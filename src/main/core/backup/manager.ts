import { join } from 'node:path'
import { readdir, stat, writeFile, readFile, rm } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BackupInfo, InstanceManifest } from '@shared/types'
import { backupsDir, serverDir, ensureDir } from '../paths'
import * as worlds from '../worlds/manager'

const execFileAsync = promisify(execFile)

/**
 * Copias de seguridad (§12).
 *
 * ⚠ Con el servidor arrancado hay que volcar el mundo a disco ANTES de copiar:
 *   save-off -> save-all flush -> esperar confirmación -> copiar -> save-on
 * Copiar sin esa secuencia produce backups corruptos que solo se descubren el
 * día que hacen falta. La secuencia la orquesta `service.ts`, que es quien
 * tiene acceso al supervisor.
 *
 * El ZIP lo crea el bsdtar que trae Windows, para no añadir dependencias.
 */

/**
 * Ficheros de configuración que merece la pena conservar.
 * Las carpetas de mundo NO se listan aquí: dependen de `level-name`, así que
 * se resuelven en tiempo de ejecución (ver `worlds.foldersForWorld`).
 */
const BACKED_UP_FILES = ['server.properties', 'ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json']

/**
 * Ejecuta bsdtar propagando su stderr en el error.
 * Sin esto, un fallo llega como un escueto "Command failed" que no permite
 * diagnosticar nada — y aquí los fallos son de ficheros bloqueados o permisos.
 */
async function runTar(args: string[]): Promise<void> {
  try {
    await execFileAsync('tar.exe', args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16
    })
  } catch (err) {
    const detail = (err as { stderr?: string }).stderr?.trim()
    throw new Error(
      detail && detail.length > 0
        ? `No se pudo comprimir la copia: ${detail}`
        : `No se pudo comprimir la copia: ${(err as Error).message}`
    )
  }
}

function timestamp(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  )
}

function sidecarFor(zipPath: string): string {
  return zipPath.replace(/\.zip$/, '.json')
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export interface CreateBackupOptions {
  manifest: InstanceManifest
  automatic?: boolean
  reason?: string
  onProgress?: (detail: string) => void
}

/**
 * Crea el ZIP. NO se encarga del save-off/save-on: quien llama debe haber
 * dejado el mundo consistente (ver `service.createBackup`).
 */
export async function createBackup(options: CreateBackupOptions): Promise<BackupInfo> {
  const { manifest, automatic = false, reason, onProgress } = options
  const id = manifest.id
  const dir = backupsDir(id)
  await ensureDir(dir)

  const name = `${timestamp()}.zip`
  const zipPath = join(dir, name)

  // ⚠ El mundo NO se llama siempre "world": lo dice `level-name`. Asumirlo
  // haría que, en cuanto el usuario cambiara de mundo, las copias guardaran
  // el mundo equivocado o ninguno.
  const worldName = await worlds.activeWorldName(id)
  const worldFolders = await worlds.foldersForWorld(id, worldName)

  // Sin mundo no hay copia que valga: guardar solo la configuración de una
  // instancia recién creada llenaría el historial de ruido inútil.
  if (worldFolders.length === 0) {
    throw new Error('No hay nada que guardar todavía: el mundo aún no se ha generado.')
  }

  // Se listan solo las rutas existentes.
  const entries: string[] = [...worldFolders]
  for (const candidate of BACKED_UP_FILES) {
    if (await exists(join(serverDir(id), candidate))) entries.push(candidate)
  }

  onProgress?.('Comprimiendo el mundo')
  await runTar([
    '-c',
    '-a',
    '-f',
    zipPath,
    '-C',
    serverDir(id),
    // El servidor mantiene session.lock abierto en exclusiva mientras corre:
    // intentar leerlo hace fallar la compresión entera. Y no aporta nada,
    // porque es un fichero de bloqueo que el servidor recrea al arrancar.
    '--exclude',
    'session.lock',
    ...entries
  ])

  const info: BackupInfo = {
    fileName: name,
    createdAt: new Date().toISOString(),
    sizeBytes: (await stat(zipPath)).size,
    minecraftVersion: manifest.minecraftVersion,
    distribution: manifest.distribution,
    automatic,
    reason
  }

  // Sidecar con los metadatos: si alguien borra un zip a mano, la lista sigue
  // siendo coherente porque se deriva de los ficheros que hay de verdad.
  await writeFile(sidecarFor(zipPath), JSON.stringify(info, null, 2), 'utf8')
  return info
}

export async function listBackups(id: string): Promise<BackupInfo[]> {
  const dir = backupsDir(id)
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }

  const result: BackupInfo[] = []
  for (const file of files) {
    if (!file.endsWith('.zip')) continue
    const zipPath = join(dir, file)

    try {
      const raw = await readFile(sidecarFor(zipPath), 'utf8')
      result.push(JSON.parse(raw) as BackupInfo)
      continue
    } catch {
      // Sin sidecar: se reconstruye lo que se pueda del propio fichero.
    }

    const stats = await stat(zipPath)
    result.push({
      fileName: file,
      createdAt: stats.mtime.toISOString(),
      sizeBytes: stats.size,
      minecraftVersion: 'desconocida',
      distribution: 'vanilla',
      automatic: false
    })
  }

  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return result
}

