import { createSocket } from 'node:dgram'

/**
 * Consulta de servidores de Steam (A2S), escrita a mano sobre UDP.
 *
 * Es lo que usa el navegador de servidores de Steam: sirve para saber si un
 * servidor de Valheim, Enshrouded, Rust o Project Zomboid está en marcha y
 * cuántos jugadores tiene, sin depender de su consola.
 *
 * Protocolo: https://developer.valvesoftware.com/wiki/Server_queries
 *
 * Detalles que no son obvios:
 * - Desde 2020 casi todos los servidores responden a la primera petición con
 *   un reto (`A`, 0x41) y hay que repetirla con esos 4 bytes al final.
 * - Una respuesta grande (muchos jugadores) puede venir partida en varios
 *   datagramas (cabecera 0xFFFFFFFE) que llegan en cualquier orden.
 * - El puerto de consulta no siempre es el de juego: en Valheim es el
 *   siguiente (2456 -> 2457). Lo decide cada juego.
 */

export interface A2sInfo {
  protocol: number
  name: string
  map: string
  folder: string
  game: string
  appId: number
  players: number
  maxPlayers: number
  bots: number
  serverType: string
  environment: string
  passwordProtected: boolean
  vac: boolean
  version: string
  gamePort?: number
  steamId?: string
  keywords?: string
  gameId?: string
}

export interface A2sPlayer {
  name: string
  score: number
  durationSeconds: number
}

const SIMPLE = 0xffffffff
const SPLIT = 0xfffffffe

const HEADER_INFO = 0x54 // 'T'
const HEADER_PLAYER = 0x55 // 'U'
const RESPONSE_CHALLENGE = 0x41 // 'A'
const RESPONSE_INFO = 0x49 // 'I'
const RESPONSE_PLAYER = 0x44 // 'D'

/** Petición A2S_INFO, con el reto al final si el servidor lo ha pedido. */
export function infoRequest(challenge?: Buffer): Buffer {
  const body = Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff, HEADER_INFO]),
    Buffer.from('Source Engine Query\0', 'latin1')
  ])
  return challenge ? Buffer.concat([body, challenge]) : body
}

/** Petición A2S_PLAYER. Sin reto se manda -1 para que el servidor dé uno. */
export function playerRequest(challenge?: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff, HEADER_PLAYER]),
    challenge ?? Buffer.from([0xff, 0xff, 0xff, 0xff])
  ])
}

/** Lector secuencial de un paquete: cadenas terminadas en 0 y enteros LE. */
class Reader {
  offset = 0
  constructor(private readonly buf: Buffer) {}

  get remaining(): number {
    return this.buf.length - this.offset
  }

  byte(): number {
    return this.buf.readUInt8(this.offset++)
  }

  short(): number {
    const value = this.buf.readUInt16LE(this.offset)
    this.offset += 2
    return value
  }

  long(): number {
    const value = this.buf.readInt32LE(this.offset)
    this.offset += 4
    return value
  }

  float(): number {
    const value = this.buf.readFloatLE(this.offset)
    this.offset += 4
    return value
  }

  longlong(): bigint {
    const value = this.buf.readBigUInt64LE(this.offset)
    this.offset += 8
    return value
  }

  string(): string {
    const end = this.buf.indexOf(0, this.offset)
    const stop = end === -1 ? this.buf.length : end
    const value = this.buf.toString('utf8', this.offset, stop)
    this.offset = stop + 1
    return value
  }
}

const SERVER_TYPES: Record<string, string> = { d: 'dedicado', l: 'no dedicado', p: 'SourceTV' }
const ENVIRONMENTS: Record<string, string> = { w: 'Windows', l: 'Linux', m: 'macOS', o: 'macOS' }

/** Interpreta el cuerpo de una respuesta A2S_INFO (sin los 4 bytes 0xFF). */
export function parseInfo(payload: Buffer): A2sInfo {
  const r = new Reader(payload)
  const header = r.byte()
  if (header !== RESPONSE_INFO) {
    throw new Error(`Respuesta A2S_INFO inesperada (cabecera 0x${header.toString(16)}).`)
  }

  const info: A2sInfo = {
    protocol: r.byte(),
    name: r.string(),
    map: r.string(),
    folder: r.string(),
    game: r.string(),
    appId: r.short(),
    players: r.byte(),
    maxPlayers: r.byte(),
    bots: r.byte(),
    serverType: '',
    environment: '',
    passwordProtected: false,
    vac: false,
    version: ''
  }
  const type = String.fromCharCode(r.byte())
  info.serverType = SERVER_TYPES[type] ?? type
  const env = String.fromCharCode(r.byte())
  info.environment = ENVIRONMENTS[env] ?? env
  info.passwordProtected = r.byte() === 1
  info.vac = r.byte() === 1
  info.version = r.string()

  // Campos opcionales, anunciados por los bits del "Extra Data Flag".
  if (r.remaining > 0) {
    const edf = r.byte()
    if (edf & 0x80) info.gamePort = r.short()
    if (edf & 0x10) info.steamId = r.longlong().toString()
    if (edf & 0x40) {
      r.short() // puerto de SourceTV
      r.string() // nombre de SourceTV
    }
    if (edf & 0x20) info.keywords = r.string()
    if (edf & 0x01) info.gameId = r.longlong().toString()
  }
  return info
}

