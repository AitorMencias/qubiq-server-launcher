import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { Diagnosis, LogLine, ServerStatus } from '@shared/types'
import type { LiveStatus, ParsedEvent, StopStrategy, SupervisorHandle } from '../games/types'
import { DEFAULT_STOP_GRACE_MS, requestStop } from './stop'

/**
 * Supervisión del proceso de un servidor, de cualquier juego (§7).
 *
 * ⚠ LO MÁS CRÍTICO DE TODO EL PROYECTO:
 * Windows no tiene SIGTERM: `child.kill()` mata el proceso de golpe y el
 * servidor no llega a guardar. Por eso cada juego declara su forma limpia de
 * parar (en Minecraft, escribir `stop` en stdin) y el kill solo se usa como
 * último recurso tras agotar el plazo de gracia.
 */

/** Ventana y umbral para detectar un bucle de fallos (§7). */
const CRASH_WINDOW_MS = 5 * 60_000
const CRASH_THRESHOLD = 3

/** Líneas de log que se conservan para diagnosticar una salida inesperada. */
const RECENT_LINES = 200

/** Cada cuánto se pregunta al servidor si no dice otra cosa su juego. */
const DEFAULT_POLL_MS = 5_000

/** Lo que se espera a que un proceso muerto a la fuerza termine de morirse. */
const KILL_WAIT_MS = 5_000

export interface SupervisorEvents {
  log: (line: LogLine) => void
  status: (status: ServerStatus) => void
  /** Quién está dentro y, si el juego solo da el número, cuántos son. */
  players: (players: string[], playerCount: number | null) => void
  ready: () => void
  /** Código para entrar, en los juegos que se conectan por relé (Valheim). */
  joinCode: (code: string | null) => void
  diagnosis: (diagnosis: Diagnosis) => void
  /**
   * `requested` distingue quién decidió el cierre: true si lo pidió el usuario
   * (`stop()`), false si el servidor se apagó por su cuenta. Sin ese dato no se
   * puede saber si procede volver a arrancarlo.
   */
  exit: (code: number | null, requested: boolean) => void
}

export interface StartOptions {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  /** Cómo se para sin perder partida. */
  stop: StopStrategy
  /** Cómo se interpreta cada línea del registro. */
  parseLine: (raw: string) => ParsedEvent
  /** Qué se le dice al usuario si el proceso muere solo. */
  diagnoseExit: (code: number | null, recentLines: string[]) => Diagnosis
  /**
   * Para los juegos que no cuentan nada por el registro: se les pregunta cada
   * pocos segundos si ya están listos y cuánta gente hay dentro.
   */
  poll?: () => Promise<LiveStatus>
  pollIntervalMs?: number
}

export class ServerSupervisor extends EventEmitter implements SupervisorHandle {
  private child: ChildProcessWithoutNullStreams | null = null
  private currentStatus: ServerStatus = 'stopped'
  private readonly onlinePlayers = new Set<string>()
  private readonly recent: string[] = []
  private crashTimestamps: number[] = []
  private stopTimer: NodeJS.Timeout | null = null
  /** Reenvío de la señal de cierre a los juegos que la ignoran al arrancar. */
  private stopRetryTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  /** Cuántos jugadores dice el juego que hay, cuando no da los nombres. */
  private currentPlayerCount: number | null = null
  private startedAt: number | null = null
  /** Código para entrar del arranque en curso; el juego lo cambia cada vez. */
  private currentJoinCode: string | null = null
  /** Se pone a true cuando la parada la pide el usuario, no un fallo. */
  private stopRequested = false
  private autoRestartEnabled = false
  /** Lo propio del juego del arranque en curso. */
  private options: StartOptions | null = null

  constructor(readonly instanceId: string) {
    super()
  }

  get status(): ServerStatus {
    return this.currentStatus
  }

  get players(): string[] {
    return [...this.onlinePlayers]
  }

  get playerCount(): number | null {
    return this.currentPlayerCount
  }

