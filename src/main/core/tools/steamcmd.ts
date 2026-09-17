import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { access, mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { download } from '../net/downloader'
import { cacheDir, systemTarPath, toolsDir } from '../paths'
import { authenticodeSigner } from '../system/windows'
import {
  PHASE_LABELS,
  branchesFromAppInfo,
  branchFromManifest,
  buildIdFromAppInfo,
  buildIdFromManifest,
  DEFAULT_BRANCH,
  interpretRun,
  parseProgressLine,
  type SteamBranch,
  type SteamCmdOutcome,
  type SteamCmdProgress
} from './steamcmdOutput'

export { DEFAULT_BRANCH, type SteamBranch } from './steamcmdOutput'

const execFileAsync = promisify(execFile)

/**
 * SteamCMD: el cliente de consola de Valve con el que se instalan y actualizan
 * los servidores dedicados de Satisfactory, Valheim, Project Zomboid,
 * Enshrouded y Rust. Uno solo, compartido, en `<datos>/tools/steamcmd`.
 *
 * Siempre de forma anónima: ninguno de esos servidores pide cuenta, y la app
 * no maneja credenciales de Steam.
 */

const DOWNLOAD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'

/** Intentos por orden. Cubre la autoactualización y los fallos pasajeros. */
const MAX_ATTEMPTS = 4

/** Sujeto del certificado de Valve, en sus dos formas conocidas. */
export function isValveSigner(subject: string): boolean {
  return /(^|,\s*)O=Valve( Corp\.)?\s*(,|$)/.test(subject)
}

export function steamCmdDir(): string {
  return join(toolsDir(), 'steamcmd')
}

export function steamCmdPath(): string {
  return join(steamCmdDir(), 'steamcmd.exe')
}

function consoleLogPath(): string {
  return join(steamCmdDir(), 'logs', 'console_log.txt')
}

export type SteamProgressFn = (progress: SteamCmdProgress, label: string) => void

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * SteamCMD usa una sola carpeta y un solo log: dos ejecuciones a la vez se
 * pisan. Todas las órdenes pasan por esta cola.
 */
let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

/**
 * Deja SteamCMD listo. La primera vez lo descarga, comprueba que el ejecutable
 * está firmado por Valve (no publican hash) y lo deja autoactualizarse.
 */
export function ensureSteamCmd(onStatus?: (detail: string) => void): Promise<void> {
  return serialized(async () => {
    if (await exists(steamCmdPath())) return

    onStatus?.('Descargando SteamCMD')
    const zip = join(cacheDir(), 'steamcmd.zip')
    await download({ url: DOWNLOAD_URL, destination: zip })

    await rm(steamCmdDir(), { recursive: true, force: true })
    await mkdir(steamCmdDir(), { recursive: true })
    await execFileAsync(systemTarPath(), ['-xf', zip, '-C', steamCmdDir()], { windowsHide: true })

    // El ejecutable del zip va firmado con un certificado antiguo ("O=Valve");
    // el que deja la autoactualización, con el actual ("O=Valve Corp.").
    const signer = await authenticodeSigner(steamCmdPath())
    if (!signer || !isValveSigner(signer)) {
      await rm(steamCmdDir(), { recursive: true, force: true })
      throw new Error(
        'El SteamCMD descargado no lleva una firma válida de Valve. No se ejecuta por seguridad.'
      )
    }

    onStatus?.('Preparando SteamCMD (se actualiza solo la primera vez)')
    // La primera ejecución se autoactualiza y sale con 7; la segunda ya es normal.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { exitCode, stdout } = await spawnSteamCmd(['+quit'])
      if (exitCode === 0) return
      if (!interpretRun(stdout, exitCode).selfUpdated) {
        throw new Error(`SteamCMD no pudo prepararse (código ${exitCode}).`)
      }
    }
    throw new Error('SteamCMD no terminó de actualizarse. Vuelve a intentarlo.')
  })
}

interface SpawnResult {
  exitCode: number | null
  stdout: string
}

