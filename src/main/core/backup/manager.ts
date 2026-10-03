import { join } from 'node:path'
import { readdir, stat, writeFile, readFile, rm } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BackupInfo, InstanceManifest } from '@shared/types'
import { GAMES, type GameInfo, type SaveKind } from '@shared/games'
import { backupsDir, serverDir, ensureDir, systemTarPath } from '../paths'

/**
 * «el mapa», «el mundo», «la partida»: cómo se llama lo que se guarda en ese
 * juego. «la partida» si el juego no está en el catálogo (el falso del smoke).
 *
 * En español a propósito: los mensajes del núcleo aún no se traducen (llegará
 * con la segunda entrega de los idiomas, pasándolos a códigos).
 */
const SAVE_ES: Record<SaveKind, string> = { world: 'el mundo', game: 'la partida', map: 'el mapa' }

function saveOf(manifest: InstanceManifest): string {
  const kind = (GAMES as Record<string, GameInfo | undefined>)[manifest.game]?.save
  return kind ? SAVE_ES[kind] : 'la partida'
}

const execFileAsync = promisify(execFile)

/**
 * Copias de seguridad (§12), para cualquier juego.
 *
 * Este módulo solo sabe comprimir, listar y restaurar. QUÉ se copia lo decide
 * el juego (`GameAdapter.backupEntries`), porque cada uno guarda la partida en
 * un sitio distinto.
 *
 * ⚠ Con el servidor arrancado hay que dejar la partida consistente en disco
 * ANTES de copiar (en Minecraft: save-off -> save-all flush -> esperar
 * confirmación -> copiar -> save-on). Copiar sin eso produce backups corruptos
 * que solo se descubren el día que hacen falta. La secuencia la orquesta
 * `service.ts`, que es quien tiene acceso al supervisor.
 *
 * El ZIP lo crea el bsdtar que trae Windows, para no añadir dependencias.
 */

/**
 * Ejecuta bsdtar propagando su stderr en el error.
 * Sin esto, un fallo llega como un escueto "Command failed" que no permite
 * diagnosticar nada — y aquí los fallos son de ficheros bloqueados o permisos.
 */
async function runTar(args: string[]): Promise<void> {
  try {
    await execFileAsync(systemTarPath(), args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16
    })
  } catch (err) {
    // tar de Windows a veces solo escribe «tar.exe: (null)», que no le dice
    // nada a nadie: se le añade lo que haya dicho por la salida normal y el
    // código con el que terminó, que es lo que permite distinguir un fichero
    // bloqueado de un disco lleno.
    const fallo = err as { stderr?: string; stdout?: string; code?: number }
    const partes = [fallo.stderr?.trim(), fallo.stdout?.trim()].filter(
      (parte): parte is string => parte !== undefined && parte.length > 0 && parte !== 'tar.exe: (null)'
    )
    if (partes.length === 0) partes.push((err as Error).message)
    if (fallo.code !== undefined) partes.push(`(tar terminó con ${fallo.code})`)
    throw new Error(`No se pudo comprimir la copia: ${partes.join(' ')}`)
  }
}

function timestamp(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  )
}

/**
 * Un nombre libre a partir de la marca de tiempo.
 *
 * El nombre solo llega al segundo, y hay momentos en que se hacen dos copias
 * seguidas: pedir una a mano y reinstalar (o cambiar de versión) justo después
 * caía en el mismo segundo, y la segunda **sobrescribía** a la primera sin
 * decir nada. Se perdía justo la copia que alguien había pedido a propósito.
 */
async function freeName(dir: string, date = new Date()): Promise<string> {
  const base = timestamp(date)
  if (!(await exists(join(dir, `${base}.zip`)))) return `${base}.zip`
  for (let n = 2; n < 100; n++) {
    if (!(await exists(join(dir, `${base}-${n}.zip`)))) return `${base}-${n}.zip`
  }
  throw new Error('Demasiadas copias en el mismo segundo.')
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
  /** Rutas relativas a la carpeta del servidor, según el juego. */
  entries: string[]
  /** Versión y variante del juego que se anotan en la copia. */
  meta: { version: string; variant?: string }
  automatic?: boolean
  reason?: string
  onProgress?: (detail: string) => void
}

