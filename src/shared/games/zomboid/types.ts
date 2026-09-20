/**
 * Tipos de Project Zomboid compartidos entre el núcleo y la interfaz.
 *
 * Zomboid es, de los seis juegos, el que más se parece a Minecraft: consola por
 * la entrada estándar, RCON, ficheros de texto editables y memoria de la JVM.
 * Por eso reutiliza casi toda la gestión que ya existe y, a cambio, tiene la
 * configuración más grande de todas: `servertest.ini` (más de 130 claves) y
 * `servertest_SandboxVars.lua` (más de 300 opciones con sus comentarios).
 *
 * Todo lo de este fichero está comprobado contra el servidor real (Build 42.20,
 * `pz-fase5.mjs` en el material de desarrollo), no copiado de una wiki
 * (ANALISIS.md §19.22):
 *
 * 1. **Sin Steam no se anuncia en ningún sitio.** El propio `.ini` avisa de que
 *    «los servidores habilitados para Steam siempre son visibles en el
 *    navegador de servidores de Steam», aunque `Public=false`. La app arranca
 *    con `-Dzomboid.steam=0` salvo que se pida lo contrario.
 * 2. **Con Steam apagado el servidor NO contesta al A2S** en ningún puerto
 *    (probado en 16261 y 16262). Lo que sí contesta siempre es RCON.
 * 3. **Sin contraseña de RCON no hay RCON.** Con `RCONPassword` vacío —que es
 *    como viene— el puerto ni se abre. La app genera una siempre: sin RCON no
 *    hay forma de saber quién está dentro ni de moderar.
 * 4. **El servidor reescribe él mismo el `.ini` al arrancar**: conserva los
 *    valores pero borra las claves que no son suyas y los comentarios que no ha
 *    puesto él. Por eso la app edita el fichero que encuentra en vez de
 *    escribirlo entero, y no guarda nada suyo ahí dentro.
 * 5. **El `SandboxVars.lua` sí se respeta entero**: 738 comentarios intactos
 *    tras arrancar y parar, con los valores cambiados aplicados.
 *
 * No debe importar nada de Node ni de Electron.
 */

/** El servidor dedicado de Project Zomboid en Steam. Se baja de forma anónima. */
export const ZOMBOID_APP_ID = 380870

/**
 * Y esta es la app del **juego**, que es de la que cuelga el taller de Steam.
 *
 * No son la misma: los mods se publican contra el juego (108600) aunque quien
 * los use sea el servidor dedicado (380870). Pedirle al taller los objetos del
 * 380870 no devuelve nada.
 */
export const ZOMBOID_WORKSHOP_APP_ID = 108600

/**
 * Puerto de juego por defecto (`DefaultPort` del `.ini`), UDP.
 *
 * Medido con `netstat`: sin Steam el servidor abre **solo este**. El segundo
 * (`UDPPort`, el siguiente) aparece en su configuración y en las guías, pero en
 * un arranque sin Steam no llega a escucharse.
 */
export const DEFAULT_GAME_PORT = 16261

/** Puerto de RCON por defecto del juego, comprobado en el `.ini` real. */
export const DEFAULT_RCON_PORT = 27015

/**
 * Memoria que conviene tener libre. La Build 42 pide bastante más que la 41: el
 * `.bat` oficial arranca con `-Xms16g -Xmx16g`, que es una barbaridad para una
 * partida de cuatro amigos, pero marca por dónde van los tiros.
 */
export const MEMORY_MIN_GB = 4
export const MEMORY_RECOMMENDED_GB = 8

/** Memoria de la JVM que propone la app, en MB, y los extremos que admite. */
export const DEFAULT_MEMORY_MB = 4096
export const MIN_MEMORY_MB = 2048
export const MAX_MEMORY_MB = 16384

/**
 * Jugadores que admite el servidor. El límite duro son 254, pero su propia
 * configuración avisa de que por encima de 32 el mapa se desincroniza.
 */
