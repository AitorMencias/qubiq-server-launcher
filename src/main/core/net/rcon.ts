import { Socket } from 'node:net'

/**
 * Source RCON, escrito a mano sobre TCP: consola remota de Project Zomboid y
 * Factorio (y de Minecraft, aunque ahí la app usa stdin).
 *
 * Protocolo: https://developer.valvesoftware.com/wiki/Source_RCON_Protocol
 * Paquete: tamaño (int32 LE, sin contarse a sí mismo) · id · tipo · cuerpo · 0 · 0
 *
 * Detalles comprobados contra un servidor real de Project Zomboid (grabación
 * en scripts/smoke/fixtures/steam/zomboid-rcon.json):
 * - Al autenticarse llega primero un paquete vacío de tipo 0 y luego el de
 *   tipo 2. Con contraseña mala, ese segundo trae id -1.
 * - Una respuesta larga llega en varios paquetes de tipo 0 con el mismo id, y
 *   el corte puede caer a mitad de un carácter UTF-8: los cuerpos se unen como
 *   bytes y se convierten a texto al final.
 * - El truco para saber cuándo acaba una respuesta es mandar detrás un paquete
 *   vacío de tipo 0: el servidor lo devuelve después del último trozo. Zomboid
 *   lo devuelve dos veces, así que los ecos sobrantes se ignoran.
 */

const TYPE_AUTH = 3
const TYPE_AUTH_RESPONSE = 2
const TYPE_EXEC = 2
const TYPE_RESPONSE = 0

export interface RconPacket {
  id: number
  type: number
  body: Buffer
}

export function encodePacket(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, 'utf8')
  const packet = Buffer.alloc(14 + payload.length)
  packet.writeInt32LE(10 + payload.length, 0)
  packet.writeInt32LE(id, 4)
  packet.writeInt32LE(type, 8)
  payload.copy(packet, 12)
  return packet
}

/** Saca los paquetes completos del búfer y devuelve lo que sobra. */
export function decodePackets(buffer: Buffer): { packets: RconPacket[]; rest: Buffer } {
  const packets: RconPacket[] = []
  let offset = 0
  while (buffer.length - offset >= 4) {
    const size = buffer.readInt32LE(offset)
    if (size < 10 || size > 1024 * 1024) throw new Error('Paquete RCON con tamaño imposible.')
    if (buffer.length - offset < 4 + size) break
    packets.push({
      id: buffer.readInt32LE(offset + 4),
      type: buffer.readInt32LE(offset + 8),
      body: buffer.subarray(offset + 12, offset + 4 + size - 2)
    })
    offset += 4 + size
  }
  return { packets, rest: buffer.subarray(offset) }
}

export interface RconOptions {
  host: string
  port: number
  password: string
  timeoutMs?: number
  /**
   * Si el servidor devuelve el eco del «paquete terminador».
   *
   * El truco estándar de Source RCON es mandar detrás del comando un paquete
   * vacío: cuando vuelve su eco, la respuesta está completa. Minecraft y
   * Project Zomboid lo hacen; **Factorio no** (comprobado: contesta al comando
   * y el terminador lo ignora, así que esperarlo acaba siempre en un plantón).
   *
   * Con `false` la respuesta se da por terminada cuando deja de llegar nada
   * durante un momento, que es lo único que se puede hacer sin ese eco.
   */
  terminatorEcho?: boolean
}

/**
 * Lo que se espera a que lleguen más trozos, cuando no hay terminador.
 *
 * Las respuestas largas vienen partidas en varios paquetes con el mismo
 * identificador, y sin eco no hay forma de saber cuál es el último: se espera
 * un poco desde el último trozo. Corto para no hacer esperar a la interfaz.
 */
const IDLE_MS = 200

export class RconError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'connection' | 'timeout'
  ) {
    super(message)
    this.name = 'RconError'
  }
}

export class RconClient {
  private buffer: Buffer = Buffer.alloc(0)
  private nextId = 1
  private waiters: Array<(packet: RconPacket) => void> = []
  private closedError: Error | null = null

