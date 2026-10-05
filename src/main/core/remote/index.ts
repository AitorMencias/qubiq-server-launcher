import { EventEmitter } from 'node:events'
import { timingSafeEqual, type KeyObject } from 'node:crypto'
import type { Server } from 'node:https'
import { homedir } from 'node:os'
import {
  CONTROL_ORDERS,
  cleanServerList,
  isConsoleLevel,
  isKeyAlgorithm,
  isRemoteOrder,
  maskAddresses,
  normalizeCode,
  orderMessage,
  pairMessage,
  CODE_LENGTH,
  type RemoteActivityEntry,
  type RemoteArgs,
  type RemoteError,
  type RemoteInvite,
  type RemoteOrder,
  type RemotePairResult,
  type RemotePermissions,
  type RemoteResponse,
  type RemoteStartError,
  type RemoteState,
  type RemoteStatus,
  type SignedOrder
} from '@shared/remote'
import { localAddresses } from '../net/network'
import { ensureCertificate, type CertMaterial } from './cert'
import { importPublicKey, randomCode, randomId, verifySignature } from './crypto'
import { AddressGuard, CLOCK_WINDOW_MS, LIMITS, NonceCache, RateLimiter } from './guard'
import { OrderRefused, runOrder, type OrderHost } from './orders'
import { startRemoteServer, stopRemoteServer, type ApiReply } from './server'
import {
  appendActivity,
  readActivity,
  readConfig,
  remoteDir,
  validPort,
  writeConfig,
  writeConfigSync,
  type RemoteConfig,
  type StoredDevice
} from './store'

/**
 * Control remoto por órdenes (§19.31): lo que une el servidor HTTPS, los
 * dispositivos emparejados, las defensas y la tabla de órdenes.
 *
 * Emite `changed` cada vez que cambia algo que enseña la app (estado,
 * dispositivos, invitación, actividad), para que la pantalla se actualice.
 */

/** Lo que dura un código de emparejamiento. */
export const INVITE_TTL_MS = 10 * 60_000
/** Intentos fallidos que aguanta un código antes de anularse. */
export const INVITE_ATTEMPTS = 5
/** Cada cuánto se guarda en disco cuándo se vio por última vez a cada dispositivo. */
const SEEN_FLUSH_MS = 60_000

interface PendingInvite {
  code: string
  expiresAt: number
  permissions: RemotePermissions
  failures: number
}

const HTTP_STATUS: Record<RemoteError, number> = {
  'bad-request': 400,
  'unknown-client': 401,
  'bad-signature': 401,
  expired: 401,
  replayed: 401,
  'bad-code': 401,
  forbidden: 403,
  'command-not-allowed': 403,
  'unknown-server': 404,
  'already-running': 409,
  'not-running': 409,
  busy: 409,
  'no-console': 409,
  'rate-limited': 429,
  blocked: 429,
  failed: 500
}

export interface RemoteAccessOptions {
  host: OrderHost
  /** Carpeta con la página remota compilada, o null si no la hay (desarrollo sin compilar). */
  staticRoot: string | null
  /** Solo para las pruebas (`127.0.0.1`). Ver `RemoteServerOptions.listenHost`. */
  listenHost?: string
  now?: () => number
}

export class RemoteAccess extends EventEmitter {
  private config: RemoteConfig | null = null
  private server: Server | null = null
  private cert: CertMaterial | null = null
  private state: RemoteState = 'off'
  private startError: RemoteStartError | null = null
  private startErrorDetail: string | null = null
  private invite: PendingInvite | null = null
  private readonly keys = new Map<string, KeyObject>()
  private readonly nonces = new NonceCache()
  private readonly limiter = new RateLimiter()
  private readonly guard = new AddressGuard()
  private seenDirty = false
  private seenTimer: NodeJS.Timeout | null = null
  /** Cambios de configuración en fila: nunca dos escrituras a la vez. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: RemoteAccessOptions) {
    super()
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** Lee la configuración y, si estaba encendido, se pone a escuchar. */
  async init(): Promise<void> {
    this.config = await readConfig()
    // Servidores borrados con la app cerrada (a mano, o con otra copia de
    // datos): se quitan ya, antes de que uno nuevo pueda reutilizar su id.
    const existing = new Set((await this.options.host.list()).map((state) => state.manifest.id))
    await this.dropServers((id) => !existing.has(id))
    if (this.config.enabled) await this.listen()
  }

