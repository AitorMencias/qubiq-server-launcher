import { access, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModCatalogItem } from '@shared/games/mods'
import { download } from '../../net/downloader'
import { fetchJsonDirect } from '../../net/http'
import { serverDir } from '../../paths'
import { extractZip, filesIn, placeFiles, resetStaging, type Placement } from '../modFiles'

/**
 * Mods de Valheim: BepInEx como cargador y Thunderstore como catálogo.
 *
 * Lo comprobado contra la API y contra los paquetes de verdad, que es lo que
 * hace que esto funcione (ANALISIS.md §19.23):
 *
 * 1. **BepInEx no es un mod: es lo que hace que existan los mods.** Se instala
 *    volcando el contenido de su paquete en la raíz del servidor (`winhttp.dll`,
 *    `doorstop_config.ini` y `BepInEx/`). El `winhttp.dll` de al lado del
 *    ejecutable es el que engancha el cargador al arrancar; en Windows no hace
 *    falta ni cambiar la línea de órdenes ni usar el `.bat` del paquete.
 * 2. **Su configuración no se toca.** Parecía que habría que apagarle la
 *    consola (`[Logging.Console] Enabled = true` viene de fábrica), pero
 *    medido con el servidor real es justo al revés: BepInEx escribe por la
 *    salida estándar, así que sus mensajes **llegan a la consola de la app**,
 *    y la salida del juego sigue llegando igual (el «listo» se detecta como
 *    siempre). La ventana de consola que se temía no existe: el `conhost.exe`
 *    que nace es de Valheim, sale igual sin cargador y no tiene ventana.
 * 3. **La ruta del servidor no puede ser profunda.** BepInEx carga las
 *    bibliotecas de Unity con las API de Mono, que se quedan en los 260
 *    caracteres de Windows: con el servidor en una carpeta muy metida, el
 *    cargador se cae con «Could not run preloader!» y ningún mod se carga.
 *    Comprobado: el mismo servidor, movido a una ruta corta, arranca bien. Por
 *    eso se mide antes de instalar nada.
 * 4. **Los paquetes de Thunderstore vienen de tres formas** (comprobado con
 *    mods reales): con el `.dll` suelto en la raíz (PlantEverything), dentro de
 *    un `plugins/` (Jotunn) o con un `BepInEx/` entero. `place` las reparte.
 * 5. **Thunderstore no publica el hash de sus ficheros.** No hay nada que
 *    comprobar contra el catálogo, así que se comprueba contra el contenido:
 *    un paquete que no se descomprime o que no trae `manifest.json` se rechaza.
 * 6. **Las dependencias vienen con versión clavada** («denikson-BepInExPack_Valheim-5.4.2350»),
 *    no con un rango: no hace falta resolver nada, solo pedir esa.
 */

const SITE = 'https://thunderstore.io'
/** Thunderstore está partido por comunidades y la de Valheim es esta. */
const COMMUNITY = 'valheim'

/** El paquete del cargador. Todos los mods de Valheim dependen de él. */
export const LOADER_ID = 'denikson-BepInExPack_Valheim'
export const LOADER_NAME = 'BepInEx'

/** Ficheros y carpetas que el cargador deja en la raíz del servidor. */
export const LOADER_PATHS = [
  'BepInEx',
  'winhttp.dll',
  'doorstop_config.ini',
  'doorstop_libs',
  '.doorstop_version',
  'start_game_bepinex.sh',
  'start_server_bepinex.sh',
  'changelog.txt'
]

/**
 * El fichero de más nivel que trae el servidor, medido en la instalación real.
 *
 * Es el que primero choca con el límite de 260 caracteres de Windows cuando
 * BepInEx recorre las bibliotecas de Unity, y por tanto el que decide si la
 * carpeta del servidor está demasiado metida.
 */
const DEEPEST_FILE = 'valheim_server_Data\\Managed\\UnityEngine.GraphicsStateCollectionSerializerModule.dll'

/** El límite de Windows para una ruta, con un margen por si el juego crece. */
export const MAX_PATH = 259

/**
 * Lo que mide la ruta que decide si BepInEx arranca, para una carpeta de
 * servidor cualquiera. Aparte de `assertPathFits` porque cambiar la carpeta de
 * datos de sitio tiene que medirlo ANTES de mover nada, en la ruta de destino.
 */
export function modsPathLength(serverFolder: string): number {
  return join(serverFolder, DEEPEST_FILE).length
}

