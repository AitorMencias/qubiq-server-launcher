import { access, cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ModCatalogItem } from '@shared/games/mods'
import { RUST_APP_ID } from '@shared/games/rust/types'
import { download, IntegrityError } from '../../net/downloader'
import { fetchJsonDirect } from '../../net/http'
import { serverDir } from '../../paths'
import { extractZip, filesIn, resetStaging } from '../modFiles'
import { listBranches } from '../../tools/steamcmd'

/**
 * Oxide y los plugins de uMod: como se amplía Rust.
 *
 * Lo medido con el servidor real y Oxide 2.0.7726 (ANALISIS.md §19.27):
 *
 * 1. **Oxide no es un cargador que se pone al lado: sustituye DLL del juego.**
 *    Su paquete trae `Assembly-CSharp.dll` y otros seis ya parcheados, más
 *    catorce ficheros suyos. Por eso **tiene que ser para la build exacta de
 *    Rust instalada**: una Oxide de otro mes dejaría un servidor que no casa con
 *    el juego de nadie.
 * 2. **Cada actualización de Rust lo quita**, porque vuelve a traer sus DLL.
 *    Tras actualizar hay que volver a ponerlo, y solo si ya ha salido la Oxide
 *    de esa build: Oxide suele tardar unas horas en salir tras el parche.
 * 3. **Quitarlo es devolver los DLL de Steam**: se borran los ficheros que
 *    añadió y SteamCMD valida la instalación. Medido: 14 s y los 250 ficheros
 *    de `Managed` idénticos a los originales.
 * 4. **Carga los plugins en caliente**: dejar un `.cs` en `oxide/plugins` lo
 *    compila y lo carga sin reiniciar, y sacarlo lo descarga. Se comprobó con
 *    `oxide.unload` y `oxide.load` por WebRCON.
 * 5. **Los plugins son código fuente** (`.cs`) y el catálogo de uMod da el
 *    `sha1` de cada uno (`latest_release_version_checksum`): coincide con el
 *    del fichero descargado, así que se comprueba siempre.
 * 6. **Las dependencias no las dice el catálogo**, pero Oxide entiende una
 *    directiva en el propio fichero: `// Requires: OtroPlugin`. Se leen de ahí.
 * 7. La primera vez que arranca se baja **su compilador** (`Oxide.Compiler.exe`)
 *    de internet: sin conexión en ese primer arranque, los plugins no cargan.
 */

export const LOADER_NAME = 'Oxide'
export const LOADER_ID = 'oxide'

/** Donde Oxide busca los plugins, relativo a la carpeta del servidor. */
export const PLUGINS_DIR = 'oxide/plugins'

/**
 * La ficha de Rust en uMod: última Oxide y ramas de Steam que conoce.
 *
 * ⚠ `umod.org/games/rust.json` no es JSON: devuelve una página HTML que
 * redirige aquí con un `<meta refresh>` (medido). Se pide la de verdad.
 */
const GAME_JSON = 'https://assets.umod.org/games/rust.json'
const SEARCH = 'https://umod.org/plugins/search.json'
const PLUGIN_FILE = (name: string): string => `https://umod.org/plugins/${encodeURIComponent(name)}.cs`
const OXIDE_ZIP = (version: string): string =>
  `https://github.com/OxideMod/Oxide.Rust/releases/download/${version}/Oxide.Rust.zip`

/** Ficheros sueltos que Oxide crea al arrancar en la raíz del servidor. */
const OXIDE_RUNTIME = ['oxide', 'Oxide.Compiler.exe']

export interface OxideRelease {
  version: string
  url: string
  /** Cuándo se publicó, en ISO. */
  releasedAt: string
}

interface UmodGame {
  latest_release_version?: string
  latest_release_at_atom?: string
}

export async function latestOxide(): Promise<OxideRelease> {
  const game = await fetchJsonDirect<UmodGame>(GAME_JSON)
  if (!game.latest_release_version) {
    throw new Error('uMod no dice cuál es la última versión de Oxide. Inténtalo más tarde.')
  }
  return {
    version: game.latest_release_version,
    url: OXIDE_ZIP(game.latest_release_version),
    releasedAt: game.latest_release_at_atom ?? ''
  }
}

