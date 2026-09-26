/**
 * Tipos de Enshrouded compartidos entre el núcleo y la interfaz.
 *
 * Toda la configuración de Enshrouded vive en un único fichero JSON
 * (`enshrouded_server.json`), que el servidor **reescribe** al arrancar: se
 * queda con lo que entiende, completa lo que falta con sus valores de serie y
 * **borra lo que no conoce**. Por eso la app no guarda nada suyo ahí.
 *
 * Todo lo de este fichero está medido contra el servidor real 0.9.0.0 (build
 * `b466cef1500d760b8ba3dda230001923c40d0e12`) arrancándolo y leyendo lo que
 * contesta, no copiado del README ni de una wiki (ANALISIS.md §19.24). El
 * servidor **vuelca por consola los ajustes que de verdad aplica**
 * («[server] Game Settings 'Hard'» y un JSON detrás), así que la lista buena se
 * saca preguntándole.
 *
 * ⚠ Dos sitios donde el README oficial dice otra cosa que el servidor:
 * - la lista de vetados se llama **`bannedAccounts`**, no `bans`;
 * - cada veto lleva **`accountId`** (un número) y **`banDate: { value }`** (un
 *   objeto), no `accountIDHash` ni una fecha suelta.
 *
 * No debe importar nada de Node ni de Electron.
 */

import type { ModRef } from '../mods'

/** El servidor dedicado de Enshrouded es esta aplicación de Steam. */
export const ENSHROUDED_APP_ID = 2278520

/**
 * Y esta es la del juego, la que viaja en la consulta de Steam (`gameId`) y la
 * que hay que mirar para preguntarle al servidor maestro de Valve.
 */
export const ENSHROUDED_GAME_APP_ID = 1203620

/**
 * Puerto por defecto. Es **el único** que abre el servidor: desde el Content
 * Update #2 no hay puerto de juego aparte del de consulta (comprobado con
 * `netstat`: un solo UDP, y el que diga `queryPort`).
 */
export const DEFAULT_QUERY_PORT = 15637

/** Memoria que conviene tener libre, según los requisitos del servidor. */
export const MEMORY_MIN_GB = 6
export const MEMORY_RECOMMENDED_GB = 12

/** Jugadores que admite el servidor. El límite lo pone el juego, no la app. */
export const MAX_PLAYERS = 16

/** Longitud mínima de la contraseña de un rol, que exige la propia app. */
export const MIN_PASSWORD_LENGTH = 6

// --- Dificultad ---------------------------------------------------------------

/**
 * Preajustes de dificultad del juego.
 *
 * `Custom` no es un preajuste más: es «manda lo que diga `gameSettings`». Con
 * cualquiera de los otros cuatro, **el servidor ignora en silencio todos los
 * valores de `gameSettings`** (medido, ver `EFFECTIVE_PRESETS`).
 */
export type EnshroudedPreset = 'Default' | 'Relaxed' | 'Hard' | 'Survival' | 'Custom'

export interface PresetInfo {
  value: EnshroudedPreset
  label: string
  help: string
}

/** Los preajustes, en el orden en que se ofrecen (de más suave a más duro). */
export const PRESETS: PresetInfo[] = [
  {
    value: 'Relaxed',
    label: 'Relajado',
    help: 'Los bichos pegan la mitad, hay menos, y las armas no se rompen. Para construir tranquilos.'
  },
  {
    value: 'Default',
    label: 'Normal',
    help: 'El juego tal y como está pensado. Si no lo tienes claro, este.'
  },
  {
    value: 'Hard',
    label: 'Difícil',
    help: 'Más enemigos, pegan un 50 % más y la experiencia cunde la mitad.'
  },
  {
    value: 'Survival',
    label: 'Supervivencia',
    help: 'Lo anterior y además pasáis hambre, al morir se pierde la mochila entera y las noches son más largas.'
  },
  {
    value: 'Custom',
    label: 'A mi manera',
    help: 'Se ajusta cada cosa por separado. Es el único con el que el servidor hace caso a los ajustes.'
  }
]

export function presetInfo(preset: EnshroudedPreset): PresetInfo {
  return PRESETS.find((p) => p.value === preset) ?? PRESETS[1]!
}

// --- Los ajustes de partida ---------------------------------------------------

export type EnshroudedSettingValue = number | boolean | string