  get joinCode(): string | null {
    return this.currentJoinCode
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
    this.currentPlayerCount = null
    this.currentJoinCode = null
    this.recent.length = 0
    this.setStatus('starting')

    this.options = options
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true,
      // stdin abierto es imprescindible: es el canal de comandos y de parada.
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.child = child
    this.startedAt = Date.now()

    // Escribir en stdin justo cuando el proceso muere da EPIPE como evento; sin
    // oyente tumbaría la app entera. El cierre ya lo trata 'close'.
    child.stdin.on('error', () => undefined)

    createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line))
    createInterface({ input: child.stderr }).on('line', (line) => this.handleLine(line))

    child.on('error', (err) => {
      this.pushLog('error', `No se pudo lanzar el servidor: ${err.message}`)
      this.finish(null)
    })

    child.on('close', (code) => this.finish(code))

    if (options.poll) this.startPolling(options.poll, options.pollIntervalMs ?? DEFAULT_POLL_MS)
  }

  /**
   * Pregunta al servidor cada pocos segundos. Los fallos se tragan: mientras
   * arranca, la API todavía no responde y eso es lo normal, no un error que
   * merezca salir en la consola del usuario.
   */
  private startPolling(poll: () => Promise<LiveStatus>, intervalMs: number): void {
    let asking = false

    const ask = async (): Promise<void> => {
      if (asking || !this.child) return
      asking = true
      try {
        const status = await poll()
        if (!this.child) return

        if (status.ready && this.currentStatus === 'starting') {
          this.setStatus('running')
          this.emit('ready')
        }

        if (status.playerCount !== undefined && status.playerCount !== this.currentPlayerCount) {
          this.currentPlayerCount = status.playerCount
          this.emit('players', this.players, this.currentPlayerCount)
        }
      } catch {
        // El servidor aún no contesta o se está cerrando.
      } finally {
        asking = false
      }
    }

    this.pollTimer = setInterval(() => void ask(), intervalMs)
    this.pollTimer.unref?.()
    void ask()
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
    this.pushLog('system', 'Guardando la partida y cerrando el servidor...')

    const strategy = this.options?.stop
    const graceMs = strategy?.graceMs ?? DEFAULT_STOP_GRACE_MS
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))

    if (strategy) {
      // Si la petición falla (RCON caído, consola ya cerrada...) no se mata nada
      // todavía: puede que el servidor se esté cerrando igualmente.
      await Promise.race([
        closed,
        requestStop(strategy, {
          pid: child.pid,
          writeStdin: (text) => child.stdin.write(text)
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          this.pushLog('warn', `No se pudo pedir el cierre limpio: ${message}`)
        })
      ])
    }

    // Hay juegos que ignoran la señal mientras arrancan (Valheim, durante la
    // generación del mundo). Repetirla es lo que evita tener que matarlos.
    if (strategy && 'retryEveryMs' in strategy && strategy.retryEveryMs) {
      this.stopRetryTimer = setInterval(() => {
        const alive = this.child
        if (!alive) return
        void requestStop(strategy, {
          pid: alive.pid,
          writeStdin: (text) => alive.stdin.write(text)
        }).catch(() => undefined)
      }, strategy.retryEveryMs)
      this.stopRetryTimer.unref?.()
    }

    await new Promise<void>((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        if (this.stopTimer) clearTimeout(this.stopTimer)
        this.stopTimer = null
        this.clearStopRetry()
        resolve()
      }

      void closed.then(done)

      this.stopTimer = setTimeout(() => {
        // Último recurso. Se avisa porque puede haber pérdida de datos.
        this.pushLog(
          'warn',
          `El servidor no respondió al cierre en ${Math.round(graceMs / 1000)} segundos. ` +
            'Se fuerza el cierre; puede que los últimos cambios de la partida no se hayan guardado.'
        )
        child.kill()

        // Matar NO es instantáneo: Windows tarda un momento en soltar los
        // ficheros que tenía abiertos el proceso. Quien llama a `stop()` suele
        // querer borrar el servidor o restaurar una copia justo después, y sin
        // esperar al cierre de verdad eso falla con EBUSY. Con un tope, para no
        // quedarse colgado si el proceso no termina de morir.
        const giveUp = setTimeout(done, KILL_WAIT_MS)
        void closed.then(() => {
          clearTimeout(giveUp)
          done()
        })
      }, graceMs)
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

    const event = this.options?.parseLine(raw) ?? { level: 'system' as const, text: raw }
    // Una línea oculta se guarda para diagnosticar, pero no llega a la consola.
    if (!event.hidden) this.pushLog(event.level, event.text)

    if (event.ready) {
      this.setStatus('running')
      this.emit('ready')
    }

    if (event.playerJoined) {
      this.onlinePlayers.add(event.playerJoined)
      this.emit('players', this.players, this.currentPlayerCount)
    }

    if (event.playerLeft) {
      this.onlinePlayers.delete(event.playerLeft)
      this.emit('players', this.players, this.currentPlayerCount)
    }

    if (event.joinCode && event.joinCode !== this.currentJoinCode) {
      this.currentJoinCode = event.joinCode
      this.emit('joinCode', event.joinCode)
    }

    if (event.diagnosis) {
      this.emit('diagnosis', event.diagnosis)
    }
  }

  private clearStopRetry(): void {
    if (!this.stopRetryTimer) return
    clearInterval(this.stopRetryTimer)
    this.stopRetryTimer = null
  }

  private finish(code: number | null): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    this.clearStopRetry()
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    this.child = null
    this.startedAt = null
    this.onlinePlayers.clear()
    this.currentPlayerCount = null
    this.emit('players', [], null)
    if (this.currentJoinCode !== null) {
      this.currentJoinCode = null
      this.emit('joinCode', null)
    }

    const wasRequested = this.stopRequested
    this.stopRequested = false

    if (wasRequested || code === 0) {
      this.setStatus('stopped')
      this.emit('exit', code, wasRequested)
      return
    }

    // Salida inesperada: diagnosticamos antes de decidir si reintentar.
    this.setStatus('crashed')
    const diagnosis = this.options?.diagnoseExit(code, this.recent) ?? {
      code: 'unknown-exit',
      title: 'El servidor se cerró inesperadamente',
      detail: `Código de salida ${code}.`
    }
    this.emit('diagnosis', diagnosis)
    this.emit('exit', code, wasRequested)

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