  /**
   * Un servidor borrado sale de la lista de todos los dispositivos. Importa:
   * el id sale del nombre, y un servidor nuevo con el mismo nombre tendría el
   * mismo id y heredaría el permiso sin que nadie lo haya dado.
   */
  forgetServer(id: string): Promise<void> {
    return this.dropServers((server) => server === id)
  }

  private async dropServers(gone: (id: string) => boolean): Promise<void> {
    const config = await this.loaded()
    const touched = config.devices.some((device) => device.permissions.servers.some(gone))
    if (this.invite) {
      this.invite.permissions.servers = this.invite.permissions.servers.filter((id) => !gone(id))
    }
    if (!touched) return
    await this.change(async (current) => {
      for (const device of current.devices) {
        device.permissions.servers = device.permissions.servers.filter((id) => !gone(id))
      }
      await writeConfig(current)
    })
  }

  /** Está encendido: la app tiene que seguir viva al cerrar la ventana. */
  get enabled(): boolean {
    return this.config?.enabled ?? false
  }

  async status(): Promise<RemoteStatus> {
    const config = await this.loaded()
    this.dropExpiredInvite()
    return {
      enabled: config.enabled,
      port: config.port,
      state: this.state,
      error: this.startError,
      errorDetail: this.startErrorDetail,
      fingerprint: this.cert?.fingerprint ?? null,
      certExpires: this.cert?.expires ?? null,
      addresses: localAddresses().map((address) => address.address),
      devices: config.devices.map(({ publicKey: _key, ...device }) => device),
      invite: this.invite
        ? {
            code: this.invite.code,
            expiresAt: new Date(this.invite.expiresAt).toISOString(),
            permissions: this.invite.permissions
          }
        : null
    }
  }

  activity(limit = 50): Promise<RemoteActivityEntry[]> {
    return readActivity(limit)
  }

  setEnabled(enabled: boolean): Promise<RemoteStatus> {
    return this.change(async (config) => {
      config.enabled = enabled
      await writeConfig(config)
      if (enabled) await this.listen()
      else await this.close()
    })
  }

  setPort(port: number): Promise<RemoteStatus> {
    return this.change(async (config) => {
      if (!validPort(port)) throw new Error('El puerto tiene que estar entre 1024 y 65535.')
      if (port === config.port) return
      config.port = port
      await writeConfig(config)
      if (config.enabled) {
        await this.close()
        await this.listen()
      }
    })
  }

  /** Código nuevo con los permisos que tendrá el dispositivo. Anula el anterior. */
  async createInvite(permissions: RemotePermissions): Promise<RemoteInvite> {
    const clean = cleanPermissions(permissions)
    this.invite = {
      code: randomCode(),
      expiresAt: this.now() + INVITE_TTL_MS,
      permissions: clean,
      failures: 0
    }
    this.emit('changed')
    return {
      code: this.invite.code,
      expiresAt: new Date(this.invite.expiresAt).toISOString(),
      permissions: clean
    }
  }

  cancelInvite(): void {
    this.invite = null
    this.emit('changed')
  }

  updateDevice(id: string, permissions: RemotePermissions): Promise<RemoteStatus> {
    return this.change(async (config) => {
      const device = config.devices.find((d) => d.id === id)
      if (!device) throw new Error('Ese dispositivo ya no está emparejado.')
      device.permissions = cleanPermissions(permissions)
      await writeConfig(config)
    })
  }

  revokeDevice(id: string): Promise<RemoteStatus> {
    return this.change(async (config) => {
      config.devices = config.devices.filter((d) => d.id !== id)
      this.keys.delete(id)
      await writeConfig(config)
    })
  }

  /** Al salir de la app: deja de escuchar y guarda lo pendiente. */
  async shutdown(): Promise<void> {
    await this.close()
    await this.flushSeen()
  }

