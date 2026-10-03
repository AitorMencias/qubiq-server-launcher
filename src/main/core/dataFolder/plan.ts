import { join, parse, relative, resolve, isAbsolute, dirname } from 'node:path'
import { access, lstat, mkdtemp, readdir, rmdir, statfs } from 'node:fs/promises'
import type { InstanceManifest } from '@shared/types'
import type { RelocationPlan, RelocationProblem, RelocationWarning } from '@shared/dataFolder'
import { DATA_ENTRIES } from '../paths'
import { MAX_PATH, modsPathLength } from '../games/valheim/mods'
import { listTree } from './tree'

/**
 * Comprobar ANTES de mover nada si la carpeta elegida sirve.
 *
 * Todo lo que se pueda saber de antemano se dice aquí, y no a mitad de un
 * traslado de decenas de GB: que no quepa, que tenga espacios (el instalador de
 * Forge se atraganta con ellos), que Valheim se quede sin mods por la longitud
 * de la ruta o que haya un servidor encendido.
 */

/** Margen de espacio libre sobre lo que ocupan los datos, para no dejar el disco a cero. */
export const SPACE_MARGIN_BYTES = 1024 ** 3

/** Subcarpeta que se crea cuando la elegida ya tiene cosas dentro. */
export const SUBFOLDER = 'QubiQ'

export interface PlanInput {
  /** Donde están ahora los datos. */
  from: string
  /** Lo que eligió el usuario. */
  chosen: string
  /** La carpeta de siempre: volver a ella se permite aunque tenga los ficheros de Electron. */
  defaultRoot: string
  manifests: InstanceManifest[]
  /** Servidores encendidos o instalándose, por su nombre. */
  busy: string[]
}

export function samePath(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase()
}

