import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { Diagnosis, LogLine, ServerStatus } from '@shared/types'
import { parseLine, diagnoseExit } from './logParser'

/**
 * Supervisión del proceso del servidor (§7).
 *
 * ⚠ LO MÁS CRÍTICO DE TODO EL PROYECTO:
 * Windows no tiene SIGTERM. La única forma de parar un servidor de Minecraft
 * sin corromper chunks es escribir `stop` en su stdin y esperar a que termine
 * solo. Matar el proceso (`taskkill` / `child.kill()`) rompe el mundo.
 * El kill solo se usa como último recurso tras agotar el plazo de gracia.
 */

/** Tiempo que se espera a que el servidor guarde y cierre por su cuenta. */
const STOP_GRACE_MS = 60_000

/** Ventana y umbral para detectar un bucle de fallos (§7). */
const CRASH_WINDOW_MS = 5 * 60_000
const CRASH_THRESHOLD = 3

/** Líneas de log que se conservan para diagnosticar una salida inesperada. */
const RECENT_LINES = 200

export interface SupervisorEvents {
  log: (line: LogLine) => void
  status: (status: ServerStatus) => void
  players: (players: string[]) => void
  ready: () => void
  diagnosis: (diagnosis: Diagnosis) => void
  exit: (code: number | null) => void
}

export interface StartOptions {
  javaPath: string
  args: string[]
  cwd: string
}

