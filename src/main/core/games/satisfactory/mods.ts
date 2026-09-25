import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModCatalogItem } from '@shared/games/mods'
import { download } from '../../net/downloader'
import { USER_AGENT } from '../../net/http'
import { serverDir } from '../../paths'
import { extractZip, placeFiles, resetStaging, type Placement } from '../modFiles'

/**
 * Mods de Satisfactory, de ficsit.app (el repositorio oficial de la comunidad,
 * también llamado SMR).
 *
 * Lo comprobado contra la API y contra los paquetes de verdad, que es lo que
 * hace que esto funcione (ANALISIS.md §19.23):
 *
 * 1. **Cada mod publica varias «dianas»** (`targets`): `Windows` es la del
 *    juego, `WindowsServer` la del servidor dedicado y `LinuxServer` la suya.
 *    Un servidor necesita **`WindowsServer`**, y hay mods que no la tienen
 *    (DifficultyTuner, por ejemplo): son de cliente y en un servidor no pintan
 *    nada. La app lo dice en el buscador en vez de instalar 20 MB inútiles.
 * 2. **El zip de ficsit ES la carpeta del mod**: en su raíz está el `.uplugin`.
 *    Va tal cual a `FactoryGame/Mods/<referencia>/`.
 * 3. **`resolveModVersions` resuelve los rangos** («^3.12.0») en el servidor,
 *    así que la app no necesita un intérprete de semver. Lo que **no** hace es
 *    elegir: con un rango ancho devuelve todas las que valen y sin ordenar, así
 *    que la más nueva la escoge la app.
 * 4. **Las dependencias no se resuelven solas**: `resolveModVersions` contesta
 *    solo por lo que se le pregunta. Se recorren a mano, que es justo lo que
 *    evita que el usuario instale un mod y el servidor se quede sin arrancar
 *    por una biblioteca que faltaba.
 * 5. **SML es un mod más del catálogo**, y es el cargador: sin él, el servidor
 *    ignora la carpeta `Mods` entera.
 */

const API = 'https://api.ficsit.app'

/** El cargador de mods, que en ficsit es un mod como los demás. */
export const LOADER_ID = 'SML'
export const LOADER_NAME = 'SML (Satisfactory Mod Loader)'

/** La única diana que le sirve a un servidor dedicado de Windows. */
const SERVER_TARGET = 'WindowsServer'

/** Dónde busca el servidor los mods, dentro de su carpeta. */
export const MODS_DIR = 'FactoryGame/Mods'

export function modsDirFor(instanceId: string): string {
  return join(serverDir(instanceId), 'FactoryGame', 'Mods')
}

// --- La API de ficsit ------------------------------------------------------------

interface FicsitTarget {
  targetName: string
  link: string
  size: number
  hash: string
}

export interface FicsitVersion {
  version: string
  /** Contra qué build del juego se hizo («>=491125»). */
  game_version: string
  /** Si los jugadores necesitan tenerlo también para poder entrar. */
  required_on_remote: boolean
  targets: FicsitTarget[]
  dependencies?: { mod_id: string; condition: string; optional: boolean }[]
}

interface FicsitMod {
  name: string
  mod_reference: string
  short_description: string
  downloads: number
  logo?: string
  authors?: { user?: { username?: string } }[]
  versions?: FicsitVersion[]
}

class FicsitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FicsitError'
  }
}

async function query<T>(
  gql: string,
  variables: Record<string, unknown> = {},
  timeoutMs = 30_000
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API}/v2/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({ query: gql, variables }),
      signal: controller.signal
    })
    if (!response.ok) {
      throw new FicsitError(`ficsit.app ha contestado con un error (${response.status}).`)
    }
    const body = (await response.json()) as { data?: T; errors?: { message: string }[] }
    // ficsit devuelve datos y errores a la vez cuando falla solo una parte (por
    // ejemplo `sml_version` de un mod antiguo). Con datos, se sigue.
    if (!body.data) {
      throw new FicsitError(body.errors?.[0]?.message ?? 'ficsit.app no ha devuelto nada.')
    }
    return body.data
  } catch (err) {
    if (err instanceof FicsitError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new FicsitError(`No se ha podido consultar ficsit.app: ${message}`)
  } finally {
    clearTimeout(timer)
  }
}

const MOD_FIELDS = `
  name
  mod_reference
  short_description
  downloads
  logo
  authors { user { username } }
`

const VERSION_FIELDS = `
  version
  game_version
  required_on_remote
  targets { targetName link size hash }
  dependencies { mod_id condition optional }
`

