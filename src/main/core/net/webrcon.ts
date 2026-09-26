/**
 * WebRCON de Rust: consola remota por WebSocket, con el WebSocket nativo de
 * Node/Electron (sin dependencias).
 *
 * - Se conecta a `ws://host:puerto/<contraseña>`. Una contraseña mala no da
 *   un mensaje de error: el servidor cierra la conexión (código 1006, medido).
 * - Cada orden va como JSON `{ Identifier, Message, Name }` y la respuesta
 *   vuelve con el mismo `Identifier`. Mezclados llegan también los mensajes
 *   de consola del servidor (Identifier 0 o -1), que se ignoran aquí.
 *
 * Dos cosas medidas contra el servidor real (fase 7, `fixtures/rust/`) que
 * cambian cómo hay que esperar la respuesta:
 *
 * 1. **Una orden puede devolver varios mensajes con el mismo Identifier**: uno
 *    por cada línea que escribe el servidor mientras la cumple. `server.save`
 *    contesta con cuatro («Saving navmesh…», «Saved 30,047 ents…», «Saving
 *    complete»…). Quedarse con el primero daba una respuesta a medias, así que
 *    se recogen todos hasta que el servidor se calla un momento.
 * 2. **Una orden que no existe no devuelve nada.** Ni un error ni un mensaje:
 *    silencio. Por eso agotar el plazo sin respuesta no es lo mismo que no
 *    poder conectar, y se dice distinto.
 */

export interface WebRconOptions {
  host: string
  port: number
  password: string
  /** Cuánto se espera a la PRIMERA respuesta. */
  timeoutMs?: number
  /**
   * Cuánto silencio, después de una respuesta, se toma como «ya ha terminado».
   * Medido: los mensajes de una misma orden llegan con menos de 100 ms entre sí.
   */
  quietMs?: number
}

export interface WebRconMessage {
  Identifier: number
  Message: string
  Type?: string
  Stacktrace?: string
}

/** Error de «no ha contestado», distinto de «no se ha podido conectar». */
export class WebRconSilenceError extends Error {
  constructor() {
    super(
      'El servidor no ha contestado a esa orden. Rust no avisa cuando no conoce una orden: ' +
        'comprueba que está bien escrita.'
    )
    this.name = 'WebRconSilenceError'
  }
}

export function webRconUrl({ host, port, password }: WebRconOptions): string {
  return `ws://${host}:${port}/${encodeURIComponent(password)}`
}

export function encodeWebRcon(identifier: number, command: string): string {
  return JSON.stringify({ Identifier: identifier, Message: command, Name: 'QubiQ' })
}

export function decodeWebRcon(data: string): WebRconMessage | null {
  try {
    const parsed = JSON.parse(data) as Partial<WebRconMessage>
    if (typeof parsed.Identifier !== 'number' || typeof parsed.Message !== 'string') return null
    return parsed as WebRconMessage
  } catch {
    return null
  }
}

let counter = 1000

/**
 * Conecta, manda una orden, recoge todo lo que conteste y cierra.
 *
 * Devuelve los mensajes de la orden unidos por saltos de línea. Si el servidor
 * cierra la conexión después de contestar (`quit`), lo que haya llegado vale.
 */
export function webRconCommand(options: WebRconOptions, command: string): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 5000
  const quietMs = options.quietMs ?? 250
  const identifier = ++counter
  return new Promise((resolve, reject) => {
    let settled = false
    let opened = false
    const parts: string[] = []
    let quietTimer: NodeJS.Timeout | null = null
    const socket = new WebSocket(webRconUrl(options))

    const finish = (err: Error | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (quietTimer) clearTimeout(quietTimer)
      try {
        socket.close()
      } catch {
        // Ya cerrado.
      }
      if (err) reject(err)
      else resolve(parts.join('\n'))
    }

    const timer = setTimeout(
      () => finish(opened ? new WebRconSilenceError() : new Error('El servidor no respondió por WebRCON a tiempo.')),
      timeoutMs
    )

    socket.addEventListener('open', () => {
      opened = true
      socket.send(encodeWebRcon(identifier, command))
    })
    socket.addEventListener('message', (event) => {
      const message = decodeWebRcon(String(event.data))
      if (message?.Identifier !== identifier) return
      if (message.Message.length > 0) parts.push(message.Message)
      // La primera respuesta ya dice que la orden existe: a partir de aquí lo
      // que manda es el silencio, no el plazo.
      clearTimeout(timer)
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => finish(null), quietMs)
    })
    let failing = false
    const failed = (): void => {
      // Llegan los dos, el error y el cierre: con uno basta.
      if (failing || settled) return
      failing = true
      // `quit` contesta y cierra: lo que llegó antes del cierre es la respuesta.
      if (parts.length > 0 || quietTimer) {
        finish(null)
        return
      }
      // ⚠ El WebSocket de Node da lo mismo —un error vacío y un cierre 1006—
      // si la contraseña es mala que si no hay nadie escuchando (comprobado).
      // No se prueba el puerto con una conexión a pelo para distinguirlo: en
      // Rust ocuparía uno de sus cuatro sitios por dirección (ver
      // `webrconSession.ts`), así que se dicen las dos posibilidades.
      finish(
        new Error(
          opened
            ? 'El servidor cerró la conexión WebRCON sin responder.'
            : 'No se pudo conectar por WebRCON con el servidor: o no está arrancado, o la contraseña no es la suya.'
        )
      )
    }
    socket.addEventListener('error', failed)
    socket.addEventListener('close', failed)
  })
}