export class ServerSupervisor extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private currentStatus: ServerStatus = 'stopped'
  private readonly onlinePlayers = new Set<string>()
  private readonly recent: string[] = []
  private crashTimestamps: number[] = []
  private stopTimer: NodeJS.Timeout | null = null
  private startedAt: number | null = null
  /** Se pone a true cuando la parada la pide el usuario, no un fallo. */
  private stopRequested = false
  private autoRestartEnabled = false

  constructor(readonly instanceId: string) {
    super()
  }

  get status(): ServerStatus {
    return this.currentStatus
  }

  get players(): string[] {
    return [...this.onlinePlayers]
  }

  get uptimeSeconds(): number | null {
    if (this.startedAt === null) return null
    return Math.floor((Date.now() - this.startedAt) / 1000)
  }

  get isRunning(): boolean {
    return this.child !== null
  }

  setAutoRestart(enabled: boolean): void {
    this.autoRestartEnabled = enabled
  }

  start(options: StartOptions): void {
    if (this.child) {
      throw new Error('Este servidor ya está arrancado.')
    }

    this.stopRequested = false
    this.onlinePlayers.clear()
    this.recent.length = 0
    this.setStatus('starting')

    const child = spawn(options.javaPath, options.args, {
      cwd: options.cwd,
      windowsHide: true,
      // stdin abierto es imprescindible: es el canal de comandos y de parada.
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.child = child
    this.startedAt = Date.now()

    createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line))
    createInterface({ input: child.stderr }).on('line', (line) => this.handleLine(line))

    child.on('error', (err) => {
      this.pushLog('error', `No se pudo lanzar el servidor: ${err.message}`)
      this.finish(null)
    })

    child.on('close', (code) => this.finish(code))
  }

  /**
   * Parada limpia. Devuelve cuando el proceso ha terminado de verdad.
   * Nunca mata el proceso antes de agotar el plazo de gracia.
   */
  async stop(): Promise<void> {
    const child = this.child
    if (!child) return

    this.stopRequested = true
    this.setStatus('stopping')
    this.pushLog('system', 'Guardando el mundo y cerrando el servidor...')

    try {
      child.stdin.write('stop\n')
    } catch {
      // Si stdin ya está cerrado no queda más remedio que esperar al cierre.
    }

    await new Promise<void>((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        if (this.stopTimer) clearTimeout(this.stopTimer)
        this.stopTimer = null
        resolve()
      }

      child.once('close', done)

      this.stopTimer = setTimeout(() => {
        // Último recurso tras 60 s. Se avisa porque puede haber pérdida de datos.
        this.pushLog(
          'warn',
          'El servidor no respondió al cierre en 60 segundos. Se fuerza el cierre; ' +
            'puede que los últimos cambios del mundo no se hayan guardado.'
        )
        child.kill()
        done()
      }, STOP_GRACE_MS)
    })
  }

  /**
   * Espera a que aparezca una línea que case con el patrón.
   * Necesario para las copias en caliente: hay que confirmar que el servidor
   * ha volcado el mundo a disco ANTES de copiarlo (§12).
   */
  waitForLog(pattern: RegExp, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false

      const finish = (matched: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.off('log', listener)
        resolve(matched)
      }

      const listener = (line: LogLine): void => {
        if (pattern.test(line.text)) finish(true)
      }

      const timer = setTimeout(() => finish(false), timeoutMs)
      this.on('log', listener)
    })
  }

  /**
   * Deja el mundo consistente en disco y suspende el autoguardado.
   * Copiar sin esto produce backups corruptos (§12).
   * Devuelve false si el servidor no confirmó el volcado a tiempo.
   */
  async flushAndHoldSaves(): Promise<boolean> {
    if (!this.isRunning) return true

    this.sendCommand('save-off')
    // El acuse varía entre versiones y distribuciones: "Saved the game",
    // "Saved the world" o "Saved the chunks".
    const confirmed = this.waitForLog(/Saved the (game|world|chunks)/i, 60_000)
    this.sendCommand('save-all flush')
    return confirmed
  }

  /** Reanuda el autoguardado tras una copia. */
  resumeSaves(): void {
    if (!this.isRunning) return
    this.sendCommand('save-on')
  }

  /** Envía un comando por stdin, que es como se moderan los jugadores (§9). */
  sendCommand(command: string): void {
    const child = this.child
    if (!child) {
      throw new Error('El servidor no está arrancado.')
    }
    const clean = command.replace(/[\r\n]+/g, ' ').trim()
    if (clean.length === 0) return
    child.stdin.write(`${clean}\n`)
    this.pushLog('system', `> ${clean}`)
  }

  private handleLine(raw: string): void {
    if (raw.trim().length === 0) return

    this.recent.push(raw)
    if (this.recent.length > RECENT_LINES) this.recent.shift()

    const event = parseLine(raw)
    this.pushLog(event.level, event.text)

    if (event.ready) {
      this.setStatus('running')
      this.emit('ready')
    }

    if (event.playerJoined) {
      this.onlinePlayers.add(event.playerJoined)
      this.emit('players', this.players)
    }

    if (event.playerLeft) {
      this.onlinePlayers.delete(event.playerLeft)
      this.emit('players', this.players)
    }

    if (event.diagnosis) {
      this.emit('diagnosis', event.diagnosis)
    }
  }

  private finish(code: number | null): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }

    this.child = null
    this.startedAt = null
    this.onlinePlayers.clear()
    this.emit('players', [])

    const wasRequested = this.stopRequested
    this.stopRequested = false

    if (wasRequested || code === 0) {
      this.setStatus('stopped')
      this.emit('exit', code)
      return
    }

    // Salida inesperada: diagnosticamos antes de decidir si reintentar.
    this.setStatus('crashed')
    const diagnosis = diagnoseExit(code, this.recent)
    this.emit('diagnosis', diagnosis)
    this.emit('exit', code)

    this.registerCrash()
  }

  /**
   * Detección de bucle de fallos (§7): si muere 3 veces en 5 minutos,
   * se desactiva el reinicio automático en lugar de reintentar en bucle.
   */
  private registerCrash(): void {
    const now = Date.now()
    this.crashTimestamps = this.crashTimestamps.filter((ts) => now - ts < CRASH_WINDOW_MS)
    this.crashTimestamps.push(now)

    if (this.crashTimestamps.length >= CRASH_THRESHOLD && this.autoRestartEnabled) {
      this.autoRestartEnabled = false
      this.pushLog(
        'error',
        'El servidor ha fallado 3 veces en 5 minutos. Se desactiva el reinicio ' +
          'automático para no repetir el error sin parar. Revisa el registro.'
      )
    }
  }

  get shouldAutoRestart(): boolean {
    return this.autoRestartEnabled && this.currentStatus === 'crashed'
  }

  private setStatus(status: ServerStatus): void {
    if (this.currentStatus === status) return
    this.currentStatus = status
    this.emit('status', status)
  }

  private pushLog(level: LogLine['level'], text: string): void {
    this.emit('log', { ts: Date.now(), level, text })
  }
}
