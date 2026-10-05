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
  cannotReachSteam,
  DEFAULT_BRANCH,
  deniedInstalledManifest,
  interpretRun,
  interpretWorkshop,
  loginProblem,
  parseProgressLine,
  type SteamBranch,
  type SteamCmdOutcome,
  type SteamCmdProgress,
  type SteamLoginProblem,
  type WorkshopOutcome
} from './steamcmdOutput'

export { DEFAULT_BRANCH, type SteamBranch } from './steamcmdOutput'
export type { WorkshopOutcome } from './steamcmdOutput'

const execFileAsync = promisify(execFile)

/**
 * SteamCMD: el cliente de consola de Valve con el que se instalan y actualizan
 * los servidores dedicados de Satisfactory, Valheim, Project Zomboid,
 * Enshrouded y Rust. Uno solo, compartido, en `<datos>/tools/steamcmd`.
 *
 * Casi siempre de forma anónima: esos servidores dedicados no piden cuenta. La
 * excepción es Factorio (fase 4), que no tiene servidor dedicado y hay que
 * descargarlo con una cuenta que tenga el juego. Ni siquiera entonces se guarda
 * la contraseña: se le pasa a SteamCMD por la entrada estándar una vez, y a
 * partir de ahí valen las credenciales que Steam deja en su caché.
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

/** Donde SteamCMD cuenta lo que pasa con las descargas: la consola no lo dice. */
function contentLogPath(): string {
  return join(steamCmdDir(), 'logs', 'content_log.txt')
}

async function fileSize(path: string): Promise<number> {
  return (await stat(path).catch(() => null))?.size ?? 0
}