/**
 * ¿Vale esta Oxide para la build de Rust instalada?
 *
 * Una Oxide sirve para la build pública que había cuando salió. Así que tiene
 * que cumplir dos cosas: que el servidor esté en esa build pública, y que la
 * Oxide sea **posterior** a la subida de esa build (`timebuildupdated`, no
 * `timeupdated`, que Steam mueve también por retoques de la rama).
 */
export function oxideFits(
  release: OxideRelease,
  installedBuild: string | null,
  publicBranch: { buildId: string; timeBuildUpdated?: number; timeUpdated: number } | null
): { ok: true } | { ok: false; reason: string } {
  if (!publicBranch || !installedBuild) return { ok: true }
  if (installedBuild !== publicBranch.buildId) {
    return Number(installedBuild) < Number(publicBranch.buildId)
      ? {
          ok: false,
          reason:
            'El servidor no está en la última versión de Rust, y Oxide solo sale para la última. ' +
            'Actualiza antes el servidor desde Configuración → Servidor.'
        }
      : {
          ok: false,
          reason: 'Oxide solo se instala sobre la versión de siempre de Rust, no sobre ramas de prueba.'
        }
  }
  const buildAt = (publicBranch.timeBuildUpdated ?? publicBranch.timeUpdated) * 1000
  const releasedAt = Date.parse(release.releasedAt)
  if (Number.isFinite(releasedAt) && buildAt > 0 && releasedAt < buildAt) {
    return {
      ok: false,
      reason:
        'Todavía no ha salido Oxide para la versión de Rust de este mes. Suele tardar unas horas ' +
        'tras el parche; mientras tanto el servidor funciona, pero sin plugins.'
    }
  }
  return { ok: true }
}