/** Cómo se enseña y qué admite cada ajuste de `gameSettings`. */
export interface SettingInfo {
  key: string
  label: string
  help: string
  /** Dónde encaja, para agrupar la pantalla. */
  group: 'jugador' | 'mundo' | 'enemigos' | 'progreso' | 'tiempo'
  /** Se ofrece en el modo básico. Los demás, solo en avanzado. */
  basic?: boolean
  kind:
    | { type: 'factor'; min: number; max: number }
    | { type: 'switch' }
    | { type: 'choice'; options: { value: string; label: string }[] }
    /** Duración en nanosegundos, que es como la guarda el juego. */
    | { type: 'minutes'; min: number; max: number }
}

const ENEMY_AMOUNT = [
  { value: 'Few', label: 'Pocos' },
  { value: 'Normal', label: 'Normal' },
  { value: 'Many', label: 'Muchos' },
  { value: 'Extreme', label: 'Muchísimos' }
]

/**
 * Los 37 ajustes de partida, con los límites que documenta el fabricante.
 *
 * El orden es el del propio fichero, que es también el del menú del juego.
 */
export const SETTINGS: SettingInfo[] = [
  {
    key: 'playerHealthFactor',
    label: 'Vida de los jugadores',
    help: 'Multiplica la vida máxima. Con 2 aguantáis el doble.',
    group: 'jugador',
    basic: true,
    kind: { type: 'factor', min: 0.25, max: 4 }
  },
  {
    key: 'playerManaFactor',
    label: 'Maná de los jugadores',
    help: 'Multiplica el maná máximo, que es lo que gasta la magia.',
    group: 'jugador',
    kind: { type: 'factor', min: 0.25, max: 4 }
  },
  {
    key: 'playerStaminaFactor',
    label: 'Aguante de los jugadores',
    help: 'Multiplica la resistencia: correr, escalar y pegar.',
    group: 'jugador',
    kind: { type: 'factor', min: 0.25, max: 4 }
  },
  {
    key: 'playerBodyHeatFactor',
    label: 'Aguante al frío',
    help: 'Cuánto se tarda en congelarse en las zonas heladas.',
    group: 'jugador',
    kind: { type: 'factor', min: 0.5, max: 2 }
  },
  {
    key: 'playerDivingTimeFactor',
    label: 'Aire debajo del agua',
    help: 'Cuánto se aguanta buceando antes de ahogarse.',
    group: 'jugador',
    kind: { type: 'factor', min: 0.5, max: 2 }
  },
  {
    key: 'enableDurability',
    label: 'Las armas se desgastan',
    help: 'Apagado, nada se rompe nunca y no hay que reparar.',
    group: 'jugador',
    basic: true,
    kind: { type: 'switch' }
  },
  {
    key: 'enableStarvingDebuff',
    label: 'Se pasa hambre',
    help: 'Encendido, quien no come va perdiendo vida hasta morir.',
    group: 'jugador',
    basic: true,
    kind: { type: 'switch' }
  },
  {
    key: 'foodBuffDurationFactor',
    label: 'Duración de la comida',
    help: 'Cuánto duran los efectos de lo que coméis.',
    group: 'jugador',
    kind: { type: 'factor', min: 0.5, max: 2 }
  },
  {
    key: 'fromHungerToStarving',
    label: 'Aviso antes de pasar hambre',
    help: 'Tiempo con hambre antes de empezar a perder vida.',
    group: 'jugador',
    kind: { type: 'minutes', min: 5, max: 20 }
  },
  {
    key: 'shroudTimeFactor',
    label: 'Tiempo dentro de la niebla',
    help: 'Cuánto se aguanta en la niebla antes de que os mate.',
    group: 'jugador',
    kind: { type: 'factor', min: 0.5, max: 2 }
  },
  {
    key: 'tombstoneMode',
    label: 'Qué se pierde al morir',
    help: 'Dónde acaba lo que llevabas encima.',
    group: 'jugador',
    basic: true,
    kind: {
      type: 'choice',
      options: [
        { value: 'AddBackpackMaterials', label: 'Solo los materiales, en una tumba' },
        { value: 'Everything', label: 'La mochila entera, en una tumba' },
        { value: 'NoTombstone', label: 'Nada: no se pierde nada' }
      ]
    }
  },
  {
    key: 'enableGliderTurbulences',
    label: 'Turbulencias con el planeador',
    help: 'Apagado, el planeador vuela liso, sin corrientes de aire.',
    group: 'mundo',
    kind: { type: 'switch' }
  },
  {
    key: 'weatherFrequency',
    label: 'Cada cuánto cambia el tiempo',
    help: 'Tormentas, lluvia y demás fenómenos.',
    group: 'mundo',
    kind: {
      type: 'choice',
      options: [
        { value: 'Disabled', label: 'Nunca' },
        { value: 'Rare', label: 'Pocas veces' },
        { value: 'Normal', label: 'Normal' },
        { value: 'Often', label: 'A menudo' }
      ]
    }
  },
  {
    key: 'fishingDifficulty',
    label: 'Dificultad de la pesca',
    help: 'Cuánto pelea el pez en el minijuego.',
    group: 'mundo',
    kind: {
      type: 'choice',
      options: [
        { value: 'VeryEasy', label: 'Muy fácil' },
        { value: 'Easy', label: 'Fácil' },
        { value: 'Normal', label: 'Normal' },
        { value: 'Hard', label: 'Difícil' },
        { value: 'VeryHard', label: 'Muy difícil' }
      ]
    }
  },
  {
    key: 'miningDamageFactor',
    label: 'Fuerza al picar',
    help: 'Cuánto terreno se lleva cada golpe y cuánto material suelta.',
    group: 'mundo',
    kind: { type: 'factor', min: 0.5, max: 2 }
  },
  {
    key: 'plantGrowthSpeedFactor',
    label: 'Velocidad de los cultivos',
    help: 'Lo que tardan en crecer las plantas que sembréis.',
    group: 'mundo',
    kind: { type: 'factor', min: 0.25, max: 2 }
  },
  {
    key: 'resourceDropStackAmountFactor',
    label: 'Materiales que sueltan las cosas',
    help: 'Cuánto cae de cada cofre, bicho o roca.',
    group: 'mundo',
    basic: true,
    kind: { type: 'factor', min: 0.25, max: 2 }
  },
  {
    key: 'factoryProductionSpeedFactor',
    label: 'Velocidad de los talleres',
    help: 'Lo que tardan en fabricar los puestos de trabajo.',
    group: 'mundo',
    kind: { type: 'factor', min: 0.25, max: 2 }
  },
  {
    key: 'perkUpgradeRecyclingFactor',
    label: 'Runas que devuelve desguazar',
    help: 'Cuánto se recupera al deshacer una mejora de un arma.',
    group: 'progreso',
    kind: { type: 'factor', min: 0, max: 1 }
  },
  {
    key: 'perkCostFactor',
    label: 'Coste de mejorar armas',
    help: 'Runas que cuesta cada mejora.',
    group: 'progreso',
    kind: { type: 'factor', min: 0.25, max: 2 }
  },
  {
    key: 'experienceCombatFactor',
    label: 'Experiencia por pelear',
    help: 'Lo que cunde matar bichos.',
    group: 'progreso',
    basic: true,
    kind: { type: 'factor', min: 0.25, max: 2 }
  },
  {
    key: 'experienceMiningFactor',
    label: 'Experiencia por picar',
    help: 'Lo que cunde sacar materiales.',
    group: 'progreso',
    kind: { type: 'factor', min: 0, max: 2 }
  },
  {
    key: 'experienceExplorationQuestsFactor',
    label: 'Experiencia por explorar',
    help: 'Lo que cunde descubrir sitios y hacer misiones.',
    group: 'progreso',
    kind: { type: 'factor', min: 0.25, max: 2 }
  },
  {
    key: 'randomSpawnerAmount',
    label: 'Cantidad de enemigos',
    help: 'Cuántos bichos hay sueltos por el mundo.',
    group: 'enemigos',
    basic: true,
    kind: { type: 'choice', options: ENEMY_AMOUNT }
  },
  {
    key: 'aggroPoolAmount',
    label: 'Enemigos que atacan a la vez',
    help: 'Cuántos pueden echársete encima al mismo tiempo.',
    group: 'enemigos',
    kind: { type: 'choice', options: ENEMY_AMOUNT }
  },
  {
    key: 'enemyDamageFactor',
    label: 'Daño de los enemigos',
    help: 'Cuánto pegan los bichos normales.',
    group: 'enemigos',
    basic: true,
    kind: { type: 'factor', min: 0.25, max: 5 }
  },
  {
    key: 'enemyHealthFactor',
    label: 'Vida de los enemigos',
    help: 'Cuánto aguantan los bichos normales.',
    group: 'enemigos',
    kind: { type: 'factor', min: 0.25, max: 4 }
  },
  {
    key: 'enemyStaminaFactor',
    label: 'Aguante de los enemigos',
    help: 'Cuesta más aturdirlos cuanto más alto.',
    group: 'enemigos',
    kind: { type: 'factor', min: 0.5, max: 2 }
  },
  {
    key: 'enemyPerceptionRangeFactor',
    label: 'Vista y oído de los enemigos',
    help: 'Desde cuán lejos te ven o te oyen.',
    group: 'enemigos',
    kind: { type: 'factor', min: 0.5, max: 2 }
  },
  {
    key: 'bossDamageFactor',
    label: 'Daño de los jefes',
    help: 'Los jefes van aparte de los bichos normales.',
    group: 'enemigos',
    kind: { type: 'factor', min: 0.2, max: 5 }
  },
  {
    key: 'bossHealthFactor',
    label: 'Vida de los jefes',
    help: 'Cuánto aguantan los jefes.',
    group: 'enemigos',
    kind: { type: 'factor', min: 0.2, max: 5 }
  },
  {
    key: 'threatBonus',
    label: 'Frecuencia de los ataques',
    help: 'Cada cuánto os atacan los bichos (los jefes no).',
    group: 'enemigos',
    kind: { type: 'factor', min: 0.25, max: 4 }
  },
  {
    key: 'pacifyAllEnemies',
    label: 'Enemigos pacíficos',
    help: 'Encendido, no atacan si no se les ataca. Los jefes sí.',
    group: 'enemigos',
    basic: true,
    kind: { type: 'switch' }
  },
  {
    key: 'tamingStartleRepercussion',
    label: 'Si asustas a un animal al domarlo',
    help: 'Qué pasa con lo que llevabas avanzado.',
    group: 'mundo',
    kind: {
      type: 'choice',
      options: [
        { value: 'KeepProgress', label: 'No se pierde nada' },
        { value: 'LoseSomeProgress', label: 'Se pierde un poco' },
        { value: 'LoseAllProgress', label: 'Se pierde todo' }
      ]
    }
  },
  {
    key: 'dayTimeDuration',
    label: 'Duración del día',
    help: 'Cuánto dura la parte de día.',
    group: 'tiempo',
    kind: { type: 'minutes', min: 2, max: 60 }
  },
  {
    key: 'nightTimeDuration',
    label: 'Duración de la noche',
    help: 'Cuánto dura la parte de noche.',
    group: 'tiempo',
    kind: { type: 'minutes', min: 2, max: 60 }
  },
  {
    key: 'curseModifier',
    label: 'Maldición de la niebla',
    help: 'Probabilidad de acabar maldito al recibir según qué golpes.',
    group: 'mundo',
    kind: {
      type: 'choice',
      options: [
        { value: 'Easy', label: 'Desactivada' },
        { value: 'Normal', label: 'Normal' },
        { value: 'Hard', label: 'El doble de probable' }
      ]
    }
  }
]