/**
 * Busca en el catálogo.
 *
 * ⚠ **El orden importa y no es el mismo en los dos casos.** Con texto se ordena
 * por `search`, que es la relevancia del propio catálogo: buscando «snapon» ese
 * mod sale el primero. Con `popularity` —que era lo primero que se probó— sale
 * el quinto, detrás de cuatro mods que no se llaman así, porque la popularidad
 * pisa la relevancia. Con la caja vacía sí manda la popularidad, que es lo que
 * sirve a quien no sabe qué buscar.
 */
export async function searchMods(text: string, limit = 20): Promise<ModCatalogItem[]> {
  const search = text.trim()
  const orden = search.length > 0 ? 'search' : 'popularity'
  const data = await query<{ getMods: { mods: FicsitMod[] } }>(
    `query($search:String,$limit:Int!){
      getMods(filter:{search:$search,limit:$limit,order_by:${orden},order:desc}){
        mods { ${MOD_FIELDS} versions(filter:{limit:5}){ version targets{ targetName } } }
      }
    }`,
    { search: search.length > 0 ? search : null, limit }
  )

  return data.getMods.mods
    .filter((mod) => mod.mod_reference !== LOADER_ID)
    .map((mod) => toCatalogItem(mod))
}

function toCatalogItem(mod: FicsitMod): ModCatalogItem {
  const versions = mod.versions ?? []
  const newest = pickNewest(versions)
  const forServer = versions.some((v) => v.targets?.some((t) => t.targetName === SERVER_TARGET))
  return {
    id: mod.mod_reference,
    name: mod.name,
    author: mod.authors?.[0]?.user?.username ?? 'anónimo',
    summary: mod.short_description,
    downloads: mod.downloads,
    version: newest?.version ?? null,
    ...(mod.logo ? { iconUrl: mod.logo } : {}),
    forServer,
    ...(forServer
      ? {}
      : {
          clientOnlyReason:
            'Solo publica versión para el juego, no para servidor: es un mod de cliente y cada ' +
            'jugador se lo instala en el suyo.'
        })
  }
}

/**
 * Las versiones que cumplen un rango, tal como las resuelve ficsit.
 *
 * ⚠ Devuelve **todas** las que valen, no la mejor: con `>=0.0.0` contesta el
 * historial entero y desordenado (comprobado). Elegir es cosa de `pickBest`.
 */
export async function resolveVersions(
  constraints: { id: string; range: string }[]
): Promise<Map<string, FicsitVersion[]>> {
  if (constraints.length === 0) return new Map()
  const data = await query<{
    resolveModVersions: { mod_reference: string; versions: FicsitVersion[] }[]
  }>(
    `query($filter:[ModVersionConstraint!]!){
      resolveModVersions(filter:$filter){ mod_reference versions { ${VERSION_FIELDS} } }
    }`,
    {
      filter: constraints.map((c) => ({ modIdOrReference: c.id, version: c.range }))
    }
  )
  return new Map(data.resolveModVersions.map((entry) => [entry.mod_reference, entry.versions]))
}

/** Los nombres legibles de unos cuantos mods, para poder nombrarlos en pantalla. */
export async function modNames(ids: string[]): Promise<Map<string, FicsitMod>> {
  if (ids.length === 0) return new Map()
  const data = await query<{ getMods: { mods: FicsitMod[] } }>(
    `query($refs:[String!],$limit:Int!){
      getMods(filter:{references:$refs,limit:$limit}){ mods { ${MOD_FIELDS} } }
    }`,
    { refs: ids, limit: Math.max(ids.length, 1) }
  )
  return new Map(data.getMods.mods.map((mod) => [mod.mod_reference, mod]))
}

// --- Elegir versión --------------------------------------------------------------

/**
 * Compara dos versiones tipo `2026.3.28` o `1.2.10`.
 *
 * Por partes numéricas, que es lo que usan los mods de ficsit: comparar como
 * texto pondría la 1.2.10 por debajo de la 1.2.2.
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(/[.\-+]/)
  const partsB = b.split(/[.\-+]/)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const rawA = partsA[i] ?? '0'
    const rawB = partsB[i] ?? '0'
    const numA = Number(rawA)
    const numB = Number(rawB)
    if (Number.isFinite(numA) && Number.isFinite(numB)) {
      if (numA !== numB) return numA - numB
    } else if (rawA !== rawB) {
      return rawA < rawB ? -1 : 1
    }
  }
  return 0
}

function pickNewest(versions: FicsitVersion[] | { version: string }[]): { version: string } | null {
  return (
    [...versions].sort((a, b) => compareVersions(b.version, a.version))[0] ?? null
  )
}

/**
 * El número de build del juego que tiene el servidor.
 *
 * La versión se guarda como la escribe el certificado del servidor
 * (`anniversary-2026 (build 502094)`), y a los mods solo les importa el número.
 */