/** Lo que se ha añadido a un fichero desde `offset`. */
async function readSince(path: string, offset: number): Promise<string> {
  const handle = await open(path, 'r').catch(() => null)
  if (!handle) return ''
  try {
    const size = (await handle.stat()).size
    if (size <= offset) return ''
    const buffer = Buffer.alloc(size - offset)
    await handle.read(buffer, 0, buffer.length, offset)
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
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
 *
 * `stdinLines` son las respuestas a lo que SteamCMD pregunta por teclado (la
 * contraseña y, si toca, el código de Steam Guard). Se escriben **nada más
 * arrancar, sin esperar al `password:`**: ese aviso no llega nunca por la
 * tubería (SteamCMD no la vacía, por eso el progreso se lee del
 * `console_log.txt`), pero la entrada sí se consume cuando la pide
 * (comprobado en la fase 4). Así la contraseña no viaja en la línea de
 * órdenes, donde cualquiera que mire los procesos la vería.
 */
function spawnSteamCmd(
  args: string[],
  onProgress?: SteamProgressFn,
  stdinLines?: string[]
): Promise<SpawnResult> {
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
      if (stdinLines?.length) {
        child.stdin.on('error', () => {
          // Si SteamCMD no llega a preguntar (credenciales en caché), cierra la
          // entrada y escribir da EPIPE. No es un fallo: no había nada que decir.
        })
        child.stdin.write(stdinLines.map((line) => `${line}\n`).join(''))
      }
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
async function runWithRetries(
  args: string[],
  onProgress?: SteamProgressFn,
  stdinLines?: string[]
): Promise<SteamCmdOutcome & { stdout: string }> {
  let last: (SteamCmdOutcome & { stdout: string }) | null = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { exitCode, stdout } = await spawnSteamCmd(args, onProgress, stdinLines)
    const outcome = interpretRun(stdout, exitCode)
    last = { ...outcome, stdout }
    if (outcome.ok) return last
    if (!outcome.selfUpdated && !outcome.error?.retryable) return last
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
  }
  return last!
}

/**
 * Cuenta de Steam para los juegos que no tienen servidor dedicado anónimo.
 *
 * Solo Factorio la necesita (fase 4): su «servidor» es el juego, y descargarlo
 * exige una cuenta que lo tenga. **La contraseña no se guarda en ninguna
 * parte**: se usa una vez y Steam deja sus propias credenciales en caché, así
 * que a partir del segundo uso basta con el nombre de usuario.
 */
export interface SteamAccount {
  user: string
  /** Solo la primera vez en este equipo. Nunca se persiste. */
  password?: string
  /** Código de Steam Guard, cuando Steam lo pide. */
  guardCode?: string
}

/** Lo que hay que escribirle por teclado, en el orden en que lo pregunta. */
function loginAnswers(account?: SteamAccount): string[] {
  if (!account) return []
  return [account.password, account.guardCode].filter((x): x is string => Boolean(x))
}

export interface AppUpdateOptions {
  appId: number
  installDir: string
  /**
   * Cuenta con la que descargar. Sin esto, `anonymous`, que es lo que sirve
   * para todos los servidores dedicados de verdad.
   */
  account?: SteamAccount
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
      options.account?.user ?? 'anonymous',
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
    const desde = await fileSize(contentLogPath())
    let outcome = await runWithRetries(args, options.onProgress, loginAnswers(options.account))
    if (!outcome.ok) {
      const log = await readSince(contentLogPath(), desde)
      if (deniedInstalledManifest(log, options.appId)) {
        // Steam no da el manifiesto de la versión instalada (ver la función).
        // Sin el appmanifest, SteamCMD trata la carpeta como una instalación
        // nueva: compara los ficheros que ya hay con la versión nueva y solo
        // baja lo que cambia (comprobado con Zomboid: 6,5 GB reaprovechados).
        // El mundo y la configuración no están en el appmanifest: no se tocan.
        await rm(join(options.installDir, 'steamapps', `appmanifest_${options.appId}.acf`), { force: true })
        outcome = await runWithRetries(args, options.onProgress, loginAnswers(options.account))
      } else if (cannotReachSteam(log, options.appId)) {
        throw new Error(
          'No se puede llegar a los servidores de descarga de Steam. Comprueba la conexión a internet ' +
            'o inténtalo más tarde; lo que ya estaba instalado sigue igual.'
        )
      }
    }
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

export interface WorkshopDownloadOptions {
  /**
   * App del **juego**, no la del servidor dedicado: los objetos del taller
   * cuelgan del juego (Project Zomboid es 108600; su servidor, 380870).
   */
  appId: number
  workshopId: string
  /** Steam deja el contenido en `<installDir>/steamapps/workshop/content/...`. */
  installDir: string
  /**
   * Cuenta con la que descargar. Sin esto, `anonymous`, que **basta para el
   * taller de Project Zomboid** (comprobado descargando un mod de verdad). Si
   * algún día hiciera falta una cuenta, aquí está el hueco.
   */
  account?: SteamAccount
  onProgress?: SteamProgressFn
}

export interface WorkshopDownloadResult {
  /** Carpeta donde ha quedado el contenido del objeto. */
  path: string
  bytes: number | null
}

/**
 * Descarga un objeto del taller de Steam.
 *
 * ⚠ SteamCMD **sale con código 0 aunque la descarga falle** (comprobado con un
 * id inexistente y con uno de otro juego), así que lo que decide es lo que
 * escribe, no el código.
 */
export function workshopDownload(
  options: WorkshopDownloadOptions
): Promise<WorkshopDownloadResult> {
  return serialized(async () => {
    await mkdir(options.installDir, { recursive: true })
    const args = [
      // Como en `app_update`: antes del login o se ignora.
      '+force_install_dir',
      options.installDir,
      '+login',
      options.account?.user ?? 'anonymous',
      '+workshop_download_item',
      String(options.appId),
      options.workshopId,
      '+quit'
    ]

    let last: WorkshopOutcome | null = null
    for (let intento = 0; intento < MAX_ATTEMPTS; intento++) {
      const { exitCode, stdout } = await spawnSteamCmd(
        args,
        options.onProgress,
        loginAnswers(options.account)
      )
      last = interpretWorkshop(stdout, exitCode)
      if (last.ok) return { path: last.path!, bytes: last.bytes ?? null }
      // La autoactualización de SteamCMD se come la primera orden, igual que
      // al instalar un servidor.
      if (!last.error?.retryable && !/Update complete, launching/i.test(stdout)) break
      await new Promise((r) => setTimeout(r, 2000 * (intento + 1)))
    }
    throw new Error(last?.error?.message ?? 'Steam no pudo descargar el mod.')
  })
}

/**
 * Comprueba que la cuenta entra, sin descargar nada.
 *
 * Es lo que la app usa antes de empezar una descarga de varios GB: si la
 * contraseña está mal o falta el código de Steam Guard, mejor saberlo ahora.
 * Si sale bien, Steam deja las credenciales en caché y las siguientes veces no
 * hará falta pedir nada.
 */
export async function steamLogin(account: SteamAccount): Promise<void> {
  await ensureSteamCmd()
  const { exitCode, stdout } = await spawnSteamCmd(
    ['+login', account.user, '+quit'],
    undefined,
    loginAnswers(account)
  )
  const problema = loginProblem(stdout, exitCode)
  if (problema) throw new SteamLoginError(problema.kind, problema.message)
}

/**
 * Login que no ha salido. `kind` es lo que decide qué hace la interfaz: con
 * `guard` hay que pedir el código de Steam Guard y reintentar, y con `password`
 * volver a pedir la contraseña.
 */
export class SteamLoginError extends Error {
  constructor(
    readonly kind: SteamLoginProblem['kind'],
    message: string
  ) {
    super(message)
    this.name = 'SteamLoginError'
  }
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