/** Carpetas de BepInEx a las que puede ir el contenido de un paquete. */
const BEPINEX_DIRS = new Set(['plugins', 'patchers', 'monomod', 'core', 'config'])

export function bepinexDir(instanceId: string): string {
  return join(serverDir(instanceId), 'BepInEx')
}

// --- El catálogo ------------------------------------------------------------------

interface ListingEntry {
  namespace: string
  name: string
  description: string
  download_count: number
  icon_url?: string
  is_deprecated: boolean
  categories?: { name: string }[]
  size?: number
}

export interface ThunderstoreVersion {
  namespace: string
  name: string
  version_number: string
  full_name: string
  description: string
  icon?: string
  dependencies: string[]
  download_url: string
  downloads?: number
}

interface ThunderstorePackage {
  namespace: string
  name: string
  full_name: string
  is_deprecated: boolean
  date_updated: string
  latest: ThunderstoreVersion
  community_listings?: { community: string; categories: string[] }[]
}

class ThunderstoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThunderstoreError'
  }
}

async function get<T>(path: string, timeoutMs = 30_000): Promise<T> {
  try {
    return await fetchJsonDirect<T>(`${SITE}${path}`, timeoutMs)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new ThunderstoreError(`No se ha podido consultar Thunderstore: ${message}`)
  }
}

/**
 * Busca en Thunderstore, ordenando por descargas.
 *
 * ⚠ **El buscador va por `q=`, no por `search=`.** Con `search=` la API
 * contesta 200 y devuelve el catálogo entero como si no se hubiera filtrado
 * nada (comprobado): el fallo sería invisible, y el usuario vería siempre los
 * mismos seis mods buscara lo que buscara.
 *
 * Se usa esta API y no el índice completo de la v1 porque ese son 13 MB
 * comprimidos y 167 sin comprimir, para lo mismo.
 */
export async function searchMods(text: string, limit = 20): Promise<ModCatalogItem[]> {
  const q = text.trim()
  const params = new URLSearchParams({ ordering: 'most-downloaded', page: '1' })
  if (q.length > 0) params.set('q', q)

  const data = await get<{ results: ListingEntry[] }>(
    `/api/cyberstorm/listing/${COMMUNITY}/?${params.toString()}`
  )

  return data.results
    .filter((entry) => `${entry.namespace}-${entry.name}` !== LOADER_ID)
    .filter((entry) => !entry.is_deprecated)
    .slice(0, limit)
    .map((entry) => {
      const categories = (entry.categories ?? []).map((c) => c.name)
      const clientOnly =
        categories.includes('Client-side') && !categories.includes('Server-side')
      return {
        id: `${entry.namespace}-${entry.name}`,
        name: entry.name.replace(/_/g, ' '),
        author: entry.namespace,
        summary: entry.description,
        downloads: entry.download_count,
        // La lista no trae la versión; se sabe al instalarlo y no merece una
        // llamada por cada resultado.
        version: null,
        ...(entry.icon_url ? { iconUrl: entry.icon_url } : {}),
        forServer: !clientOnly,
        ...(clientOnly
          ? {
              clientOnlyReason:
                'Su autor lo ha marcado como mod de cliente: en el servidor no hace nada, se lo ' +
                'instala cada jugador en su juego.'
            }
          : {})
      }
    })
}

/** De «Autor-Mod» a sus dos partes. Es el identificador de todo Thunderstore. */
export function splitId(id: string): { namespace: string; name: string } {
  const corte = id.indexOf('-')
  if (corte <= 0) {
    throw new ThunderstoreError(`«${id}» no tiene la forma «Autor-Mod» que usa Thunderstore.`)
  }
  return { namespace: id.slice(0, corte), name: id.slice(corte + 1) }
}

/**
 * De «Autor-Mod-1.2.3», sus tres partes.
 *
 * Así vienen las dependencias, con la versión pegada al final. Separar por el
 * último guion no vale: los nombres llevan guiones (`Azumatt-AzuAntiDrift`), y
 * la versión son siempre tres números.
 */
export function splitDependency(full: string): { id: string; version: string } | null {
  const match = /^(.+)-(\d+\.\d+\.\d+)$/.exec(full)
  return match ? { id: match[1]!, version: match[2]! } : null
}

export async function latestVersion(id: string): Promise<ThunderstorePackage> {
  const { namespace, name } = splitId(id)
  return get<ThunderstorePackage>(
    `/api/experimental/package/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/`
  )
}