  private constructor(
    private readonly socket: Socket,
    private readonly timeoutMs: number,
    private readonly terminatorEcho: boolean
  ) {
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      try {
        const { packets, rest } = decodePackets(this.buffer)
        this.buffer = rest
        for (const packet of packets) for (const waiter of [...this.waiters]) waiter(packet)
      } catch (err) {
        this.fail(err as Error)
      }
    })
    socket.on('error', (err) => this.fail(new RconError(err.message, 'connection')))
    socket.on('close', () => this.fail(new RconError('El servidor cerró la conexión RCON.', 'connection')))
  }

  static connect(options: RconOptions): Promise<RconClient> {
    const timeoutMs = options.timeoutMs ?? 5000
    return new Promise((resolve, reject) => {
      const socket = new Socket()
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new RconError('El servidor no aceptó la conexión RCON a tiempo.', 'timeout'))
      }, timeoutMs)
      socket.once('error', (err) => {
        clearTimeout(timer)
        reject(new RconError(`No se pudo conectar por RCON: ${err.message}`, 'connection'))
      })
      socket.connect(options.port, options.host, async () => {
        clearTimeout(timer)
        const client = new RconClient(socket, timeoutMs, options.terminatorEcho ?? true)
        try {
          await client.authenticate(options.password)
          resolve(client)
        } catch (err) {
          client.close()
          reject(err)
        }
      })
    })
  }

  private fail(err: Error): void {
    if (this.closedError) return
    this.closedError = err
    for (const waiter of [...this.waiters]) waiter({ id: Number.NaN, type: -1, body: Buffer.alloc(0) })
  }

  /** Espera paquetes hasta que `accept` diga que ya está. */
  private collect<T>(accept: (packet: RconPacket) => T | undefined): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.closedError) {
        reject(this.closedError)
        return
      }
      const waiter = (packet: RconPacket): void => {
        if (this.closedError) {
          done()
          reject(this.closedError)
          return
        }
        const result = accept(packet)
        if (result !== undefined) {
          done()
          resolve(result)
        }
      }
      const timer = setTimeout(() => {
        done()
        reject(new RconError('El servidor no respondió por RCON a tiempo.', 'timeout'))
      }, this.timeoutMs)
      const done = (): void => {
        clearTimeout(timer)
        this.waiters = this.waiters.filter((w) => w !== waiter)
      }
      this.waiters.push(waiter)
    })
  }

  private async authenticate(password: string): Promise<void> {
    const id = this.nextId++
    const wait = this.collect((p) => (p.type === TYPE_AUTH_RESPONSE ? p : undefined))
    this.socket.write(encodePacket(id, TYPE_AUTH, password))
    const response = await wait
    if (response.id === -1 || response.id !== id) {
      throw new RconError('La contraseña de RCON no es correcta.', 'auth')
    }
  }

  /** Ejecuta una orden y devuelve la respuesta completa. */
  async exec(command: string): Promise<string> {
    if (!this.terminatorEcho) return this.execWithoutTerminator(command)

    const id = this.nextId++
    const terminator = this.nextId++
    const chunks: Buffer[] = []
    const wait = this.collect((p) => {
      if (p.id === id) chunks.push(p.body)
      return p.id === terminator ? true : undefined
    })
    this.socket.write(encodePacket(id, TYPE_EXEC, command))
    this.socket.write(encodePacket(terminator, TYPE_RESPONSE, ''))
    await wait
    return Buffer.concat(chunks).toString('utf8')
  }

  /**
   * Lo mismo para servidores que no devuelven el eco del terminador (Factorio).
   *
   * Sin ese eco no hay forma de saber que la respuesta ha terminado, así que se
   * recogen trozos hasta que pasa un rato sin llegar nada. Una respuesta vacía
   * es normal (hay comandos que no contestan), y por eso el plazo general sigue
   * corriendo: si el servidor no dice nada en absoluto, eso sí es un plantón.
   */
  private execWithoutTerminator(command: string): Promise<string> {
    const id = this.nextId++
    const chunks: Buffer[] = []
    return new Promise((resolve, reject) => {
      if (this.closedError) {
        reject(this.closedError)
        return
      }
      let idle: NodeJS.Timeout | null = null
      const finish = (): void => {
        done()
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
      const waiter = (packet: RconPacket): void => {
        if (this.closedError) {
          // El servidor cerró la conexión. Si ya había contestado algo, eso
          // vale: `/quit` responde y corta acto seguido.
          if (chunks.length > 0) finish()
          else {
            done()
            reject(this.closedError)
          }
          return
        }
        if (packet.id !== id) return
        chunks.push(packet.body)
        if (idle) clearTimeout(idle)
        idle = setTimeout(finish, IDLE_MS)
      }
      const timer = setTimeout(() => {
        if (chunks.length > 0) finish()
        else {
          done()
          reject(new RconError('El servidor no respondió por RCON a tiempo.', 'timeout'))
        }
      }, this.timeoutMs)
      const done = (): void => {
        clearTimeout(timer)
        if (idle) clearTimeout(idle)
        this.waiters = this.waiters.filter((w) => w !== waiter)
      }
      this.waiters.push(waiter)
      this.socket.write(encodePacket(id, TYPE_EXEC, command))
    })
  }

  close(): void {
    this.socket.destroy()
  }
}

/** Conecta, ejecuta una orden y cierra. */
export async function rconCommand(options: RconOptions, command: string): Promise<string> {
  const client = await RconClient.connect(options)
  try {
    return await client.exec(command)
  } finally {
    client.close()
  }
}