export const SETTING_GROUPS: { id: SettingInfo['group']; label: string }[] = [
  { id: 'jugador', label: 'Los jugadores' },
  { id: 'enemigos', label: 'Los enemigos' },
  { id: 'mundo', label: 'El mundo' },
  { id: 'progreso', label: 'Progresar' },
  { id: 'tiempo', label: 'Día y noche' }
]

export type EnshroudedSettings = Record<string, EnshroudedSettingValue>

/**
 * Lo que aplica de verdad cada preajuste, **medido arrancando el servidor una
 * vez con cada uno** y leyendo el volcado que hace por consola.
 *
 * Sirve para dos cosas: enseñar en qué se nota elegir uno, y —lo importante—
 * poder partir de sus valores reales cuando el usuario pasa a «A mi manera»,
 * en vez de dejarle los de Normal y que la partida cambie sin avisar.
 *
 * ⚠ Estos números NO están en el fichero: con un preajuste que no sea `Custom`
 * el servidor deja `gameSettings` como esté y aplica los suyos.
 */
export const EFFECTIVE_PRESETS: Record<
  Exclude<EnshroudedPreset, 'Custom'>,
  EnshroudedSettings
> = {
  Default: {
    playerHealthFactor: 1,
    playerManaFactor: 1,
    playerStaminaFactor: 1,
    playerBodyHeatFactor: 1,
    playerDivingTimeFactor: 1,
    enableDurability: true,
    enableStarvingDebuff: false,
    foodBuffDurationFactor: 1,
    fromHungerToStarving: 600000000000,
    shroudTimeFactor: 1,
    tombstoneMode: 'AddBackpackMaterials',
    enableGliderTurbulences: true,
    weatherFrequency: 'Normal',
    fishingDifficulty: 'Normal',
    miningDamageFactor: 1,
    plantGrowthSpeedFactor: 1,
    resourceDropStackAmountFactor: 1,
    factoryProductionSpeedFactor: 1,
    perkUpgradeRecyclingFactor: 0.5,
    perkCostFactor: 1,
    experienceCombatFactor: 1,
    experienceMiningFactor: 1,
    experienceExplorationQuestsFactor: 1,
    randomSpawnerAmount: 'Normal',
    aggroPoolAmount: 'Normal',
    enemyDamageFactor: 1,
    enemyHealthFactor: 1,
    enemyStaminaFactor: 1,
    enemyPerceptionRangeFactor: 1,
    bossDamageFactor: 1,
    bossHealthFactor: 1,
    threatBonus: 1,
    pacifyAllEnemies: false,
    tamingStartleRepercussion: 'LoseSomeProgress',
    dayTimeDuration: 1800000000000,
    nightTimeDuration: 720000000000,
    curseModifier: 'Normal'
  },
  Relaxed: {
    playerHealthFactor: 2,
    playerManaFactor: 2,
    playerStaminaFactor: 2,
    playerBodyHeatFactor: 2,
    playerDivingTimeFactor: 1.5,
    enableDurability: false,
    enableStarvingDebuff: false,
    foodBuffDurationFactor: 1.5,
    fromHungerToStarving: 600000000000,
    shroudTimeFactor: 1.5,
    tombstoneMode: 'NoTombstone',
    enableGliderTurbulences: false,
    weatherFrequency: 'Rare',
    fishingDifficulty: 'Easy',
    miningDamageFactor: 1.5,
    plantGrowthSpeedFactor: 2,
    resourceDropStackAmountFactor: 1.5,
    factoryProductionSpeedFactor: 2,
    perkUpgradeRecyclingFactor: 1,
    perkCostFactor: 0.5,
    experienceCombatFactor: 1.5,
    experienceMiningFactor: 1.25,
    experienceExplorationQuestsFactor: 1,
    randomSpawnerAmount: 'Few',
    aggroPoolAmount: 'Few',
    enemyDamageFactor: 0.5,
    enemyHealthFactor: 0.5,
    enemyStaminaFactor: 0.5,
    enemyPerceptionRangeFactor: 0.75,
    bossDamageFactor: 0.5,
    bossHealthFactor: 0.5,
    threatBonus: 0.5,
    pacifyAllEnemies: false,
    tamingStartleRepercussion: 'KeepProgress',
    dayTimeDuration: 1800000000000,
    nightTimeDuration: 720000000000,
    curseModifier: 'Easy'
  },
  Hard: {
    playerHealthFactor: 1,
    playerManaFactor: 1,
    playerStaminaFactor: 1,
    playerBodyHeatFactor: 1,
    playerDivingTimeFactor: 0.9,
    enableDurability: true,
    enableStarvingDebuff: false,
    foodBuffDurationFactor: 0.9,
    fromHungerToStarving: 600000000000,
    shroudTimeFactor: 1,
    tombstoneMode: 'AddBackpackMaterials',
    enableGliderTurbulences: true,
    weatherFrequency: 'Normal',
    fishingDifficulty: 'Normal',
    miningDamageFactor: 1,
    plantGrowthSpeedFactor: 1,
    resourceDropStackAmountFactor: 1,
    factoryProductionSpeedFactor: 1,
    perkUpgradeRecyclingFactor: 0.5,
    perkCostFactor: 1,
    experienceCombatFactor: 0.5,
    experienceMiningFactor: 0.5,
    experienceExplorationQuestsFactor: 1,
    randomSpawnerAmount: 'Many',
    aggroPoolAmount: 'Normal',
    enemyDamageFactor: 1.5,
    enemyHealthFactor: 1,
    enemyStaminaFactor: 1,
    enemyPerceptionRangeFactor: 1,
    bossDamageFactor: 1,
    bossHealthFactor: 1.5,
    threatBonus: 1.5,
    pacifyAllEnemies: false,
    tamingStartleRepercussion: 'LoseSomeProgress',
    dayTimeDuration: 1800000000000,
    nightTimeDuration: 720000000000,
    curseModifier: 'Normal'
  },
  Survival: {
    playerHealthFactor: 0.75,
    playerManaFactor: 1,
    playerStaminaFactor: 1,
    playerBodyHeatFactor: 0.75,
    playerDivingTimeFactor: 0.75,
    enableDurability: true,
    enableStarvingDebuff: true,
    foodBuffDurationFactor: 0.7,
    fromHungerToStarving: 600000000000,
    shroudTimeFactor: 1,
    tombstoneMode: 'Everything',
    enableGliderTurbulences: true,
    weatherFrequency: 'Often',
    fishingDifficulty: 'Hard',
    miningDamageFactor: 0.75,
    plantGrowthSpeedFactor: 1,
    resourceDropStackAmountFactor: 0.75,
    factoryProductionSpeedFactor: 1,
    perkUpgradeRecyclingFactor: 0.3,
    perkCostFactor: 1.25,
    experienceCombatFactor: 0.5,
    experienceMiningFactor: 0.5,
    experienceExplorationQuestsFactor: 1,
    randomSpawnerAmount: 'Many',
    aggroPoolAmount: 'Normal',
    enemyDamageFactor: 1.5,
    enemyHealthFactor: 1,
    enemyStaminaFactor: 1,
    enemyPerceptionRangeFactor: 1,
    bossDamageFactor: 1,
    bossHealthFactor: 1.5,
    threatBonus: 1.5,
    pacifyAllEnemies: false,
    tamingStartleRepercussion: 'LoseAllProgress',
    dayTimeDuration: 1800000000000,
    nightTimeDuration: 1200000000000,
    curseModifier: 'Hard'
  }
}

