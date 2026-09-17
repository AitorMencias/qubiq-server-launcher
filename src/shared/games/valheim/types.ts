/**
 * Tipos de Valheim compartidos entre el núcleo y la interfaz.
 *
 * Valheim no tiene fichero de configuración ni consola: **todo se decide en la
 * línea de órdenes al arrancar**. Por eso aquí no hay un catálogo de claves de
 * un `.ini`, sino la lista de lo que admite cada argumento.
 *
 * Todo lo de este fichero está comprobado contra el servidor real (1.0.12,
 * versión de red 40) lanzándolo y leyendo lo que contesta, no copiado de una
 * wiki: el servidor escribe «Setting world modifier: combat->veryhard» cuando
 * acepta algo y «Could not parse ... as a world modifier» cuando no, así que la
 * lista buena se saca preguntándole (ANALISIS.md §19.16).
 *
 * No debe importar nada de Node ni de Electron.
 */

/** El servidor dedicado de Valheim es esta aplicación de Steam. */
export const VALHEIM_APP_ID = 896660

/**
 * Y esta es la del juego, que el servidor necesita en `SteamAppId` para
 * arrancar. No son la misma: el `.bat` oficial exporta la del juego.
 */
export const VALHEIM_GAME_APP_ID = 892970

/** Puerto de juego por defecto. El de consulta es siempre el siguiente. */
export const DEFAULT_GAME_PORT = 2456

/**
 * Memoria que conviene tener libre. Valheim es de los servidores más ligeros
 * que gestiona la app; lo que pesa es el número de jugadores.
 */
export const MEMORY_MIN_GB = 2
export const MEMORY_RECOMMENDED_GB = 4

/** Jugadores que admite el servidor. El límite lo pone el juego, no la app. */
export const MAX_PLAYERS = 10

/**
 * Longitud mínima de la contraseña.
 *
 * El servidor 1.0.12 **no la comprueba**: arranca igual con cuatro caracteres
 * (probado). La exige el propio juego y la anuncia el `.bat` oficial
 * («Minimum password length is 5 characters»), así que la comprueba la app
 * antes de crear nada, que es donde se puede decir en cristiano.
 */
export const MIN_PASSWORD_LENGTH = 5

/** Cada cuánto guarda el mundo el servidor, en segundos. */
export const DEFAULT_SAVE_INTERVAL_SECONDS = 1800
export const MIN_SAVE_INTERVAL_SECONDS = 60

/** Copias que guarda el propio juego, aparte de las de la app. */
export const DEFAULT_BACKUPS = 4

/**
 * Dificultad del mundo, de un tirón.
 *
 * Son los mismos siete que ofrece el juego al crear un mundo. Cada uno pone
 * varios modificadores a la vez; tocar un modificador suelto después es
 * afinarlo.
 */
export type ValheimPreset =
  | 'default'
  | 'normal'
  | 'casual'
  | 'easy'
  | 'hard'
  | 'hardcore'
  | 'immersive'
  | 'hammer'

export interface PresetInfo {
  value: ValheimPreset
  label: string
  help: string
}

/** Los presets, en el orden en que se ofrecen (de más suave a más duro). */
export const PRESETS: PresetInfo[] = [
  {
    value: 'casual',
    label: 'Relajado',
    help: 'Los enemigos pegan menos y al morir no se pierde nada. Para jugar sin agobios.'
  },
  {
    value: 'easy',
    label: 'Fácil',
    help: 'Algo más suave que el normal, sin llegar a quitar el castigo por morir.'
  },
  {
    value: 'normal',
    label: 'Normal',
    help: 'El juego tal y como está pensado. Si no lo tienes claro, este.'
  },
  {
    value: 'hard',
    label: 'Difícil',
    help: 'Los enemigos pegan más y morir cuesta más caro.'
  },
  {
    value: 'hardcore',
    label: 'Extremo',
    help: 'Lo más duro: al morir se pierde todo el equipo y la experiencia.'
  },
  {
    value: 'immersive',
    label: 'Inmersivo',
    help: 'Sin mapa ni marcadores: hay que orientarse mirando el terreno. Cambia mucho la partida.'
  },
  {
    value: 'hammer',
    label: 'Constructor',
    help: 'Construir no gasta materiales. Para montar cosas sin tener que picar antes.'
  }
]

/** Lo que se puede afinar por separado, una vez elegida la dificultad. */
export type ValheimModifierKey = 'combat' | 'deathpenalty' | 'resources' | 'raids' | 'portals'