export const MAX_PLAYERS = 32
export const DEFAULT_MAX_PLAYERS = 8

/**
 * Nombre interno de la partida. No lo elige el usuario a propósito.
 *
 * Es a la vez el nombre de la carpeta de guardado, el prefijo de los ficheros
 * de configuración (`servertest.ini`, `servertest_SandboxVars.lua`) y el de la
 * base de datos de cuentas. Dejarlo en el de siempre hace que cualquier guía de
 * internet valga tal cual para los ficheros de este servidor.
 */
export const SERVER_NAME = 'servertest'

/**
 * Cuenta de administrador que crea el servidor en su primer arranque.
 *
 * El nombre lo fija el juego (`admin`); la contraseña se le pasa por
 * `-adminpassword` para que no se quede esperando en la consola, que es lo que
 * hace si no se la das.
 */
export const ADMIN_USER = 'admin'

/** Lo que tarda como mucho el primer arranque, que genera el mundo. */
export const FIRST_START_TIMEOUT_MS = 600_000

/**
 * Plazo de gracia al parar con `quit`.
 *
 * Medido: entre 8 y 11 segundos en un mundo recién creado. Se da mucho más
 * margen porque lo que se está esperando es que termine de volcar la partida.
 */
export const STOP_GRACE_MS = 180_000

/**
 * Longitud mínima de las contraseñas que pide la app.
 *
 * El servidor acepta cualquier cosa; quien lo exige es la app, porque la
 * cuenta de administrador manda sobre la partida entera.
 */
export const MIN_PASSWORD_LENGTH = 5

// --- Dificultad ---------------------------------------------------------------

/**
 * Preajuste de dificultad, de los que trae el propio juego.
 *
 * Son los cinco ficheros de `media/lua/shared/Sandbox/` más el de serie
 * (`survivor`), que es el `SandboxVars.lua` sin tocar. Los nombres y las
 * descripciones son los del juego en español (`Translate/ES/UI.json`), para
 * que el asistente diga exactamente lo mismo que el menú de Zomboid.
 */
export type ZomboidPreset =
  | 'survivor'
  | 'apocalypse'
  | 'outbreak'
  | 'rising'
  | 'extinction'
  | 'sixmonths'

export interface PresetInfo {
  id: ZomboidPreset
  /** Fichero de `media/lua/shared/Sandbox/`, o null si es el de serie. */
  file: string | null
  name: string
  description: string
}

export const PRESETS: PresetInfo[] = [
  {
    id: 'rising',
    file: 'Rising.lua',
    name: 'Alzamiento',
    description:
      'Un entorno más acogedor y menos estresante para quienes sueñan con construir la granja ' +
      'perfecta de superviviente. Pero no bajes la guardia.'
  },
  {
    id: 'survivor',
    file: null,
    name: 'Superviviente',
    description:
      'Combate potente. Mayor expectativa de vida. Un desafío basado en el anterior modo ' +
      'Supervivencia de PZ.'
  },
  {
    id: 'apocalypse',
    file: 'Apocalypse.lua',
    name: 'Apocalipsis',
    description:
      'La experiencia canónica de Zomboid. Tomate tu tiempo, extrema la precaución y vigila tu espalda.'
  },
  {
    id: 'outbreak',
    file: 'Outbreak.lua',
    name: 'Brote',
    description:
      'Una experiencia acelerada para jugadores con menos tiempo para jugar. Menos farmeo, más ' +
      'botín, misma letalidad.'
  },
  {
    id: 'sixmonths',
    file: 'SixMonthsLater.lua',
    name: '6 meses después',
    description:
      'Horda grande, casas saqueadas y un mundo cubierto por la naturaleza. Sin agua ni ' +
      'electricidad. Para jugadores expertos.'
  },
  {
    id: 'extinction',
    file: 'Extinction.lua',
    name: 'Extinción',
    description:
      'Un mundo brutal e implacable donde todo quiere verte muerto ahora mismo. No recomendado ' +
      'para jugadores nuevos.'
  }
]

