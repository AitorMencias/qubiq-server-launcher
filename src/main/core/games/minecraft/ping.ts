import { Socket } from 'node:net'
import { USER_AGENT } from '../../net/http'
import type { ExternalCheckResult, PingResult } from '../types'

/**
 * Consultas de estado propias de Minecraft (§10).
 *
 * La comprobación local se hace con el **Server List Ping**, el mismo
 * handshake que usa el juego al mostrar un servidor en la lista. Un simple "el
 * puerto acepta conexiones" mentiría: el puerto está abierto desde que la JVM
 * lo reserva, bastante antes de que el servidor pueda aceptar jugadores.
 */

// --- Protocolo Server List Ping ---------------------------------------------

function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let remaining = value

  do {
    let byte = remaining & 0x7f
    remaining >>>= 7
    if (remaining !== 0) byte |= 0x80
    bytes.push(byte)
  } while (remaining !== 0)

  return Buffer.from(bytes)
}

function writeString(value: string): Buffer {
  const data = Buffer.from(value, 'utf8')
  return Buffer.concat([writeVarInt(data.length), data])
}

/** Envuelve una carga útil con su longitud, como exige el protocolo. */
function packet(...parts: Buffer[]): Buffer {
  const payload = Buffer.concat(parts)
  return Buffer.concat([writeVarInt(payload.length), payload])
}

interface VarIntRead {
  value: number
  size: number
}

function readVarInt(buffer: Buffer, offset = 0): VarIntRead | null {
  let value = 0
  let size = 0

  while (true) {
    if (offset + size >= buffer.length) return null // Faltan bytes por llegar.
    const byte = buffer[offset + size]!
    value |= (byte & 0x7f) << (7 * size)
    size++
    if ((byte & 0x80) === 0) break
    if (size > 5) return null // VarInt corrupto.
  }

  return { value, size }
}


interface StatusResponse {
  version?: { name?: string }
  players?: { online?: number; max?: number }
  description?: unknown
}

/** El MOTD puede venir como texto plano o como componente con `extra`. */
function flattenDescription(description: unknown): string {
  if (typeof description === 'string') return description
  if (description && typeof description === 'object') {
    const node = description as { text?: string; extra?: unknown[] }
    const own = typeof node.text === 'string' ? node.text : ''
    const children = Array.isArray(node.extra)
      ? node.extra.map((child) => flattenDescription(child)).join('')
      : ''
    return own + children
  }
  return ''
}

/**
 * Hace un Server List Ping contra host:port.
 * Protocolo -1 significa "no me importa la versión", que es lo correcto para
 * un sondeo: así responde cualquier servidor sin quejarse de incompatibilidad.
 */
export function serverListPing(host: string, port: number, timeoutMs = 4000): Promise<PingResult> {
  return new Promise((resolve) => {
    const socket = new Socket()
    const started = Date.now()
    let received = Buffer.alloc(0)
    let settled = false

    const finish = (result: PingResult): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)

    socket.on('timeout', () => finish({ ok: false, error: 'El servidor no respondió a tiempo.' }))
    socket.on('error', (err) => finish({ ok: false, error: err.message }))
    // Un servidor que corta sin responder (pasa justo al terminar de arrancar)
    // no dispara ni 'error' ni 'timeout': sin esto la promesa no se resolvía.
    socket.on('close', () => finish({ ok: false, error: 'El servidor cerró la conexión sin responder.' }))

    socket.connect(port, host, () => {
      const handshake = packet(
        writeVarInt(0x00), // id de paquete: handshake
        writeVarInt(-1), // versión de protocolo: indiferente
        writeString(host),
        (() => {
          const buf = Buffer.alloc(2)
          buf.writeUInt16BE(port)
          return buf
        })(),
        writeVarInt(1) // siguiente estado: status
      )
      socket.write(handshake)
      socket.write(packet(writeVarInt(0x00))) // petición de estado
    })

    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk])

      const length = readVarInt(received)
      if (!length) return
      if (received.length < length.size + length.value) return // Aún incompleto.

      const body = received.subarray(length.size, length.size + length.value)
      const packetId = readVarInt(body)
      if (!packetId || packetId.value !== 0x00) {
        finish({ ok: false, error: 'Respuesta inesperada del servidor.' })
        return
      }

      const jsonLength = readVarInt(body, packetId.size)
      if (!jsonLength) {
        finish({ ok: false, error: 'Respuesta incompleta del servidor.' })
        return
      }

      const start = packetId.size + jsonLength.size
      const json = body.subarray(start, start + jsonLength.value).toString('utf8')

      try {
        const status = JSON.parse(json) as StatusResponse
        finish({
          ok: true,
          motd: flattenDescription(status.description).trim(),
          versionName: status.version?.name,
          playersOnline: status.players?.online,
          playersMax: status.players?.max,
          latencyMs: Date.now() - started
        })
      } catch {
        finish({ ok: false, error: 'El servidor devolvió una respuesta ilegible.' })
      }
    })
  })
}

interface McStatusResponse {
  online: boolean
  motd?: { clean?: string }
  players?: { online?: number; max?: number }
}

/**
 * Pide a un servicio externo que intente conectarse al servidor.
 *
 * Es la única forma honesta de responder "¿pueden entrar mis amigos?": desde
 * esta máquina siempre se ve el servidor, esté o no accesible desde fuera.
 *
 * ⚠ Estos servicios cachean la respuesta alrededor de un minuto, así que un
 * resultado negativo justo tras abrir el puerto puede ser antiguo. La interfaz
 * muestra la hora de la comprobación por eso.
 */
export async function checkFromInternet(
  host: string,
  port: number,
  timeoutMs = 20_000
): Promise<ExternalCheckResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const target = `${encodeURIComponent(host)}:${port}`
    const res = await fetch(`https://api.mcstatus.io/v2/status/java/${target}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: controller.signal
    })

    if (!res.ok) {
      return { reachable: false, error: `El servicio de comprobación respondió ${res.status}.` }
    }

    const data = (await res.json()) as McStatusResponse
    if (!data.online) return { reachable: false }

    return {
      reachable: true,
      motd: data.motd?.clean?.trim(),
      playersOnline: data.players?.online,
      playersMax: data.players?.max
    }
  } catch (err) {
    return {
      reachable: false,
      error: err instanceof Error ? err.message : 'No se pudo contactar con el servicio.'
    }
  } finally {
    clearTimeout(timer)
  }
}
