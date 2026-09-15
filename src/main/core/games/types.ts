import type {
  CreateInstanceRequest,
  Diagnosis,
  GameId,
  InstanceManifest,
  LogLevel,
  ManifestChanges
} from '@shared/types'
import type { UpdateCheck } from '@shared/games'

/**
 * Contrato de un juego (Hoja de ruta multijuego, fase 0).
 *
 * El núcleo no sabe nada de Minecraft ni de ningún otro juego: sabe crear una
 * instancia, arrancar un proceso, pararlo, copiar carpetas y exponer una
 * conexión. Lo que cambia de un juego a otro lo declara su adaptador.
 *
 * Se diseñó a la vez contra Minecraft y contra Satisfactory (sobre papel) para
 * que no saliera con forma de Minecraft: si una pieza no tenía sentido para los
 * dos, no entraba aquí.
 */

/** Cómo se lanza el servidor ya instalado. Se recalcula en cada arranque. */
export interface LaunchSpec {
  command: string
  args: string[]
  cwd: string
  /** Variables de entorno añadidas a las de la app (Valheim necesita `SteamAppId`). */
  env?: Record<string, string>
}

/**
 * Cómo se para un servidor sin perder partida.
 *
 * Windows no tiene señales: matar el proceso es siempre abrupto. Cada juego
 * declara su vía limpia y el supervisor la ejecuta (`runtime/stop.ts`); matar
 * el proceso solo llega tras agotar el plazo de gracia.
 *
 * - `stdin`: una orden por la entrada estándar (Minecraft, Project Zomboid).
 * - `ctrl-break`: la señal de consola (Valheim, Enshrouded). Ctrl+C no sirve:
 *   el proceso hereda la orden de ignorarlo (ANALISIS.md §19.14).
 * - `rcon` / `webrcon`: una orden por la consola remota (Factorio, Rust).
 * - `api`: una llamada a la API del propio servidor (Satisfactory).
 */
export type StopStrategy = (
  | { kind: 'stdin'; command: string }
  | { kind: 'ctrl-break' }
  | { kind: 'rcon'; host?: string; port: number; password: string; command: string }
  | { kind: 'webrcon'; host?: string; port: number; password: string; command: string }
  | { kind: 'api'; request: () => Promise<void> }
) & {
  /** Cuánto se espera a que cierre solo. Por defecto 60 s. */
  graceMs?: number
}

/** Lo que se extrae de una línea del registro del servidor. */
export interface ParsedEvent {
  level: LogLevel
  text: string
  /** Servidor listo para aceptar jugadores. */
  ready?: boolean
  playerJoined?: string
  playerLeft?: string
  chat?: { player: string; message: string }
  diagnosis?: Diagnosis
}

/** Lo mínimo del supervisor que necesita un juego (p. ej. para copias en caliente). */
export interface SupervisorHandle {
  readonly isRunning: boolean
  sendCommand(command: string): void
  waitForLog(pattern: RegExp, timeoutMs: number): Promise<boolean>
}

export type ProgressFn = (phase: string, progress: number | null, detail?: string) => void

/** Estado del servidor tal como lo ve un cliente del juego desde esta máquina. */
export interface PingResult {
  ok: boolean
  motd?: string
  versionName?: string
  playersOnline?: number
  playersMax?: number
  latencyMs?: number
  error?: string
}

export interface ExternalCheckResult {
  reachable: boolean
  motd?: string
  playersOnline?: number
  playersMax?: number
  error?: string
}

export interface GameAdapter<
  M extends InstanceManifest = InstanceManifest,
  R extends CreateInstanceRequest = CreateInstanceRequest
> {
  readonly id: GameId

  // --- Creación e instalación ------------------------------------------------

  /**
   * Valida lo pedido y calcula los datos propios del juego, ANTES de tocar el
   * disco: una petición no válida no debe dejar un servidor a medio crear.
   */
  prepareCreate(request: R, name: string): Promise<M['data']>

  /** Escribe los ficheros iniciales (configuración, condiciones aceptadas). */
  writeInitialFiles(manifest: M, request: R): Promise<void>

  /** Descarga e instala. Devuelve los datos que cambien (p. ej. el build real). */
  install(manifest: M, onProgress: ProgressFn): Promise<Partial<M['data']> | void>

  /** Ajustes derivados al cambiar el manifiesto (p. ej. flags de memoria). */
  applyChanges?(current: M, next: M, changes: ManifestChanges): M

  /**
   * Compara lo instalado con lo publicado. Sin esto el juego no avisa de
   * actualizaciones (Minecraft: la versión la elige el usuario). Actualizar es
   * volver a llamar a `install` con el servidor parado.
   */
  checkUpdate?(manifest: M): Promise<UpdateCheck>

  // --- Ejecución -------------------------------------------------------------

  launch(manifest: M): Promise<LaunchSpec>
  stop(manifest: M): StopStrategy
  parseLine(raw: string): ParsedEvent
  diagnoseExit(code: number | null, recentLines: string[]): Diagnosis

  // --- Copias de seguridad ---------------------------------------------------

  /**
   * Rutas (relativas a la carpeta del servidor) que forman una copia. Vacío
   * significa que aún no hay nada que guardar.
   */
  backupEntries(manifest: M): Promise<string[]>

  /** Carpetas que se retiran antes de restaurar una copia. */
  restoreTargets(manifest: M): Promise<string[]>

  /** Versión y variante que se anotan en la copia. */
  backupMeta(manifest: M): { version: string; variant?: string }

  /**
   * Deja la partida consistente en disco y suspende el guardado automático.
   * Devuelve false si el servidor no lo confirmó a tiempo. Sin esto no se
   * permiten copias en caliente.
   */
  holdSaves?(supervisor: SupervisorHandle): Promise<boolean>
  resumeSaves?(supervisor: SupervisorHandle): void

  // --- Red -------------------------------------------------------------------

  /** Consulta local del estado, con el protocolo del propio juego. */
  ping(manifest: M): Promise<PingResult>

  /** Pide a un servicio externo que intente entrar desde internet. */
  checkFromInternet(host: string, port: number): Promise<ExternalCheckResult>
}
