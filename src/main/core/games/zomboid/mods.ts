import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ZOMBOID_WORKSHOP_APP_ID,
  type ZomboidMod,
  type ZomboidModEntry,
  type ZomboidModRef
} from '@shared/games/zomboid/types'
import { serverDir } from '../../paths'
import { workshopDownload } from '../../tools/steamcmd'
import { postForm } from '../../net/http'
import { exists, folderSize, modsDirFor } from './paths'

/**
 * Mods de Project Zomboid: el taller de Steam.
 *
 * Todo esto está comprobado contra el taller y el servidor reales
 * (ANALISIS.md §19.22), no sacado de una wiki:
 *
 * 1. **Se descargan sin cuenta.** `workshop_download_item 108600 <id>` con
 *    `login anonymous` funciona (probado con un mod de verdad). Al revés que
 *    Factorio, aquí no hace falta la cuenta del usuario.
 * 2. **El taller cuelga del JUEGO (108600), no del servidor** (380870).
 * 3. **La Build 42 exige la carpeta de versión.** Un mod carga si su `mod.info`
 *    y su `media/` están dentro de `<mod>/42.20/` (o la versión que sea); con
 *    todo en la raíz, al estilo antiguo, el servidor ni lo encuentra y solo
 *    dice «required mod not found». Por eso la app mira qué versiones trae cada
 *    mod y avisa **antes** de que el servidor se quede callado.
 * 4. **No hace falta `WorkshopItems=`.** Esa clave es para que el servidor se
 *    los descargue él por Steam, y este servidor arranca sin Steam: los mods se
 *    copian a `Zomboid/mods` y se activan por `Mods=`, que es lo que de verdad
 *    los carga.
 */

/** Carpeta de trabajo donde SteamCMD deja lo que baja del taller. */
function stagingDirFor(id: string): string {
  return join(serverDir(id), '.taller')
}

/**
 * Los datos públicos de un objeto del taller: cómo se llama, de qué juego es y
 * cuándo se actualizó.
 *
 * La API de Steam que los da **no pide clave** (`GetPublishedFileDetails`), así
 * que la app puede enseñar el nombre de un mod antes de descargarlo y saber si
 * su autor lo ha tocado desde la última vez.
 */
export interface WorkshopDetails {
  workshopId: string
  title: string
  description: string
  /** De qué juego es. Sirve para rechazar un mod de otro juego con sentido. */
  appId: number
  sizeBytes: number
  /** Última vez que lo tocó su autor, en ISO. */
  updatedAt: string | null
  tags: string[]
}

const DETAILS_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/'

export async function workshopDetails(ids: string[]): Promise<WorkshopDetails[]> {
  if (ids.length === 0) return []
  const form: Record<string, string> = { itemcount: String(ids.length) }
  ids.forEach((id, i) => {
    form[`publishedfileids[${i}]`] = id
  })

  const body = (await postForm(DETAILS_URL, form)) as {
    response?: { publishedfiledetails?: Record<string, unknown>[] }
  }
  return (body.response?.publishedfiledetails ?? []).map((raw) => {
    const value = (key: string): string => String(raw[key] ?? '')
    const time = Number(raw['time_updated'] ?? 0)
    return {
      workshopId: value('publishedfileid'),
      // `result` distinto de 1 significa que ese id no existe: entonces Steam
      // no manda ni el título, y decirlo vacío sería peor que no decir nada.
      title: value('title') || `Mod ${value('publishedfileid')}`,
      description: value('description'),
      appId: Number(raw['consumer_app_id'] ?? raw['creator_app_id'] ?? 0),
      sizeBytes: Number(raw['file_size'] ?? 0),
      updatedAt: time > 0 ? new Date(time * 1000).toISOString() : null,
      tags: Array.isArray(raw['tags'])
        ? (raw['tags'] as { tag?: string }[]).map((t) => String(t.tag ?? '')).filter(Boolean)
        : []
    }
  })
}

/**
 * Descarga un objeto del taller y deja sus mods en la carpeta del servidor.
 *
 * Lo que baja Steam tiene esta forma, comprobada con un mod real:
 *
 *     steamapps/workshop/content/108600/<id>/mods/<Nombre>/<versión>/mod.info
 *
 * De ahí, cada `<Nombre>` se copia tal cual a `Zomboid/mods/<Nombre>`, con sus
 * carpetas de versión: son ellas las que hacen que la Build 42 lo encuentre.
 */
