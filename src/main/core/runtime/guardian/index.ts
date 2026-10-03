import { execFile, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { connect, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  guardianExitPath,
  guardianRecordPath,
  guardianSpecPath,
  toolsDir
} from '../../paths'
import { killPid, killTree, pidAlive, type DirectOptions, type ServerProcess } from '../process'
import { argumentsLine, resolveCommand } from './commandLine'
import {
  encodeSpec,
  parseExitFile,
  parseGuardianLine,
  stdinMessage,
  type GuardianExitFile,
  type GuardianMessage
} from './protocol'
import { GUARDIAN_PROTOCOL, GUARDIAN_SOURCE } from './source'

/**
 * El guardián: un proceso pequeño entre la app y cada servidor (§19.34).
 *
 * Sin él, el servidor es hijo directo de la app y habla con ella por tuberías
 * que mueren con ella. Si la app se cierra de golpe (un fallo, el
 * Administrador de tareas), el servidor sigue vivo pero ya no hay forma de
 * mandarle órdenes ni de pararlo limpio, y al volver a abrir la app sale como
 * parado. Con el guardián en medio, las tuberías son suyas y la app se conecta
 * a él por una tubería con nombre de Windows, que puede volver a abrir.
 *
 * Si el guardián no se puede compilar o lanzar, el servidor se lanza directo,
 * como antes: arrancar siempre gana a poder reengancharse.
 */

const execFileAsync = promisify(execFile)

/** Cuánto se espera a que el guardián recién lanzado abra su tubería. */
const LAUNCH_CONNECT_MS = 15_000
/** Al abrir la app, a uno que ya estaba en marcha. */
const REATTACH_CONNECT_MS = 5_000
/** Reintentos si se corta la conexión con la app abierta. */
const RECONNECT_MS = 10_000

/** Lo que se guarda para volver a conectarse tras cerrar la app. */
export interface GuardianRecord {
  protocol: number
  pipe: string
  guardianPid: number
  /** Del `LaunchSpec`: al reengancharse no se vuelve a llamar a `launch()`. */
  killTree: boolean
  dropEchoes: boolean
  /** Lo último que la app sabía del servidor. */
  state?: GuardianState
}

/**
 * Cómo estaba el servidor y hasta qué línea lo había visto la app. Al volver,
 * las líneas hasta `seq` ya se vieron (y lo que contaban ya está en el
 * historial); las siguientes pasaron con la app cerrada y se tratan como
 * nuevas.
 */
export interface GuardianState {
  seq: number
  ready: boolean
  players: string[]
  playerCount: number | null
  joinCode: string | null
}

function pipePath(name: string): string {
  return `\\\\.\\pipe\\${name}`
}

// --- El ejecutable ----------------------------------------------------------

let compiled: Promise<string | null> | null = null
let compileProblem: string | null = null

/** Por qué no hay guardián, si no lo hay. */
export function guardianProblem(): string | null {
  return compileProblem
}

function cscPath(): string | null {
  const windowsDir = process.env['SystemRoot'] || process.env['windir']
  if (!windowsDir) return null
  for (const framework of ['Framework64', 'Framework']) {
    const path = join(windowsDir, 'Microsoft.NET', framework, 'v4.0.30319', 'csc.exe')
    if (existsSync(path)) return path
  }
  return null
}

/**
 * El guardián compilado, o null si no se puede. Se compila una vez por versión
 * del código (el nombre lleva su huella) y se queda en `tools/guardian`.
 */
export function guardianExe(): Promise<string | null> {
  compiled ??= compileGuardian().catch((err: unknown) => {
    compileProblem = err instanceof Error ? err.message : String(err)
    compiled = null // Se reintenta en el siguiente arranque.
    return null
  })
  return compiled
}

async function compileGuardian(): Promise<string> {
  const hash = createHash('sha256').update(GUARDIAN_SOURCE).digest('hex').slice(0, 12)
  const dir = join(toolsDir(), 'guardian')
  const exe = join(dir, `qubiq-guardian-${hash}.exe`)
  if (existsSync(exe)) return exe

  const csc = cscPath()
  if (!csc) throw new Error('No está el compilador de .NET Framework (csc.exe).')

  await mkdir(dir, { recursive: true })
  const source = join(dir, `qubiq-guardian-${hash}.cs`)
  const tmp = join(dir, `qubiq-guardian-${hash}.${process.pid}.tmp.exe`)
  await writeFile(source, GUARDIAN_SOURCE, 'utf8')
  try {
    await execFileAsync(
      csc,
      ['/nologo', '/target:exe', '/optimize+', '/r:System.Core.dll', `/out:${tmp}`, source],
      { windowsHide: true, timeout: 60_000 }
    )
  } catch (err) {
    const output = (err as { stdout?: string }).stdout?.trim()
    await rm(tmp, { force: true })
    throw new Error(`No se pudo compilar el guardián.${output ? ` ${output}` : ''}`)
  }
  await rename(tmp, exe)
  return exe
}

// --- Lanzar -----------------------------------------------------------------

export interface GuardedLaunch extends DirectOptions {
  killTree?: boolean
  dropEchoes?: boolean
}

/**
 * Lanza el servidor a través del guardián. null si no hay guardián: entonces
 * se lanza directo. Un servidor que no arranca (ejecutable que no existe) NO
 * es null: es un proceso que avisa con `error`, como el directo.
 */
export async function launchGuarded(id: string, options: GuardedLaunch): Promise<ServerProcess | null> {
  const exe = await guardianExe()
  if (!exe) return null

  const exitPath = guardianExitPath(id)
  await forgetGuardian(id)
  const pipe = `qubiq-${id}-${randomBytes(8).toString('hex')}`
  await writeFile(
    guardianSpecPath(id),
    encodeSpec({
      file: resolveCommand(options.command, options.cwd),
      args: argumentsLine(options.args, options.verbatimArguments),
      cwd: options.cwd,
      pipe,
      exit: exitPath
    }),
    'utf8'
  )

  // Desligado: sin consola ni grupo de la app. Así no muere con ella, tampoco
  // al cerrar la terminal de `npm run dev`. Su carpeta de trabajo es la suya,
  // no la del servidor: la tendría ocupada y no se podría borrar ni restaurar
  // nada en ella mientras termina de cerrarse (el servidor ya usa la suya).
  const guardian = spawn(exe, [guardianSpecPath(id)], {
    cwd: dirname(exe),
    env: options.env ? { ...process.env, ...options.env } : process.env,
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  })
  const spawned = await new Promise<boolean>((resolve) => {
    guardian.once('spawn', () => resolve(true))
    guardian.once('error', () => resolve(false))
  })
  if (!spawned || !guardian.pid) {
    // Un antivirus que no deja ejecutarlo, por ejemplo: se lanza directo.
    await rm(guardianSpecPath(id), { force: true })
    return null
  }
  let guardianExited = false
  guardian.once('exit', () => (guardianExited = true))
  guardian.unref()

  const record: GuardianRecord = {
    protocol: GUARDIAN_PROTOCOL,
    pipe,
    guardianPid: guardian.pid,
    killTree: options.killTree ?? false,
    dropEchoes: options.dropEchoes ?? false
  }
  await queued(id, () => writeFile(guardianRecordPath(id), JSON.stringify(record, null, 2), 'utf8'))

  const proc = new GuardedProcess(id, record)
  const deadline = Date.now() + LAUNCH_CONNECT_MS
  while (Date.now() < deadline) {
    if (await proc.open()) return proc
    if (guardianExited) break
    await sleep(100)
  }

  // No llegó a conectarse. Si el guardián dejó dicho algo (el servidor no se
  // pudo lanzar, o salió nada más arrancar), eso es lo que se cuenta.
  const left = await readExitFile(id)
  await forgetGuardian(id)
  if (!guardianExited) killPid(guardian.pid)
  if (left?.kind === 'exit') return new EndedProcess(left.lines.map((l) => l.text), left.code)
  const message =
    left?.kind === 'error' ? left.message : 'El guardián del servidor no respondió al arrancar.'
  return new EndedProcess([], null, new Error(message))
}

// --- Volver a conectarse ----------------------------------------------------

export type Reattach =
  | { kind: 'attached'; process: GuardedProcess; record: GuardianRecord }
  /** Salió con la app cerrada: su código, cuándo y sus últimas líneas. */
  | { kind: 'exited'; code: number; ts: number; lines: string[] }
  /** Había guardián pero no se puede hablar con él. */
  | { kind: 'lost'; reason: string }

/**
 * Al abrir la app: ¿hay un servidor de esta instancia que siguió en marcha?
 * null si no hay nada que recuperar.
 */
export async function reattachGuarded(id: string): Promise<Reattach | null> {
  const record = await readRecord(id)
  const left = await readExitFile(id)

  if (left?.kind === 'exit') {
    await forgetGuardian(id)
    return { kind: 'exited', code: left.code, ts: left.ts, lines: left.lines.map((l) => l.text) }
  }
  if (!record) {
    if (left) await forgetGuardian(id)
    return null
  }
  if (record.protocol !== GUARDIAN_PROTOCOL) {
    // De otra versión de la app. No se sabe hablar con él: no se toca.
    return { kind: 'lost', reason: `su guardián es de otra versión de QubiQ (protocolo ${record.protocol})` }
  }

  const proc = new GuardedProcess(id, record)
  const deadline = Date.now() + REATTACH_CONNECT_MS
  while (Date.now() < deadline) {
    if (await proc.open()) return { kind: 'attached', process: proc, record }
    if (!pidAlive(record.guardianPid)) break
    await sleep(200)
  }

  // Puede que justo acabe de salir y esté escribiendo su fichero.
  await sleep(300)
  const late = await readExitFile(id)
  if (late?.kind === 'exit') {
    await forgetGuardian(id)
    return { kind: 'exited', code: late.code, ts: late.ts, lines: late.lines.map((l) => l.text) }
  }
  if (pidAlive(record.guardianPid)) {
    return { kind: 'lost', reason: 'su guardián sigue vivo pero no contesta' }
  }
  await forgetGuardian(id)
  return { kind: 'lost', reason: 'su guardián ya no está' }
}

async function readRecord(id: string): Promise<GuardianRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(guardianRecordPath(id), 'utf8')) as Partial<GuardianRecord>
    if (typeof parsed.pipe !== 'string' || typeof parsed.guardianPid !== 'number') return null
    return {
      protocol: Number(parsed.protocol),
      pipe: parsed.pipe,
      guardianPid: parsed.guardianPid,
      killTree: parsed.killTree === true,
      dropEchoes: parsed.dropEchoes === true,
      ...(parsed.state ? { state: cleanState(parsed.state) } : {})
    }
  } catch {
    return null
  }
}

