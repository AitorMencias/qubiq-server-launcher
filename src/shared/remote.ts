import type { GameId, LogLevel, ServerStatus } from './types'
import type { JournalEntry } from './journal'

/**
 * Control remoto por órdenes (ANALISIS.md §19.31).
 *
 * Contrato entre el QubiQ que tiene los servidores (el anfitrión) y quien lo
 * maneja desde fuera (la página remota y, en la 0.13.0, otro QubiQ). Vive en
 * `shared` porque los dos lados tienen que montar EXACTAMENTE el mismo texto
 * para firmar y para comprobar la firma: una coma distinta y nada valida.
 *
 * ⚠ La lista de órdenes es cerrada a propósito. Ninguna acepta rutas, ficheros,
 * mods ni configuración: eso convertiría el acceso a la app en acceso al PC.
 */

export const REMOTE_PROTOCOL = 'qubiq-remote/1'

/** Puerto por defecto. Cualquiera libre vale; este no choca con ningún juego de la app. */
export const DEFAULT_REMOTE_PORT = 8443

export const REMOTE_ORDERS = ['list', 'start', 'stop', 'restart', 'console', 'send', 'journal'] as const
export type RemoteOrder = (typeof REMOTE_ORDERS)[number]

export function isRemoteOrder(value: unknown): value is RemoteOrder {
  return typeof value === 'string' && (REMOTE_ORDERS as readonly string[]).includes(value)
}

/** Órdenes que cambian algo. Pasan por el permiso de controlar y por su límite. */
export const CONTROL_ORDERS: readonly RemoteOrder[] = ['start', 'stop', 'restart']

/**
 * Nivel de consola de un dispositivo.
 * 1: solo lectura (por defecto). 2: comandos de la lista del juego. 3: libre.
 */
export type ConsoleLevel = 1 | 2 | 3

export function isConsoleLevel(value: unknown): value is ConsoleLevel {
  return value === 1 || value === 2 || value === 3
}

export interface RemotePermissions {
  /** Arrancar, parar y reiniciar. */
  control: boolean
  console: ConsoleLevel
  /**
   * Los servidores (ids) que este dispositivo ve y maneja. Ninguno por
   * defecto: hay que marcarlos uno a uno, y los servidores que se creen
   * después no se añaden solos. Para el dispositivo, uno que no está en la
   * lista no existe (`unknown-server`), igual que uno inventado.
   */
  servers: string[]
}

export const DEFAULT_PERMISSIONS: RemotePermissions = { control: true, console: 1, servers: [] }

/** Servidores que puede tener un dispositivo, como mucho. */
export const MAX_DEVICE_SERVERS = 100

/** Lista de servidores limpia: solo textos, sin repetir y con tope. */
export function cleanServerList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 100)
  return [...new Set(ids)].slice(0, MAX_DEVICE_SERVERS)
}

export type KeyAlgorithm = 'Ed25519' | 'ECDSA-P256'

export function isKeyAlgorithm(value: unknown): value is KeyAlgorithm {
  return value === 'Ed25519' || value === 'ECDSA-P256'
}

/** Lo que lleva una orden. Plano a propósito: nada de objetos anidados que firmar. */
export interface RemoteArgs {
  server?: string
  /** `console`: devolver las líneas posteriores a esta. */
  after?: number
  /** `send`: el texto para la consola. */
  command?: string
}

export interface SignedOrder {
  client: string
  /** Milisegundos, con el reloj del dispositivo corregido por el del anfitrión. */
  ts: number
  /** Número de uso único (base64url, 16 bytes). */
  nonce: string
  order: RemoteOrder
  args: RemoteArgs
  /** Firma en base64 del texto de `orderMessage`. */
  sig: string
}

export interface PairRequest {
  code: string
  /** Nombre que el usuario le da al dispositivo («Móvil de Aitor»). */
  name: string
  /** Clave pública SPKI en base64. */
  publicKey: string
  algorithm: KeyAlgorithm
  /** Firma de `pairMessage`: demuestra que el dispositivo tiene la clave privada. */
  sig: string
}