export function presetInfo(id: ZomboidPreset): PresetInfo {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[1]!
}

// --- Las pocas reglas del modo básico -----------------------------------------

/**
 * Las opciones de la partida que se enseñan en el modo básico.
 *
 * El `SandboxVars.lua` tiene más de 300 opciones: enseñarlas todas en básico
 * sería justo lo contrario de lo que el modo básico promete. Estas seis son las
 * que de verdad cambian cómo se juega, y todas las demás están en avanzado con
 * su explicación (la que escribe el propio juego en el fichero).
 *
 * Cada una es una clave real del fichero y sus valores son los que acepta el
 * juego; lo comprobado es que existen en el `SandboxVars.lua` de la Build 42.20.
 */
export interface SandboxChoice {
  /** Clave dentro de `SandboxVars`, tal cual. */
  key: string
  label: string
  help: string
  options: { value: number; label: string }[]
}

export const BASIC_SANDBOX: SandboxChoice[] = [
  {
    key: 'Zombies',
    label: 'Cuántos zombis hay',
    help: 'Lo que más cambia la partida. «Normal» es lo que trae el juego.',
    options: [
      { value: 6, label: 'Ninguno' },
      { value: 5, label: 'Pocos' },
      { value: 4, label: 'Normal' },
      { value: 3, label: 'Muchos' },
      { value: 2, label: 'Muchísimos' },
      { value: 1, label: 'Zombicidio' }
    ]
  },
  {
    key: 'ZombieRespawn',
    label: 'Si vuelven a aparecer',
    help: 'Si los zombis reaparecen en zonas ya limpiadas. Sin reaparición, una zona limpia se queda limpia.',
    options: [
      { value: 4, label: 'No reaparecen' },
      { value: 3, label: 'Pocos' },
      { value: 2, label: 'Normal' },
      { value: 1, label: 'Muchos' }
    ]
  },
  {
    key: 'DayLength',
    label: 'Cuánto dura un día',
    help: 'En tiempo real. Los días largos dan para más, pero también se pasa más hambre.',
    options: [
      { value: 2, label: '30 minutos' },
      { value: 3, label: '1 hora' },
      { value: 4, label: '1 hora y media' },
      { value: 5, label: '2 horas' },
      { value: 7, label: '4 horas' },
      { value: 27, label: 'Tiempo real' }
    ]
  },
  {
    key: 'WaterShut',
    label: 'Cuándo se corta el agua',
    help: 'Cuánto tarda en irse el agua corriente. Marca el ritmo de la partida entera.',
    options: [
      { value: 1, label: 'Enseguida' },
      { value: 2, label: 'En 0-30 días' },
      { value: 3, label: 'En 0-2 meses' },
      { value: 4, label: 'En 0-6 meses' },
      { value: 9, label: 'Nunca' }
    ]
  },
  {
    // ⚠ Los números son los mismos que los del agua, pero los tramos NO: aquí
    // el 2 son «14-30 días», no «0-30». Copiar los del agua diría una cosa por
    // otra.
    key: 'ElecShut',
    label: 'Cuándo se corta la luz',
    help: 'Lo mismo con la electricidad. Sin luz no hay neveras ni cocinas eléctricas.',
    options: [
      { value: 1, label: 'Enseguida' },
      { value: 2, label: 'En 14-30 días' },
      { value: 3, label: 'En 14 días - 2 meses' },
      { value: 4, label: 'En 14 días - 6 meses' },
      { value: 9, label: 'Nunca' }
    ]
  },
  {
    // En la Build 42 el multiplicador de experiencia no es una clave suelta:
    // vive dentro de `MultiplierConfig`, junto al de cada habilidad.
    key: 'MultiplierConfig.Global',
    label: 'A qué ritmo se sube de nivel',
    help: 'Multiplica la experiencia que se gana en todas las habilidades. Subirlo hace la partida mucho más llevadera.',
    options: [
      { value: 1, label: 'Normal' },
      { value: 2, label: 'El doble' },
      { value: 3, label: 'El triple' },
      { value: 5, label: 'Cinco veces' }
    ]
  }
]