export async function exactVersion(id: string, version: string): Promise<ThunderstoreVersion> {
  const { namespace, name } = splitId(id)
  return get<ThunderstoreVersion>(
    `/api/experimental/package/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/`
  )
}

// --- Qué hay que instalar -----------------------------------------------------------

export interface ValheimInstallPlan {
  entries: { id: string; name: string; version: ThunderstoreVersion; requiredBy?: string }[]
  /** La versión de BepInEx que hace falta, si el servidor no la tiene ya. */
  loader: ThunderstoreVersion | null
}

/**
 * Resuelve el mod y lo que arrastra.
 *
 * Las dependencias de Thunderstore vienen con la versión clavada, así que no
 * hay nada que negociar: se pide esa. Lo único que se decide es no volver a
 * bajar lo que ya está y quedarse con la más alta cuando dos mods piden la
 * misma biblioteca en versiones distintas.
 */
export async function planInstall(
  modId: string,
  options: { installed: Map<string, string>; loaderVersion: string | null }
): Promise<ValheimInstallPlan> {
  const elegidas = new Map<string, { version: ThunderstoreVersion; requiredBy?: string }>()
  let loader: ThunderstoreVersion | null = null

  const raiz = await latestVersion(modId)
  elegidas.set(modId, { version: raiz.latest })

  let pendientes = [...raiz.latest.dependencies]
  const vistas = new Set<string>()

  for (let vuelta = 0; vuelta < 10 && pendientes.length > 0; vuelta++) {
    const ahora = pendientes.filter((d) => !vistas.has(d))
    pendientes = []
    for (const full of ahora) {
      vistas.add(full)
      const partes = splitDependency(full)
      if (!partes) continue

      if (partes.id === LOADER_ID || partes.id.includes('BepInExPack')) {
        if (
          options.loaderVersion === null ||
          compareVersions(partes.version, options.loaderVersion) > 0
        ) {
          loader = await exactVersion(LOADER_ID, partes.version).catch(async () =>
            (await latestVersion(LOADER_ID)).latest
          )
        }
        continue
      }

      const yaInstalada = options.installed.get(partes.id)
      const yaElegida = elegidas.get(partes.id)?.version.version_number
      const mejor = [yaInstalada, yaElegida].filter(Boolean) as string[]
      if (mejor.some((v) => compareVersions(v, partes.version) >= 0)) continue

      const version = await exactVersion(partes.id, partes.version)
      elegidas.set(partes.id, { version, requiredBy: raiz.latest.name })
      pendientes.push(...version.dependencies)
    }
  }

  return {
    entries: [...elegidas.entries()].map(([id, valor]) => ({
      id,
      name: valor.version.name.replace(/_/g, ' '),
      version: valor.version,
      ...(valor.requiredBy ? { requiredBy: valor.requiredBy } : {})
    })),
    loader
  }
}

/** Compara `1.21.2` con `1.3.0` por números, no como texto. */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(/[.\-+]/)
  const partsB = b.split(/[.\-+]/)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = Number(partsA[i] ?? '0')
    const numB = Number(partsB[i] ?? '0')
    if (Number.isFinite(numA) && Number.isFinite(numB)) {
      if (numA !== numB) return numA - numB
    } else if ((partsA[i] ?? '') !== (partsB[i] ?? '')) {
      return (partsA[i] ?? '') < (partsB[i] ?? '') ? -1 : 1
    }
  }
  return 0
}

// --- Instalación -----------------------------------------------------------------

/**
 * A dónde va cada fichero de un paquete de Thunderstore.
 *
 * Las tres formas que se ven en el catálogo, comprobadas con mods reales:
 *
 * | En el zip | Dónde acaba |
 * |---|---|
 * | `BepInEx/plugins/X.dll` | tal cual, respetando lo que trae |
 * | `plugins/X.dll` | `BepInEx/plugins/<Autor-Mod>/X.dll` |
 * | `config/X.cfg` | `BepInEx/config/X.cfg` |
 * | `X.dll` (suelto) | `BepInEx/plugins/<Autor-Mod>/X.dll` |
 *
 * La configuración es la excepción que importa: va **suelta** en
 * `BepInEx/config`, sin carpeta propia, porque cada mod la busca por su nombre
 * de fichero. Metida en una subcarpeta, el mod no la encuentra y arranca con
 * los valores de fábrica sin decir nada.
 */