export interface ModifierInfo {
  key: ValheimModifierKey
  label: string
  help: string
  /** Valores que acepta el servidor, en orden y con nombre en cristiano. */
  options: { value: string; label: string }[]
}

/**
 * Modificadores y sus valores, comprobados uno a uno contra el servidor real.
 * `default` significa «lo que diga el preset»: no es un valor más, es no tocarlo.
 */
export const MODIFIERS: ModifierInfo[] = [
  {
    key: 'combat',
    label: 'Dureza de los enemigos',
    help: 'Cuánto pegan y cuánto aguantan los bichos.',
    options: [
      { value: 'default', label: 'Lo que diga la dificultad' },
      { value: 'veryeasy', label: 'Muy blandos' },
      { value: 'easy', label: 'Blandos' },
      { value: 'hard', label: 'Duros' },
      { value: 'veryhard', label: 'Muy duros' }
    ]
  },
  {
    key: 'deathpenalty',
    label: 'Qué pasa al morir',
    help: 'Cuánto se pierde: el equipo, la experiencia o nada.',
    options: [
      { value: 'default', label: 'Lo que diga la dificultad' },
      { value: 'casual', label: 'No se pierde nada' },
      { value: 'veryeasy', label: 'Se pierde muy poco' },
      { value: 'easy', label: 'Se pierde poco' },
      { value: 'hard', label: 'Se pierde bastante' },
      { value: 'hardcore', label: 'Se pierde todo' }
    ]
  },
  {
    key: 'resources',
    label: 'Recursos del mundo',
    help: 'Cuánto material sueltan los árboles, las rocas y los enemigos.',
    options: [
      { value: 'default', label: 'Lo que diga la dificultad' },
      { value: 'muchless', label: 'Muchos menos' },
      { value: 'less', label: 'Menos' },
      { value: 'more', label: 'Más' },
      { value: 'muchmore', label: 'Muchos más' },
      { value: 'most', label: 'Muchísimos más' }
    ]
  },
  {
    key: 'raids',
    label: 'Ataques a la base',
    help: 'Con qué frecuencia vienen a atacar donde vivís.',
    options: [
      { value: 'default', label: 'Lo que diga la dificultad' },
      { value: 'none', label: 'Ninguno' },
      { value: 'muchless', label: 'Muchos menos' },
      { value: 'less', label: 'Menos' },
      { value: 'more', label: 'Más' },
      { value: 'muchmore', label: 'Muchos más' }
    ]
  },
  {
    key: 'portals',
    label: 'Portales',
    help: 'Si se puede llevar cualquier cosa por un portal o hay que transportarla a mano.',
    options: [
      { value: 'default', label: 'Lo que diga la dificultad' },
      { value: 'casual', label: 'Se puede llevar todo' },
      { value: 'hard', label: 'Con más restricciones' },
      { value: 'veryhard', label: 'Sin portales que valgan' }
    ]
  }
]

export type ValheimModifiers = Partial<Record<ValheimModifierKey, string>>

/**
 * Las cuatro reglas de sí o no.
 *
 * ⚠ NO van por `-modifier`: el servidor las rechaza («Could not parse
 * 'nobuildcost' ... as a world modifier», comprobado). Son **claves globales**
 * del mundo y se ponen con `-setkey`. Es el error fácil de esta fase.
 */
export type ValheimGlobalKey =
  | 'nobuildcost'
  | 'nomap'
  | 'passivemobs'
  | 'playerevents'
  | 'noportals'

export interface GlobalKeyInfo {
  key: ValheimGlobalKey
  label: string
  help: string
}

export const GLOBAL_KEYS: GlobalKeyInfo[] = [
  {
    key: 'nobuildcost',
    label: 'Construir sin materiales',
    help: 'Levantar cosas no gasta nada del inventario.'
  },
  {
    key: 'nomap',
    label: 'Sin mapa',
    help: 'Nadie tiene mapa: hay que orientarse por el terreno.'
  },
  {
    key: 'passivemobs',
    label: 'Enemigos pacíficos',
    help: 'Los bichos no atacan si no se les ataca.'
  },
  {
    key: 'playerevents',
    label: 'Sucesos con jugadores fuera',
    help: 'Los ataques a la base pueden dispararse aunque no estéis conectados.'
  },
  {
    key: 'noportals',
    label: 'Sin portales',
    help: 'Los portales no funcionan: todo se recorre a pie o en barco.'
  }
]