/**
 * Texto que se firma para una orden. Una línea por campo y los argumentos
 * siempre en el mismo orden: no depende de cómo serialice JSON cada lado.
 */
export function orderMessage(order: Omit<SignedOrder, 'sig'>): string {
  return [
    REMOTE_PROTOCOL,
    'order',
    order.client,
    String(order.ts),
    order.nonce,
    order.order,
    JSON.stringify([
      order.args.server ?? null,
      order.args.after ?? null,
      order.args.command ?? null
    ])
  ].join('\n')
}

export function pairMessage(code: string, publicKey: string): string {
  return [REMOTE_PROTOCOL, 'pair', normalizeCode(code), publicKey].join('\n')
}

/**
 * Alfabeto de los códigos de emparejamiento: sin 0/O, 1/I/L ni U, que se
 * confunden al copiarlos de una pantalla a un móvil.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 8

/** «abcd efgh», «ABCD-EFGH» y «abcdefgh» son el mismo código. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

/** «ABCDEFGH» → «ABCD-EFGH», para leerlo y dictarlo. */
export function formatCode(code: string): string {
  const clean = normalizeCode(code)
  return clean.length === CODE_LENGTH ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
}

// --- Respuestas -----------------------------------------------------------------

export type RemoteError =
  | 'bad-request'
  | 'unknown-client'
  | 'bad-signature'
  | 'expired'
  | 'replayed'
  | 'forbidden'
  | 'unknown-server'
  | 'rate-limited'
  | 'blocked'
  | 'not-running'
  | 'already-running'
  | 'busy'
  | 'no-console'
  | 'command-not-allowed'
  | 'bad-code'
  | 'failed'

export type RemoteResponse<T> =
  /** `time`: el reloj del anfitrión, para que el dispositivo corrija el suyo. */
  | { ok: true; data: T; time: number }
  | { ok: false; error: RemoteError; detail?: string; time: number }

export interface RemoteServerSummary {
  id: string
  name: string
  game: GameId
  status: ServerStatus
  /** Quién está conectado (vacío con el servidor parado). */
  players: string[]
  /** Cuántos hay, en los juegos que dan el número y no los nombres (Satisfactory). */
  playerCount: number | null
  /** El juego dice QUIÉN está (aunque sea con un identificador). */
  playerIds: boolean
  /** Y ese «quién» es un nombre reconocible (Valheim da identificadores de Steam). */
  playerNames: boolean
  /** El juego tiene consola con entrada de comandos. */
  commands: boolean
  /** El juego deja moderar (para los filtros del historial). */
  moderation: boolean
}

export interface RemoteListResult {
  /** Nombre del equipo anfitrión. */
  host: string
  /** Nombre de este dispositivo, tal como lo ve el anfitrión. */
  device: string
  permissions: RemotePermissions
  /** Comandos del nivel 2, por juego. */
  allowedCommands: Partial<Record<GameId, string[]>>
  servers: RemoteServerSummary[]
}

export interface RemoteConsoleLine {
  seq: number
  ts: number
  level: LogLevel
  text: string
}

export interface RemoteConsoleResult {
  lines: RemoteConsoleLine[]
  /** Lo que hay que mandar en `after` la próxima vez. */
  next: number
}

/**
 * `journal`: el historial del servidor (ANALISIS.md §19.32), lo más reciente
 * primero. Es solo lectura, como la consola del nivel 1, y sale con las IP
 * enmascaradas en lo que es texto libre (órdenes y motivos).
 */
export interface RemoteJournalResult {
  entries: JournalEntry[]
}

/** Entradas del historial por petición. */
export const REMOTE_JOURNAL_PAGE = 200

export interface RemotePairResult {
  client: string
  host: string
  permissions: RemotePermissions
}

// --- Lado de la app (Configuración → Acceso remoto) --------------------------------

