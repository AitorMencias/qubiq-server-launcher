import type { ModRef } from '../mods'

/**
 * Tipos de Rust compartidos entre el núcleo y la interfaz.
 *
 * Rust es el juego más pesado de la app y el único con fecha de caducidad: el
 * primer jueves de cada mes Facepunch publica un parche que obliga a actualizar
 * el servidor y que empieza un mapa nuevo (el «borrado» o *wipe*). A cambio es
 * de los más cómodos de gobernar desde fuera, porque todo va por su consola
 * remota por WebSocket (WebRCON).
 *
 * Todo lo de este fichero está medido contra el servidor real (protocolo 2633,
 * build 25454815, `rust-fase7.mjs` en el material de desarrollo), no copiado de
 * una wiki (ANALISIS.md §19.27):
 *
 * 1. **No se puede dejar de publicar.** No hay ninguna variable para quedar
 *    fuera de la lista de Steam (revisado en su ensamblado): en cuanto arranca
 *    se anuncia con la IP de casa, igual que Enshrouded.
 * 2. **No lee la entrada estándar.** Todo —parar, guardar, moderar, la consola
 *    de la app— va por WebRCON, como Factorio con su RCON.
 * 3. **Una orden por WebRCON devuelve VARIAS respuestas** con el mismo
 *    identificador (una por línea que escribe mientras la cumple), y una orden
 *    que no existe **no devuelve ninguna**.
 * 4. **La línea de órdenes manda sobre `server.cfg`**: con el nombre puesto en
 *    los dos sitios, gana el de la línea de órdenes.
 * 5. **El mapa se genera al arrancar** y tarda según su tamaño: medido, 171 s
 *    con 3000 y 306 s con 4000 la primera vez; 13 s las siguientes.
 *
 * No debe importar nada de Node ni de Electron.
 */

/** El servidor dedicado de Rust en Steam. Se baja de forma anónima. */
export const RUST_APP_ID = 258550

/**
 * Y esta es la app del **juego**, que es con la que se registra el servidor en
 * Steam. Medido en la consulta de Steam: `gameid` 252490.
 */
export const RUST_GAME_APP_ID = 252490

/** Puerto de juego por defecto, UDP. */
export const DEFAULT_GAME_PORT = 28015

/**
 * La consola remota va en el siguiente, por TCP, y **solo en 127.0.0.1**.
 *
 * Medido con `netstat`: sin `rcon.ip`, Rust la abre en `0.0.0.0`, o sea, a toda
 * la red de casa. Con la contraseña que genera la app no entraría nadie, pero
 * no hay motivo para dejarla a la vista: la usa la app y nadie más.
 */
export function rconPortFor(gamePort: number): number {
  return gamePort + 1
}

/**
 * La consulta de Steam, en el de después, por UDP.
 *
 * Como los tres alternan protocolo (UDP, TCP, UDP), un segundo servidor en el
 * puerto siguiente no choca con el primero: su juego va por UDP donde el otro
 * tiene su consola por TCP.
 */
export function queryPortFor(gamePort: number): number {
  return gamePort + 2
}

/**
 * Rust+ (la app del móvil) usa un puerto TCP propio. Rust lo pone en el de
 * juego más 67 si no se le dice otro; la app lo fija ahí para saber cuál es.
 */
export function rustPlusPortFor(gamePort: number): number {
  return gamePort + 67
}

/** Memoria del equipo, en GB. Medido: 4,2 GB de pico con un mapa de 3000. */
export const MEMORY_MIN_GB = 4
export const MEMORY_RECOMMENDED_GB = 8

/**
 * Jugadores. El juego aguanta cientos, pero en un ordenador de casa lo que
 * manda es la memoria y la conexión: por encima de 50 no tiene sentido ofrecerlo.
 */
export const MAX_PLAYERS = 50
export const DEFAULT_MAX_PLAYERS = 8

/** Semilla del mapa: entero positivo de 32 bits, como la acepta el juego. */
export const MAX_SEED = 2_147_483_647

/**
 * Nombre de la identidad del servidor: la carpeta `server/<identidad>`, donde
 * guarda el mapa, los jugadores y su configuración. No lo elige el usuario: así
 * cualquier guía de internet vale tal cual para las rutas de este servidor.
 */
export const IDENTITY = 'qubiq'