/** Los ajustes de un preajuste, o los de Normal si es «A mi manera». */
export function presetSettings(preset: EnshroudedPreset): EnshroudedSettings {
  return { ...(EFFECTIVE_PRESETS[preset as keyof typeof EFFECTIVE_PRESETS] ?? EFFECTIVE_PRESETS.Default) }
}

/**
 * En qué se diferencian unos ajustes de los que aplicaría un preajuste.
 *
 * Es lo que decide si hay que poner `Custom`: con cualquier otro preajuste el
 * servidor no miraría estos valores.
 */
export function changedFromPreset(
  preset: Exclude<EnshroudedPreset, 'Custom'>,
  settings: EnshroudedSettings
): string[] {
  const base = EFFECTIVE_PRESETS[preset]
  return Object.keys(base).filter((key) => key in settings && settings[key] !== base[key])
}

/** Nanosegundos a minutos, que es como lo enseña el juego. */
export function nanosToMinutes(nanos: number): number {
  return Math.round(nanos / 60_000_000_000)
}

export function minutesToNanos(minutes: number): number {
  return Math.round(minutes) * 60_000_000_000
}

/** «×1,5» / «50 %», según lo que se entienda mejor en cada caso. */
export function factorLabel(value: number): string {
  return `${Math.round(value * 100)} %`
}