/**
 * Crea el ZIP. NO deja la partida consistente: quien llama debe haberlo hecho
 * (ver `service.createBackup`).
 */
export async function createBackup(options: CreateBackupOptions): Promise<BackupInfo> {
  const { manifest, entries, meta, automatic = false, reason, onProgress } = options
  const id = manifest.id

  // Sin partida no hay copia que valga: guardar solo la configuración de una
  // instancia recién creada llenaría el historial de ruido inútil.
  if (entries.length === 0) {
    throw new Error(`No hay nada que guardar todavía: ${saveOf(manifest)} aún no se ha generado.`)
  }

  const dir = backupsDir(id)
  await ensureDir(dir)

  const name = await freeName(dir)
  const zipPath = join(dir, name)

  onProgress?.(`Comprimiendo ${saveOf(manifest)}`)
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
    game: manifest.game,
    version: meta.version,
    ...(meta.variant ? { variant: meta.variant } : {}),
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
      result.push(normalizeSidecar(JSON.parse(raw) as LegacyBackupInfo))
      continue
    } catch {
      // Sin sidecar: se reconstruye lo que se pueda del propio fichero.
    }

    const stats = await stat(zipPath)
    result.push({
      fileName: file,
      createdAt: stats.mtime.toISOString(),
      sizeBytes: stats.size,
      game: 'minecraft',
      version: 'desconocida',
      automatic: false
    })
  }

  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return result
}

/** Sidecar escrito antes de la v2 del manifiesto, cuando solo había Minecraft. */
type LegacyBackupInfo = Partial<BackupInfo> & {
  fileName: string
  createdAt: string
  sizeBytes: number
  minecraftVersion?: string
  distribution?: string
}

/**
 * Las copias hechas con versiones anteriores de la app guardaban
 * `minecraftVersion` y `distribution`. No se reescriben en disco: se leen
 * igual, para que el historial no pierda ninguna.
 */
function normalizeSidecar(raw: LegacyBackupInfo): BackupInfo {
  const { minecraftVersion, distribution, ...rest } = raw
  const variant = raw.variant ?? distribution
  return {
    ...rest,
    fileName: raw.fileName,
    createdAt: raw.createdAt,
    sizeBytes: raw.sizeBytes,
    game: raw.game ?? 'minecraft',
    version: raw.version ?? minecraftVersion ?? 'desconocida',
    ...(variant ? { variant } : {}),
    automatic: raw.automatic ?? false
  }
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
export interface RestoreBackupOptions {
  /** Carpetas que se retiran antes de extraer, según el juego. */
  targets: string[]
  /** Copia del estado actual antes de sobrescribir; puede fallar sin bloquear. */
  saveCurrent: () => Promise<unknown>
  onProgress?: (detail: string) => void
}

export async function restoreBackup(
  manifest: InstanceManifest,
  fileName: string,
  options: RestoreBackupOptions
): Promise<void> {
  const { targets, saveCurrent, onProgress } = options
  const id = manifest.id
  const zipPath = join(backupsDir(id), fileName)
  if (!(await exists(zipPath))) {
    throw new Error(`No existe la copia ${fileName}.`)
  }

  onProgress?.('Guardando el estado actual por si acaso')
  // Una partida vacía no se puede copiar, y eso no debe bloquear la restauración.
  await saveCurrent().catch(() => undefined)

  onProgress?.(`Retirando ${saveOf(manifest)} de ahora`)
  for (const folder of targets) {
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

/** Tamaño de un fichero o de un directorio entero. */
async function pathSize(path: string): Promise<number> {
  try {
    const info = await stat(path)
    return info.isDirectory() ? directorySize(path) : info.size
  } catch {
    return 0
  }
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
 * estima a partir de lo que se copiaría: las partidas suelen ir ya comprimidas
 * (las regiones de Minecraft son NBT comprimido) y el ZIP les saca poco más,
 * así que se aplica un factor conservador del 70 %.
 */
export async function estimate(id: string, entries: string[]): Promise<{
  perBackupBytes: number
  sampleCount: number
  worldBytes: number
  freeDiskBytes: number | null
}> {
  const existing = await listBackups(id)

  let worldBytes = 0
  for (const entry of entries) {
    worldBytes += await pathSize(join(serverDir(id), entry))
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
