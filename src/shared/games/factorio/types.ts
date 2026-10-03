import { t } from '../../i18n'
/**
 * Tipos de Factorio compartidos entre el núcleo y la interfaz.
 *
 * Factorio es el primer juego de la app que **no tiene servidor dedicado
 * propio en Windows**: se usa el ejecutable del juego con `--start-server`, y
 * eso obliga a que el usuario tenga Factorio (hoja de ruta, fase 4).
 *
 * Todo lo de este fichero está comprobado contra el juego real (2.1.19 con
 * Space Age y 2.0.77 estable), preguntándoselo al ejecutable y mirando lo que
 * escribe, no copiado de una wiki (ANALISIS.md §19.19):
 *
 * 1. **El ejecutable es de subsistema GUI, no de consola.** No tiene entrada
 *    estándar utilizable: escribir en ella da EPIPE. Por eso la única vía de
 *    control es **RCON**, y por eso todo servidor lleva RCON aunque el usuario
 *    no lo pida. Ctrl+Break tampoco sirve (y encima no guarda).
 * 2. **Un `config.ini` propio con `write-data` saca todo** (partidas, mods,
 *    registro, listas de moderación) de `%APPDATA%\Factorio`, que es donde
 *    están las partidas de un jugador del usuario.
 * 3. **La versión estable 2.0.77 no termina de cerrarse** tras guardar con
 *    `/quit` (probado con 60, 90 y 240 segundos). La 2.1.19 cierra en 0,4 s.
 *    Como la partida ya está guardada al 100 % cuando eso pasa, cerrar el
 *    proceso entonces es seguro: los arranques siguientes cargan sin quejarse.
 * 4. **Las imágenes y los sonidos no hacen falta para servir.** Quitarlos deja
 *    la instalación en ~246 MB de 5,1 GB con los **mismos checksums de
 *    prototipos**, así que los clientes entran igual. Los `.lua` que hay
 *    dentro de `graphics/` sí hacen falta: sin ellos no carga ni el mod base.
 *
 * No debe importar nada de Node ni de Electron.
 */

/** Factorio en Steam. No hay app de servidor dedicado: es el juego. */
export const FACTORIO_APP_ID = 427520

/**
 * Y este es el DLC Space Age, que viaja en su propio depósito.
 *
 * SteamCMD lo descarga junto al juego **solo si la cuenta lo tiene**
 * (comprobado). Por eso la app no pregunta si el usuario lo compró: mira si
 * `data/space-age` ha llegado.
 */
export const SPACE_AGE_APP_ID = 645390

/** Puerto de juego por defecto, UDP. Es el único que hay que abrir. */
export const DEFAULT_GAME_PORT = 34197

/**
 * Memoria que conviene tener libre. Un mapa recién creado ocupa ~1 GB de RAM;
 * lo que la dispara es el tamaño de la fábrica, no los jugadores.
 */
export const MEMORY_MIN_GB = 2
export const MEMORY_RECOMMENDED_GB = 6

/**
 * Jugadores que propone el asistente. El juego no impone un máximo: el límite
 * de verdad es la red y la CPU, porque Factorio simula en lockstep.
 */
export const DEFAULT_MAX_PLAYERS = 8

/**
 * Longitud mínima de la contraseña de entrada. La pide la app, no el servidor:
 * el servidor acepta cualquier cosa, incluida una vacía (que deja entrar a
 * cualquiera que sepa la dirección).
 */
export const MIN_PASSWORD_LENGTH = 5

/** Cada cuántos minutos guarda solo el servidor, y cuántas copias mantiene. */
export const DEFAULT_AUTOSAVE_MINUTES = 10
export const DEFAULT_AUTOSAVE_SLOTS = 5

/**
 * Cuánto se espera a que el proceso cierre tras pedirle `/quit`.
 *
 * Generoso porque un mapa grande tarda en volcarse. Ojo: en la 2.0.77 este
 * plazo SIEMPRE se agota (no cierra nunca), y ahí lo que vale es haber visto
 * el guardado terminado, no el plazo.
 */
export const STOP_GRACE_MS = 120_000

/**
 * Preset de generación del mapa.
 *
 * Son los nueve que trae el juego (`data/base/prototypes/map-gen-presets.lua`),
 * con el nombre y la explicación que el propio Factorio da en español
 * (`locale/es-ES`): así el asistente dice lo mismo que el juego.
 */