export async function deleteBackup(id: string, fileName: string): Promise<void> {
  const zipPath = join(backupsDir(id), fileName)
  await rm(zipPath, { force: true })
  await rm(sidecarFor(zipPath), { force: true })
}

/**
 * Restaura una copia sobre el servidor.
 *
 * Antes de sobrescribir se guarda el estado actual: restaurar por error es
 * justo el momento en que más duele no tener vuelta atrás (§12).
 */
export async function restoreBackup(
  manifest: InstanceManifest,
  fileName: string,
  onProgress?: (detail: string) => void
): Promise<void> {
  const id = manifest.id
  const zipPath = join(backupsDir(id), fileName)
  if (!(await exists(zipPath))) {
    throw new Error(`No existe la copia ${fileName}.`)
  }

  onProgress?.('Guardando el estado actual por si acaso')
  await createBackup({
    manifest,
    automatic: true,
    reason: `Estado previo a restaurar ${fileName}`
  }).catch(() => undefined) // Un mundo vacío no se puede copiar, y no debe bloquear.

  onProgress?.('Retirando el mundo actual')
  const worldName = await worlds.activeWorldName(id)
  for (const folder of await worlds.foldersForWorld(id, worldName)) {
    await rm(join(serverDir(id), folder), { recursive: true, force: true })
  }

  onProgress?.('Restaurando la copia')
  await runTar(['-x', '-f', zipPath, '-C', serverDir(id)])
}

/**
 * Aplica la retención configurada, conservando siempre las N más recientes.
 * Devuelve cuántas se han borrado.
 */
export async function applyRetention(id: string, keep: number): Promise<number> {
  if (keep <= 0) return 0
  const backups = await listBackups(id)
  const excess = backups.slice(keep)
  for (const backup of excess) {
    await deleteBackup(id, backup.fileName)
  }
  return excess.length
}

/** Tamaño total de un directorio, recorriéndolo entero. */
async function directorySize(path: string): Promise<number> {
  let total = 0
  let entries: Dirent[]

  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }

  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      total += await directorySize(child)
    } else {
      try {
        total += (await stat(child)).size
      } catch {
        // Un fichero bloqueado por el servidor no debe romper el cálculo.
      }
    }
  }

  return total
}

/**
 * Cuánto ocupa (o va a ocupar) una copia, para poder anticipar al usuario el
 * coste de la retención que elija.
 *
 * Con copias reales se promedia, que es la única cifra fiable. Sin ellas se
 * estima a partir del mundo: las regiones de Minecraft son NBT comprimido y el
 * ZIP les saca poco más, así que se aplica un factor conservador del 70 %.
 */
export async function estimate(id: string): Promise<{
  perBackupBytes: number
  sampleCount: number
  worldBytes: number
  freeDiskBytes: number | null
}> {
  const existing = await listBackups(id)

  const worldName = await worlds.activeWorldName(id)
  let worldBytes = 0
  for (const folder of await worlds.foldersForWorld(id, worldName)) {
    worldBytes += await directorySize(join(serverDir(id), folder))
  }

  const perBackupBytes =
    existing.length > 0
      ? Math.round(existing.reduce((sum, b) => sum + b.sizeBytes, 0) / existing.length)
      : Math.round(worldBytes * 0.7)

  let freeDiskBytes: number | null = null
  try {
    const { statfs } = await import('node:fs/promises')
    const info = await statfs(backupsDir(id))
    freeDiskBytes = Number(info.bavail) * Number(info.bsize)
  } catch {
    // No es crítico: la interfaz simplemente no avisará del espacio libre.
  }

  return { perBackupBytes, sampleCount: existing.length, worldBytes, freeDiskBytes }
}