export interface RemoteDevice {
  id: string
  name: string
  algorithm: KeyAlgorithm
  createdAt: string
  lastSeen: string | null
  lastAddress: string | null
  permissions: RemotePermissions
}

export interface RemoteInvite {
  /** Sin guiones; la interfaz lo enseña con `formatCode`. */
  code: string
  expiresAt: string
  permissions: RemotePermissions
}

export type RemoteState = 'off' | 'starting' | 'listening' | 'error'

export type RemoteStartError = 'port-in-use' | 'cert-failed' | 'failed'

export interface RemoteStatus {
  enabled: boolean
  port: number
  state: RemoteState
  error: RemoteStartError | null
  /** Mensaje técnico del fallo, para quien sepa leerlo. */
  errorDetail: string | null
  /** Huella SHA-256 del certificado, en pares hexadecimales separados por «:». */
  fingerprint: string | null
  certExpires: string | null
  /** Direcciones de la red local por las que se puede entrar. */
  addresses: string[]
  devices: RemoteDevice[]
  invite: RemoteInvite | null
}

export interface RemoteActivityEntry {
  ts: string
  /** Nombre del dispositivo, o null si no se le reconoció. */
  device: string | null
  address: string
  order: RemoteOrder | 'pair'
  server: string | null
  /** `send`: lo que se mandó (o se intentó mandar) a la consola. */
  command?: string
  result: 'ok' | RemoteError
}

// --- Consola -------------------------------------------------------------------

/**
 * Comandos del nivel 2: hablar, listar, expulsar y guardar. Nada que dé
 * permisos, cambie el mundo o toque la configuración. Se compara la primera
 * palabra, sin la barra inicial y en minúsculas.
 */
export const LEVEL2_COMMANDS: Partial<Record<GameId, string[]>> = {
  minecraft: ['list', 'say', 'tell', 'msg', 'w', 'kick', 'save-all', 'tps'],
  factorio: ['players', 'kick', 'server-save'],
  zomboid: ['players', 'servermsg', 'kickuser', 'save'],
  rust: ['status', 'playerlist', 'say', 'kick', 'server.save']
}

/** Primera palabra de un comando, como se compara con la lista del nivel 2. */
export function commandName(command: string): string {
  return (command.trim().split(/\s+/)[0] ?? '').replace(/^\//, '').toLowerCase()
}

/**
 * ¿Puede un dispositivo de este nivel mandar este comando a este juego?
 *
 * En el nivel 2 se rechaza además cualquier cosa que encadene comandos: no
 * todas las consolas lo hacen, pero no hace falta averiguar cuáles.
 */
export function commandAllowed(level: ConsoleLevel, game: GameId, command: string): boolean {
  if (level === 3) return true
  if (level === 1) return false
  if (/[;|&`]/.test(command)) return false
  return (LEVEL2_COMMANDS[game] ?? []).includes(commandName(command))
}

const IPV4 = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g
/** Forma completa (Java: `0:0:0:0:0:0:0:1`), al menos cinco grupos. */
const IPV6_FULL = /\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi
/** Forma comprimida: con «::» y al menos un grupo. */
const IPV6_SHORT = /(?:\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*\b)?/gi

/**
 * Quita las IP de una línea de consola antes de mandarla fuera.
 *
 * Minecraft escribe la de cada jugador al entrar y otros juegos hacen algo
 * parecido. Las horas (`12:34:56`) no se tocan: tienen menos grupos de los que
 * pide la forma completa de IPv6 y ningún «::».
 *
 * IPv4 va primero: en `::ffff:1.2.3.4`, si fuera después, la parte IPv6 se
 * comería el primer número y el resto ya no parecería una IPv4.
 */
export function maskAddresses(text: string): string {
  return text
    .replace(IPV4, '***.***.***.***')
    .replace(IPV6_FULL, '***')
    .replace(IPV6_SHORT, (match) => (/[0-9a-f]/i.test(match) ? '***' : match))
}