/**
 * Las claves del `servertest.ini` que gestiona la app desde el manifiesto.
 *
 * Se reescriben en cada arranque. El resto del fichero no se toca: el usuario
 * puede editarlo desde la pestaña de ajustes avanzados, y lo que ponga ahí se
 * queda (salvo que sea una de estas, que manda el manifiesto).
 */
export const MANAGED_INI_KEYS = [
  // Las tres de los mods: salen de lo que hay instalado, no se escriben a mano.
  'Mods',
  'Map',
  'WorkshopItems',
  'DefaultPort',
  'UDPPort',
  'PublicName',
  'PublicDescription',
  'Public',
  'Password',
  'MaxPlayers',
  'PVP',
  'Open',
  'RCONPort',
  'RCONPassword',
  'SteamVAC',
  'UPnP'
] as const

/** Lo propio de un servidor de Zomboid dentro del manifiesto (`manifest.data`). */
export interface ZomboidData {
  /**
   * Contraseña de la cuenta `admin`, la que manda sobre la partida.
   *
   * Se guarda porque va en la línea de órdenes de cada arranque
   * (`-adminpassword`) y porque el usuario tiene que poder leerla para entrar
   * como administrador desde el juego.
   */
  adminPassword: string
  /** Contraseña para entrar. Vacía = entra cualquiera que tenga la dirección. */
  password: string
  /** Descripción que se ve en el navegador de servidores. */
  description: string
  maxPlayers: number
  pvp: boolean
  /**
   * Cualquiera puede crearse una cuenta al entrar (`Open` del `.ini`).
   *
   * Con esto apagado hay que darle de alta a mano a cada jugador desde la
   * pestaña de moderación, que es la lista blanca de Zomboid.
   */
  openToNewPlayers: boolean
  /**
   * Los mods del taller que el usuario ha añadido, en el orden en que se
   * cargan (el último gana cuando dos tocan lo mismo).
   *
   * Aquí solo va la **intención**: qué objetos quiso y en qué orden. Lo demás
   * —qué mods trae cada uno, qué versión, si aporta mapas— se lee del disco al
   * enseñarlos, porque es estado derivado y puede cambiar cuando el autor
   * actualice el mod.
   */
  mods: ZomboidModRef[]
  /** Preajuste de dificultad con el que se creó la partida. */
  preset: ZomboidPreset
  /**
   * Las reglas que el asistente cambió sobre el preajuste, por su clave del
   * `SandboxVars.lua` (`Zombies`, `MultiplierConfig.Global`…).
   *
   * Se guardan para poder volver a aplicarlas si alguna vez se restablece la
   * dificultad: el preajuste solo sabe de sí mismo y, sin esto, se llevaría por
   * delante lo que el usuario eligió al crear el servidor.
   */
  sandbox: Record<string, number>
  /** Memoria de la JVM, en MB (`-Xmx`). */
  memoryMb: number
  /**
   * Arrancar con Steam (`-Dzomboid.steam=1`).
   *
   * ⚠ Con esto el servidor **aparece en el navegador de servidores de Steam**
   * con la dirección de internet del usuario, aunque `Public` esté en false: lo
   * dice el propio `.ini`. Por eso viene apagado y se pregunta antes.
   *
   * A cambio, con Steam el servidor sí contesta a las consultas de estado (A2S)
   * y hay VAC.
   */
  useSteam: boolean
  /**
   * Puerto y contraseña de RCON, que genera la app.
   *
   * No son opcionales: sin RCON la app no sabe quién está dentro (el servidor
   * no lo cuenta de forma fiable por el registro) ni puede moderar. Y sin
   * contraseña el servidor **ni siquiera abre el puerto** (comprobado).
   *
   * ⚠ A diferencia de Factorio, Zomboid **no deja elegir en qué dirección
   * escucha**: lo abre en 0.0.0.0, o sea, en toda la red local (visto en
   * netstat). Por eso la contraseña la genera la app al azar y es larga, y por
   * eso este puerto no se lista nunca entre los que hay que abrir en el router.
   */
  rconPort: number
  rconPassword: string
  /** Rama de Steam instalada. Si falta, la pública. */
  branch?: string
  /** Build de Steam instalada, para saber si hay actualización. */
  buildId?: string
  /** Versión tal como la escribe el servidor al arrancar («42.20.4»). */
  gameVersion?: string
}