/** La rama pública de Rust, tal como la da Steam ahora mismo. */
export async function publicBranch(): Promise<{
  buildId: string
  timeUpdated: number
  timeBuildUpdated?: number
} | null> {
  const branches = await listBranches(RUST_APP_ID)
  return branches.find((b) => b.name === 'public') ?? null
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * ¿Está Oxide puesto de verdad? Se mira el disco: `Oxide.Rust.dll` es el que lo
 * engancha al juego, y una actualización de Rust no lo borra pero sí le quita
 * el `Assembly-CSharp.dll` parcheado. Esto dice si están sus ficheros, no si el
 * juego los va a cargar: eso lo dice `pending` en el manifiesto.
 */
export async function oxideInstalled(id: string): Promise<boolean> {
  return exists(join(serverDir(id), 'RustDedicated_Data', 'Managed', 'Oxide.Rust.dll'))
}

/**
 * Pone Oxide encima del servidor. Devuelve los ficheros que añadió y que el
 * juego no traía: son los que hay que borrar para quitarlo.
 */
export async function installOxide(
  id: string,
  release: OxideRelease,
  onProgress?: (detail: string) => void
): Promise<string[]> {
  const staging = await resetStaging(id)
  const zipPath = join(staging, 'Oxide.Rust.zip')

  onProgress?.(`Descargando Oxide ${release.version}`)
  await download({ url: release.url, destination: zipPath })

  onProgress?.('Descomprimiendo Oxide')
  const extracted = join(staging, 'contenido')
  await extractZip(zipPath, extracted)

  const entries = await filesIn(extracted)
  if (!entries.includes('RustDedicated_Data/Managed/Oxide.Rust.dll')) {
    throw new Error('El paquete de Oxide no trae lo que se esperaba. No se ha tocado nada del servidor.')
  }

  const destino = serverDir(id)
  const added: string[] = []
  for (const entry of entries) {
    const target = join(destino, ...entry.split('/'))
    if (!(await exists(target))) added.push(entry)
    await mkdir(dirname(target), { recursive: true })
    await cp(join(extracted, ...entry.split('/')), target)
  }

  await mkdir(join(destino, ...PLUGINS_DIR.split('/')), { recursive: true })
  await rm(staging, { recursive: true, force: true })
  return added
}

/**
 * Borra lo que añadió Oxide. Lo que sustituyó lo devuelve después SteamCMD
 * validando la instalación: eso lo hace quien llama, que es quien sabe de ramas.
 *
 * `oxide/` se va entero (configuración y datos de los plugins incluidos): solo
 * se llega aquí sin plugins instalados.
 */
export async function removeOxideFiles(id: string, added: string[]): Promise<void> {
  const destino = serverDir(id)
  for (const path of added) {
    await rm(join(destino, ...path.split('/')), { force: true })
  }
  // Las carpetas de librerías nativas que trae (x64, x86) quedan vacías.
  for (const dir of ['RustDedicated_Data/Managed/x64', 'RustDedicated_Data/Managed/x86']) {
    const path = join(destino, ...dir.split('/'))
    const left = await readdir(path).catch(() => null)
    if (left && left.length === 0) await rm(path, { recursive: true, force: true })
  }
  for (const path of OXIDE_RUNTIME) {
    await rm(join(destino, path), { recursive: true, force: true })
  }
}

// --- Plugins ------------------------------------------------------------------------

interface UmodPlugin {
  name?: string
  title?: string
  description?: string
  author?: string
  downloads?: number
  latest_release_version?: string
  latest_release_version_checksum?: string
  distribution?: string
  icon_url?: string
  games_detail?: { slug?: string }[]
}

interface UmodSearch {
  data?: UmodPlugin[]
}

function toCatalogItem(plugin: UmodPlugin): ModCatalogItem | null {
  if (!plugin.name) return null
  const descargable = (plugin.distribution ?? 'download') === 'download'
  return {
    id: plugin.name,
    name: plugin.title ?? plugin.name,
    author: plugin.author || 'autor desconocido',
    summary: plugin.description ?? '',
    downloads: plugin.downloads ?? 0,
    version: plugin.latest_release_version ?? null,
    ...(plugin.icon_url ? { iconUrl: plugin.icon_url } : {}),
    // Todos los plugins de Oxide van en el servidor: aquí «no sirve» solo es
    // cuando uMod no lo reparte (de pago o alojado en otro sitio).
    forServer: descargable,
    ...(descargable
      ? {}
      : { clientOnlyReason: 'uMod no lo reparte directamente: hay que conseguirlo en su página.' })
  }
}

/**
 * Busca en uMod.
 *
 * Con la caja vacía salen los más descargados. Con texto, el orden de uMod por
 * relevancia, que es el que pone primero lo que se llama como lo buscado.
 */
export async function searchPlugins(text: string): Promise<ModCatalogItem[]> {
  const query = text.trim()
  const params = new URLSearchParams({
    query,
    page: '1',
    sort: query.length > 0 ? 'title' : 'downloads',
    sortdir: query.length > 0 ? 'asc' : 'desc'
  })
  params.append('categories[]', 'rust')
  const result = await fetchJsonDirect<UmodSearch>(`${SEARCH}?${params.toString()}`)
  const items = (result.data ?? []).map(toCatalogItem).filter((i): i is ModCatalogItem => i !== null)
  if (query.length === 0) return items
  // uMod ordena por título; lo que se llama justo así va primero.
  const q = query.toLowerCase()
  return items.sort((a, b) => score(b, q) - score(a, q))
}

function score(item: ModCatalogItem, q: string): number {
  const name = item.name.toLowerCase()
  const id = item.id.toLowerCase()
  if (name === q || id === q) return 3
  if (name.startsWith(q) || id.startsWith(q)) return 2
  if (name.includes(q) || id.includes(q)) return 1
  return 0
}

/** La ficha de un plugin por su nombre de fichero, que es como se pide a uMod. */
export async function pluginInfo(name: string): Promise<UmodPlugin | null> {
  const params = new URLSearchParams({ query: name, page: '1', sort: 'title', sortdir: 'asc' })
  params.append('categories[]', 'rust')
  const result = await fetchJsonDirect<UmodSearch>(`${SEARCH}?${params.toString()}`)
  return (result.data ?? []).find((p) => p.name === name) ?? null
}

/** `[Info("Gather Manager", "Mughisi", "2.2.78")]`: nombre, autor y versión (grabado). */
export function parsePluginHeader(source: string): { title?: string; author?: string; version?: string } {
  const match = /\[Info\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/.exec(source)
  if (!match) return {}
  return { title: match[1]!, author: match[2]!, version: match[3]! }
}

/**
 * Las dependencias duras de un plugin: `// Requires: ImageLibrary`. Es la
 * directiva que entiende el compilador de Oxide; sin ellas, el plugin no carga.
 */
export function parseRequires(source: string): string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(/^\s*\/\/\s*Requires:\s*([\w.]+)/gim)) {
    found.add(match[1]!.replace(/\.cs$/i, ''))
  }
  return [...found]
}