// --- Roles y permisos ---------------------------------------------------------

/**
 * Los permisos de un rol. Son los cinco que admite el servidor 0.9.0.0; un
 * nombre distinto se ignoraría en silencio al reescribir el fichero.
 */
export interface EnshroudedPermissions {
  canKickBan: boolean
  canAccessInventories: boolean
  canEditWorld: boolean
  canEditBase: boolean
  canExtendBase: boolean
}

export interface PermissionInfo {
  key: keyof EnshroudedPermissions
  label: string
  help: string
}

export const PERMISSIONS: PermissionInfo[] = [
  {
    key: 'canEditBase',
    label: 'Construir en las bases',
    help: 'Levantar, quitar y cambiar el terreno dentro de una base.'
  },
  {
    key: 'canExtendBase',
    label: 'Poner y mejorar altares',
    help: 'Los altares de llama son los que marcan hasta dónde llega una base.'
  },
  {
    key: 'canAccessInventories',
    label: 'Abrir cofres y talleres',
    help: 'Lo de dentro de las bases. Los cofres del mundo los abre cualquiera.'
  },
  {
    key: 'canEditWorld',
    label: 'Cambiar el mundo de fuera',
    help: 'Picar y construir fuera de las bases. Apagarlo es lo que evita destrozos.'
  },
  {
    key: 'canKickBan',
    label: 'Echar y vetar',
    help: 'Desde el propio juego, en la pestaña Social. Es el permiso de administrador.'
  }
]

