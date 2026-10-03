import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { createPrivateKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { hostname } from 'node:os'
import {
  CODE_LENGTH,
  CONTROL_ORDERS,
  formatRemoteAddress,
  isRemoteError,
  normalizeCode,
  orderMessage,
  pairMessage,
  parseRemoteAddress,
  sameFingerprint,
  type RemoteAddress,
  type RemoteArgs,
  type RemoteClientError,
  type RemoteClientResult,
  type RemoteLink,
  type RemoteLinkRequest,
  type RemoteLinkState,
  type RemoteLinksState,
  type RemoteListResult,
  type RemoteOrder,
  type RemotePairResult,
  type RemoteProbe,
  type RemoteUnlinkResult
} from '@shared/remote'
import { ensureDir } from '../paths'
import { ClientFailure, openPinned, postPinned } from './client'
import { randomId } from './crypto'
import { cleanConsole, cleanJournal, cleanList } from './sanitize'
import { remoteDir } from './store'

/**
 * QubiQ como cliente de otro QubiQ (0.13.0, ANALISIS.md §19.31).
 *
 * Este equipo se empareja con otro como un dispositivo más, igual que la
 * página remota del móvil, y con exactamente sus mismos poderes: la lista
 * cerrada de órdenes. Nada de aquí da más acceso que la página.
 *
 * - **La clave privada** (Ed25519, de `node:crypto`) se guarda cifrada con
 *   `SecretBox`, que en la app es `safeStorage` (DPAPI de Windows): solo este
 *   usuario de Windows en este equipo puede descifrarla. Copiar la carpeta de
 *   datos a otro PC deja la conexión en `key-lost`, no la clave a la vista.
 * - **La huella** del certificado del anfitrión se fija al emparejar, después
 *   de que el usuario la compare con la que enseña el otro equipo. Si cambia,
 *   no se le manda nada (`cert-changed`) hasta que se confirme la nueva.
 * - **La lista** de cada anfitrión se pide cada pocos segundos mientras la
 *   ventana está a la vista. La consola y el historial los pide la pantalla
 *   del servidor abierto, por `order`.
 *
 * Emite `changed` con el estado entero cuando cambia algo que se ve.
 */

/** Cada cuánto se pide la lista de cada anfitrión con la ventana a la vista. */
export const LINK_POLL_MS = 5_000

/** Lo que cifra la clave privada. En la app, `safeStorage`; en las pruebas, uno falso. */
export interface SecretBox {
  available(): boolean
  /** Texto → base64 cifrado. */
  encrypt(plain: string): string
  /** Lanza si no se puede descifrar (otro usuario u otro equipo). */
  decrypt(sealed: string): string
}

interface StoredLink {
  id: string
  host: string
  port: number
  fingerprint: string
  /** Nombre del equipo anfitrión. */
  hostName: string
  /** Nombre de este dispositivo allí. */
  device: string
  pairedAt: string
  /** El id que nos dio el anfitrión al emparejar. */
  client: string
  /** Clave pública SPKI en base64 (para reconocer la conexión, no hace falta para firmar). */
  publicKey: string
  /** PKCS#8 en base64, cifrado con `SecretBox`. */
  sealedKey: string
}

interface LinkRuntime {
  state: RemoteLinkState
  error: RemoteClientError | null
  errorDetail: string | null
  lastContact: string | null
  list: RemoteListResult | null
  newFingerprint: string | null
  /** Hora del anfitrión menos la nuestra: las firmas solo valen con menos de un minuto de diferencia. */
  clockOffset: number
  /** La petición de lista en marcha, si hay una: no se apilan. */
  polling: Promise<void> | null
}

export interface RemoteLinksOptions {
  secrets: SecretBox
  /** Carpeta de `links.json`. Por defecto, `remote/` en la carpeta de datos (se mueve con ella). */
  dir?: () => string
  now?: () => number
  pollMs?: number
}

/** Órdenes que la interfaz puede pedir. `forget` va por `remove`, y solo por ahí. */
const UI_ORDERS: readonly RemoteOrder[] = ['list', 'start', 'stop', 'restart', 'console', 'send', 'journal']

/** Estados en los que no se le habla al anfitrión hasta que el usuario haga algo. */
const STOPPED_STATES: readonly RemoteLinkState[] = ['revoked', 'cert-changed', 'key-lost']

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/
const HEX_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

export class RemoteLinks extends EventEmitter {
  private links: StoredLink[] = []
  private readonly runtime = new Map<string, LinkRuntime>()
  private readonly keys = new Map<string, KeyObject>()
  private timer: NodeJS.Timeout | null = null
  private active = true
  private lastEmitted = ''
  /** Escrituras de `links.json` en fila. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: RemoteLinksOptions) {
    super()
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private file(): string {
    return join(this.options.dir?.() ?? remoteDir(), 'links.json')
  }

  async init(): Promise<void> {
    this.links = await this.read()
    for (const link of this.links) this.runtimeOf(link.id)
    this.schedule()
    void this.refreshAll()
  }

  /** La ventana se ve o no. Escondida (en la bandeja) no se pregunta a nadie. */
  setActive(active: boolean): void {
    if (active === this.active) return
    this.active = active
    this.schedule()
    if (active) void this.refreshAll()
  }

  shutdown(): void {
    this.active = false
    this.schedule()
  }

  state(): RemoteLinksState {
    return {
      links: this.links.map((link) => this.view(link)),
      defaultName: hostname(),
      secureStorage: this.options.secrets.available()
    }
  }

  // --- Emparejar ------------------------------------------------------------

  /** Primer contacto: la huella que enseña, para que el usuario la compare. */
  async probe(addressText: string): Promise<RemoteClientResult<RemoteProbe>> {
    const address = parseRemoteAddress(addressText)
    if (!address) return { ok: false, error: 'bad-address' }
    try {
      // Antes de enseñar nada, que de verdad sea un QubiQ: una orden vacía da
      // `bad-request` con su hora. Sin firma ni datos de este equipo.
      const { reply, cert } = await postPinned(address, null, '/api/order', {})
      if (reply.ok || reply.error !== 'bad-request') {
        if (!reply.ok && reply.error === 'blocked') return { ok: false, error: 'blocked' }
        return { ok: false, error: 'not-qubiq' }
      }
      return {
        ok: true,
        data: { address: formatRemoteAddress(address), fingerprint: cert.fingerprint, expires: cert.expires }
      }
    } catch (err) {
      return failure(err)
    }
  }

  async pair(request: RemoteLinkRequest): Promise<RemoteClientResult<RemoteLink>> {
    const address = parseRemoteAddress(String(request?.address ?? ''))
    if (!address) return { ok: false, error: 'bad-address' }
    if (!this.options.secrets.available()) return { ok: false, error: 'no-secure-storage' }
    const code = normalizeCode(String(request.code ?? ''))
    if (code.length !== CODE_LENGTH) return { ok: false, error: 'bad-code' }
    const name = String(request.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60)
    if (name.length === 0) return { ok: false, error: 'bad-request' }
    const fingerprint = String(request.fingerprint ?? '').toUpperCase()
    if (!HEX_FINGERPRINT.test(fingerprint)) return { ok: false, error: 'bad-request' }

    const pair = generateKeyPairSync('ed25519')
    const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    const body = {
      code,
      name,
      publicKey,
      algorithm: 'Ed25519',
      sig: sign(null, Buffer.from(pairMessage(code, publicKey), 'utf8'), pair.privateKey).toString('base64')
    }

    let result: RemotePairResult
    try {
      const { reply } = await postPinned<RemotePairResult>(address, fingerprint, '/api/pair', body)
      if (!reply.ok) return { ok: false, error: isRemoteError(reply.error) ? reply.error : 'failed' }
      result = reply.data
    } catch (err) {
      return failure(err)
    }
    if (typeof result?.client !== 'string' || !CLIENT_ID.test(result.client)) return { ok: false, error: 'not-qubiq' }

    const sealedKey = this.options.secrets.encrypt(
      pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
    )
    // Volver a emparejar con un equipo que ya estaba (otro código tras quitarlo
    // allí, o tras perder la clave) sustituye la conexión vieja y conserva su
    // id: la lista lateral no salta.
    const previous = this.links.find((link) => link.fingerprint === fingerprint)
    const stored: StoredLink = {
      id: previous?.id ?? randomId(12),
      host: address.host,
      port: address.port,
      fingerprint,
      hostName: typeof result.host === 'string' ? result.host.slice(0, 100) : address.host,
      device: name,
      pairedAt: new Date(this.now()).toISOString(),
      client: result.client,
      publicKey,
      sealedKey
    }
    if (previous) {
      // La vieja, si el anfitrión aún la tiene, sobra allí: se le pide que la olvide.
      await this.forgetOnHost(previous).catch(() => false)
      this.links = this.links.map((link) => (link.id === previous.id ? stored : link))
    } else {
      this.links.push(stored)
    }
    this.keys.set(stored.id, pair.privateKey)
    this.runtime.set(stored.id, freshRuntime())
    await this.save()
    await this.poll(stored)
    this.schedule()
    return { ok: true, data: this.view(stored) }
  }

  /**
   * La huella ha cambiado (certificado renovado o regenerado en el anfitrión)
   * y el usuario ha comparado la nueva: se fija si es la que enseña ahora.
   */
  async trust(id: string, fingerprint: string): Promise<RemoteClientResult<RemoteLink>> {
    const link = this.find(id)
    if (!link) return { ok: false, error: 'unknown-link' }
    let current: string
    try {
      const { socket, cert } = await openPinned(addressOf(link), null)
      socket.destroy()
      current = cert.fingerprint
    } catch (err) {
      return failure(err)
    }
    if (!sameFingerprint(current, String(fingerprint))) {
      const runtime = this.runtimeOf(id)
      runtime.newFingerprint = current
      this.emitChanged()
      return { ok: false, error: 'cert-changed', detail: current }
    }
    link.fingerprint = current
    this.runtime.set(id, freshRuntime())
    await this.save()
    await this.poll(link)
    this.schedule()
    return { ok: true, data: this.view(link) }
  }

  /**
   * Quita la conexión. Antes le pide al anfitrión que olvide este dispositivo
   * (`forget`); si no se puede (sin conexión, huella cambiada), se quita aquí
   * igual y `notified: false` dice que allí sigue apuntado.
   */
  async remove(id: string): Promise<RemoteClientResult<RemoteUnlinkResult>> {
    const link = this.find(id)
    if (!link) return { ok: false, error: 'unknown-link' }
    const notified = await this.forgetOnHost(link).catch(() => false)
    this.links = this.links.filter((l) => l.id !== id)
    this.runtime.delete(id)
    this.keys.delete(id)
    await this.save()
    this.schedule()
    this.emitChanged()
    return { ok: true, data: { notified } }
  }

  // --- Órdenes --------------------------------------------------------------

  /**
   * Una orden de la lista cerrada a un anfitrión. Lo que vuelve ya está
   * comprobado (`sanitize.ts`). Las de controlar piden la lista justo después,
   * para que el cambio de estado se vea sin esperar a la siguiente vuelta.
   */
  async order(id: string, order: RemoteOrder, args: RemoteArgs = {}): Promise<RemoteClientResult<unknown>> {
    if (!UI_ORDERS.includes(order)) return { ok: false, error: 'bad-request' }
    const link = this.find(id)
    if (!link) return { ok: false, error: 'unknown-link' }
    const clean: RemoteArgs = {}
    if (typeof args?.server === 'string') clean.server = args.server
    if (typeof args?.after === 'number' && Number.isSafeInteger(args.after)) clean.after = args.after
    if (typeof args?.command === 'string') clean.command = args.command

    try {
      const data = await this.send(link, order, clean)
      let result: unknown = data
      if (order === 'list') result = cleanList(data)
      else if (order === 'console') result = cleanConsole(data)
      else if (order === 'journal') result = cleanJournal(data)
      else result = null
      if ((order === 'list' || order === 'console' || order === 'journal') && result === null) {
        return { ok: false, error: 'not-qubiq' }
      }
      if (CONTROL_ORDERS.includes(order)) void this.poll(link)
      return { ok: true, data: result }
    } catch (err) {
      return failure(err)
    }
  }

  /** Pide la lista ya (al abrir un anfitrión o pulsar «reintentar»). */
  async refresh(id: string): Promise<void> {
    const link = this.find(id)
    if (!link) return
    const runtime = this.runtimeOf(id)
    // Reintentar a mano saca de «sin conexión», no de lo que exige al usuario.
    if (runtime.state === 'offline') runtime.state = 'connecting'
    this.emitChanged()
    await this.poll(link)
  }

  // --- Por dentro -----------------------------------------------------------

  /**
   * Firma y manda. Con «hora desfasada», la respuesta ya trae la del
   * anfitrión: se corrige y se reintenta una vez, como la página.
   * Actualiza el estado de la conexión con lo que pase.
   */
  private async send(link: StoredLink, order: RemoteOrder, args: RemoteArgs, retry = true): Promise<unknown> {
    const runtime = this.runtimeOf(link.id)
    if (runtime.state === 'cert-changed') throw new ClientFailure('cert-changed', runtime.newFingerprint ?? undefined)
    if (runtime.state === 'key-lost') throw new ClientFailure('key-lost')
    const key = this.keyOf(link)
    if (!key) {
      this.setState(link.id, 'key-lost', 'key-lost', null)
      throw new ClientFailure('key-lost')
    }

    const unsigned = {
      client: link.client,
      ts: Math.round(this.now() + runtime.clockOffset),
      nonce: randomId(16),
      order,
      args
    }
    const sig = sign(null, Buffer.from(orderMessage(unsigned), 'utf8'), key).toString('base64')

    let reply
    try {
      reply = (await postPinned<unknown>(addressOf(link), link.fingerprint, '/api/order', { ...unsigned, sig })).reply
    } catch (err) {
      if (err instanceof ClientFailure && err.code === 'cert-changed') {
        runtime.newFingerprint = err.detail ?? null
        this.setState(link.id, 'cert-changed', 'cert-changed', null)
      } else if (err instanceof ClientFailure && err.code === 'offline') {
        this.setState(link.id, 'offline', 'offline', err.detail ?? null)
      }
      throw err
    }

    runtime.clockOffset = reply.time - this.now()
    runtime.lastContact = new Date(this.now()).toISOString()
    // Ha contestado: está en línea, diga lo que diga de la orden.
    const reached = (): void => {
      if (runtime.state === 'online') return
      const offline = runtime.error === 'offline'
      this.setState(link.id, 'online', offline ? null : runtime.error, offline ? null : runtime.errorDetail)
    }
    if (reply.ok) {
      reached()
      return reply.data
    }
    const error = isRemoteError(reply.error) ? reply.error : 'failed'
    if (error === 'expired' && retry) return this.send(link, order, args, false)
    if (error === 'unknown-client') this.setState(link.id, 'revoked', 'unknown-client', null)
    else reached()
    throw new ClientFailure(error, typeof reply.detail === 'string' ? reply.detail.slice(0, 500) : undefined)
  }

  /** `forget` con la clave de la conexión. True si el anfitrión ya no la tiene. */
  private async forgetOnHost(link: StoredLink): Promise<boolean> {
    const state = this.runtimeOf(link.id).state
    if (state === 'revoked') return true
    // Con la huella cambiada no se le habla; sin clave no se puede firmar.
    if (state === 'cert-changed' || state === 'key-lost') return false
    try {
      await this.send(link, 'forget', {})
      return true
    } catch (err) {
      return err instanceof ClientFailure && err.code === 'unknown-client'
    }
  }

  /**
   * Pide la lista de un anfitrión y la deja en su estado. Si ya hay una
   * petición en marcha, espera a esa en vez de mandar otra: quien llama
   * (reintentar, recién emparejado) quiere la respuesta, no solo pedirla.
   */
  private poll(link: StoredLink): Promise<void> {
    const runtime = this.runtimeOf(link.id)
    if (runtime.polling) return runtime.polling
    if (STOPPED_STATES.includes(runtime.state)) return Promise.resolve()
    runtime.polling = this.fetchList(link, runtime).finally(() => {
      runtime.polling = null
    })
    return runtime.polling
  }

  private async fetchList(link: StoredLink, runtime: LinkRuntime): Promise<void> {
    try {
      const list = cleanList(await this.send(link, 'list', {}))
      if (!list) throw new ClientFailure('not-qubiq')
      runtime.list = list
      runtime.error = null
      runtime.errorDetail = null
      // El anfitrión puede haber cambiado de nombre, o el dueño haber
      // renombrado el dispositivo. Se guarda para verlo igual sin conexión.
      if ((list.host && list.host !== link.hostName) || (list.device && list.device !== link.device)) {
        link.hostName = list.host || link.hostName
        link.device = list.device || link.device
        void this.save()
      }
    } catch (err) {
      const failed = err instanceof ClientFailure ? err : new ClientFailure('failed', String(err))
      if (failed.code !== 'offline' && !STOPPED_STATES.includes(runtime.state)) {
        runtime.error = failed.code
        runtime.errorDetail = failed.detail ?? null
      }
    }
    this.emitChanged()
  }

  private async refreshAll(): Promise<void> {
    await Promise.all(this.links.map((link) => this.poll(link)))
  }

  /** Un temporizador para todos, solo con la ventana a la vista y alguna conexión. */
  private schedule(): void {
    const wanted = this.active && this.links.length > 0
    if (wanted && !this.timer) {
      this.timer = setInterval(() => void this.refreshAll(), this.options.pollMs ?? LINK_POLL_MS)
      this.timer.unref?.()
    } else if (!wanted && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private setState(id: string, state: RemoteLinkState, error: RemoteClientError | null, detail: string | null): void {
    const runtime = this.runtimeOf(id)
    runtime.state = state
    runtime.error = error
    runtime.errorDetail = detail
    this.emitChanged()
  }

  /** Solo si algo de lo que se ve ha cambiado: la lista se pide cada 5 s. */
  private emitChanged(): void {
    const state = this.state()
    const serialized = JSON.stringify(state)
    if (serialized === this.lastEmitted) return
    this.lastEmitted = serialized
    this.emit('changed', state)
  }

  private find(id: string): StoredLink | undefined {
    return this.links.find((link) => link.id === id)
  }

  private runtimeOf(id: string): LinkRuntime {
    let runtime = this.runtime.get(id)
    if (!runtime) {
      runtime = freshRuntime()
      this.runtime.set(id, runtime)
    }
    return runtime
  }

  private keyOf(link: StoredLink): KeyObject | null {
    const cached = this.keys.get(link.id)
    if (cached) return cached
    try {
      const der = Buffer.from(this.options.secrets.decrypt(link.sealedKey), 'base64')
      const key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
      if (key.asymmetricKeyType !== 'ed25519') return null
      this.keys.set(link.id, key)
      return key
    } catch {
      return null
    }
  }

  private view(link: StoredLink): RemoteLink {
    const runtime = this.runtimeOf(link.id)
    return {
      id: link.id,
      address: formatRemoteAddress(addressOf(link)),
      host: link.hostName,
      device: link.device,
      fingerprint: link.fingerprint,
      pairedAt: link.pairedAt,
      state: runtime.state,
      error: runtime.error,
      errorDetail: runtime.errorDetail,
      lastContact: runtime.lastContact,
      list: runtime.list,
      newFingerprint: runtime.newFingerprint
    }
  }

  private async read(): Promise<StoredLink[]> {
    let raw: string
    try {
      raw = await readFile(this.file(), 'utf8')
    } catch {
      return []
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return []
    }
    const links = (parsed as { links?: unknown })?.links
    return Array.isArray(links) ? links.filter(validLink) : []
  }

  /** Escritura atómica y en fila, como la configuración del anfitrión. */
  private save(): Promise<void> {
    const run = this.queue.then(async () => {
      const file = this.file()
      await ensureDir(join(file, '..'))
      await writeFile(`${file}.tmp`, JSON.stringify({ links: this.links }, null, 2), 'utf8')
      await rename(`${file}.tmp`, file)
    })
    this.queue = run.catch(() => undefined)
    return run
  }
}

function freshRuntime(): LinkRuntime {
  return {
    state: 'connecting',
    error: null,
    errorDetail: null,
    lastContact: null,
    list: null,
    newFingerprint: null,
    clockOffset: 0,
    polling: null
  }
}

function addressOf(link: StoredLink): RemoteAddress {
  return { host: link.host, port: link.port }
}

function failure<T>(err: unknown): RemoteClientResult<T> {
  if (err instanceof ClientFailure) {
    return { ok: false, error: err.code, ...(err.detail ? { detail: err.detail } : {}) }
  }
  return { ok: false, error: 'failed', detail: err instanceof Error ? err.message : String(err) }
}

/** Una conexión editada a mano o a medias se descarta: mejor volver a emparejar. */
function validLink(value: unknown): value is StoredLink {
  const link = value as Partial<StoredLink> | null
  return (
    !!link &&
    typeof link.id === 'string' &&
    typeof link.host === 'string' &&
    parseRemoteAddress(`${link.host.includes(':') ? `[${link.host}]` : link.host}:${link.port}`) !== null &&
    typeof link.fingerprint === 'string' &&
    HEX_FINGERPRINT.test(link.fingerprint) &&
    typeof link.hostName === 'string' &&
    typeof link.device === 'string' &&
    typeof link.pairedAt === 'string' &&
    typeof link.client === 'string' &&
    CLIENT_ID.test(link.client) &&
    typeof link.publicKey === 'string' &&
    typeof link.sealedKey === 'string'
  )
}