/**
 * Lanza SteamCMD. Mientras corre, lee lo nuevo de `console_log.txt` para dar
 * el progreso en vivo, porque por la tubería no llega nada hasta el final.
 */
function spawnSteamCmd(args: string[], onProgress?: SteamProgressFn): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let offset = 0
    let pending = ''
    let polling: NodeJS.Timeout | null = null
    let reading = false

    const pollLog = async (): Promise<void> => {
      if (reading || !onProgress) return
      reading = true
      try {
        const size = (await stat(consoleLogPath())).size
        if (size < offset) offset = 0 // Log rotado.
        if (size > offset) {
          const handle = await open(consoleLogPath(), 'r')
          try {
            const buffer = Buffer.alloc(size - offset)
            await handle.read(buffer, 0, buffer.length, offset)
            offset = size
            pending += buffer.toString('utf8')
            const lines = pending.split(/\r?\n/)
            pending = lines.pop() ?? ''
            for (const line of lines) {
              const progress = parseProgressLine(line)
              if (progress) onProgress(progress, PHASE_LABELS[progress.phase])
            }
          } finally {
            await handle.close()
          }
        }
      } catch {
        // El log aún no existe o está bloqueado un instante: se reintenta.
      } finally {
        reading = false
      }
    }

    const start = async (): Promise<void> => {
      offset = await stat(consoleLogPath()).then(
        (s) => s.size,
        () => 0
      )
      const child = spawn(steamCmdPath(), args, { cwd: steamCmdDir(), windowsHide: true })
      let stdout = ''
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
      child.stderr.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
      if (onProgress) polling = setInterval(() => void pollLog(), 500)
      child.on('error', (err) => {
        if (polling) clearInterval(polling)
        reject(err)
      })
      child.on('close', async (exitCode) => {
        if (polling) clearInterval(polling)
        await pollLog()
        resolve({ exitCode, stdout })
      })
    }

    start().catch(reject)
  })
}

/**
 * Ejecuta una orden reintentando lo que se arregla solo: la autoactualización
 * de SteamCMD y los fallos pasajeros de Steam.
 */
async function runWithRetries(args: string[], onProgress?: SteamProgressFn): Promise<SteamCmdOutcome & { stdout: string }> {
  let last: (SteamCmdOutcome & { stdout: string }) | null = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { exitCode, stdout } = await spawnSteamCmd(args, onProgress)
    const outcome = interpretRun(stdout, exitCode)
    last = { ...outcome, stdout }
    if (outcome.ok) return last
    if (!outcome.selfUpdated && !outcome.error?.retryable) return last
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
  }
  return last!
}

export interface AppUpdateOptions {
  appId: number
  installDir: string
  /**
   * Rama de Steam. `public` es la de siempre; las demás las publica el estudio
   * (`experimental` en Satisfactory, `default_preal` en Valheim).
   */
  branch?: string
  /** Comprueba todos los ficheros. Más lento; útil para reparar. */
  validate?: boolean
  onProgress?: SteamProgressFn
}

export interface AppUpdateResult {
  alreadyUpToDate: boolean
  buildId: string | null
  /** Rama que quedó instalada, leída del appmanifest. */
  branch: string
}