/**
 * Un rol con su contraseña: **la contraseña con la que entras decide qué
 * puedes hacer**. No hay cuentas ni lista de usuarios.
 */
export interface EnshroudedRole extends EnshroudedPermissions {
  name: string
  password: string
  /**
   * Plazas guardadas para este rol. Con una o más, el servidor aparece «lleno»
   * para los demás roles antes de que se agoten las plazas.
   */
  reservedSlots: number
}

/** Los cuatro roles que el propio servidor crea al escribir su fichero. */
export const DEFAULT_ROLES: Omit<EnshroudedRole, 'password'>[] = [
  {
    name: 'Admin',
    canKickBan: true,
    canAccessInventories: true,
    canEditWorld: true,
    canEditBase: true,
    canExtendBase: true,
    reservedSlots: 0
  },
  {
    name: 'Friend',
    canKickBan: false,
    canAccessInventories: true,
    canEditWorld: true,
    canEditBase: true,
    canExtendBase: false,
    reservedSlots: 0
  },
  {
    name: 'Guest',
    canKickBan: false,
    canAccessInventories: false,
    canEditWorld: true,
    canEditBase: false,
    canExtendBase: false,
    reservedSlots: 0
  },
  {
    name: 'Visitor',
    canKickBan: false,
    canAccessInventories: false,
    canEditWorld: false,
    canEditBase: false,
    canExtendBase: false,
    reservedSlots: 0
  }
]

