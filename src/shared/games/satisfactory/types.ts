/**
 * Tipos de Satisfactory compartidos entre el núcleo y la interfaz.
 *
 * Todo lo que en Minecraft son ficheros de configuración, aquí son llamadas a
 * la API HTTPS del propio servidor (ANALISIS.md §19.15). Este fichero solo
 * declara qué opciones existen y cómo se llaman en cristiano; hablar con la API
 * es cosa del núcleo (`main/core/games/satisfactory/api.ts`).
 *
 * No debe importar nada de Node ni de Electron.
 */

import type { ModRef } from '../mods'
import { choice, labelled } from '../../i18n'

/** Lo propio de un servidor de Satisfactory dentro del manifiesto (`manifest.data`). */
export interface SatisfactoryData {
  /**
   * Contraseña de administrador. La app la necesita en cada arranque para
   * hablar con la API (consultar jugadores, parar, guardar), y el usuario para
   * mandar en la partida desde el juego.
   */
  adminPassword: string
  /** Contraseña para entrar. Vacía = puede entrar cualquiera que tenga la dirección. */
  clientPassword: string
  /** Partida que el servidor carga al arrancar. */
  sessionName: string
  /** Límite de jugadores del servidor (por defecto son 4). */
  maxPlayers: number
  /**
   * ¿Ya se ha reclamado el servidor? Solo se puede reclamar una vez y sin
   * contraseña; después hace falta la de administrador. Si la instalación
   * terminó pero el servidor aún no se había reclamado, se reintenta al arrancar.
   */
  claimed: boolean
  /**
   * Rama de Steam en la que va el servidor. Si falta, la pública: es lo que
   * había antes de poder elegir, y es lo que Steam instala por defecto.
   */
  branch?: string
  /** Build de Steam instalada, para saber si hay actualización. */
  buildId?: string
  /** Versión del juego, tal como la publica el propio servidor. */
  gameVersion?: string
  /**
   * Los mods de ficsit.app que lleva el servidor, en el orden en que se
   * añadieron. Falta en los servidores creados antes de que la app supiera de
   * mods, y eso es «ninguno», no un manifiesto roto.
   */
  mods?: ModRef[]
  /** Versión de SML instalada, que es el cargador sin el cual no carga ninguno. */
  loaderVersion?: string
}

/** Lo que el asistente elige para un servidor de Satisfactory nuevo. */
export interface SatisfactoryCreateOptions {
  adminPassword: string
  clientPassword: string
  /** Nombre de la partida. Es lo que se ve al entrar y lo que agrupa los guardados. */
  sessionName: string
  /** Ajustes de servidor elegidos en el asistente (autoguardado, pausa...). */
  serverOptions?: Record<string, string>
}

/** El servidor dedicado de Satisfactory es siempre esta aplicación de Steam. */
export const SATISFACTORY_APP_ID = 1690800

/** Puerto de juego y de la API. El usuario puede cambiarlo. */
export const DEFAULT_GAME_PORT = 7777

/**
 * Puerto de la mensajería fiable. NO sigue al del juego: comprobado lanzando el
 * servidor con `-Port=7788`, este siguió siendo 8888. Por eso no puede haber
 * dos servidores de Satisfactory a la vez en el mismo equipo.
 */
export const RELIABLE_PORT = 8888

/** Jugadores que admite un servidor recién instalado si no se dice otra cosa. */
export const DEFAULT_MAX_PLAYERS = 4

/** Memoria que pide el juego, para avisar antes de instalar (no se reserva). */
export const MEMORY_MIN_GB = 8
export const MEMORY_RECOMMENDED_GB = 16

/**
 * Una opción del servidor, de las que se cambian por la API en caliente.
 * Las claves son las que entiende el juego (`FG.*`).
 */
export interface SatisfactoryOption {
  key: string
  label: string
  help: string
  /** `advanced` solo sale en modo avanzado. */
  advanced?: boolean
  kind: 'toggle' | 'choice' | 'minutes'
  /** Para `choice`: valor tal cual lo espera la API y cómo se llama en pantalla. */
  choices?: { value: string; label: string }[]
}

