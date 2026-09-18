/**
 * Tipos compartidos entre el núcleo (proceso principal) y la interfaz.
 * No debe importar nada de Node ni de Electron.
 */

import type { MinecraftCreateOptions, MinecraftData } from './games/minecraft/types'
import type { SatisfactoryCreateOptions, SatisfactoryData } from './games/satisfactory/types'
import type { ValheimCreateOptions, ValheimData } from './games/valheim/types'
import type { FactorioCreateOptions, FactorioData } from './games/factorio/types'

/**
 * Nivel de detalle de la interfaz.
 *
 * `basic` no es "la misma pantalla con menos botones": es no obligar a decidir.
 * Lo que en avanzado son controles (versión, memoria, puerto), en básico son
 * valores sensatos ya elegidos, y como mucho se informan.
 */
export type UiMode = 'basic' | 'advanced'

export interface AppSettings {
  uiMode: UiMode
}

export interface BackupSettings {
  enabled: boolean
  intervalHours: number
  keep: number
}

// --- Juegos -------------------------------------------------------------------

/** Juegos que sabe gestionar la app. Cada uno vive en `games/<id>/`. */
export type GameId = 'minecraft' | 'satisfactory' | 'valheim' | 'factorio'

/**
 * Condiciones que el usuario acepta de forma explícita al crear un servidor.
 * Nunca se marcan por él (§6): cada juego declara cuáles exige.
 */
export type AgreementId = 'minecraft-eula' | 'steam-subscriber'

/**
 * Lo que tiene cualquier servidor, sea del juego que sea.
 *
 * El manifiesto guarda INTENCIÓN (qué quiso el usuario), no estado derivado. Lo
 * propio de cada juego va en `data`, para que un juego nuevo no tenga que
 * inventarse campos que no le corresponden (la v1 guardaba `minecraftVersion`
 * y `javaMajor` como si todo servidor fuera de Minecraft).
 */
interface ManifestBase {
  schemaVersion: 2
  id: string
  name: string
  game: GameId
  /** Jugadores esperados: de aquí salen la memoria recomendada y el límite de jugadores. */
  expectedPlayers?: number
  /** Puerto principal: el que se da a los jugadores para conectarse. */
  port: number
  autoRestart: boolean
  /** Cómo se expone al exterior. Si falta, se asume solo red local. */
  exposure?: ExposureSettings
  backup: BackupSettings
  createdAt: string
  /** Condiciones aceptadas explícitamente por el usuario. */
  agreements: AgreementId[]
}

export interface MinecraftManifest extends ManifestBase {
  game: 'minecraft'
  data: MinecraftData
}

export interface SatisfactoryManifest extends ManifestBase {
  game: 'satisfactory'
  data: SatisfactoryData
}

export interface ValheimManifest extends ManifestBase {
  game: 'valheim'
  data: ValheimData
}

export interface FactorioManifest extends ManifestBase {
  game: 'factorio'
  data: FactorioData
}

/**
 * Unión discriminada por `game`: quien lea `data` tiene que mirar antes de qué
 * juego es el servidor, y así no puede colarse un campo de un juego en otro.
 */
export type InstanceManifest =
  | MinecraftManifest
  | SatisfactoryManifest
  | ValheimManifest
  | FactorioManifest

/**
 * Cambios que se pueden pedir sobre un manifiesto. `data` se fusiona con lo que
 * ya hay, así que basta con mandar los campos que cambian.
 */
export type ManifestChanges = Partial<
  Pick<ManifestBase, 'name' | 'expectedPlayers' | 'port' | 'autoRestart' | 'exposure' | 'backup'>
> & {
  data?:
    | Partial<MinecraftData>
    | Partial<SatisfactoryData>
    | Partial<ValheimData>
    | Partial<FactorioData>
}

export type ServerStatus =
  | 'stopped'
  | 'installing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'

export interface InstanceState {
  manifest: InstanceManifest
  status: ServerStatus
  /**
   * Quién está conectado. Vacío no significa «no hay nadie» en los juegos que
   * no dan nombres (Satisfactory solo da cuántos son): para eso está
   * `playerCount`, y la capacidad `playerNames` dice a cuál hay que hacer caso.
   */
  players: string[]
  /** Cuántos hay conectados, cuando el juego lo dice y no da los nombres. */
  playerCount: number | null
  /**
   * Código con el que se entra, en los juegos que se conectan por relé en vez
   * de por dirección (Valheim con crossplay). Solo existe con el servidor
   * arrancado: el juego lo genera en cada arranque y lo dice por el registro.
   */
  joinCode: string | null
  /** Segundos desde el arranque, o null si no está corriendo. */
  uptimeSeconds: number | null
  lastError: string | null
}

export type LogLevel = 'info' | 'warn' | 'error' | 'chat' | 'system'