export function buildNumber(gameVersion: string | undefined): number | null {
  const match = gameVersion ? /(\d{5,})/.exec(gameVersion) : null
  return match ? Number(match[1]) : null
}

/**
 * ¿Le vale esta versión del mod a esta build del juego?
 *
 * `game_version` viene como `>=491125`. Cuando no se reconoce la forma —o no se
 * sabe qué build tiene el servidor, porque aún no ha arrancado nunca— se
 * contesta que sí: un aviso inventado es peor que no avisar.
 */
export function fitsGame(constraint: string, build: number | null): boolean {
  if (build === null) return true
  const match = /^\s*(>=|<=|>|<|=)?\s*(\d+)\s*$/.exec(constraint ?? '')
  if (!match) return true
  const target = Number(match[2])
  switch (match[1] ?? '=') {
    case '>=':
      return build >= target
    case '>':
      return build > target
    case '<=':
      return build <= target
    case '<':
      return build < target
    default:
      return build === target
  }
}

/**
 * La versión que se instala: la más nueva que tenga versión de servidor y que
 * le valga a la build del juego.
 *
 * Si ninguna le vale a la build, se queda con la más nueva que haya de
 * servidor: es mejor instalarla y avisar que negarse, porque el catálogo va por
 * delante del servidor cada vez que Coffee Stain publica una actualización.
 */
export function pickBest(versions: FicsitVersion[], build: number | null): FicsitVersion | null {
  const conServidor = versions.filter((v) => targetFor(v) !== null)
  if (conServidor.length === 0) return null
  const ordenadas = [...conServidor].sort((a, b) => compareVersions(b.version, a.version))
  return ordenadas.find((v) => fitsGame(v.game_version, build)) ?? ordenadas[0] ?? null
}

export function targetFor(version: FicsitVersion): FicsitTarget | null {
  return version.targets?.find((t) => t.targetName === SERVER_TARGET) ?? null
}

// --- Instalación ------------------------------------------------------------------

/**
 * Qué hay que instalar para tener un mod: él y lo que necesita.
 *
 * Se resuelve **antes de descargar nada**, para poder decir de una vez lo que
 * va a entrar y cuánto ocupa, en vez de ir descubriéndolo a mitad.
 */
export interface InstallPlan {
  entries: { id: string; name: string; version: FicsitVersion; requiredBy?: string }[]
  /** La versión de SML que hace falta, si el servidor no la tiene ya. */
  loader: FicsitVersion | null
  /** Lo que ocupa todo junto. */
  sizeBytes: number
  /** Dependencias que no se instalan porque son de cliente. */
  clientOnly: string[]
}

/**
 * Resuelve el mod y todo lo que arrastra.
 *
 * `installed` son los mods que el servidor ya tiene, para no volver a bajarlos.
 * El recorrido es en anchura y con tope, porque una cadena de dependencias mal
 * publicada podría no acabar nunca.
 */
export async function planInstall(
  modId: string,
  options: { build: number | null; installed: Map<string, string>; loaderVersion: string | null }
): Promise<InstallPlan> {
  const entries: InstallPlan['entries'] = []
  const clientOnly: string[] = []
  const visto = new Set<string>()
  let loader: FicsitVersion | null = null

  let pendientes: { id: string; range: string; requiredBy?: string }[] = [
    { id: modId, range: '>=0.0.0' }
  ]

  for (let vuelta = 0; vuelta < 10 && pendientes.length > 0; vuelta++) {
    const porResolver = pendientes.filter((p) => !visto.has(p.id))
    pendientes = []
    if (porResolver.length === 0) break
    porResolver.forEach((p) => visto.add(p.id))

    const resueltas = await resolveVersions(porResolver.map((p) => ({ id: p.id, range: p.range })))
    const nombres = await modNames(porResolver.map((p) => p.id))

    for (const pendiente of porResolver) {
      const versiones = resueltas.get(pendiente.id) ?? []
      if (versiones.length === 0) {
        if (pendiente.id === modId) {
          throw new FicsitError(
            `El mod «${modId}» no tiene ninguna versión publicada que se pueda instalar.`
          )
        }
        // Una dependencia que ficsit no conoce: se avisa, pero no se aborta.
        clientOnly.push(pendiente.id)
        continue
      }

      const elegida = pickBest(versiones, options.build)
      if (!elegida) {
        if (pendiente.id === modId) {
          throw new FicsitError(
            `«${nombres.get(modId)?.name ?? modId}» no publica versión para servidor dedicado: ` +
              'es un mod de cliente y cada jugador se lo instala en el suyo.'
          )
        }
        clientOnly.push(nombres.get(pendiente.id)?.name ?? pendiente.id)
        continue
      }

      if (pendiente.id === LOADER_ID) {
        // El cargador va aparte: no es un mod de la lista del usuario.
        if (options.loaderVersion === null || compareVersions(elegida.version, options.loaderVersion) > 0) {
          loader = elegida
        }
        continue
      }

      const yaInstalada = options.installed.get(pendiente.id)
      if (yaInstalada === undefined || compareVersions(elegida.version, yaInstalada) > 0) {
        entries.push({
          id: pendiente.id,
          name: nombres.get(pendiente.id)?.name ?? pendiente.id,
          version: elegida,
          ...(pendiente.requiredBy ? { requiredBy: pendiente.requiredBy } : {})
        })
      }

      for (const dep of elegida.dependencies ?? []) {
        if (dep.optional) continue
        if (visto.has(dep.mod_id)) continue
        pendientes.push({
          id: dep.mod_id,
          range: dep.condition,
          requiredBy: nombres.get(pendiente.id)?.name ?? pendiente.id
        })
      }
    }
  }

  const sizeBytes =
    entries.reduce((total, e) => total + (targetFor(e.version)?.size ?? 0), 0) +
    (loader ? (targetFor(loader)?.size ?? 0) : 0)

  return { entries, loader, sizeBytes, clientOnly: [...new Set(clientOnly)] }
}

