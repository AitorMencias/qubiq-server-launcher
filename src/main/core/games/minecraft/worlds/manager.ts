import { join } from 'node:path'
import { readdir, stat, rm, access } from 'node:fs/promises'
import type { CreateWorldRequest, WorldInfo } from '@shared/games/minecraft/types'
import { childPath, serverDir } from '../../../paths'
import { PropertiesFile } from '../config/properties'

/**
 * Gestión de mundos (§8).
 *
 * Un servidor de Minecraft solo tiene UN mundo activo: el que indica
 * `level-name` en server.properties. "Varios mundos" son varias carpetas
 * conviviendo, y cambiar de mundo es cambiar esa clave y reiniciar.
 *
 * ⚠ Estructura comprobada en MC 26.x (vanilla y Paper): las tres dimensiones
 * viven DENTRO de la carpeta del mundo, en `dimensions/minecraft/...`. Las
 * carpetas `<mundo>_nether` y `<mundo>_the_end` sueltas son del esquema antiguo
 * de Bukkit/Spigot; se siguen contemplando porque los mundos importados de
 * servidores viejos las traen.
 */

const DEFAULT_LEVEL_NAME = 'world'

/** Carpetas del servidor que nunca son mundos, aunque estén al mismo nivel. */
const NOT_WORLDS = new Set([
  'libraries', 'logs', 'versions', 'plugins', 'mods', 'config', 'cache',
  'crash-reports', 'backups', '.paper', '.fabric', 'defaultconfigs', 'kubejs'
])

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function propertiesPath(id: string): string {
  return join(serverDir(id), 'server.properties')
}

/** Nombre del mundo activo según server.properties. */
export async function activeWorldName(id: string): Promise<string> {
  const props = await PropertiesFile.load(propertiesPath(id))
  const name = props.get('level-name')?.trim()
  return name && name.length > 0 ? name : DEFAULT_LEVEL_NAME
}

/** Tamaño total de un directorio. */
async function directorySize(path: string): Promise<number> {
  let total = 0
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) total += await directorySize(child)
    else {
      try {
        total += (await stat(child)).size
      } catch {
        // Fichero bloqueado por el servidor: no debe romper el cálculo.
      }
    }
  }
  return total
}

/** Carpetas heredadas que acompañan a un mundo en servidores antiguos. */
async function legacyFoldersFor(id: string, name: string): Promise<string[]> {
  const found: string[] = []
  for (const suffix of ['_nether', '_the_end']) {
    const folder = `${name}${suffix}`
    if (await exists(join(serverDir(id), folder))) found.push(folder)
  }
  return found
}

/**
 * Mundos presentes en el servidor.
 *
 * Se identifican por contener `level.dat`, que es lo que hace a una carpeta un
 * mundo de verdad; así no se cuelan `plugins`, `logs` ni carpetas de mods.
 */
export async function listWorlds(id: string): Promise<WorldInfo[]> {
  const dir = serverDir(id)
  const active = await activeWorldName(id)

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const worlds: WorldInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (NOT_WORLDS.has(entry.name)) continue
    // Las carpetas heredadas se contabilizan dentro de su mundo, no aparte.
    if (/_(nether|the_end)$/.test(entry.name)) continue
    if (!(await exists(join(dir, entry.name, 'level.dat')))) continue

    const legacy = await legacyFoldersFor(id, entry.name)
    let size = await directorySize(join(dir, entry.name))
    for (const folder of legacy) size += await directorySize(join(dir, folder))

    let lastPlayed: string | null = null
    try {
      lastPlayed = (await stat(join(dir, entry.name, 'level.dat'))).mtime.toISOString()
    } catch {
      // Sin fecha; la interfaz lo muestra como desconocida.
    }

    worlds.push({
      name: entry.name,
      active: entry.name === active,
      sizeBytes: size,
      lastPlayed,
      generated: true,
      legacyFolders: legacy
    })
  }

  // Si el mundo activo aún no existe en disco, se muestra igualmente: el
  // usuario acaba de crearlo y el servidor lo generará al arrancar. Omitirlo
  // haría parecer que la creación no ha funcionado.
  if (!worlds.some((w) => w.name === active)) {
    worlds.push({
      name: active,
      active: true,
      sizeBytes: 0,
      lastPlayed: null,
      generated: false,
      legacyFolders: []
    })
  }

  worlds.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '')
  })

  return worlds
}