/** Instala o actualiza un servidor. La segunda vez solo descarga lo que cambió. */
export function appUpdate(options: AppUpdateOptions): Promise<AppUpdateResult> {
  return serialized(async () => {
    await mkdir(options.installDir, { recursive: true })
    const branch = options.branch ?? DEFAULT_BRANCH

    const current = await installedBranch(options.installDir, options.appId)
    const changingBranch = current !== branch

    // ⚠ `-beta public` sobre algo que YA está en la pública no es inofensivo:
    // SteamCMD lanza un trabajo de «reconfiguring» que, si no hay nada que
    // descargar, termina con «state is 0x6 after update job» y código 8
    // (comprobado). Por eso la bandera solo se pasa cuando de verdad cambia
    // algo: a una rama distinta de la pública, o de vuelta a ella desde otra.
    const needsBeta = branch !== DEFAULT_BRANCH || current !== DEFAULT_BRANCH

    const args = [
      // force_install_dir tiene que ir ANTES del login o SteamCMD lo ignora.
      '+force_install_dir',
      options.installDir,
      '+login',
      'anonymous',
      '+app_update',
      String(options.appId),
      // `-beta public` es la forma de volver a la rama de siempre: Steam la
      // trata como una rama más y así borra la anterior del appmanifest.
      ...(needsBeta ? ['-beta', branch] : []),
      // Cambiar de rama es la única vez que hay que validar sin que lo pida
      // nadie: al bajar a una anterior, Steam da por buenos los ficheros que
      // ya están y el servidor se queda mezclado. Validar compara uno a uno.
      ...(options.validate || changingBranch ? ['validate'] : []),
      '+quit'
    ]
    const outcome = await runWithRetries(args, options.onProgress)
    if (!outcome.ok) {
      throw new Error(outcome.error?.message ?? 'SteamCMD no pudo instalar el servidor.')
    }
    return {
      alreadyUpToDate: outcome.alreadyUpToDate,
      buildId: await installedBuildId(options.installDir, options.appId),
      branch: await installedBranch(options.installDir, options.appId)
    }
  })
}

export async function installedBuildId(installDir: string, appId: number): Promise<string | null> {
  const acf = await readAppManifest(installDir, appId)
  return acf === null ? null : buildIdFromManifest(acf)
}

/** Rama instalada. `public` también cuando aún no hay nada instalado. */
export async function installedBranch(installDir: string, appId: number): Promise<string> {
  const acf = await readAppManifest(installDir, appId)
  return acf === null ? DEFAULT_BRANCH : branchFromManifest(acf)
}

async function readAppManifest(installDir: string, appId: number): Promise<string | null> {
  try {
    return await readFile(join(installDir, 'steamapps', `appmanifest_${appId}.acf`), 'utf8')
  } catch {
    return null
  }
}

/** Build publicado en Steam para una rama. */
export async function latestBuildId(appId: number, branch = DEFAULT_BRANCH): Promise<string | null> {
  return buildIdFromAppInfo(await appInfo(appId), appId, branch)
}

/**
 * Ramas que el estudio publica para esa aplicación, la pública primero.
 *
 * Es lo que permite llevar un servidor a otra versión: Valheim mantiene ramas
 * antiguas con su descripción, y Satisfactory tiene `experimental`. Las que
 * piden contraseña se dejan fuera: la app no la tiene.
 */
export async function listBranches(appId: number): Promise<SteamBranch[]> {
  const branches = branchesFromAppInfo(await appInfo(appId), appId)
  return branches.filter((b) => !b.needsPassword)
}

/** Salida cruda de `app_info_print`, que es de donde sale todo lo publicado. */
function appInfo(appId: number): Promise<string> {
  return serialized(async () => {
    const outcome = await runWithRetries([
      '+login',
      'anonymous',
      '+app_info_update',
      '1',
      '+app_info_print',
      String(appId),
      '+quit'
    ])
    return outcome.stdout
  })
}

export interface AppUpdateCheck {
  installed: string | null
  latest: string | null
  available: boolean
}

/**
 * ¿Hay build nueva en la rama en la que va el servidor?
 *
 * Se compara contra SU rama, no contra la pública: un servidor puesto a
 * propósito en una rama anterior no tiene ninguna actualización pendiente, y
 * decirle que sí lo llevaría a perder la versión que eligió.
 */
export async function checkAppUpdate(
  appId: number,
  installDir: string,
  branch = DEFAULT_BRANCH
): Promise<AppUpdateCheck> {
  const [installed, latest] = await Promise.all([
    installedBuildId(installDir, appId),
    latestBuildId(appId, branch)
  ])
  return { installed, latest, available: installed !== null && latest !== null && installed !== latest }
}