function cleanState(state: Partial<GuardianState>): GuardianState {
  return {
    seq: Number.isInteger(state.seq) ? state.seq! : 0,
    ready: state.ready === true,
    players: Array.isArray(state.players) ? state.players.filter((p) => typeof p === 'string') : [],
    playerCount: typeof state.playerCount === 'number' ? state.playerCount : null,
    joinCode: typeof state.joinCode === 'string' ? state.joinCode : null
  }
}

async function readExitFile(id: string): Promise<GuardianExitFile | null> {
  try {
    return parseExitFile(await readFile(guardianExitPath(id), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Escrituras de `guardian.json` de cada servidor, una detrás de otra: un
 * estado que se guarda a la vez que el servidor sale no puede resucitar el
 * fichero que la salida acaba de borrar.
 */
const recordQueues = new Map<string, Promise<void>>()

function queued(id: string, task: () => Promise<void>): Promise<void> {
  const next = (recordQueues.get(id) ?? Promise.resolve()).then(task, task).catch(() => undefined)
  recordQueues.set(id, next)
  return next
}

/** Apunta cómo está el servidor, si sigue habiendo guardián. */
export function rememberGuardianState(id: string, state: GuardianState): Promise<void> {
  return queued(id, async () => {
    const record = await readRecord(id)
    if (!record) return
    record.state = state
    const path = guardianRecordPath(id)
    await writeFile(`${path}.tmp`, JSON.stringify(record, null, 2), 'utf8')
    await rename(`${path}.tmp`, path)
  })
}

function forgetGuardian(id: string): Promise<void> {
  return queued(id, async () => {
    await Promise.all([
      rm(guardianRecordPath(id), { force: true }),
      rm(guardianExitPath(id), { force: true }),
      rm(guardianSpecPath(id), { force: true })
    ])
  })
}

// --- El proceso a través del guardián ---------------------------------------

/**
 * Las líneas no se emiten hasta `resume()`: entre conectar y que el supervisor
 * se ponga a escuchar no se pierde ninguna. Las que la app ya vio antes de
 * cerrarse (hasta `record.state.seq`) salen con `replay` a true.
 */
export class GuardedProcess extends EventEmitter implements ServerProcess {
  private socket: Socket | null = null
  private serverPid: number | undefined
  private started = Date.now()
  private lastSeq = 0
  private paused = true
  private readonly queuedLines: { text: string; replay: boolean }[] = []
  private exitCode: number | null | undefined = undefined
  private ended = false
  private closing = false
  private readonly seenSeq: number

  constructor(
    private readonly id: string,
    readonly record: GuardianRecord
  ) {
    super()
    this.seenSeq = record.state?.seq ?? 0
  }

  get pid(): number | undefined {
    return this.serverPid
  }

  get startedAt(): number {
    return this.started
  }

  /** Número de la última línea recibida, para apuntar hasta dónde se ha visto. */
  get lastLine(): number {
    return this.lastSeq
  }

  /**
   * Abre la conexión y espera a que el guardián mande lo que tiene guardado.
   * false si todavía no hay tubería (recién lanzado) o no contesta.
   */
  open(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = connect(pipePath(this.record.pipe))
      let settled = false
      let first = true
      let buffer = ''
      const settle = (ok: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (!ok) socket.destroy()
        resolve(ok)
      }
      const timer = setTimeout(() => settle(false), 3_000)

      socket.setEncoding('utf8')
      socket.on('error', () => settle(false))
      socket.on('data', (chunk: string) => {
        buffer += chunk
        let newline: number
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const raw = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          const message = parseGuardianLine(raw)
          if (first) {
            first = false
            if (message.kind !== 'hello' || message.protocol !== GUARDIAN_PROTOCOL) {
              settle(false)
              return
            }
            this.serverPid = message.serverPid
            this.started = message.startedAt
            continue
          }
          if (message.kind === 'replayed') {
            this.socket = socket
            settle(true)
            continue
          }
          this.handle(message)
        }
      })
      socket.on('close', () => {
        if (!settled) {
          settle(false)
          return
        }
        if (this.socket === socket) {
          this.socket = null
          void this.connectionLost()
        }
      })
    })
  }

  private handle(message: GuardianMessage): void {
    if (message.kind === 'line') {
      // Al reconectar llega otra vez lo guardado: solo lo que no se tenía.
      if (message.seq <= this.lastSeq) return
      this.lastSeq = message.seq
      this.deliver({ text: message.text, replay: message.seq <= this.seenSeq })
    } else if (message.kind === 'exit') {
      this.finish(message.code)
    }
  }

  /** Empieza a soltar lo que ha llegado. Lo llama el supervisor al escuchar. */
  resume(): void {
    if (!this.paused) return
    this.paused = false
    for (const line of this.queuedLines.splice(0)) this.emit('line', line.text, line.replay)
    if (this.exitCode !== undefined) this.emitExit()
  }

  private deliver(line: { text: string; replay: boolean }): void {
    if (this.paused) this.queuedLines.push(line)
    else this.emit('line', line.text, line.replay)
  }

  private finish(code: number | null): void {
    if (this.exitCode !== undefined) return
    this.exitCode = code
    this.closing = true
    this.socket?.end()
    void forgetGuardian(this.id)
    if (!this.paused) this.emitExit()
  }

  private emitExit(): void {
    if (this.ended) return
    this.ended = true
    this.emit('exit', this.exitCode ?? null)
  }

  /**
   * Se ha cortado sin que el servidor saliera. Puede ser el guardián que
   * reinicia la tubería (la app no leía a tiempo) o que ha muerto.
   */
  private async connectionLost(): Promise<void> {
    if (this.closing) return
    const deadline = Date.now() + RECONNECT_MS
    while (Date.now() < deadline) {
      if (await this.open()) return
      if (!pidAlive(this.record.guardianPid)) break
      await sleep(500)
    }

    const left = await readExitFile(this.id)
    if (left?.kind === 'exit') {
      for (const line of left.lines) {
        if (line.seq <= this.lastSeq) continue
        this.lastSeq = line.seq
        this.deliver({ text: line.text, replay: false })
      }
      this.finish(left.code)
      return
    }

    // El guardián ha muerto sin dejar nada (alguien lo cerró a mano). Puede
    // que el servidor siga en marcha, ya sin forma de hablar con él.
    const alive = this.serverPid !== undefined && pidAlive(this.serverPid)
    this.emit(
      'notice',
      'error',
      alive
        ? `Se ha perdido la conexión con el servidor, que sigue en marcha sin control (proceso ${this.serverPid}). ` +
            'Ciérralo desde el propio juego o desde el Administrador de tareas antes de volver a arrancarlo.'
        : 'Se ha perdido la conexión con el servidor.'
    )
    this.finish(null)
  }

  writeStdin(text: string): void {
    this.socket?.write(stdinMessage(text))
  }

  /**
   * Suelta la conexión sin tocar el servidor, como cuando la app se cierra de
   * golpe. El guardián sigue y espera a la siguiente. No emite `exit`.
   */
  detach(): void {
    this.closing = true
    this.socket?.destroy()
    this.socket = null
  }

  kill(tree: boolean): void {
    const pid = this.serverPid
    if (!pid) return
    if (tree) killTree(pid, () => killPid(pid))
    else killPid(pid)
  }
}

/**
 * Un servidor que ya ha terminado antes de poder hablar con él: no se pudo
 * lanzar (`error`) o salió nada más arrancar. Cuenta lo mismo que contaría
 * lanzado directo.
 */
class EndedProcess extends EventEmitter implements ServerProcess {
  readonly pid = undefined
  readonly startedAt = Date.now()

  constructor(
    private readonly lines: string[],
    private readonly code: number | null,
    private readonly error?: Error
  ) {
    super()
  }

  resume(): void {
    for (const line of this.lines) this.emit('line', line, false)
    if (this.error) this.emit('error', this.error)
    this.emit('exit', this.code)
  }

  writeStdin(): void {}
  kill(): void {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