export type FactorioPreset =
  | 'default'
  | 'rich-resources'
  | 'marathon'
  | 'death-world'
  | 'death-world-marathon'
  | 'rail-world'
  | 'ribbon-world'
  | 'lakes'
  | 'island'

export interface PresetInfo {
  id: FactorioPreset
  name: string
  description: string
}

/**
 * Los preajustes del propio juego. Sus nombres y descripciones son los que usa
 * Factorio en cada idioma, para que se reconozcan al abrir el juego.
 */
export const PRESETS: PresetInfo[] = (
  [
    'default',
    'rich-resources',
    'rail-world',
    'lakes',
    'island',
    'ribbon-world',
    'marathon',
    'death-world',
    'death-world-marathon'
  ] as const
).map((id) => ({
  id,
  get name() {
    return t(`fa.preset.${id}.name`)
  },
  get description() {
    return t(`fa.preset.${id}.description`)
  }
}))

export function presetInfo(id: FactorioPreset): PresetInfo {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]
}

/**
 * Quién puede usar los comandos de consola dentro del juego.
 *
 * `admins-only` es lo que trae el servidor de serie y lo que la app deja
 * puesto: los comandos de Factorio incluyen el modo trampas, y con `true`
 * cualquiera que entre puede darse lo que quiera.
 */
export type AllowCommands = 'true' | 'false' | 'admins-only'

/** De dónde sale el juego para este servidor. */
export type FactorioSource =
  /** Descargado con SteamCMD usando la cuenta de Steam del usuario. */
  | 'steamcmd'
  /** Copiado de una instalación que ya existía en el equipo. */
  | 'local'

export interface FactorioData {
  /**
   * Contraseña para entrar. Vacía = entra cualquiera que tenga la dirección.
   *
   * Se guarda tal cual porque va en `server-settings.json` en cada arranque y
   * porque el usuario tiene que poder leerla para dársela a alguien.
   */
  password: string
  /** Lo que se ve del servidor: el nombre y la descripción del juego. */
  description: string
  maxPlayers: number
  /** Partida que carga al arrancar. Es el nombre del `.zip` en `saves/`. */
  saveName: string
  preset: FactorioPreset
  /** Semilla del mapa, si se fijó una. Vacío = la elige el juego. */
  seed?: string
  /**
   * Si el servidor carga el DLC Space Age.
   *
   * Se decide al crear y **no se puede cambiar después**: el mapa se genera con
   * esos mods y el checksum de prototipos cambia con ellos. Solo se ofrece si
   * el juego descargado trae `data/space-age`.
   */
  spaceAge: boolean
  /** Cada cuántos minutos guarda solo, y cuántas copias propias mantiene. */
  autosaveMinutes: number
  autosaveSlots: number
  /** Pausa la partida cuando no hay nadie dentro. Es lo que hace el juego de serie. */
  autoPause: boolean
  allowCommands: AllowCommands
  /**
   * Pedir a factorio.com que confirme quién entra.
   *
   * Con esto el servidor **habla con `auth.factorio.com` al arrancar** (pide un
   * «server padlock»); sin esto no sale ni un paquete hacia fuera, comprobado
   * con netstat. A cambio, sin verificación cualquiera puede entrar con el
   * nombre que quiera, porque el nombre lo elige el cliente.
   */
  verifyAccounts: boolean
  /**
   * Puerto y contraseña de RCON, que la app genera al crear el servidor.
   *
   * No son opcionales ni configurables: sin RCON no hay forma de parar el
   * servidor ni de moderarlo, porque el ejecutable no lee la entrada estándar.
   * El puerto se abre **solo en 127.0.0.1**, así que no sale del equipo.
   */
  rconPort: number
  rconPassword: string
  /** De dónde salió el juego de este servidor. */
  source: FactorioSource
  /**
   * Cuenta de Steam con la que se descargó (`source: 'steamcmd'`).
   *
   * Se guarda el nombre y **nada más**: la contraseña se pide una vez, se le
   * pasa a SteamCMD por la entrada estándar y es Steam quien deja sus
   * credenciales en caché. La app no la escribe en ningún sitio.
   */
  steamUser?: string
  /** Carpeta de la que se copió el juego (`source: 'local'`). */
  sourcePath?: string
  /** Rama de Steam instalada. Si falta, la pública. */
  branch?: string
  /** Build de Steam instalada, para saber si hay actualización. */
  buildId?: string
  /** Versión tal como la escribe el servidor al arrancar («2.0.77»). */
  gameVersion?: string
}