/** Interpreta el cuerpo de una respuesta A2S_PLAYER (sin los 4 bytes 0xFF). */
export function parsePlayers(payload: Buffer): A2sPlayer[] {
  const r = new Reader(payload)
  const header = r.byte()
  if (header !== RESPONSE_PLAYER) {
    throw new Error(`Respuesta A2S_PLAYER inesperada (cabecera 0x${header.toString(16)}).`)
  }
  const count = r.byte()
  const players: A2sPlayer[] = []
  for (let i = 0; i < count && r.remaining > 0; i++) {
    r.byte() // índice, que casi ningún servidor rellena
    const name = r.string()
    const score = r.long()
    const durationSeconds = Math.round(r.float())
    // Los servidores de algunos juegos rellenan huecos sin nombre: no son personas.
    if (name.length > 0) players.push({ name, score, durationSeconds })
  }
  return players
}

/**
 * Recompone una respuesta que puede venir partida. Devuelve el cuerpo sin la
 * cabecera 0xFFFFFFFF, o null si aún faltan trozos.
 */
export class SplitAssembler {
  private parts = new Map<number, Buffer>()
  private total = 0

  push(datagram: Buffer): Buffer | null {
    const kind = datagram.readUInt32LE(0)
    if (kind === SIMPLE) return datagram.subarray(4)
    if (kind !== SPLIT) throw new Error('Datagrama A2S con cabecera desconocida.')

    // Formato Source: id (4), total (1), número (1), tamaño máximo (2).
    this.total = datagram.readUInt8(8)
    const number = datagram.readUInt8(9)
    this.parts.set(number, datagram.subarray(12))
    if (this.parts.size < this.total) return null

    const whole = Buffer.concat(
      Array.from({ length: this.total }, (_, i) => this.parts.get(i) ?? Buffer.alloc(0))
    )
    this.parts.clear()
    // El mensaje recompuesto vuelve a empezar por 0xFFFFFFFF.
    return whole.subarray(4)
  }
}

interface QueryOptions {
  timeoutMs?: number
}

/**
 * Envía una petición y resuelve el reto si lo hay. Devuelve el cuerpo de la
 * respuesta definitiva, que empieza por `expectedHeader`.
 */
function query(
  host: string,
  port: number,
  build: (challenge?: Buffer) => Buffer,
  expectedHeader: number,
  { timeoutMs = 3000 }: QueryOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4')
    const assembler = new SplitAssembler()
    let settled = false
    let challenges = 0

    const finish = (err: Error | null, value?: Buffer): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.close()
      if (err) reject(err)
      else resolve(value!)
    }

    const timer = setTimeout(
      () => finish(new Error('El servidor no respondió a la consulta de Steam a tiempo.')),
      timeoutMs
    )

    socket.on('error', (err) => finish(err))
    socket.on('message', (datagram) => {
      try {
        const payload = assembler.push(datagram)
        if (!payload) return
        const header = payload.readUInt8(0)
        if (header === RESPONSE_CHALLENGE) {
          // Un servidor que encadena retos sin fin no debe colgar la consulta.
          if (++challenges > 3) throw new Error('El servidor repite el reto sin responder.')
          socket.send(build(payload.subarray(1, 5)), port, host)
          return
        }
        if (header !== expectedHeader) return // Respuesta de otra cosa: se ignora.
        finish(null, payload)
      } catch (err) {
        finish(err as Error)
      }
    })

    socket.send(build(), port, host, (err) => {
      if (err) finish(err)
    })
  })
}

export async function queryInfo(host: string, port: number, options: QueryOptions = {}): Promise<A2sInfo> {
  return parseInfo(await query(host, port, infoRequest, RESPONSE_INFO, options))
}

export async function queryPlayers(
  host: string,
  port: number,
  options: QueryOptions = {}
): Promise<A2sPlayer[]> {
  return parsePlayers(await query(host, port, playerRequest, RESPONSE_PLAYER, options))
}