/**
 * Valida un nombre de mundo.
 * Es un nombre de carpeta en Windows, con sus restricciones.
 */
export function validateWorldName(name: string): string | null {
  const trimmed = name.trim()

  if (trimmed.length === 0) return 'Ponle un nombre al mundo.'
  if (trimmed.length > 40) return 'El nombre es demasiado largo (máximo 40 caracteres).'
  if (/[<>:"/\\|?*]/.test(trimmed)) return 'El nombre no puede contener < > : " / \\ | ? *'
  if (/[\x00-\x1f]/.test(trimmed)) return 'El nombre contiene caracteres no válidos.'
  if (/[. ]$/.test(trimmed)) return 'El nombre no puede acabar en punto ni en espacio.'
  if (/_(nether|the_end)$/.test(trimmed)) {
    return 'Ese sufijo está reservado para las dimensiones. Elige otro nombre.'
  }
  if (NOT_WORLDS.has(trimmed.toLowerCase())) {
    return 'Ese nombre lo usa el servidor para otra cosa. Elige otro.'
  }

  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
  if (reserved.test(trimmed)) return 'Windows reserva ese nombre. Elige otro.'

  return null
}

/**
 * Crea un mundo: lo deja seleccionado para que el servidor lo genere al
 * arrancar. No se genera aquí porque generar un mundo es trabajo del propio
 * servidor, y hacerlo por nuestra cuenta sería inventar su formato.
 */
export async function createWorld(id: string, request: CreateWorldRequest): Promise<string> {
  const name = request.name.trim()
  const error = validateWorldName(name)
  if (error) throw new Error(error)

  if (await exists(join(serverDir(id), name))) {
    throw new Error(`Ya existe un mundo llamado "${name}".`)
  }

  const path = propertiesPath(id)
  const props = await PropertiesFile.load(path)
  props.set('level-name', name)

  // La semilla se limpia si no se indica: si quedara la de un mundo anterior,
  // el "mundo nuevo" saldría idéntico al viejo sin que nadie lo esperase.
  props.set('level-seed', request.seed?.trim() ?? '')
  if (request.levelType) props.set('level-type', request.levelType)

  await props.save(path)
  return name
}

/** Cambia el mundo activo. El servidor debe estar parado. */
export async function activateWorld(id: string, name: string): Promise<void> {
  if (!(await exists(join(childPath(serverDir(id), name), 'level.dat')))) {
    throw new Error(`El mundo "${name}" no existe o está incompleto.`)
  }

  const path = propertiesPath(id)
  const props = await PropertiesFile.load(path)
  props.set('level-name', name)
  // La semilla solo actúa al generar: dejar aquí la de otro mundo no cambia
  // este, pero sí contaminaría el siguiente que se cree.
  props.set('level-seed', '')
  await props.save(path)
}

/** Borra un mundo y sus carpetas heredadas. Irreversible. */
export async function deleteWorld(id: string, name: string): Promise<void> {
  const active = await activeWorldName(id)
  if (name === active) {
    throw new Error(
      'No se puede borrar el mundo activo. Activa otro primero y vuelve a intentarlo.'
    )
  }

  const dir = serverDir(id)
  // Los mundos viven sueltos en la carpeta del servidor, junto a `plugins` o
  // `libraries`: solo se borra lo que es un mundo de verdad (§19.36).
  const world = childPath(dir, name)
  if (!(await exists(join(world, 'level.dat')))) {
    throw new Error(`El mundo "${name}" ya no existe.`)
  }

  await rm(world, { recursive: true, force: true })
  for (const folder of await legacyFoldersFor(id, name)) {
    await rm(join(dir, folder), { recursive: true, force: true })
  }
}

/**
 * Carpetas que hay que copiar para respaldar un mundo concreto.
 * Lo usa el servicio de copias, que ya no puede asumir que el mundo se llame
 * "world": depende de `level-name`.
 */
export async function foldersForWorld(id: string, name: string): Promise<string[]> {
  const folders: string[] = []
  if (await exists(join(serverDir(id), name))) folders.push(name)
  folders.push(...(await legacyFoldersFor(id, name)))
  return folders
}