export async function installWorkshopItem(
  instanceId: string,
  workshopId: string,
  onProgress?: (detail: string) => void
): Promise<string[]> {
  const staging = stagingDirFor(instanceId)
  await rm(staging, { recursive: true, force: true })

  onProgress?.('Descargando el mod del taller de Steam')
  const { path } = await workshopDownload({
    appId: ZOMBOID_WORKSHOP_APP_ID,
    workshopId,
    installDir: staging,
    onProgress: (_progress, label) => onProgress?.(label)
  })

  const desde = join(path, 'mods')
  if (!(await exists(desde))) {
    await rm(staging, { recursive: true, force: true })
    throw new Error(
      'Lo que se ha descargado no lleva ningún mod dentro. Puede que sea un objeto del taller que ' +
        'no es un mod (un mapa de imágenes, una traducción suelta) o que su autor lo haya subido mal.'
    )
  }

  onProgress?.('Colocando el mod en el servidor')
  await mkdir(modsDirFor(instanceId), { recursive: true })
  const carpetas: string[] = []
  for (const entry of await readdir(desde, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const destino = join(modsDirFor(instanceId), entry.name)
    // Se sustituye entero: actualizar un mod dejando ficheros del anterior es
    // la forma más fácil de que cargue medio roto.
    await rm(destino, { recursive: true, force: true })
    await cp(join(desde, entry.name), destino, { recursive: true })
    carpetas.push(entry.name)
  }

  // La descarga no se guarda: ya está copiada donde el servidor la busca.
  await rm(staging, { recursive: true, force: true })
  if (carpetas.length === 0) throw new Error('El objeto del taller venía vacío.')
  return carpetas
}

/** Borra del disco los mods de un objeto del taller. */
export async function removeWorkshopItem(instanceId: string, folders: string[]): Promise<void> {
  for (const folder of folders) {
    await rm(join(modsDirFor(instanceId), folder), { recursive: true, force: true })
  }
}

/**
 * Lee lo que hay instalado en `Zomboid/mods`.
 *
 * No se fía del manifiesto: lo que cuenta es lo que el servidor va a encontrar.
 */
export async function readInstalledMods(
  instanceId: string,
  gameVersion?: string
): Promise<ZomboidMod[]> {
  const dir = modsDirFor(instanceId)
  const mods: ZomboidMod[] = []

  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue
    const raiz = join(dir, entry.name)
    const versions = (await readdir(raiz, { withFileTypes: true }).catch(() => []))
      .filter((sub) => sub.isDirectory())
      .map((sub) => sub.name)

    const version = bestVersion(versions, gameVersion)
    const info = version ? await readModInfo(join(raiz, version, 'mod.info')) : null

    mods.push({
      // Lo rellena quien llama, que es el que sabe de qué objeto vino.
      workshopId: '',
      id: info?.id ?? entry.name,
      name: info?.name ?? entry.name,
      ...(info?.author ? { author: info.author } : {}),
      ...(info?.description ? { description: info.description } : {}),
      folder: entry.name,
      versions,
      version,
      maps: version ? await mapsIn(join(raiz, version)) : [],
      requires: info?.requires ?? [],
      sizeBytes: await folderSize(raiz)
    })
  }

  return mods.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/**
 * Junta lo pedido con lo instalado: para cada objeto del taller del manifiesto,
 * qué mods trae de verdad y qué le pasa, si le pasa algo.
 *
 * El reparto de mods por objeto se hace por la carpeta: cada objeto deja las
 * suyas en `Zomboid/mods`, y la app anota cuáles son al instalarlo. Los mods
 * que estén en disco sin dueño conocido (los puso el usuario a mano) salen
 * igual, porque el servidor los va a cargar si están en `Mods=`.
 */
export async function installedEntries(
  instanceId: string,
  refs: ZomboidModRef[],
  gameVersion?: string
): Promise<ZomboidModEntry[]> {
  const instalados = await readInstalledMods(instanceId, gameVersion)
  const porCarpeta = new Map(instalados.map((mod) => [mod.folder, mod]))
  const ids = new Set(instalados.map((mod) => mod.id))

  return refs.map((ref) => {
    const mods = (ref.folders ?? [])
      .map((folder) => porCarpeta.get(folder))
      .filter((mod): mod is ZomboidMod => mod !== undefined)
      .map((mod) => ({ ...mod, workshopId: ref.workshopId }))
    const problem = problemWith(mods, ids)
    return { ref, mods, ...(problem ? { problem } : {}) }
  })
}

/**
 * La carpeta de versión que usaría este servidor, o null si el mod no le sirve.
 *
 * ⚠ **No es «la más alta que no pase de la versión del juego»**, que es lo que
 * parece. Medido contra un servidor 42.20.4 con mods de mentira montados a
 * propósito (`pz-mods.mjs`):
 *
 * | Carpetas del mod | ¿Lo carga? | Cuál usa |
 * |---|---|---|
 * | ninguna (todo en la raíz) | no | — |
 * | `41` | **no** | — |
 * | `42` | sí | `42` |
 * | `42.20` | sí | `42.20` |
 * | `43` | **no** | — |
 * | `41` y `42` | sí | `42` |
 * | `42` y `42.20` | sí | **`42`** |
 * | `common` | sí | `common` |
 *
 * O sea: manda la **serie mayor**. Un mod de la 41 no sirve en la 42 aunque sea
 * «anterior», y uno de la 43 tampoco aunque sea «posterior». Entre dos que
 * valen, el servidor cogió la más baja.
 *
 * `common` es la carpeta que los mods usan para lo que vale en cualquier
 * versión, y se acepta siempre.
 */
export function bestVersion(versions: string[], gameVersion?: string): string | null {
  const numericas = versions.filter((v) => /^\d+(\.\d+)*$/.test(v))
  const tieneCommon = versions.includes('common')

  // Sin saber la versión del juego —antes del primer arranque— no se puede
  // juzgar: se da por buena la más baja en vez de asustar con un falso aviso.
  if (!gameVersion) {
    const cualquiera = [...numericas].sort(compareVersions)[0]
    return cualquiera ?? (tieneCommon ? 'common' : null)
  }

  const mayorDelJuego = Number(gameVersion.split('.')[0])
  const compatibles = numericas
    .filter((v) => Number(v.split('.')[0]) === mayorDelJuego)
    .filter((v) => compareVersions(v, gameVersion) <= 0)
    .sort(compareVersions)

  // La más baja de las que valen: es la que cogió el servidor cuando había dos.
  return compatibles[0] ?? (tieneCommon ? 'common' : null)
}

function compareVersions(a: string, b: string): number {
  const partesA = a.split('.').map(Number)
  const partesB = b.split('.').map(Number)
  for (let i = 0; i < Math.max(partesA.length, partesB.length); i++) {
    const diferencia = (partesA[i] ?? 0) - (partesB[i] ?? 0)
    if (diferencia !== 0) return diferencia
  }
  return 0
}

/** Lo que la app necesita del `mod.info`. */
interface ModInfo {
  id?: string
  name?: string
  author?: string
  description?: string
  requires: string[]
}

/**
 * El `mod.info` es un `clave=valor` por línea, como el `.ini` del servidor.
 * `require` puede traer varios separados por coma.
 */
export function parseModInfo(raw: string): ModInfo {
  const valores = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    const igual = line.indexOf('=')
    if (igual === -1) continue
    const clave = line.slice(0, igual).trim().toLowerCase()
    if (clave.length === 0) continue
    // Un mod puede repetir `require=`: se juntan en vez de quedarse el último.
    const valor = line.slice(igual + 1).trim()
    valores.set(clave, valores.has(clave) ? `${valores.get(clave)},${valor}` : valor)
  }
  const requires = (valores.get('require') ?? '')
    .split(/[,;]/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
  return {
    ...(valores.get('id') ? { id: valores.get('id') } : {}),
    ...(valores.get('name') ? { name: valores.get('name') } : {}),
    ...(valores.get('author') ? { author: valores.get('author') } : {}),
    ...(valores.get('description') ? { description: valores.get('description') } : {}),
    requires
  }
}

async function readModInfo(path: string): Promise<ModInfo | null> {
  const raw = await readFile(path, 'utf8').catch(() => null)
  return raw === null ? null : parseModInfo(raw)
}

/** Los mapas que aporta un mod, que además hay que declarar en `Map=`. */
async function mapsIn(versionDir: string): Promise<string[]> {
  const dir = join(versionDir, 'media', 'maps')
  return (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

/**
 * Por qué un objeto del taller no va a funcionar, dicho para el usuario.
 *
 * Es lo que evita el fallo típico de Zomboid: poner un mod de la Build 41 en un
 * servidor de la 42 y que el servidor no diga más que «required mod not found»
 * en una línea perdida del registro.
 */
export function problemWith(mods: ZomboidMod[], instalados: Set<string>): string | undefined {
  if (mods.length === 0) return 'Todavía no está descargado.'

  const incompatibles = mods.filter((mod) => mod.version === null)
  if (incompatibles.length === mods.length) {
    const versiones = [...new Set(mods.flatMap((mod) => mod.versions))]
    return versiones.length > 0
      ? `No sirve para esta versión del juego: está hecho para la ${versiones.join(', ')}.`
      : 'No trae carpeta de versión, así que el servidor no lo encuentra. Está hecho al estilo antiguo.'
  }

  const faltan = mods
    .flatMap((mod) => mod.requires)
    .filter((necesario) => !instalados.has(necesario))
  if (faltan.length > 0) {
    return `Necesita otros mods que no están: ${[...new Set(faltan)].join(', ')}.`
  }
  return undefined
}

export const modsInternals = { compareVersions }
