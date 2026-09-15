/**
 * WebRCON de Rust: consola remota por WebSocket, con el WebSocket nativo de
 * Node/Electron (sin dependencias).
 *
 * - Se conecta a `ws://host:puerto/<contraseña>`. Una contraseña mala no da
 *   un mensaje de error: el servidor cierra la conexión.
 * - Cada orden va como JSON `{ Identifier, Message, Name }` y la respuesta
 *   vuelve con el mismo `Identifier`. Mezclados llegan también los mensajes
 *   de consola del servidor (Identifier 0 o -1), que se ignoran aquí.
 */

export interface WebRconOptions {
  host: string
  port: number
  password: string
  timeoutMs?: number
}

export interface WebRconMessage {
  Identifier: number
  Message: string
  Type?: string
  Stacktrace?: string
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

/** Conecta, manda una orden, espera su respuesta y cierra. */
export function webRconCommand(options: WebRconOptions, command: string): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 5000
  const identifier = ++counter
  return new Promise((resolve, reject) => {
    let settled = false
    let opened = false
    const socket = new WebSocket(webRconUrl(options))

    const finish = (err: Error | null, value?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // Ya cerrado.
      }
      if (err) reject(err)
      else resolve(value ?? '')
    }

    const timer = setTimeout(
      () => finish(new Error('El servidor no respondió por WebRCON a tiempo.')),
      timeoutMs
    )

    socket.addEventListener('open', () => {
      opened = true
      socket.send(encodeWebRcon(identifier, command))
    })
    socket.addEventListener('message', (event) => {
      const message = decodeWebRcon(String(event.data))
      if (message?.Identifier === identifier) finish(null, message.Message)
    })
    socket.addEventListener('error', () => {
      finish(new Error('No se pudo conectar por WebRCON con el servidor.'))
    })
    socket.addEventListener('close', () => {
      finish(
        new Error(
          opened
            ? 'El servidor cerró la conexión WebRCON sin responder.'
            : 'El servidor rechazó la conexión WebRCON (¿contraseña incorrecta?).'
        )
      )
    })
  })
}