/**
 * Plazo de gracia al parar.
 *
 * `quit` por WebRCON guarda y cierra en menos de un segundo con el mundo hecho.
 * Pero mandado **mientras genera el mapa**, el servidor no lo atiende hasta
 * terminar (medido: 90 s de espera con un mapa de 2000), y un mapa grande tarda
 * más de cinco minutos. Matarlo a medias podría dejar el fichero del mapa roto,
 * así que se espera.
 */
export const STOP_GRACE_MS = 15 * 60_000

// --- El mapa --------------------------------------------------------------------

export interface WorldSizeInfo {
  size: number
  label: string
  /** Para cuánta gente está pensado, dicho como lo diría alguien que juega. */
  players: string
  /** Memoria que usa, medida con el servidor vacío. */
  memoryGb: number
  /** Lo que tarda en generarse la primera vez, medido. */
  firstStart: string
}

/**
 * Tamaños de mapa que ofrece el asistente.
 *
 * Medidos arrancando el servidor real una vez con cada uno, sin nadie dentro:
 * pico de memoria del proceso y tiempo hasta «Server startup complete» la
 * primera vez, que es cuando genera el mapa (2000: 109 s y 3,2 GB; 3000: 171 s
 * y 4,2 GB; 4000: 306 s y 5,6 GB). Las siguientes veces arranca en segundos.
 */
export const WORLD_SIZES: WorldSizeInfo[] = [
  {
    size: 2000,
    label: 'Pequeño',
    players: 'para 2 a 4',
    memoryGb: 3.2,
    firstStart: 'unos 2 minutos'
  },
  {
    size: 3000,
    label: 'Mediano',
    players: 'para 4 a 10',
    memoryGb: 4.2,
    firstStart: 'unos 3 minutos'
  },
  {
    size: 4000,
    label: 'Grande',
    players: 'para 10 o más',
    memoryGb: 5.6,
    firstStart: 'unos 5 minutos'
  }
]

/** El que propone el asistente: el de un grupo de amigos. */
export const DEFAULT_WORLD_SIZE = 3000

/** Lo que acepta el juego: por debajo de 1000 no hay monumentos; por encima de 6000, no cabe. */
export const MIN_WORLD_SIZE = 1000
export const MAX_WORLD_SIZE = 6000

export function worldSizeInfo(size: number): WorldSizeInfo | undefined {
  return WORLD_SIZES.find((w) => w.size === size)
}

/** «Mediano (3000 m)» o «3500 m» si no es uno de los de la lista. */
export function worldSizeLabel(size: number): string {
  const info = worldSizeInfo(size)
  return info ? `${info.label} (${size} m)` : `${size} m`
}

export function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED) + 1
}

// --- El borrado mensual -----------------------------------------------------------

/**
 * Qué hacer con el borrado de cada mes.
 *
 * El borrado forzado lo hace el propio juego: el parche del primer jueves
 * cambia la versión de guardado y el servidor, al arrancar actualizado, ya no
 * encuentra su mapa y hace uno nuevo. Lo que decide el usuario es lo demás:
 * si la app lo hace sola en cuanto sale el parche, si el mapa nuevo cambia de
 * forma y si los planos aprendidos se van también.
 */
export interface RustWipePlan {
  /** La app actualiza y borra sola en cuanto Facepunch publica el parche. */
  auto: boolean
  /** Cada mapa nuevo con otra semilla, o sea, con otra forma. */
  newSeed: boolean
  /** Borrar también los planos aprendidos (*blueprints*). */
  blueprints: boolean
  /** Mes cuyo aviso ya se descartó («2026-10»), para no repetirlo. */
  dismissed?: string
  /** Mes cuyo borrado forzado ya está hecho, para no repetirlo. */
  doneMonth?: string
}

export const DEFAULT_WIPE_PLAN: RustWipePlan = {
  auto: false,
  newSeed: true,
  blueprints: false
}

/** «2026-10»: la clave de un mes para los avisos. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * ¿Es horario de verano en Londres en ese instante?
 *
 * Del último domingo de marzo a la 1:00 UTC al último domingo de octubre a la
 * 1:00 UTC, que es la regla de toda la UE y el Reino Unido.
 */
function londonSummerTime(date: Date): boolean {
  const year = date.getUTCFullYear()
  const lastSunday = (month: number): Date => {
    const last = new Date(Date.UTC(year, month + 1, 0, 1))
    last.setUTCDate(last.getUTCDate() - last.getUTCDay())
    return last
  }
  return date >= lastSunday(2) && date < lastSunday(9)
}