export function placeInPackage(modId: string, entry: string): Placement {
  const partes = entry.split('/')
  const primera = (partes[0] ?? '').toLowerCase()

  if (primera === 'bepinex') {
    // Trae el árbol hecho: se respeta, y lo suyo es lo que cuelgue de su carpeta.
    const dest = entry
    const owns = partes.length >= 3 ? partes.slice(0, 3).join('/') : dest
    return { dest, owns }
  }

  if (BEPINEX_DIRS.has(primera) && partes.length > 1) {
    const resto = partes.slice(1).join('/')
    if (primera === 'config') {
      return { dest: `BepInEx/config/${resto}`, owns: `BepInEx/config/${resto}` }
    }
    return {
      dest: `BepInEx/${primera}/${modId}/${resto}`,
      owns: `BepInEx/${primera}/${modId}`
    }
  }

  return { dest: `BepInEx/plugins/${modId}/${entry}`, owns: `BepInEx/plugins/${modId}` }
}

/**
 * Descarga un paquete y lo reparte por el servidor.
 *
 * Thunderstore no publica hash, así que la comprobación es el propio contenido:
 * si no se descomprime o no trae `manifest.json`, no es un paquete suyo y no se
 * toca nada del servidor.
 */
export async function installPackage(
  instanceId: string,
  modId: string,
  version: ThunderstoreVersion,
  onProgress?: (detail: string) => void
): Promise<string[]> {
  const staging = await resetStaging(instanceId)
  try {
    const zip = join(staging, 'paquete.zip')
    onProgress?.(`Descargando ${version.name} ${version.version_number}`)
    await download({ url: version.download_url, destination: zip })

    onProgress?.(`Colocando ${version.name}`)
    const contenido = join(staging, 'contenido')
    await extractZip(zip, contenido)

    const dentro = await filesIn(contenido)
    if (!dentro.some((f) => f.toLowerCase() === 'manifest.json')) {
      throw new ThunderstoreError(
        `Lo que se ha descargado de «${modId}» no parece un paquete de Thunderstore: no trae su ` +
          'manifest.json. No se ha tocado nada del servidor.'
      )
    }

    // El README, el icono y el manifiesto del paquete no pintan nada dentro del
    // servidor, pero se quedan en la carpeta del mod: es lo que deja ver de
    // dónde salió cada cosa si alguien abre la carpeta a mano.
    return await placeFiles(instanceId, contenido, (entry) => placeInPackage(modId, entry))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Instala BepInEx en la raíz del servidor.
 *
 * Su paquete lleva todo dentro de `BepInExPack_Valheim/`, que hay que quitar:
 * lo que tiene que quedar junto a `valheim_server.exe` es el contenido, no la
 * carpeta. Después se le apaga la consola (ver la cabecera del fichero).
 */
export async function installLoader(
  instanceId: string,
  version: ThunderstoreVersion,
  onProgress?: (detail: string) => void
): Promise<void> {
  assertPathFits(instanceId)
  const staging = await resetStaging(instanceId)
  try {
    const zip = join(staging, 'bepinex.zip')
    onProgress?.(`Descargando BepInEx ${version.version_number}`)
    await download({ url: version.download_url, destination: zip })

    onProgress?.('Instalando BepInEx')
    const contenido = join(staging, 'contenido')
    await extractZip(zip, contenido)

    const raiz = await packRoot(contenido)
    await placeFiles(instanceId, join(contenido, raiz), (entry) => ({
      dest: entry,
      owns: entry.split('/')[0] ?? entry
    }))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Se planta si la carpeta del servidor está tan metida que BepInEx no va a
 * poder cargar.
 *
 * Vale más negarse aquí, donde se puede explicar, que instalarlo y que el
 * usuario se encuentre con un servidor que arranca **sin ningún mod** y con un
 * «Could not run preloader!» perdido en un registro que no va a leer.
 */
export function assertPathFits(instanceId: string): void {
  const largo = modsPathLength(serverDir(instanceId))
  if (largo <= MAX_PATH) return
  throw new ThunderstoreError(
    'La carpeta de este servidor está demasiado metida en el disco para poder llevar mods: ' +
      `la ruta se va a ${largo} caracteres y Windows solo admite ${MAX_PATH}. BepInEx no llegaría ` +
      'a cargar y el servidor arrancaría sin ningún mod. Mueve la carpeta de datos de la app a ' +
      'un sitio más corto (Configuración de la app → Carpeta de datos) y vuelve a intentarlo.'
  )
}

/**
 * La carpeta de dentro del paquete que hay que volcar («BepInExPack_Valheim»).
 *
 * Se busca en vez de darla por hecha porque su nombre lleva la versión en otras
 * comunidades y podría cambiar; lo que no cambia es que dentro está `BepInEx`.
 */
async function packRoot(dir: string): Promise<string> {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue
    if (await exists(join(dir, entry.name, 'BepInEx'))) return entry.name
  }
  return ''
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
 * Qué hizo BepInEx en el último arranque, leído de sus registros.
 *
 * ⚠ **El chainloader —el que dice qué mods ha cargado— no escribe por la
 * consola**, solo en `BepInEx/LogOutput.log` (comprobado: por la tubería del
 * proceso solo llegan las líneas del preloader). Sin leer ese fichero, un mod
 * que no cargue no se nota hasta que alguien lo echa de menos dentro del juego.
 *
 * El otro fichero, `preloader_<fecha>.log` en la raíz del servidor, es el que
 * aparece cuando BepInEx ni siquiera llega a arrancar.
 */
export async function readLoaderLog(
  instanceId: string
): Promise<{ loaded: string[]; problems: string[] } | null> {
  const principal = await readFile(join(bepinexDir(instanceId), 'LogOutput.log'), 'utf8').catch(
    () => null
  )
  const leido = parseLoaderLog(principal ?? '')

  // El del preloader solo existe cuando algo se torció antes de empezar.
  const raiz = await readdir(serverDir(instanceId)).catch(() => [])
  const preloader = raiz
    .filter((f) => /^preloader_.*\.log$/i.test(f))
    .sort()
    .at(-1)
  if (preloader) {
    const crudo = await readFile(join(serverDir(instanceId), preloader), 'utf8').catch(() => '')
    if (/Could not run preloader/i.test(crudo)) {
      leido.problems.unshift(
        'BepInEx no ha llegado a arrancar, así que el servidor funcionó sin ningún mod. Casi ' +
          'siempre es porque la carpeta del servidor está demasiado metida en el disco y las ' +
          'rutas se pasan de los 260 caracteres que admite Windows.'
      )
    }
  }

  if (principal === null && !preloader) return null
  return leido
}

/**
 * Lo que se saca de `LogOutput.log`: qué cargó y de qué se quejó.
 *
 * ⚠ **No todo error de ese fichero es un problema de mods.** BepInEx recoge
 * también el registro del propio juego, y un servidor sin pantalla escribe de
 * serie quince errores de vídeo y de shaders (comprobado con el servidor real).
 * Enseñarlos sería alarmar por lo que siempre ha estado ahí, así que se mira
 * **quién habla**: solo cuentan el cargador y los propios mods, nunca
 * `Unity Log`.
 */
export function parseLoaderLog(raw: string): { loaded: string[]; problems: string[] } {
  const loaded: string[] = []
  const problems: string[] = []

  for (const linea of raw.split(/\r?\n/)) {
    const cargado = /^\[\w+\s*:\s*BepInEx\]\s*Loading \[(.+?) ([\d.]+)\]/.exec(linea)
    if (cargado) {
      loaded.push(`${cargado[1]} ${cargado[2]}`)
      continue
    }

    const fallo = /^\[(?:Error|Fatal)\s*:\s*(.+?)\]\s*(.+)$/.exec(linea)
    if (fallo && fallo[1]!.trim() !== 'Unity Log') {
      problems.push(`${fallo[1]!.trim()}: ${fallo[2]!.trim()}`)
    }
  }

  return { loaded, problems: [...new Set(problems)].slice(0, 5) }
}

/** ¿Está puesto el cargador? Se mira el `winhttp.dll`, que es lo que lo engancha. */
export async function loaderInstalled(instanceId: string): Promise<boolean> {
  return (
    (await exists(join(serverDir(instanceId), 'winhttp.dll'))) &&
    (await exists(join(bepinexDir(instanceId), 'core', 'BepInEx.Preloader.dll')))
  )
}

/** Quita el cargador y todo lo que trajo, registros incluidos. */
export async function removeLoader(instanceId: string): Promise<void> {
  for (const path of LOADER_PATHS) {
    await rm(join(serverDir(instanceId), path), { recursive: true, force: true })
  }
  for (const entry of await readdir(serverDir(instanceId)).catch(() => [])) {
    if (/^preloader_.*\.log$/i.test(entry)) {
      await rm(join(serverDir(instanceId), entry), { force: true })
    }
  }
}

export { ThunderstoreError }