/** Lo que el asistente elige para un servidor de Factorio nuevo. */
export interface FactorioCreateOptions {
  /**
   * De dónde sale el juego. Es la primera decisión y la única que no tienen los
   * demás juegos: sin Factorio no hay servidor, y la app no puede descargarlo
   * de forma anónima.
   */
  source: FactorioSource
  /** Con `source: 'local'`, la carpeta de la que copiarlo. */
  sourcePath?: string
  /** Con `source: 'steamcmd'`, la cuenta que lo tiene. */
  steamUser?: string
  password: string
  description?: string
  maxPlayers?: number
  preset: FactorioPreset
  seed?: string
  spaceAge: boolean
  autoPause?: boolean
  verifyAccounts?: boolean
}

/**
 * Una partida guardada del servidor.
 *
 * Factorio guarda cada partida en un `.zip` suelto dentro de `saves/`, y los
 * autoguardados son `_autosave1.zip`, `_autosave2.zip`… en la misma carpeta.
 */
export interface FactorioSave {
  /** Nombre sin `.zip`, que es con lo que se arranca. */
  name: string
  /** true si es la que carga el servidor ahora mismo. */
  active: boolean
  /** true si lo escribió el autoguardado del juego. */
  automatic: boolean
  sizeBytes: number
  modifiedAt: string
}

/** Las dos listas de moderación que el servidor mantiene en su carpeta. */
export type FactorioListKind = 'admin' | 'banned'

export interface FactorioListInfo {
  kind: FactorioListKind
  /** Fichero donde el servidor la guarda, dentro de la carpeta de datos. */
  file: string
  title: string
  description: string
}

export const MODERATION_LISTS: FactorioListInfo[] = (
  [
    ['admin', 'server-adminlist.json'],
    ['banned', 'server-banlist.json']
  ] as [FactorioListKind, string][]
).map(([kind, file]) => ({
  kind,
  file,
  get title() {
    return t(`fa.list.${kind}.title`)
  },
  get description() {
    return t(`fa.list.${kind}.description`)
  }
}))

/**
 * El `server-settings.json` que lee el servidor.
 *
 * Se escribe entero en cada arranque a partir del manifiesto: es configuración
 * derivada, no algo que el usuario edite a mano por su cuenta.
 *
 * `visibility.public` se queda SIEMPRE en false mientras la app no sepa
 * publicar: anunciarse en la lista de Factorio exige el usuario y el token de
 * factorio.com, y eso se pregunta antes de hacerlo.
 */
export function serverSettings(
  name: string,
  data: FactorioData
): Record<string, string | number | boolean | string[] | Record<string, boolean>> {
  return {
    name,
    description: data.description,
    tags: [],
    max_players: data.maxPlayers,
    // `lan: true` solo se anuncia por la red de casa (un UDP suelto más, visto
    // en netstat); `public: true` es lo que publicaría la IP del usuario en la
    // lista de Factorio, y eso no lo hace la app sin preguntar.
    visibility: { public: false, lan: true },
    username: '',
    password: '',
    token: '',
    game_password: data.password,
    require_user_verification: data.verifyAccounts,
    max_upload_in_kilobytes_per_second: 0,
    minimum_latency_in_ticks: 0,
    ignore_player_limit_for_returning_players: false,
    allow_commands: data.allowCommands,
    autosave_interval: data.autosaveMinutes,
    autosave_slots: data.autosaveSlots,
    afk_autokick_interval: 0,
    auto_pause: data.autoPause,
    only_admins_can_pause_the_game: true,
    autosave_only_on_server: true,
    // En Windows no existe: el servidor contesta «OS does not support
    // non-blocking saving. Forcing value to false» y sigue. Se deja en false
    // para no prometer en la interfaz algo que el sistema no da.
    non_blocking_saving: false
  }
}

/**
 * El `mod-list.json` que enciende o apaga Space Age.
 *
 * Los cuatro mods del DLC viajan con el juego y vienen activados: para jugar
 * al Factorio de siempre hay que apagarlos a mano, y hacerlo DESPUÉS de crear
 * el mapa no vale, porque el mapa se genera con los mods que estén puestos.
 */
export function modList(spaceAge: boolean): { mods: { name: string; enabled: boolean }[] } {
  return {
    mods: [
      { name: 'base', enabled: true },
      { name: 'elevated-rails', enabled: spaceAge },
      { name: 'quality', enabled: spaceAge },
      { name: 'recycler', enabled: spaceAge },
      { name: 'space-age', enabled: spaceAge }
    ]
  }
}
