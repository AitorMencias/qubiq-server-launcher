import {
  WebRconSilenceError,
  decodeWebRcon,
  encodeWebRcon,
  webRconUrl,
  type WebRconOptions
} from './webrcon'

/**
 * Una conexión WebRCON que se abre una vez y sirve para todo.
 *
 * ⚠ La razón de que exista, medida contra el servidor real de Rust (fase 7):
 * **Rust admite cuatro conexiones por dirección y no suelta las cerradas.** El
 * cliente cierra, el servidor nunca contesta al cierre, y la conexión se queda
 * ocupando su sitio: con seis conexiones sueltas seguidas, las tres últimas se
 * rechazan, y cuatro minutos después se seguían rechazando. Como la app
 * pregunta cada cinco segundos quién está dentro, «conectar, mandar y cerrar»
 * dejaba la consola inservible en medio minuto, parada incluida.
 *
 * Con una sola conexión, en cambio, treinta órdenes seguidas salieron todas
 * bien. Así que el sondeo, la consola, la moderación, las copias y la parada
 * van todas por la misma, y cada respuesta se reconoce por su Identifier.
 *
 * Si la conexión se cae (el servidor se para), la siguiente orden abre otra:
 * un servidor nuevo tiene sus sitios libres.
 */

interface Pending {
  parts: string[]
  timer: NodeJS.Timeout
  quietTimer: NodeJS.Timeout | null
  resolve: (value: string) => void
  reject: (err: Error) => void
  quietMs: number
}

export interface SessionCommandOptions {
  /** Cuánto se espera a la PRIMERA respuesta. */
  timeoutMs?: number
  /** Silencio tras una respuesta que la da por terminada (medido: < 100 ms entre mensajes). */
  quietMs?: number
}

let counter = 5000

export class WebRconSession {
  private socket: WebSocket | null = null
  private connecting: Promise<WebSocket> | null = null
  private readonly pending = new Map<number, Pending>()

  constructor(readonly options: WebRconOptions) {}

  /** ¿Es la sesión de este servidor, con esta contraseña? */
  matches(options: WebRconOptions): boolean {
    return (
      options.host === this.options.host &&
      options.port === this.options.port &&
      options.password === this.options.password
    )
  }

  get connected(): boolean {
    return this.socket !== null
  }

  private open(): Promise<WebSocket> {
    if (this.socket) return Promise.resolve(this.socket)
    if (this.connecting) return this.connecting

    this.connecting = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(webRconUrl(this.options))
      let opened = false
      const timer = setTimeout(() => {
        if (opened) return
        try {
          socket.close()
        } catch {
          // Ya cerrado.
        }
        reject(new Error('La consola remota del servidor no contesta. ¿Está arrancando todavía?'))
      }, this.options.timeoutMs ?? 5_000)

      socket.addEventListener('open', () => {
        opened = true
        clearTimeout(timer)
        this.socket = socket
        resolve(socket)
      })
      socket.addEventListener('message', (event) => this.onMessage(String(event.data)))
      const lost = (): void => {
        clearTimeout(timer)
        if (!opened) {
          // ⚠ No se prueba el puerto con una conexión a pelo para saber si es
          // la contraseña: en Rust esa conexión también ocuparía un sitio.
          reject(
            new Error(
              'No se pudo abrir la consola remota del servidor. Si acaba de arrancar, espera un ' +
                'momento; si no, puede que la contraseña ya no sea la suya.'
            )
          )
          return
        }
        if (this.socket === socket) this.socket = null
        this.failAll()
      }
      socket.addEventListener('error', lost)
      socket.addEventListener('close', lost)
    }).finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private onMessage(data: string): void {
    const message = decodeWebRcon(data)
    if (!message) return
    const pending = this.pending.get(message.Identifier)
    if (!pending) return
    if (message.Message.length > 0) pending.parts.push(message.Message)
    // La primera respuesta dice que la orden existe: a partir de aquí manda el
    // silencio, no el plazo.
    clearTimeout(pending.timer)
    if (pending.quietTimer) clearTimeout(pending.quietTimer)
    pending.quietTimer = setTimeout(() => this.settle(message.Identifier), pending.quietMs)
  }

  private settle(identifier: number, err?: Error): void {
    const pending = this.pending.get(identifier)
    if (!pending) return
    this.pending.delete(identifier)
    clearTimeout(pending.timer)
    if (pending.quietTimer) clearTimeout(pending.quietTimer)
    if (err) pending.reject(err)
    else pending.resolve(pending.parts.join('\n'))
  }

  /** La conexión se ha caído: lo que tenga respuesta, vale; lo demás, falla. */
  private failAll(): void {
    for (const [identifier, pending] of [...this.pending]) {
      this.settle(
        identifier,
        pending.parts.length > 0 || pending.quietTimer
          ? undefined
          : new Error('El servidor ha cerrado la consola remota.')
      )
    }
  }

  /** Manda una orden y devuelve todo lo que conteste, unido por líneas. */
  async command(text: string, options: SessionCommandOptions = {}): Promise<string> {
    const socket = await this.open()
    const identifier = ++counter
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => this.settle(identifier, new WebRconSilenceError()),
        options.timeoutMs ?? 10_000
      )
      this.pending.set(identifier, {
        parts: [],
        timer,
        quietTimer: null,
        resolve,
        reject,
        quietMs: options.quietMs ?? 250
      })
      try {
        socket.send(encodeWebRcon(identifier, text))
      } catch (err) {
        this.settle(identifier, err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  close(): void {
    const socket = this.socket
    this.socket = null
    this.failAll()
    try {
      socket?.close()
    } catch {
      // Ya cerrado.
    }
  }
}