export interface DownloadedPlugin {
  name: string
  title: string
  version: string
  requires: string[]
}

/**
 * Baja un plugin y lo deja en `oxide/plugins`. Con el servidor en marcha, Oxide
 * lo compila y lo carga él solo en cuanto aparece el fichero.
 *
 * El `sha1` de uMod se comprueba siempre: es código que se va a compilar y
 * ejecutar en el equipo del usuario.
 */
export async function downloadPlugin(id: string, name: string): Promise<DownloadedPlugin> {
  if (!/^[\w.]+$/.test(name)) throw new Error(`«${name}» no es un nombre de plugin válido.`)
  const info = await pluginInfo(name)
  if (!info) throw new Error(`uMod no tiene ningún plugin de Rust que se llame «${name}».`)
  if ((info.distribution ?? 'download') !== 'download') {
    throw new Error(`uMod no reparte «${info.title ?? name}» directamente: hay que conseguirlo en su página.`)
  }

  // Se baja a la carpeta de trabajo y se comprueba ahí, sobre los bytes: solo
  // un fichero que coincide llega a `oxide/plugins`, donde Oxide lo compilaría
  // al momento.
  const staging = await resetStaging(id)
  const bajado = join(staging, `${name}.cs`)
  const esperado = info.latest_release_version_checksum
  try {
    await download({
      url: PLUGIN_FILE(name),
      destination: bajado,
      ...(esperado ? { expectedHash: { algorithm: 'sha1' as const, value: esperado } } : {})
    })
  } catch (err) {
    if (err instanceof IntegrityError) {
      throw new Error(
        `El fichero de «${info.title ?? name}» no coincide con el que publica uMod. No se ha instalado.`
      )
    }
    throw err
  }

  const source = await readFile(bajado, 'utf8')
  const header = parsePluginHeader(source)
  const target = join(serverDir(id), ...PLUGINS_DIR.split('/'), `${name}.cs`)
  await mkdir(dirname(target), { recursive: true })
  await cp(bajado, target)
  await rm(staging, { recursive: true, force: true })

  return {
    name,
    title: header.title ?? info.title ?? name,
    version: header.version ?? info.latest_release_version ?? 'desconocida',
    requires: parseRequires(source)
  }
}

export function pluginPath(name: string): string {
  return `${PLUGINS_DIR}/${name}.cs`
}

/** La versión del `.cs` instalado, leída de su cabecera. */
export async function installedPluginVersion(id: string, name: string): Promise<string | null> {
  const source = await readFile(join(serverDir(id), ...pluginPath(name).split('/')), 'utf8').catch(
    () => null
  )
  return source ? (parsePluginHeader(source).version ?? null) : null
}

/**
 * Los `.cs` que hay en `oxide/plugins` y que la app no conoce: los puestos a
 * mano. Se enseñan para que la lista no diga «ninguno» con tres cargando.
 */
export async function strayPlugins(id: string, known: string[]): Promise<string[]> {
  const dir = join(serverDir(id), ...PLUGINS_DIR.split('/'))
  const conocidos = new Set(known.map((k) => k.toLowerCase()))
  const found: string[] = []
  for (const entry of await readdir(dir).catch((): string[] => [])) {
    if (!entry.toLowerCase().endsWith('.cs')) continue
    const name = entry.slice(0, -3)
    if (!conocidos.has(name.toLowerCase())) found.push(name)
  }
  return found
}

export async function fileSize(path: string): Promise<number> {
  return (await stat(path).catch(() => null))?.size ?? 0
}

/** Compara «2.2.78» con «2.2.8» como versiones, no como texto. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] => v.split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
