import { join } from 'node:path'
import { access, readdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { runtimesDir, ensureDir, cacheDir, systemTarPath } from '../../../paths'
import { download } from '../../../net/downloader'

const execFileAsync = promisify(execFile)

/**
 * Gestión de Java (§4.7).
 *
 * Es el mayor punto de fricción del flujo actual: el usuario NUNCA instala Java.
 * Los runtimes se guardan compartidos entre instancias (~180 MB cada uno).
 */

const ADOPTIUM = 'https://api.adoptium.net/v3'

export interface JavaRuntime {
  major: number
  javaPath: string
  home: string
}

function arch(): 'x64' | 'aarch64' {
  return process.arch === 'arm64' ? 'aarch64' : 'x64'
}

function runtimeHome(major: number): string {
  return join(runtimesDir(), `jdk-${major}`)
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
 * Adoptium entrega un ZIP que descomprime a una carpeta con nombre propio
 * (`jdk-25.0.1+9`), así que hay que localizarla en lugar de asumir la ruta.
 */
async function findJavaExecutable(home: string): Promise<string | null> {
  const direct = join(home, 'bin', 'java.exe')
  if (await exists(direct)) return direct

  let entries: string[]
  try {
    entries = await readdir(home)
  } catch {
    return null
  }

  for (const entry of entries) {
    const candidate = join(home, entry, 'bin', 'java.exe')
    if (await exists(candidate)) return candidate
  }
  return null
}

/** Runtime ya instalado para esa versión mayor, o null. */
export async function findInstalled(major: number): Promise<JavaRuntime | null> {
  const home = runtimeHome(major)
  const javaPath = await findJavaExecutable(home)
  if (!javaPath) return null
  return { major, javaPath, home }
}

export interface EnsureJavaProgress {
  (phase: 'download' | 'extract', progress: number | null, detail?: string): void
}

/**
 * Devuelve un Java utilizable para esa versión mayor, descargándolo si hace falta.
 * Idempotente: si ya está, no hace nada.
 */
export async function ensureJava(
  major: number,
  onProgress?: EnsureJavaProgress
): Promise<JavaRuntime> {
  const installed = await findInstalled(major)
  if (installed) return installed

  const home = runtimeHome(major)
  await ensureDir(home)
  await ensureDir(cacheDir())

  const url =
    `${ADOPTIUM}/binary/latest/${major}/ga/windows/${arch()}/jdk/hotspot/normal/eclipse`
  const archivePath = join(cacheDir(), `jdk-${major}-${arch()}.zip`)

  onProgress?.('download', 0, `Descargando Java ${major}`)
  await download({
    url,
    destination: archivePath,
    onProgress: (received, total) => {
      onProgress?.('download', total ? received / total : null, `Descargando Java ${major}`)
    }
  })

  onProgress?.('extract', null, `Instalando Java ${major}`)
  await extractZip(archivePath, home)

  const javaPath = await findJavaExecutable(home)
  if (!javaPath) {
    throw new Error(
      `Se descargó Java ${major} pero no se encontró java.exe dentro del paquete. ` +
        `Revisa que el antivirus no haya bloqueado la extracción.`
    )
  }

  await rm(archivePath, { force: true })
  return { major, javaPath, home }
}

/**
 * Descomprime usando el bsdtar que trae Windows 10/11 (`C:\Windows\System32\tar.exe`).
 * Evita añadir una dependencia npm para esto, y es notablemente más rápido
 * que Expand-Archive de PowerShell con ficheros grandes.
 *
 * Por la ruta absoluta, nunca por el PATH: ver `systemTarPath`.
 */
async function extractZip(archivePath: string, destination: string): Promise<void> {
  await ensureDir(destination)
  try {
    await execFileAsync(systemTarPath(), ['-xf', archivePath, '-C', destination], {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`No se pudo descomprimir ${archivePath}: ${message}`)
  }
}

/** Versión mayor de un java.exe concreto, para validar instalaciones externas. */
export async function probeJavaMajor(javaPath: string): Promise<number | null> {
  try {
    const { stderr, stdout } = await execFileAsync(javaPath, ['-version'], { windowsHide: true })
    const text = `${stderr}\n${stdout}`
    const match = /version "(\d+)(?:\.(\d+))?/.exec(text)
    if (!match) return null
    const first = Number(match[1])
    // Java 8 se reporta como "1.8.0_xxx".
    if (first === 1 && match[2]) return Number(match[2])
    return first
  } catch {
    return null
  }
}

/** Runtimes instalados, para la pantalla de ajustes. */
export async function listInstalled(): Promise<JavaRuntime[]> {
  const result: JavaRuntime[] = []
  let entries: string[]
  try {
    entries = await readdir(runtimesDir())
  } catch {
    return result
  }
  for (const entry of entries) {
    const match = /^jdk-(\d+)$/.exec(entry)
    if (!match) continue
    const runtime = await findInstalled(Number(match[1]))
    if (runtime) result.push(runtime)
  }
  return result
}