  /**
   * El cierre de la app, sin esperar a nada: deja de aceptar conexiones,
   * corta las abiertas y guarda cuándo se vio a cada dispositivo. Es lo que
   * usa `will-quit`, donde el proceso termina al volver del manejador; cancelar
   * la salida para esperar a algo asíncrono obligaba a forzarla después, y eso
   * dejaba procesos de Chromium huérfanos.
   */
  shutdownNow(): void {
    if (this.seenTimer) clearInterval(this.seenTimer)
    this.seenTimer = null
    const server = this.server
    this.server = null
    if (server) {
      server.close()
      server.closeAllConnections()
    }
    if (this.seenDirty && this.config) {
      this.seenDirty = false
      try {
        writeConfigSync(this.config)
      } catch {
        // Lo único que se pierde es la hora de la última visita.
      }
    }
  }

  // --- Peticiones -----------------------------------------------------------

  async handlePair(body: unknown, address: string): Promise<ApiReply> {
    if (this.guard.isBlocked(address, this.now())) return this.reply('blocked')
    const request = parsePair(body)
    if (!request) return this.fail(address, 'bad-request', null, 'pair')

    this.dropExpiredInvite()
    const invite = this.invite
    if (!invite || !sameCode(invite.code, request.code)) {
      if (invite) {
        invite.failures++
        // Un código que alguien está intentando adivinar deja de valer.
        if (invite.failures >= INVITE_ATTEMPTS) this.invite = null
        this.emit('changed')
      }
      return this.fail(address, 'bad-code', null, 'pair')
    }

    const key = importPublicKey(request.publicKey, request.algorithm)
    if (!key || !verifySignature(key, request.algorithm, pairMessage(request.code, request.publicKey), request.sig)) {
      return this.fail(address, 'bad-signature', null, 'pair')
    }

    // Se gasta el código antes de escribir nada: dos peticiones a la vez con
    // el mismo código no pueden emparejar dos dispositivos.
    this.invite = null
    const device: StoredDevice = {
      id: randomId(),
      name: request.name,
      algorithm: request.algorithm,
      publicKey: request.publicKey,
      createdAt: new Date(this.now()).toISOString(),
      lastSeen: new Date(this.now()).toISOString(),
      lastAddress: address,
      permissions: invite.permissions
    }
    await this.change(async (current) => {
      current.devices.push(device)
      await writeConfig(current)
    })
    this.keys.set(device.id, key)
    await this.log({ device: device.name, address, order: 'pair', server: null, result: 'ok' })

    const result: RemotePairResult = {
      client: device.id,
      host: this.options.host.hostName(),
      permissions: device.permissions
    }
    return this.reply(null, result)
  }

  async handleOrder(body: unknown, address: string): Promise<ApiReply> {
    const now = this.now()
    if (this.guard.isBlocked(address, now)) return this.reply('blocked')
    const config = await this.loaded()

    const order = parseOrder(body)
    if (!order) return this.fail(address, 'bad-request', null, null)

    const device = config.devices.find((d) => d.id === order.client)
    if (!device) return this.fail(address, 'unknown-client', null, order)

    const key = this.keyFor(device)
    if (!key || !verifySignature(key, device.algorithm, orderMessage(order), order.sig)) {
      return this.fail(address, 'bad-signature', device, order)
    }

    // A partir de aquí la firma es buena: quien manda es el dispositivo.
    // Un reloj desfasado no cuenta como fallo (no es un ataque, y la página
    // se corrige con la hora que va en la respuesta).
    if (Math.abs(now - order.ts) > CLOCK_WINDOW_MS) return this.reply('expired')
    if (!this.nonces.use(`${device.id}:${order.nonce}`, now)) {
      return this.fail(address, 'replayed', device, order)
    }

    const limits: { key: string; max: number; windowMs: number }[] = [
      { key: `any:${device.id}`, ...LIMITS.any }
    ]
    if (CONTROL_ORDERS.includes(order.order)) limits.push({ key: `control:${device.id}`, ...LIMITS.control })
    if (order.order === 'send') limits.push({ key: `send:${device.id}`, ...LIMITS.send })
    for (const limit of limits) {
      if (!this.limiter.allow(limit.key, limit.max, limit.windowMs, now)) {
        await this.logOrder(device, address, order, 'rate-limited')
        return this.reply('rate-limited')
      }
    }

    this.markSeen(device, address)

    // Olvidarse a sí mismo no es cosa del servicio sino de esta lista. Solo
    // puede borrar al dispositivo que firma: no lleva argumentos.
    if (order.order === 'forget') {
      if (Object.keys(order.args).length > 0) {
        await this.logOrder(device, address, order, 'bad-request')
        return this.reply('bad-request')
      }
      await this.revokeDevice(device.id)
      await this.logOrder(device, address, order, 'ok')
      return this.reply(null, null)
    }

    try {
      const data = await runOrder(this.options.host, device, order.order, order.args)
      await this.logOrder(device, address, order, 'ok')
      return this.reply(null, data)
    } catch (err) {
      const refused = err instanceof OrderRefused ? err : new OrderRefused('failed', String(err))
      await this.logOrder(device, address, order, refused.code)
      return this.reply(refused.code, undefined, refused.code === 'failed' ? cleanDetail(refused.message) : undefined)
    }
  }