/**
 * El borrado forzado de un mes: el primer jueves, a las 19:00 de Londres.
 *
 * Es la hora a la que Facepunch publica el parche (las 20:00 en España, que
 * cambia de hora a la vez que el Reino Unido). A partir de ahí un servidor sin
 * actualizar deja de aceptar a quien ya tiene el juego al día.
 */
export function forcedWipeOf(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month, 1, 19))
  const offset = (4 - first.getUTCDay() + 7) % 7
  const thursday = new Date(Date.UTC(year, month, 1 + offset, 19))
  // 19:00 de Londres son las 18:00 UTC en verano y las 19:00 en invierno.
  if (londonSummerTime(thursday)) thursday.setUTCHours(18)
  return thursday
}

/**
 * El próximo borrado forzado a partir de `now`.
 *
 * El de este mes sigue siendo «el próximo» durante tres días después de la
 * hora: es el margen en el que tiene sentido avisar de que ya ha pasado y aún
 * no se ha hecho.
 */
export function nextForcedWipe(now: Date, graceDays = 3): Date {
  const thisMonth = forcedWipeOf(now.getUTCFullYear(), now.getUTCMonth())
  if (now.getTime() < thisMonth.getTime() + graceDays * 86_400_000) return thisMonth
  return forcedWipeOf(now.getUTCFullYear(), now.getUTCMonth() + 1)
}

/** En qué punto está el borrado de este mes, para el aviso de la pantalla. */
export type WipeMoment =
  /** Faltan más de dos días: no hay nada que decir. */
  | 'lejos'
  /** Faltan dos días o menos. */
  | 'cerca'
  /** Ya es la hora y el parche puede estar fuera. */
  | 'hoy'

export function wipeMoment(now: Date, wipe: Date): WipeMoment {
  const diff = wipe.getTime() - now.getTime()
  if (diff <= 0) return 'hoy'
  if (diff <= 2 * 86_400_000) return 'cerca'
  return 'lejos'
}

// --- Ajustes ---------------------------------------------------------------------

export type RustSettingValue = number | boolean | string

/** Cómo se enseña y qué admite cada variable del servidor que ofrece la app. */
export interface RustSettingInfo {
  /** El nombre de la variable tal como la entiende el servidor. */
  key: string
  label: string
  help: string
  group: 'partida' | 'construir' | 'jugadores' | 'lista'
  /** Se ofrece en el modo básico. Las demás, solo en avanzado. */
  basic?: boolean
  /** Valor de serie, leído del propio servidor con `find` (grabado). */
  default: RustSettingValue
  kind:
    | { type: 'switch' }
    | { type: 'number'; min: number; max: number; step?: number; unit?: string }
    /** Se guarda en segundos, que es como la entiende el servidor, y se enseña en minutos. */
    | { type: 'minutes'; min: number; max: number }
    | { type: 'text'; placeholder?: string }
}

/**
 * Las variables del servidor que se pueden tocar desde la app.
 *
 * Son pocas a propósito: Rust tiene cientos, casi todas de ajuste fino del
 * motor. Estas son las que cambian cómo se juega. Cada una está comprobada
 * contra el servidor real con `find <variable>`, que devuelve su ayuda y su
 * valor de serie (`fixtures/rust/variables.txt`): el smoke falla si alguna deja
 * de existir.
 */