/** Lo propio de un servidor de Valheim dentro del manifiesto (`manifest.data`). */
export interface ValheimData {
  /**
   * Contraseña para entrar. Vacía = entra cualquiera que tenga la dirección.
   *
   * Se guarda tal cual porque hace falta en cada arranque (va en la línea de
   * órdenes) y porque el usuario tiene que poder leerla para dársela a alguien.
   */
  password: string
  /** Mundo que carga al arrancar. Es el nombre de la carpeta en `worlds_local`. */
  worldName: string
  preset: ValheimPreset
  modifiers: ValheimModifiers
  globalKeys: ValheimGlobalKey[]
  /**
   * `-public 1`: el servidor aparece en la lista pública de Steam con la IP de
   * casa. Sin esto, el servidor **no contesta a las consultas de Steam** (A2S)
   * ni siquiera desde el propio equipo (comprobado): la app lo tiene en cuenta
   * al decir si responde y al contar jugadores.
   */
  listed: boolean
  /** Cada cuánto guarda el mundo, en segundos. */
  saveIntervalSeconds: number
  /** Copias que mantiene el propio juego dentro de la carpeta de mundos. */
  backups: number
  /** Build de Steam instalada, para saber si hay actualización. */
  buildId?: string
  /** Versión del juego tal como la escribe el servidor al arrancar. */
  gameVersion?: string
}

/** Lo que el asistente elige para un servidor de Valheim nuevo. */
export interface ValheimCreateOptions {
  password: string
  worldName: string
  preset: ValheimPreset
  modifiers?: ValheimModifiers
  globalKeys?: ValheimGlobalKey[]
  listed?: boolean
}

/** Un mundo guardado del servidor. */
export interface ValheimWorld {
  /** Nombre del mundo, que es con lo que se arranca (`-world`). */
  name: string
  /** true si es el que carga el servidor ahora mismo. */
  active: boolean
  /** Lo que ocupa con todos sus ficheros. */
  sizeBytes: number
  /** Última vez que se guardó, en ISO, o null si no se ha podido saber. */
  savedAt: string | null
}

/** Las tres listas de moderación de Valheim, que son ficheros de texto. */
export type ValheimListKind = 'admin' | 'banned' | 'permitted'

export interface ValheimListInfo {
  kind: ValheimListKind
  fileName: string
  label: string
  help: string
  /** Qué hace el servidor si la lista está vacía. */
  emptyMeans: string
}

export const MODERATION_LISTS: ValheimListInfo[] = [
  {
    kind: 'admin',
    fileName: 'adminlist.txt',
    label: 'Administradores',
    help: 'Pueden usar los comandos de administrador dentro del juego (volar, invocar, echar a alguien).',
    emptyMeans: 'Nadie manda dentro de la partida más que tú, y solo desde tu propio personaje.'
  },
  {
    kind: 'banned',
    fileName: 'bannedlist.txt',
    label: 'Vetados',
    help: 'No pueden entrar. Es lo más parecido a un baneo que tiene Valheim.',
    emptyMeans: 'No hay nadie vetado.'
  },
  {
    kind: 'permitted',
    fileName: 'permittedlist.txt',
    label: 'Lista de invitados',
    help: 'Si tiene a alguien, SOLO entra quien esté en ella. Es la lista blanca.',
    emptyMeans: 'Puede entrar cualquiera que sepa la dirección y la contraseña.'
  }
]

/** Una entrada de una lista: un SteamID (o PlayFab ID con crossplay). */
export interface ValheimListEntry {
  id: string
  /** Comentario que el usuario haya puesto en la misma línea, para reconocerlo. */
  note?: string
}

/**
 * ¿Hay que arrancar con crossplay?
 *
 * No es un ajuste aparte: **el crossplay ES una forma de exponer el servidor**,
 * la que no toca el router (relés de PlayFab, código de 6 dígitos). Guardarlo
 * también en `data` daría dos fuentes de verdad para lo mismo, y tarde o
 * temprano dirían cosas distintas.
 */
export function crossplayEnabled(exposure?: { mode: string }): boolean {
  return exposure?.mode === 'crossplay'
}

/** Puerto de consulta de Steam: siempre el siguiente al de juego. */
export function queryPortFor(gamePort: number): number {
  return gamePort + 1
}

/**
 * Los argumentos de `-modifier` que hay que pasar, saltándose los que están en
 * `default` (que significan «lo que diga el preset», no un valor a mandar).
 */
export function modifierArgs(modifiers: ValheimModifiers): string[] {
  return Object.entries(modifiers)
    .filter(([, value]) => value && value !== 'default')
    .flatMap(([key, value]) => ['-modifier', key, value!])
}