/**
 * Catálogo de opciones del servidor, en lenguaje llano.
 *
 * Son las que devuelve `GetServerOptions` del servidor real. Si el juego añade
 * o quita alguna, el panel enseña igual las que existan: lo que no esté aquí se
 * muestra en crudo solo en modo avanzado, en vez de desaparecer sin avisar.
 */
/** Una opción con su etiqueta y su ayuda traducidas (`sf.opt.<clave>.label`/`.help`). */
function option(base: Omit<SatisfactoryOption, 'label' | 'help'>): SatisfactoryOption {
  return labelled(base, `sf.opt.${base.key}`)
}

export const SERVER_OPTIONS: SatisfactoryOption[] = [
  option({ key: 'FG.AutosaveInterval', kind: 'minutes' }),
  option({ key: 'FG.DSAutoPause', kind: 'toggle' }),
  option({ key: 'FG.DSAutoSaveOnDisconnect', kind: 'toggle' }),
  option({ key: 'FG.EnableSeasonalEvents', kind: 'toggle' }),
  option({ key: 'FG.SendGameplayData', kind: 'toggle' }),
  option({
    key: 'FG.NetworkQuality',
    advanced: true,
    kind: 'choice',
    choices: [
      choice('0', 'sf.opt.quality.low'),
      choice('1', 'sf.opt.quality.normal'),
      choice('2', 'sf.opt.quality.high'),
      choice('3', 'sf.opt.quality.ultra')
    ]
  }),
  option({ key: 'FG.ServerRestartTimeSlot', advanced: true, kind: 'minutes' })
]

/**
 * Reglas de partida («ajustes avanzados de juego»).
 *
 * ⚠ Activarlas marca la partida para siempre: el juego desactiva los logros de
 * esa sesión. Por eso van juntas, con su aviso, y solo en modo avanzado.
 */
export const GAME_RULES: SatisfactoryOption[] = [
  option({ key: 'FG.GameRules.NoPower', kind: 'toggle' }),
  option({ key: 'FG.PlayerRules.NoBuildCost', kind: 'toggle' }),
  option({ key: 'FG.GameRules.DisableArachnidCreatures', kind: 'toggle' }),
  option({ key: 'FG.PlayerRules.FlightMode', kind: 'toggle' }),
  option({ key: 'FG.PlayerRules.GodMode', kind: 'toggle' }),
  option({ key: 'FG.GameRules.NoFuelCost', kind: 'toggle' }),
  option({ key: 'FG.GameRules.UnlockInstantAltRecipes', kind: 'toggle' })
]

/** Una partida guardada, tal como la cuenta el servidor. */
export interface SatisfactorySave {
  /** Nombre del fichero de guardado, que es lo que se carga. */
  saveName: string
  /** Partida a la que pertenece: varios guardados comparten sesión. */
  sessionName: string
  /** Tiempo jugado, en segundos. */
  playDurationSeconds: number
  /** Cuándo se guardó, en ISO. */
  savedAt: string
  /** Build del juego con la que se guardó. */
  buildVersion: number
  creativeModeEnabled: boolean
  modded: boolean
}

/** Las partidas del servidor, agrupadas por sesión. */
export interface SatisfactorySessions {
  sessions: { sessionName: string; saves: SatisfactorySave[] }[]
  /** Sesión que está cargada ahora mismo, si hay alguna. */
  currentSessionName: string | null
}

/** Estado en vivo del servidor, tal como lo cuenta su API. */
export interface SatisfactoryState {
  sessionName: string
  playersConnected: number
  playerLimit: number
  /** Hay una partida cargada y se puede entrar. */
  gameRunning: boolean
  paused: boolean
  /** Horas jugadas en esta partida. */
  durationSeconds: number
  tickRate: number
  techTier: number
}

/** Lo que hay que pedirle a la API para crear una partida nueva. */
export interface NewGameRequest {
  sessionName: string
  /** Ajustes avanzados de juego. Si lleva algo, la partida pierde los logros. */
  gameRules?: Record<string, string>
}
