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
  /** Build de Steam instalada, para saber si hay actualización. */
  buildId?: string
  /** Versión del juego, tal como la publica el propio servidor. */
  gameVersion?: string
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
export const SERVER_OPTIONS: SatisfactoryOption[] = [
  {
    key: 'FG.AutosaveInterval',
    label: 'Guardado automático',
    help: 'Cada cuánto guarda la partida el servidor. Cuanto más a menudo, menos se pierde si algo falla.',
    kind: 'minutes'
  },
  {
    key: 'FG.DSAutoPause',
    label: 'Pausar cuando no hay nadie',
    help: 'Con el servidor en pausa las fábricas no producen, pero el equipo descansa.',
    kind: 'toggle'
  },
  {
    key: 'FG.DSAutoSaveOnDisconnect',
    label: 'Guardar cuando se va el último',
    help: 'Guarda la partida en cuanto se desconecta el último jugador.',
    kind: 'toggle'
  },
  {
    key: 'FG.EnableSeasonalEvents',
    label: 'Eventos de temporada',
    help: 'Los eventos que el juego activa en ciertas fechas (FICSMAS y compañía).',
    kind: 'toggle'
  },
  {
    key: 'FG.SendGameplayData',
    label: 'Enviar datos de juego al estudio',
    help: 'Estadísticas anónimas de partida que el servidor manda a Coffee Stain.',
    kind: 'toggle'
  },
  {
    key: 'FG.NetworkQuality',
    label: 'Calidad de red',
    help: 'Cuánta información manda el servidor a cada jugador. Más calidad, más ancho de banda.',
    advanced: true,
    kind: 'choice',
    choices: [
      { value: '0', label: 'Baja' },
      { value: '1', label: 'Normal' },
      { value: '2', label: 'Alta' },
      { value: '3', label: 'Ultra' }
    ]
  },
  {
    key: 'FG.ServerRestartTimeSlot',
    label: 'Reinicio programado del juego',
    help: 'Minuto del día en que el propio juego se reinicia. 1440 significa que no.',
    advanced: true,
    kind: 'minutes'
  }
]

/**
 * Reglas de partida («ajustes avanzados de juego»).
 *
 * ⚠ Activarlas marca la partida para siempre: el juego desactiva los logros de
 * esa sesión. Por eso van juntas, con su aviso, y solo en modo avanzado.
 */
export const GAME_RULES: SatisfactoryOption[] = [
  {
    key: 'FG.GameRules.NoPower',
    label: 'Sin consumo de electricidad',
    help: 'Las máquinas funcionan aunque no haya red eléctrica.',
    kind: 'toggle'
  },
  {
    key: 'FG.PlayerRules.NoBuildCost',
    label: 'Construir sin materiales',
    help: 'Construir no gasta nada del inventario.',
    kind: 'toggle'
  },
  {
    key: 'FG.GameRules.DisableArachnidCreatures',
    label: 'Sin bichos con muchas patas',
    help: 'Quita del mapa las criaturas tipo araña. Útil si alguien las lleva mal.',
    kind: 'toggle'
  },
  {
    key: 'FG.PlayerRules.FlightMode',
    label: 'Volar',
    help: 'Los jugadores pueden volar libremente por el mapa.',
    kind: 'toggle'
  },
  {
    key: 'FG.PlayerRules.GodMode',
    label: 'Invulnerabilidad',
    help: 'Los jugadores no reciben daño.',
    kind: 'toggle'
  },
  {
    key: 'FG.GameRules.NoFuelCost',
    label: 'Sin gastar combustible',
    help: 'Vehículos y generadores no consumen combustible.',
    kind: 'toggle'
  },
  {
    key: 'FG.GameRules.UnlockInstantAltRecipes',
    label: 'Recetas alternativas al instante',
    help: 'Las investigaciones de recetas alternativas salen sin esperar.',
    kind: 'toggle'
  }
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