/** true si `inner` está dentro de `outer` (o es ella). */
export function isInside(inner: string, outer: string): boolean {
  const rel = relative(resolve(outer).toLowerCase(), resolve(inner).toLowerCase())
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function sameDrive(a: string, b: string): boolean {
  return parse(resolve(a)).root.toLowerCase() === parse(resolve(b)).root.toLowerCase()
}

/** La carpeta donde acabarán los datos, según lo que haya en la elegida. */
export async function resolveTarget(chosen: string, defaultRoot: string): Promise<string> {
  const clean = resolve(chosen)
  if (samePath(clean, defaultRoot)) return resolve(defaultRoot)
  const entries = await readdir(clean).catch(() => null)
  if (!entries || entries.length === 0) return clean
  return join(clean, SUBFOLDER)
}

/**
 * ¿Hay algo ahí que se pisaría? Un fichero o una carpeta con cosas dentro. Una
 * carpeta vacía no cuenta: la puede haber dejado una versión anterior o un
 * traslado deshecho, y el traslado la sustituye (`relocate.ts`).
 */
export async function hasContent(path: string): Promise<boolean> {
  const info = await lstat(path).catch(() => null)
  if (!info) return false
  if (!info.isDirectory()) return true
  return (await readdir(path).catch(() => [])).length > 0
}

/** La carpeta existente más cercana: donde se mira el espacio y los permisos. */
async function existingAncestor(path: string): Promise<string> {
  let current = resolve(path)
  for (;;) {
    try {
      await access(current)
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

/**
 * ¿Se puede crear algo ahí? Se prueba con una carpeta y no con un fichero: en la
 * raíz de `C:\` un usuario normal puede crear carpetas pero no ficheros, y la
 * app solo va a crear una carpeta.
 */
async function canCreateIn(folder: string): Promise<boolean> {
  try {
    const probe = await mkdtemp(join(folder, '.qubiq-prueba-'))
    await rmdir(probe)
    return true
  } catch {
    return false
  }
}

/** Lo que ocupan ahora los datos de la app, y el primer enlace si lo hay. */
export async function measureData(from: string): Promise<{ bytes: number; link: string | null }> {
  let bytes = 0
  let link: string | null = null
  for (const entry of DATA_ENTRIES) {
    const listing = await listTree(join(from, entry)).catch(() => null)
    if (!listing) continue
    bytes += listing.totalBytes
    if (listing.link !== null && link === null) {
      link = listing.link ? join(entry, listing.link) : entry
    }
  }
  return { bytes, link }
}

export async function planRelocation(input: PlanInput): Promise<RelocationPlan> {
  const { from, chosen, defaultRoot, manifests, busy } = input
  const target = await resolveTarget(chosen, defaultRoot)
  const problems: RelocationProblem[] = []
  const warnings: RelocationWarning[] = []

  if (samePath(target, from)) problems.push({ code: 'same' })
  else if (isInside(target, from) || isInside(from, target)) problems.push({ code: 'nested' })

  if (/\s/.test(target)) problems.push({ code: 'spaces' })
  // Una carpeta de red se puede caer a mitad de partida, y SteamCMD ni instala en ella.
  if (target.startsWith('\\\\')) problems.push({ code: 'network' })

  const occupied: string[] = []
  for (const entry of DATA_ENTRIES) {
    if (await hasContent(join(target, entry))) occupied.push(entry)
  }
  if (occupied.length > 0 && !samePath(target, from)) problems.push({ code: 'occupied', entries: occupied })

  const ancestor = await existingAncestor(target)
  if (!(await canCreateIn(ancestor))) problems.push({ code: 'not-writable' })

  if (busy.length > 0) problems.push({ code: 'busy', servers: busy })

  // Valheim: la ruta de su biblioteca más metida no puede pasar de 260
  // caracteres o BepInEx no arranca y el servidor se queda sin mods sin decir
  // nada. Con mods puestos, eso rompe el servidor: no se deja. Sin ellos solo
  // cierra la puerta a ponerlos, y basta con avisar.
  const valheimWithMods: string[] = []
  const valheimWithout: string[] = []
  let longest = 0
  for (const manifest of manifests) {
    if (manifest.game !== 'valheim') continue
    const length = modsPathLength(join(target, 'instances', manifest.id, 'server'))
    if (length <= MAX_PATH) continue
    longest = Math.max(longest, length)
    const hasMods = Boolean(manifest.data.loaderVersion) || (manifest.data.mods?.length ?? 0) > 0
    ;(hasMods ? valheimWithMods : valheimWithout).push(manifest.name)
  }
  if (valheimWithMods.length > 0) {
    problems.push({ code: 'valheim-path', servers: valheimWithMods, length: longest, max: MAX_PATH })
  } else if (valheimWithout.length > 0) {
    warnings.push({ code: 'valheim-path', servers: valheimWithout, length: longest, max: MAX_PATH })
  }

  const drive = sameDrive(target, from)
  const { bytes, link } = await measureData(from)

  let freeBytes: number | null = null
  try {
    const stats = await statfs(ancestor)
    freeBytes = Number(stats.bavail) * Number(stats.bsize)
  } catch {
    freeBytes = null
  }

  if (!drive) {
    // Entre discos se copia: un enlace no se puede llevar sin arrastrar lo que
    // hay al otro lado, y hace falta sitio para todo.
    if (link) problems.push({ code: 'links', path: link })
    const needed = bytes + SPACE_MARGIN_BYTES
    if (freeBytes !== null && freeBytes < needed) {
      problems.push({ code: 'space', neededBytes: needed, freeBytes })
    }
    warnings.push({ code: 'copy', totalBytes: bytes })
  }

  // OneDrive y compañía suben lo que cambia y bloquean ficheros mientras lo
  // hacen: con servidores dentro, eso son GB de subida y partidas a medio escribir.
  if (/\\(onedrive|dropbox|google ?drive|icloud ?drive)[^\\]*(\\|$)/i.test(target)) {
    warnings.push({ code: 'cloud' })
  }

  // Siempre: los permisos del cortafuegos van por la ruta del programa, y los
  // programas de los servidores cambian de ruta.
  warnings.push({ code: 'firewall' })

  return {
    chosen: resolve(chosen),
    target,
    sameDrive: drive,
    totalBytes: bytes,
    freeBytes,
    problems,
    warnings
  }
}