/** Lo que el asistente elige para un servidor de Zomboid nuevo. */
export interface ZomboidCreateOptions {
  adminPassword: string
  password?: string
  description?: string
  maxPlayers?: number
  pvp?: boolean
  openToNewPlayers?: boolean
  preset: ZomboidPreset
  memoryMb?: number
  useSteam?: boolean
  /** Ajustes de la partida elegidos en el asistente (`BASIC_SANDBOX`). */
  sandbox?: Record<string, number>
}

// --- Mods -----------------------------------------------------------------------

/**
 * Un objeto del taller añadido al servidor, tal como se guarda en el manifiesto.
 *
 * `workshopId` es lo único imprescindible: con él se vuelve a descargar. El
 * título se guarda para poder enseñar la lista sin tener que preguntarle a
 * Steam ni leer el disco.
 */
export interface ZomboidModRef {
  /** Identificador del objeto en el taller («3802614552»). */
  workshopId: string
  /** Como se llamaba cuando se añadió. */
  title: string
  /**
   * Las carpetas que dejó en `Zomboid/mods`.
   *
   * Hace falta porque **un objeto del taller puede traer varios mods**: sin
   * esto no se sabría cuáles quitar al borrarlo ni cuáles son suyos al
   * enseñarlos.
   */
  folders: string[]
  /** Apagarlo lo quita de la partida sin borrarlo del disco. */
  enabled: boolean
  /** Cuándo lo actualizó su autor por última vez, para saber si hay novedades. */
  updatedAt?: string
  addedAt: string
}

/**
 * Un mod ya instalado, leído del disco.
 *
 * ⚠ **Un objeto del taller puede traer varios mods.** Lo que se descarga es el
 * objeto; lo que se activa en `Mods=` son los identificadores de cada mod que
 * hay dentro, que salen de su `mod.info`.
 */
export interface ZomboidMod {
  /** De qué objeto del taller salió. */
  workshopId: string
  /** El identificador de carga, que es lo que va en `Mods=`. */
  id: string
  name: string
  author?: string
  description?: string
  /** Carpeta suya dentro de `Zomboid/mods`. */
  folder: string
  /**
   * Carpetas de versión que trae el mod («42.20», «41»).
   *
   * ⚠ La Build 42 **exige** que el `mod.info` y el contenido vivan dentro de
   * una de ellas: un mod al estilo antiguo, con todo en la raíz, el servidor
   * ni lo encuentra (comprobado).
   */
  versions: string[]
  /** La que usaría este servidor, o null si ninguna le sirve. */
  version: string | null
  /** Mapas que aporta y que además hay que poner en `Map=`. */
  maps: string[]
  /** Otros mods que necesita, por identificador. */
  requires: string[]
  sizeBytes: number
}

/** Lo que se enseña en la pestaña de mods: lo pedido y lo que hay en disco. */
export interface ZomboidModEntry {
  ref: ZomboidModRef
  /** Los mods que trae ese objeto. Vacío si todavía no se ha descargado. */
  mods: ZomboidMod[]
  /** Por qué este objeto no va a funcionar, si es que no va a funcionar. */
  problem?: string
}

/** El mapa que trae el juego, que va siempre el último de `Map=`. */
export const BASE_MAP = 'Muldraugh, KY'

/**
 * De un enlace del taller o de un número suelto, el identificador.
 *
 * La gente copia la URL entera de la barra del navegador, así que aceptar solo
 * el número sería hacerle un trabajo que puede hacer la app.
 */