/** Cómo se llama cada rol de serie en cristiano. */
export const ROLE_LABELS: Record<string, string> = {
  Admin: 'Administrador',
  Friend: 'Amigo',
  Guest: 'Invitado',
  Visitor: 'Visitante'
}

export function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name
}

/**
 * Qué tiene de malo esta lista de roles, si algo.
 *
 * Las dos reglas salen del propio ejecutable («Internal Error: Only one user
 * group can be without password» y «user groups passwords must be unique»): el
 * servidor las trata como error interno, así que hay que cortarlas antes.
 */
export function roleProblems(roles: EnshroudedRole[]): string | null {
  if (roles.length === 0) return 'Tiene que haber al menos un rol para poder entrar.'

  const names = roles.map((r) => r.name.trim())
  if (names.some((n) => n.length === 0)) return 'Todos los roles tienen que tener nombre.'
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    return 'Hay dos roles que se llaman igual.'
  }

  const sinContrasena = roles.filter((r) => r.password.length === 0)
  if (sinContrasena.length > 1) {
    return 'Solo puede haber un rol sin contraseña: el servidor no sabría cuál darle a quien entra sin ella.'
  }

  const conContrasena = roles.filter((r) => r.password.length > 0).map((r) => r.password)
  if (new Set(conContrasena).size !== conContrasena.length) {
    return 'Dos roles tienen la misma contraseña, y entonces el servidor no sabe cuál de los dos dar.'
  }

  const corta = roles.find((r) => r.password.length > 0 && r.password.length < MIN_PASSWORD_LENGTH)
  if (corta) {
    return `La contraseña de «${roleLabel(corta.name)}» es muy corta: mínimo ${MIN_PASSWORD_LENGTH} caracteres.`
  }

  return null
}

// --- Etiquetas de la lista de servidores --------------------------------------

/**
 * Las etiquetas con las que el servidor se anuncia en la lista del juego. Son
 * las que admite el 0.9.0.0; una inventada se borraría al reescribir.
 */