  // --- Por dentro -----------------------------------------------------------

  private async loaded(): Promise<RemoteConfig> {
    if (!this.config) this.config = await readConfig()
    return this.config
  }

  /** Un cambio de configuración, en fila con los demás, y el estado nuevo. */
  private change(work: (config: RemoteConfig) => Promise<void>): Promise<RemoteStatus> {
    const run = this.queue.then(async () => {
      await work(await this.loaded())
      this.emit('changed')
      return this.status()
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  private async listen(): Promise<void> {
    if (this.server) return
    const config = await this.loaded()
    this.setState('starting', null, null)

    try {
      const cert = await ensureCertificate(remoteDir(), config.certPassword, this.now())
      if (cert.passphrase !== config.certPassword) {
        config.certPassword = cert.passphrase
        await writeConfig(config)
      }
      this.cert = cert
    } catch (err) {
      this.setState('error', 'cert-failed', err instanceof Error ? err.message : String(err))
      return
    }

    try {
      this.server = await startRemoteServer({
        pfx: this.cert.pfx,
        passphrase: this.cert.passphrase,
        port: config.port,
        listenHost: this.options.listenHost,
        staticRoot: this.options.staticRoot,
        onPair: (body, address) => this.handlePair(body, address),
        onOrder: (body, address) => this.handleOrder(body, address)
      })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      this.setState(
        'error',
        code === 'EADDRINUSE' || code === 'EACCES' ? 'port-in-use' : 'failed',
        err instanceof Error ? err.message : String(err)
      )
      return
    }

    this.seenTimer = setInterval(() => void this.flushSeen(), SEEN_FLUSH_MS)
    this.seenTimer.unref?.()
    this.setState('listening', null, null)
  }

  private async close(): Promise<void> {
    if (this.seenTimer) clearInterval(this.seenTimer)
    this.seenTimer = null
    this.invite = null
    const server = this.server
    this.server = null
    if (server) await stopRemoteServer(server)
    this.setState('off', null, null)
  }

  private setState(state: RemoteState, error: RemoteStartError | null, detail: string | null): void {
    this.state = state
    this.startError = error
    this.startErrorDetail = detail
    this.emit('changed')
  }

  private dropExpiredInvite(): void {
    if (this.invite && this.invite.expiresAt <= this.now()) this.invite = null
  }

  private keyFor(device: StoredDevice): KeyObject | null {
    const cached = this.keys.get(device.id)
    if (cached) return cached
    const key = importPublicKey(device.publicKey, device.algorithm)
    if (key) this.keys.set(device.id, key)
    return key
  }

  private markSeen(device: StoredDevice, address: string): void {
    device.lastSeen = new Date(this.now()).toISOString()
    device.lastAddress = address
    this.seenDirty = true
  }

  private async flushSeen(): Promise<void> {
    if (!this.seenDirty || !this.config) return
    this.seenDirty = false
    await this.change(async (config) => writeConfig(config)).catch(() => undefined)
  }

  /** Un fallo de autenticación: cuenta para bloquear la dirección y se apunta. */
  private async fail(
    address: string,
    code: RemoteError,
    device: StoredDevice | null,
    order: SignedOrder | 'pair' | null
  ): Promise<ApiReply> {
    this.guard.fail(address, this.now())
    if (order) {
      await this.log({
        device: device?.name ?? null,
        address,
        order: order === 'pair' ? 'pair' : order.order,
        server: order === 'pair' ? null : (order.args.server ?? null),
        result: code
      })
    }
    return this.reply(code)
  }

  /**
   * Las órdenes que cambian algo, siempre. Las consultas (`list`, `console`, `journal`),
   * solo si se rechazan: la página las repite cada pocos segundos.
   */
  private async logOrder(
    device: StoredDevice,
    address: string,
    order: SignedOrder,
    result: 'ok' | RemoteError
  ): Promise<void> {
    const query = order.order === 'list' || order.order === 'console' || order.order === 'journal'
    if (query && result === 'ok') return
    await this.log({
      device: device.name,
      address,
      order: order.order,
      server: order.args.server ?? null,
      ...(order.order === 'send' && order.args.command ? { command: order.args.command } : {}),
      result
    })
  }

  private async log(entry: Omit<RemoteActivityEntry, 'ts'>): Promise<void> {
    await appendActivity({ ts: new Date(this.now()).toISOString(), ...entry })
    this.emit('changed')
  }

  private reply(error: RemoteError | null, data?: unknown, detail?: string): ApiReply {
    const time = this.now()
    if (error) {
      const body: RemoteResponse<never> = { ok: false, error, time, ...(detail ? { detail } : {}) }
      return { status: HTTP_STATUS[error], body }
    }
    const body: RemoteResponse<unknown> = { ok: true, data: data ?? null, time }
    return { status: 200, body }
  }
}

/**
 * El error de una orden que ha fallado, tal como sale hacia el dispositivo: sin
 * la carpeta del usuario de Windows (lleva su nombre) ni IPs, igual que la
 * consola (§19.36).
 */
export function cleanDetail(message: string): string {
  const home = homedir()
  const sinCasa = home
    ? message.replace(new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '%USERPROFILE%')
    : message
  return maskAddresses(sinCasa).slice(0, 500)
}

function cleanPermissions(permissions: RemotePermissions): RemotePermissions {
  return {
    control: permissions?.control === true,
    console: isConsoleLevel(permissions?.console) ? permissions.console : 1,
    servers: cleanServerList(permissions?.servers)
  }
}

function sameCode(expected: string, given: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(normalizeCode(given))
  return a.length === b.length && timingSafeEqual(a, b)
}

const NONCE = /^[A-Za-z0-9_-]{16,64}$/
const ID = /^[A-Za-z0-9_-]{8,64}$/
const BASE64 = /^[A-Za-z0-9+/=]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePair(body: unknown): { code: string; name: string; publicKey: string; algorithm: 'Ed25519' | 'ECDSA-P256'; sig: string } | null {
  if (!isRecord(body)) return null
  const { code, name, publicKey, algorithm, sig } = body
  if (typeof code !== 'string' || normalizeCode(code).length !== CODE_LENGTH) return null
  if (typeof name !== 'string') return null
  const cleanName = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60)
  if (cleanName.length === 0) return null
  if (typeof publicKey !== 'string' || publicKey.length > 400 || !BASE64.test(publicKey)) return null
  if (!isKeyAlgorithm(algorithm)) return null
  if (typeof sig !== 'string' || sig.length > 200 || !BASE64.test(sig)) return null
  return { code: normalizeCode(code), name: cleanName, publicKey, algorithm, sig }
}

/**
 * Comprueba la forma de una orden ANTES de mirar la firma. Lo que no encaja
 * exactamente se rechaza: ni campos de más en `args` ni tipos aproximados.
 */
function parseOrder(body: unknown): SignedOrder | null {
  if (!isRecord(body)) return null
  const { client, ts, nonce, order, args, sig } = body
  if (typeof client !== 'string' || !ID.test(client)) return null
  if (typeof ts !== 'number' || !Number.isSafeInteger(ts)) return null
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) return null
  if (!isRemoteOrder(order)) return null
  if (typeof sig !== 'string' || sig.length > 200 || !BASE64.test(sig)) return null
  if (!isRecord(args)) return null

  const clean: RemoteArgs = {}
  for (const [name, value] of Object.entries(args)) {
    if (name === 'server' && typeof value === 'string') clean.server = value
    else if (name === 'after' && typeof value === 'number' && Number.isSafeInteger(value)) clean.after = value
    else if (name === 'command' && typeof value === 'string') clean.command = value
    else return null
  }
  return { client, ts, nonce, order: order as RemoteOrder, args: clean, sig }
}