export const RUST_SETTINGS: RustSettingInfo[] = [
  {
    key: 'server.pve',
    label: 'Sin peleas entre jugadores',
    help:
      'Los jugadores no se pueden hacer daño entre ellos. Los animales, los científicos y el ' +
      'entorno siguen matando igual.',
    group: 'partida',
    basic: true,
    default: false,
    kind: { type: 'switch' }
  },
  {
    key: 'server.radiation',
    label: 'Radiación en los monumentos',
    help: 'Apagada, se puede entrar en cualquier monumento sin traje ni pastillas.',
    group: 'partida',
    default: true,
    kind: { type: 'switch' }
  },
  {
    key: 'craft.instant',
    label: 'Fabricar al instante',
    help: 'Todo se fabrica sin esperar. Cambia mucho el ritmo de la partida.',
    group: 'partida',
    default: false,
    kind: { type: 'switch' }
  },
  {
    key: 'server.planttickscale',
    label: 'Velocidad de las plantas',
    help: 'Con 2, los cultivos crecen el doble de rápido.',
    group: 'partida',
    default: 1,
    kind: { type: 'number', min: 0.1, max: 10, step: 0.1, unit: '×' }
  },
  {
    key: 'server.itemdespawn',
    label: 'Lo tirado al suelo dura',
    help: 'Lo que se tira o se cae al morir desaparece pasado este tiempo.',
    group: 'partida',
    default: 300,
    kind: { type: 'minutes', min: 1, max: 120 }
  },
  {
    key: 'decay.scale',
    label: 'Deterioro de las construcciones',
    help:
      'Con 1 las bases se deterioran como en el juego normal si no se pagan; con 0 no se ' +
      'deterioran nunca. Con pocos jugadores, 0 evita volver y encontrarse la base caída.',
    group: 'construir',
    basic: true,
    default: 1,
    kind: { type: 'number', min: 0, max: 5, step: 0.1, unit: '×' }
  },
  {
    key: 'server.stability',
    label: 'Las construcciones se pueden derrumbar',
    help: 'Apagado, nada se cae aunque se quiten los apoyos.',
    group: 'construir',
    default: true,
    kind: { type: 'switch' }
  },
  {
    key: 'relationshipmanager.maxteamsize',
    label: 'Tamaño máximo de un equipo',
    help: 'Cuántos pueden ir en el mismo equipo. Con 0 no hay equipos.',
    group: 'jugadores',
    default: 8,
    kind: { type: 'number', min: 0, max: 50, unit: 'jugadores' }
  },
  {
    key: 'server.idlekick',
    label: 'Echar a quien se queda quieto',
    help: 'Minutos sin hacer nada antes de que el servidor lo eche. Con 0, nunca.',
    group: 'jugadores',
    default: 30,
    kind: { type: 'number', min: 0, max: 600, unit: 'min' }
  },
  {
    key: 'chat.localchat',
    label: 'Chat solo de cerca',
    help: 'Encendido, los mensajes solo los leen quienes están a menos de 100 metros.',
    group: 'jugadores',
    default: false,
    kind: { type: 'switch' }
  },
  {
    key: 'server.saveinterval',
    label: 'Guardar cada',
    help: 'Cada cuánto guarda el servidor por su cuenta. Parar el servidor desde la app guarda siempre.',
    group: 'partida',
    default: 600,
    kind: { type: 'minutes', min: 1, max: 60 }
  },
  {
    key: 'server.url',
    label: 'Página web',
    help: 'Un enlace que sale en la ficha del servidor dentro del juego. Opcional.',
    group: 'lista',
    default: '',
    kind: { type: 'text', placeholder: 'https://…' }
  },
  {
    key: 'server.headerimage',
    label: 'Imagen de cabecera',
    help: 'Dirección de una imagen de 512×256 que sale en la ficha del servidor. Opcional.',
    group: 'lista',
    default: '',
    kind: { type: 'text', placeholder: 'https://…/imagen.png' }
  }
]

export const RUST_SETTING_GROUPS: { id: RustSettingInfo['group']; label: string }[] = [
  { id: 'partida', label: 'La partida' },
  { id: 'construir', label: 'Construir' },
  { id: 'jugadores', label: 'Los jugadores' },
  { id: 'lista', label: 'En la lista del juego' }
]

export type RustSettings = Record<string, RustSettingValue>

export function settingInfo(key: string): RustSettingInfo | undefined {
  return RUST_SETTINGS.find((s) => s.key === key)
}

/** Solo lo que se aparta de lo de serie: es lo único que hay que pasarle al servidor. */
export function changedSettings(settings: RustSettings): RustSettings {
  const out: RustSettings = {}
  for (const info of RUST_SETTINGS) {
    const value = settings[info.key]
    if (value !== undefined && value !== info.default) out[info.key] = value
  }
  return out
}

/** El valor de un ajuste o, si no se ha tocado, el de serie. */
export function settingValue(settings: RustSettings, key: string): RustSettingValue {
  return settings[key] ?? settingInfo(key)?.default ?? ''
}

// --- Oxide -------------------------------------------------------------------------

/**
 * Oxide instalado en el servidor.
 *
 * `added` son los ficheros que puso y que el juego no traía: quitar Oxide es
 * borrarlos y dejar que SteamCMD valide la instalación, que devuelve los que
 * sustituyó (medido: 14 s y los DLL quedan idénticos a los originales).
 */