export function workshopIdFrom(text: string): string | null {
  const limpio = text.trim()
  const enLaUrl = /[?&]id=(\d+)/.exec(limpio)
  if (enLaUrl) return enLaUrl[1]!
  return /^\d{6,20}$/.test(limpio) ? limpio : null
}

/**
 * El valor de `Mods=`: los identificadores de los mods activos, en orden.
 *
 * El orden es el de la lista del usuario, y decide quién pisa a quién cuando
 * dos mods tocan lo mismo.
 */
export function modsSetting(entries: ZomboidModEntry[]): string {
  return entries
    .filter((entry) => entry.ref.enabled)
    .flatMap((entry) => entry.mods.filter((mod) => mod.version !== null).map((mod) => mod.id))
    .join(';')
}

/**
 * El valor de `Map=`: los mapas de los mods y, **al final, el del juego**.
 *
 * El orden importa y el último es el que pone el terreno de base: si
 * `Muldraugh, KY` no va el último, los mapas de los mods no se superponen bien.
 */
export function mapSetting(entries: ZomboidModEntry[]): string {
  const deMods = entries
    .filter((entry) => entry.ref.enabled)
    .flatMap((entry) => entry.mods.filter((mod) => mod.version !== null).flatMap((mod) => mod.maps))
  return [...new Set([...deMods, BASE_MAP])].join(';')
}

// --- Moderación ---------------------------------------------------------------

/**
 * Los siete niveles de acceso de Zomboid, tal como los define el propio
 * servidor en su base de datos (tabla `role`), con su descripción traducida.
 *
 * No son listas de texto como en Valheim ni dos ficheros como en Factorio: aquí
 * cada cuenta tiene un nivel, y vetar a alguien es ponerle el nivel `banned`.
 */
export type ZomboidRole =
  | 'banned'
  | 'user'
  | 'priority'
  | 'observer'
  | 'gm'
  | 'moderator'
  | 'admin'

export interface RoleInfo {
  id: ZomboidRole
  label: string
  help: string
  /** Se ofrece como acción desde la app. Los que no, solo se enseñan. */
  assignable: boolean
}

export const ROLES: RoleInfo[] = [
  { id: 'banned', label: 'Vetado', help: 'No puede entrar.', assignable: true },
  { id: 'user', label: 'Jugador', help: 'Juega y ya está.', assignable: true },
  {
    id: 'priority',
    label: 'Con prioridad',
    help: 'Entra el primero cuando hay cola.',
    assignable: false
  },
  {
    id: 'observer',
    label: 'Observador',
    help: 'Puede teletransportarse y hacerse invulnerable, pero no cambiar nada.',
    assignable: false
  },
  {
    id: 'gm',
    label: 'Máster',
    help: 'Todo lo del observador y además dar objetos y experiencia.',
    assignable: false
  },
  {
    id: 'moderator',
    label: 'Moderador',
    help: 'Puede hacer de todo salvo tocar los roles y los ajustes del servidor.',
    assignable: true
  },
  { id: 'admin', label: 'Administrador', help: 'Manda en todo.', assignable: true }
]

export function roleInfo(id: ZomboidRole): RoleInfo {
  return ROLES.find((r) => r.id === id) ?? ROLES[1]!
}

/** Una cuenta de jugador del servidor, sacada de su base de datos. */
export interface ZomboidAccount {
  username: string
  role: ZomboidRole
  /** Última vez que entró, tal como la anota el servidor, o null si nunca. */
  lastConnection: string | null
  /** true si está conectado ahora mismo. */
  online: boolean
}

/** Una dirección vetada, de la tabla `bannedip` del servidor. */
export interface ZomboidBannedIp {
  ip: string
  username: string | null
  reason: string | null
}

/** Puerto de datos de jugador: siempre el siguiente al de juego (`UDPPort`). */
export function udpPortFor(gamePort: number): number {
  return gamePort + 1
}