/**
 * Descarga un paquete y lo deja en `FactoryGame/Mods/<referencia>`.
 *
 * El zip de ficsit es ya la carpeta del mod, así que no hay nada que decidir:
 * todo va dentro de la suya. El hash que publica el catálogo se comprueba
 * siempre; un paquete a medias dejaría el servidor sin arrancar y el fallo
 * saldría al arrancar, no aquí.
 */
export async function installPackage(
  instanceId: string,
  modId: string,
  version: FicsitVersion,
  onProgress?: (detail: string) => void
): Promise<string[]> {
  const target = targetFor(version)
  if (!target) {
    throw new FicsitError(`«${modId}» no tiene versión para servidor dedicado.`)
  }

  const staging = await resetStaging(instanceId)
  try {
    const zip = join(staging, `${modId}.zip`)
    onProgress?.(`Descargando ${modId} ${version.version}`)
    await download({
      url: `${API}${target.link}`,
      destination: zip,
      expectedHash: { algorithm: 'sha256', value: target.hash }
    })

    onProgress?.(`Colocando ${modId}`)
    const contenido = join(staging, 'contenido')
    await extractZip(zip, contenido)

    const carpeta = `${MODS_DIR}/${modId}`
    // Se sustituye entera: dejar ficheros de la versión anterior es la forma
    // más fácil de que el servidor cargue medio mod y no arranque.
    await rm(join(serverDir(instanceId), ...carpeta.split('/')), {
      recursive: true,
      force: true
    })

    const place = (entry: string): Placement => ({
      dest: `${carpeta}/${entry}`,
      owns: carpeta
    })
    return await placeFiles(instanceId, contenido, place)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

// --- Lo que hay en disco -----------------------------------------------------------

/** Lo que se puede saber de un mod mirando solo su `.uplugin`. */
export interface UpluginInfo {
  version: string | null
  name: string | null
}

/**
 * Lee el `.uplugin` de un mod instalado.
 *
 * Es la forma de saber qué versión hay puesta de verdad, sin fiarse del
 * manifiesto: si el usuario copió un mod a mano, aquí sale igual.
 */
export async function readUplugin(dir: string): Promise<UpluginInfo | null> {
  const files = await readdir(dir).catch(() => [])
  const uplugin = files.find((f) => f.toLowerCase().endsWith('.uplugin'))
  if (!uplugin) return null
  try {
    const raw = JSON.parse(await readFile(join(dir, uplugin), 'utf8')) as {
      SemVersion?: string
      VersionName?: string
      FriendlyName?: string
    }
    return {
      version: raw.SemVersion ?? raw.VersionName ?? null,
      name: raw.FriendlyName ?? null
    }
  } catch {
    return null
  }
}

/** Las carpetas que hay ahora mismo en `FactoryGame/Mods`, con su versión. */
export async function installedOnDisk(instanceId: string): Promise<Map<string, UpluginInfo>> {
  const dir = modsDirFor(instanceId)
  const found = new Map<string, UpluginInfo>()
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue
    const info = await readUplugin(join(dir, entry.name))
    if (info) found.set(entry.name, info)
  }
  return found
}

export { FicsitError }