export interface LogLine {
  ts: number
  level: LogLevel
  text: string
}

/** Progreso de una operación larga (descarga, instalación). */
export interface ProgressUpdate {
  instanceId: string
  phase: string
  /** 0..1, o null si es indeterminado. */
  progress: number | null
  detail?: string
}

/**
 * Diagnóstico traducido a lenguaje humano (§7).
 * `action` describe un arreglo que la interfaz puede ofrecer con un botón.
 */
export interface Diagnosis {
  code: string
  title: string
  detail: string
  action?: { kind: 'set-memory' | 'change-port' | 'accept-eula' | 'install-java'; value?: number }
}

interface CreateRequestBase {
  game: GameId
  name: string
  expectedPlayers?: number
  port: number
  /** Condiciones que el usuario ha aceptado en el asistente. */
  agreements: AgreementId[]
  /** Cómo se conectarán los jugadores, si se eligió al crear. */
  exposure?: ExposureSettings
}

export interface MinecraftCreateRequest extends CreateRequestBase {
  game: 'minecraft'
  options: MinecraftCreateOptions
}

export interface SatisfactoryCreateRequest extends CreateRequestBase {
  game: 'satisfactory'
  options: SatisfactoryCreateOptions
}

export interface ValheimCreateRequest extends CreateRequestBase {
  game: 'valheim'
  options: ValheimCreateOptions
}

export interface FactorioCreateRequest extends CreateRequestBase {
  game: 'factorio'
  options: FactorioCreateOptions
}

export type CreateInstanceRequest =
  | MinecraftCreateRequest
  | SatisfactoryCreateRequest
  | ValheimCreateRequest
  | FactorioCreateRequest

// --- Copias de seguridad (§12) ----------------------------------------------

export interface BackupInfo {
  /** Nombre del fichero, que hace de identificador. */
  fileName: string
  createdAt: string
  sizeBytes: number
  game: GameId
  /** Versión del juego en el momento de la copia, para avisar al restaurar. */
  version: string
  /** Variante dentro del juego (en Minecraft, la distribución). */
  variant?: string
  /** true si se hizo automáticamente antes de una operación de riesgo. */
  automatic: boolean
  reason?: string
}

/**
 * Estimación de espacio para poder decirle al usuario cuánto le va a costar
 * la retención que elija, antes de elegirla.
 */
export interface BackupEstimate {
  /**
   * Bytes que ocupa una copia. Se calcula con las copias reales cuando las hay,
   * que es la única cifra fiable; si no, se estima a partir del mundo actual.
   */
  perBackupBytes: number
  /** Cuántas copias reales se han promediado. 0 = es una estimación. */
  sampleCount: number
  /** Tamaño del mundo sin comprimir, como referencia. */
  worldBytes: number
  /** Espacio libre en disco, o null si no se ha podido consultar. */
  freeDiskBytes: number | null
}

// --- Red (§10) ---------------------------------------------------------------

export interface LocalAddress {
  /** Nombre del adaptador, para distinguir Wi-Fi de Ethernet. */
  label: string
  address: string
}

export type ConnectivityState = 'ok' | 'no-responde' | 'parado' | 'comprobando'

/**
 * Cómo se expone el servidor al exterior (§10).
 *
 * `router` exige abrir un puerto y falla de raíz bajo CGNAT.
 * `tunnel` no toca el router y funciona incluso con CGNAT, a cambio de latencia
 * y de depender de un tercero.
 * `crossplay` es lo mismo pero de serie en el propio juego (Valheim lo hace con
 * los relés de PlayFab): no hay dirección que dar, sino un código de 6 dígitos.
 * Solo lo ofrecen los juegos que declaran la capacidad `crossplay`.
 */
export type ExposureMode = 'local' | 'router' | 'tunnel' | 'crossplay'

export interface ExposureSettings {
  mode: ExposureMode
  /** Dirección que da playit.gg, del tipo `algo.joinmc.link`. */
  tunnelAddress?: string
}

/** Resultado de pedir a un servicio externo que intente conectarse (§10). */
export interface ExternalCheck {
  reachable: boolean
  /** Dirección comprobada, tal cual la usarían tus amigos. */
  address: string
  publicIp?: string
  motd?: string
  playersOnline?: number
  playersMax?: number
  /** Momento de la comprobación: estos servicios cachean resultados. */
  checkedAt: string
  error?: string
}

export interface ConnectionInfo {
  port: number
  loopback: string
  localAddresses: LocalAddress[]
  /** Resultado del Server List Ping, que es lo que hace el juego de verdad. */
  ping: {
    state: ConnectivityState
    motd?: string
    versionName?: string
    playersOnline?: number
    playersMax?: number
    latencyMs?: number
  }
  exposure: ExposureSettings
  /** IP del router, para poder enlazar a su panel en la ayuda. */
  gateway: string | null
}