export interface RustOxide {
  version: string
  /** Rutas relativas a la carpeta del servidor, con barras normales. */
  added: string[]
  /**
   * La build de Rust para la que se instaló. Si el juego se actualiza y no hay
   * Oxide nueva todavía, el servidor arranca sin él y esto dice por qué.
   */
  buildId?: string
  /** Oxide está puesto pero la última actualización del juego lo quitó. */
  pending?: boolean
}

// --- Datos del servidor ---------------------------------------------------------

export interface RustData {
  description: string
  worldSize: number
  seed: number
  maxPlayers: number
  /** Contraseña de WebRCON. La genera la app; no la escribe nadie. */
  rconPassword: string
  /** La app del móvil de Rust. Apagada, no hace falta abrir su puerto. */
  rustPlus: boolean
  /** Variables del servidor que se apartan de lo de serie. */
  settings: RustSettings
  wipe: RustWipePlan
  /** Cuándo empezó el mapa actual, según la app (borrado hecho desde aquí). */
  lastWipeAt?: string
  /**
   * Rama de Steam. Si falta, la pública: es lo que había antes de poder
   * elegir y lo que Steam instala por defecto.
   */
  branch?: string
  buildId?: string
  /** Versión de red del juego («2633»), la que anuncia en su consulta de Steam. */
  gameVersion?: string
  oxide?: RustOxide
  /** Plugins de Oxide instalados desde la app. */
  plugins?: ModRef[]
}

export interface RustCreateOptions {
  description?: string
  worldSize: number
  seed?: number
  maxPlayers?: number
  settings?: RustSettings
  wipe?: Partial<RustWipePlan>
  rustPlus?: boolean
}

// --- Lo que ven las pantallas ----------------------------------------------------

export interface RustConfigView {
  description: string
  maxPlayers: number
  rustPlus: boolean
  /** Todos los ajustes que ofrece la app, con su valor (el de serie si no se ha tocado). */
  settings: RustSettings
}

export interface RustConfigChanges {
  description?: string
  maxPlayers?: number
  rustPlus?: boolean
  settings?: RustSettings
}

/** Un mapa que hay en disco: el actual o los de meses pasados. */
export interface RustMapOnDisk {
  size: number
  seed: number
  /** Versión de guardado: cambia con el parche de cada mes. */
  saveVersion: number
  bytes: number
  /** Cuándo se generó el terreno (el `.map`), o sea, cuándo empezó este mapa. */
  bornAt: string | null
  /** Último guardado de lo construido (el `.sav`). */
  savedAt: string | null
}

/** Lo que la pestaña de Borrado necesita de una vez. */
export interface RustMapView {
  worldSize: number
  seed: number
  plan: RustWipePlan
  /** El borrado forzado que viene (o el de este mes, hasta tres días después). */
  nextForcedWipe: string
  moment: WipeMoment
  /** El de este mes ya está hecho desde la app. */
  doneThisMonth: boolean
  /** Descartado el aviso de este mes. */
  dismissed: boolean
  lastWipeAt: string | null
  current: RustMapOnDisk | null
  /** Todos los mapas que hay en disco, incluidos los de meses pasados. */
  maps: RustMapOnDisk[]
}

export interface RustWipeOptions {
  newSeed?: boolean
  blueprints?: boolean
  /** Semilla o tamaño concretos para el mapa nuevo. */
  seed?: number
  worldSize?: number
  /** Actualizar el juego antes, si hay versión nueva. Es el borrado del mes. */
  update?: boolean
}

// --- Moderación ------------------------------------------------------------------

/** Alguien con permisos en el servidor (`users.cfg`). */
export interface RustAdmin {
  steamId: string
  name: string
  /** `owner` puede todo; `moderator` puede moderar pero no tocar la configuración. */
  level: 'owner' | 'moderator'
}

export interface RustBan {
  steamId: string
  name: string
  reason: string
}

/** Un jugador conectado, tal como lo da `playerlist`. */
export interface RustPlayer {
  steamId: string
  name: string
  ping?: number
  connectedSeconds?: number
}

/** El SteamID64 de una cuenta: 17 cifras que empiezan por 7656. */
export function validSteamId(value: string): boolean {
  return /^7656\d{13}$/.test(value.trim())
}

/**
 * Un nombre o un motivo tal como lo acepta la consola de Rust: entre comillas
 * y sin comillas dentro, que la partirían en dos.
 */
export function consoleQuote(value: string): string {
  return `"${value.replace(/["\r\n]/g, "'").trim()}"`
}