export const TAGS: { value: string; label: string }[] = [
  { value: 'LookingForPlayers', label: 'Buscamos gente' },
  { value: 'BaseBuilding', label: 'Construir bases' },
  { value: 'Exploration', label: 'Explorar' },
  { value: 'Roleplay', label: 'Rol' },
  { value: 'Spanish', label: 'Se habla español' },
  { value: 'English', label: 'Se habla inglés' },
  { value: 'German', label: 'Se habla alemán' },
  { value: 'French', label: 'Se habla francés' },
  { value: 'Italian', label: 'Se habla italiano' },
  { value: 'Portuguese', label: 'Se habla portugués' },
  { value: 'Polish', label: 'Se habla polaco' },
  { value: 'Russian', label: 'Se habla ruso' },
  { value: 'Ukrainian', label: 'Se habla ucraniano' },
  { value: 'Turkish', label: 'Se habla turco' },
  { value: 'Japanese', label: 'Se habla japonés' },
  { value: 'Korean', label: 'Se habla coreano' },
  { value: 'Chinese', label: 'Se habla chino' },
  { value: 'Taiwanese', label: 'Se habla taiwanés' },
  { value: 'Thai', label: 'Se habla tailandés' }
]

// --- Vetados ------------------------------------------------------------------

/**
 * Alguien vetado, tal como lo guarda el servidor.
 *
 * ⚠ El README oficial llama a esta lista `bans` y al identificador
 * `accountIDHash`; el servidor real escribe **`bannedAccounts`** y
 * **`accountId`** (un número), con la fecha dentro de un objeto. Comprobado
 * metiéndole a mano las dos formas: la del README se borra sin decir nada.
 */
export interface EnshroudedBan {
  accountId: number
  displayName: string
  characterName: string
  /** Momento del veto, en segundos desde 1970. */
  banDate: number
}

// --- Manifiesto ---------------------------------------------------------------

/** Lo propio de un servidor de Enshrouded dentro del manifiesto. */
export interface EnshroudedData {
  /**
   * Mundo que carga al arrancar: el nombre de la carpeta dentro de `mundos`.
   * Es lo que se le pasa al servidor como `saveDirectory`.
   */
  worldName: string
  preset: EnshroudedPreset
  /**
   * Los ajustes de partida. Se guardan siempre, aunque el preajuste no sea
   * «A mi manera»: así se conservan si el usuario vuelve a él.
   */
  settings: EnshroudedSettings
  /** Los roles con su contraseña. Son la única forma de permisos del juego. */
  roles: EnshroudedRole[]
  /** Etiquetas con las que sale en la lista del juego. */
  tags: string[]
  enableTextChat: boolean
  enableVoiceChat: boolean
  voiceChatMode: 'Proximity' | 'Global'
  /**
   * Rama de Steam. Si falta, la pública: es lo que había antes de poder
   * elegir y lo que Steam instala por defecto.
   */
  branch?: string
  /** Build de Steam instalada, para saber si hay actualización. */
  buildId?: string
  /** Versión del juego, tal como la anuncia el servidor en su consulta. */
  gameVersion?: string
  /**
   * Los mods que lleva el servidor. Falta en los servidores creados antes de
   * que la app supiera de mods, y eso es «ninguno», no un manifiesto roto.
   */
  mods?: ModRef[]
  /** Versión de Shroudtopia instalada, que es el cargador. */
  loaderVersion?: string
}

/** Lo que el asistente elige para un servidor de Enshrouded nuevo. */
export interface EnshroudedCreateOptions {
  worldName: string
  preset: EnshroudedPreset
  settings?: EnshroudedSettings
  roles: EnshroudedRole[]
  tags?: string[]
  enableTextChat?: boolean
}

/** Un mundo guardado del servidor. */
export interface EnshroudedWorld {
  /** Nombre de la carpeta, que es con lo que se arranca. */
  name: string
  active: boolean
  sizeBytes: number
  savedAt: string | null
}

/**
 * Valida el nombre de un mundo.
 *
 * Es el nombre de una carpeta y va dentro del JSON de configuración: con algo
 * raro, el servidor arranca y guarda donde no toca, que no se nota hasta que
 * se pierde la partida.
 */
export function validWorldName(name: string): boolean {
  return /^[\w áéíóúñÁÉÍÓÚÑ.-]{1,40}$/.test(name)
}
