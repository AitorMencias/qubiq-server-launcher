import { access, copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { download } from '../../net/downloader'
import { fetchJsonDirect } from '../../net/http'
import { serverDir } from '../../paths'
import { extractZip, filesIn, resetStaging } from '../modFiles'

/**
 * Mods de Enshrouded: Shroudtopia de cargador, y los mods los trae el usuario.
 *
 * **Era la incógnita de la fase** y resultó que sí hay una forma establecida,
 * aunque no la que tienen Satisfactory y Valheim. Lo averiguado:
 *
 * 1. **Enshrouded no tiene mods oficiales ni taller.** Keen Games dice que
 *    llegarán; mientras tanto, la comunidad usa dos cargadores, Shroudtopia y
 *    EML, y los dos funcionan en servidor dedicado.
 * 2. **Se elige Shroudtopia** porque es el único que se puede instalar sin
 *    intervención del usuario: es MIT y publica sus binarios en GitHub, que no
 *    pide cuenta. EML solo está en Nexus Mods.
 * 3. **Se engancha con un `winmm.dll`** al lado del ejecutable, exactamente
 *    igual que BepInEx con su `winhttp.dll` en Valheim. No hay que tocar la
 *    línea de órdenes, y **la parada con Ctrl+Break sigue saliendo con código
 *    0 con el cargador puesto** (comprobado con el servidor real).
 * 4. **Lo cuenta todo por la consola** (`[shroudtopia][INFO] Registered mod:
 *    …`), al revés que BepInEx, que solo lo escribe en su propio fichero. Por
 *    eso aquí no hace falta leer ningún registro aparte: lo traduce `parseLine`.
 * 5. **Y aquí se acaba lo automático: NO hay catálogo.** Los mods viven en
 *    Nexus Mods, cuya API **no deja descargar sin cuenta de pago**. Así que la
 *    app no puede buscarlos ni instalarlos por su nombre: el usuario se baja el
 *    fichero y lo trae, como en Fabric o Forge. Eso descarta el molde de
 *    `CatalogModsPanel`, que es cargador **más** buscador.
 * 6. **Apagar un mod es sacar su fichero de `mods/`.** Medido: poner
 *    `"active": false` en `shroudtopia.json` **no** impide que el cargador lo
 *    cargue (sigue saliendo «Loading mod»), solo que lo active; su `Load()` ya
 *    ha corrido. Es la misma regla que en los otros dos juegos.
 */

/** Los binarios del cargador se publican aquí. MIT, sin cuenta ni clave. */
const RELEASES_API = 'https://api.github.com/repos/s0t7x/shroudtopia/releases/latest'

export const LOADER_NAME = 'Shroudtopia'
export const LOADER_ID = 'shroudtopia'

/** Dónde busca el cargador los mods, relativo a la carpeta del servidor. */
export const MODS_DIR = 'mods'

/**
 * Lo que el cargador deja en la raíz del servidor.
 *
 * `mods/` no está en la lista a propósito: ahí es donde viven los mods del
 * usuario, y quitar el cargador no puede llevárselos por delante.
 */
export const LOADER_PATHS = ['winmm.dll', 'shroudtopia.dll', 'shroudtopia.json', 'shroudtopia.log']

/** Extensiones que tiene sentido traer. Un mod es un `.dll`, o un zip con él. */
export const ACCEPTED_EXTENSIONS = ['.dll', '.zip']

export interface LoaderRelease {
  version: string
  url: string
  publishedAt: string
}

interface GithubRelease {
  tag_name?: string
  published_at?: string
  assets?: { name?: string; browser_download_url?: string }[]
}

/** La última versión publicada del cargador. */
export async function latestLoader(): Promise<LoaderRelease> {
  const release = await fetchJsonDirect<GithubRelease>(RELEASES_API)
  const asset = (release.assets ?? []).find((a) => (a.name ?? '').toLowerCase().endsWith('.zip'))
  if (!asset?.browser_download_url) {
    throw new Error(
      'La última publicación de Shroudtopia no trae el paquete con los ficheros. Inténtalo más tarde.'
    )
  }
  return {
    version: (release.tag_name ?? '').replace(/^v/, '') || 'desconocida',
    url: asset.browser_download_url,
    publishedAt: release.published_at ?? ''
  }
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
 * ¿Está el cargador puesto?
 *
 * Se mira el disco y no el manifiesto: si alguien borró sus ficheros a mano, el
 * manifiesto seguiría diciendo que sí y los mods no se cargarían sin explicar
 * por qué. Las dos piezas que hacen falta son el `winmm.dll` que lo engancha y
 * el `shroudtopia.dll` que es el cargador.
 */
export async function loaderInstalled(id: string): Promise<boolean> {
  const dir = serverDir(id)
  return (await exists(join(dir, 'winmm.dll'))) && (await exists(join(dir, 'shroudtopia.dll')))
}

/**
 * Instala o actualiza el cargador.
 *
 * El zip trae, además del cargador, unos cuantos mods de ejemplo en `mods/`.
 * **No se copian**: lo que el usuario tenga en esa carpeta es cosa suya, y
 * meterle mods que no ha pedido —uno de ellos quita el coste de construir— le
 * cambiaría la partida sin avisar. Se le dice cuáles trae y él decide.
 */
export async function installLoader(
  id: string,
  release: LoaderRelease,
  onProgress?: (detail: string) => void
): Promise<string[]> {
  const staging = await resetStaging(id)
  const zipPath = join(staging, 'shroudtopia.zip')

  onProgress?.(`Descargando ${LOADER_NAME} ${release.version}`)
  await download({ url: release.url, destination: zipPath })

  onProgress?.('Descomprimiendo el cargador')
  const extracted = join(staging, 'contenido')
  await extractZip(zipPath, extracted)

  const entries = await filesIn(extracted)
  if (!entries.some((e) => e.toLowerCase() === 'shroudtopia.dll')) {
    throw new Error(
      'El paquete de Shroudtopia no trae el cargador donde se esperaba. No se ha tocado nada del servidor.'
    )
  }

  const destino = serverDir(id)
  const puestos: string[] = []
  for (const entry of entries) {
    // Solo la raíz del paquete: los mods de ejemplo (`mods/...`) se quedan
    // fuera a propósito.
    if (entry.includes('/')) continue
    await copyFile(join(extracted, entry), join(destino, entry))
    puestos.push(entry)
  }

  // La carpeta donde busca los mods, para que la pantalla pueda abrirla aunque
  // todavía no haya ninguno.
  await mkdir(join(destino, MODS_DIR), { recursive: true })
  await rm(staging, { recursive: true, force: true })
  return puestos
}

/**
 * Los mods que vienen dentro del paquete del cargador y que la app **no**
 * copia. Se listan para poder decir en pantalla qué hay ahí dentro por si el
 * usuario los quiere; uno de ellos quita el coste de construir.
 */
export const BUNDLED_MODS = [
  'basics_mod',
  'flight_mod',
  'ChatCommands',
  'first_person_view',
  'whitelist_mod'
]

/** Quita el cargador y deja el servidor como vino de Steam. */
export async function removeLoader(id: string): Promise<void> {
  for (const path of LOADER_PATHS) {
    await rm(join(serverDir(id), path), { recursive: true, force: true })
  }
}

/**
 * Lo que trae un fichero que el usuario quiere instalar.
 *
 * Un `.dll` es un mod suelto. Un `.zip` puede traer el `.dll` en la raíz, con
 * su `mod.json` al lado, o dentro de una carpeta: las tres formas salen de los
 * paquetes reales de Nexus, así que se busca el `.dll` esté donde esté.
 */
export interface StagedMod {
  /** Cómo se llamará su carpeta dentro de `mods/`. */
  id: string
  name: string
  version: string
  /** Ficheros del paquete, en rutas relativas a la carpeta de trabajo. */
  files: string[]
  root: string
}

export async function stageModFile(id: string, filePath: string): Promise<StagedMod> {
  const extension = extname(filePath).toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new Error(
      'Un mod de Enshrouded es un fichero .dll, o un .zip que lo lleve dentro. Eso no es ninguna de las dos cosas.'
    )
  }

  const staging = await resetStaging(id)
  const root = join(staging, 'contenido')
  await mkdir(root, { recursive: true })

  if (extension === '.dll') {
    await copyFile(filePath, join(root, basename(filePath)))
  } else {
    await extractZip(filePath, root)
  }

  const files = await filesIn(root)
  const dll = files.find((f) => f.toLowerCase().endsWith('.dll'))
  if (!dll) {
    throw new Error(
      'Ese paquete no trae ningún .dll, que es lo que carga Shroudtopia. Comprueba que es un mod de servidor y no de otra cosa.'
    )
  }

  // El `mod.json` es opcional: los mods que lo traen declaran su identificador
  // y su versión, y son los que además se pueden configurar desde
  // `shroudtopia.json`. Los que no, se nombran por su fichero.
  const info = files.find((f) => f.toLowerCase().endsWith('mod.json'))
  let modId = basename(dll, extname(dll))
  let name = modId
  let version = 'sin versión'

  if (info) {
    try {
      const parsed = JSON.parse(await readFile(join(root, ...info.split('/')), 'utf8')) as {
        id?: string
        name?: string
        version?: string
      }
      if (parsed.id) modId = parsed.id
      if (parsed.name) name = parsed.name
      if (parsed.version) version = parsed.version
    } catch {
      // Un `mod.json` ilegible no es motivo para no instalar el mod: el
      // cargador lo trata igual, buscando el `.dll`.
    }
  }

  return { id: sanitizeId(modId), name, version, files, root }
}

/**
 * Copia lo preparado a `mods/<id>/` y devuelve las rutas que quedan a su
 * nombre, para poder apagarlo o quitarlo después.
 *
 * Cada mod en su carpeta aunque venga como un `.dll` suelto: el cargador
 * recorre `mods/` entera, así que da igual la forma, y con carpeta propia se
 * sabe siempre qué fichero es de quién.
 */
export async function placeStagedMod(id: string, staged: StagedMod): Promise<string[]> {
  const destino = join(serverDir(id), MODS_DIR, staged.id)
  await rm(destino, { recursive: true, force: true })
  await mkdir(destino, { recursive: true })

  for (const entry of staged.files) {
    // Se aplana: lo que importa es que el `.dll` y su `mod.json` acaben juntos
    // dentro de la carpeta del mod, que es como los busca el cargador.
    const target = join(destino, basename(entry))
    await copyFile(join(staged.root, ...entry.split('/')), target)
  }

  await rm(staged.root, { recursive: true, force: true })
  return [`${MODS_DIR}/${staged.id}`]
}

/** Un identificador que valga como nombre de carpeta. */
function sanitizeId(raw: string): string {
  const clean = raw.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
  return clean.length > 0 ? clean : 'mod'
}

/**
 * Los `.dll` que hay ahora mismo en `mods/` y que la app no conoce.
 *
 * El usuario puede dejar ficheros ahí a mano —es una carpeta normal y la
 * pantalla tiene un botón para abrirla—, y callárselo haría que la lista de la
 * app dijera «ningún mod» con el servidor cargando tres.
 */
export async function strayMods(id: string, known: string[]): Promise<string[]> {
  const dir = join(serverDir(id), MODS_DIR)
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const conocidos = new Set(known)

  const sueltos: string[] = []
  for (const entry of entries) {
    if (conocidos.has(entry.name)) continue
    if (entry.isDirectory()) {
      const dentro = await filesIn(join(dir, entry.name))
      if (dentro.some((f) => f.toLowerCase().endsWith('.dll'))) sueltos.push(entry.name)
    } else if (entry.name.toLowerCase().endsWith('.dll')) {
      sueltos.push(entry.name)
    }
  }
  return sueltos
}

/** Lo que ocupa la carpeta de un mod. */
export async function sizeOf(path: string): Promise<number> {
  const info = await stat(path).catch(() => null)
  if (!info) return 0
  if (info.isFile()) return info.size
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    total += await sizeOf(join(path, entry.name))
  }
  return total
}

/** Compara «0.1.1» con «0.1.10» como versiones, no como texto. */
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
