/**
 * Tipos de Minecraft compartidos entre el núcleo y la interfaz: distribuciones,
 * versiones, opciones de server.properties, plugins y mods, y mundos.
 *
 * Lo común a cualquier juego (estado, registro, copias, conexión) vive en
 * `shared/types.ts`. No debe importar nada de Node ni de Electron.
 */
export type Distribution = 'vanilla' | 'paper' | 'fabric' | 'forge'

export const DISTRIBUTIONS: Distribution[] = ['vanilla', 'paper', 'fabric', 'forge']

/** Etiquetas orientadas al usuario, no al desarrollador (§8). */
export const DISTRIBUTION_LABELS: Record<Distribution, { name: string; hint: string }> = {
  vanilla: {
    name: 'Minecraft original',
    hint: 'El juego tal cual. Sin plugins ni mods.'
  },
  paper: {
    name: 'Plugins (Bukkit/Spigot)',
    hint: 'Admite plugins y va más fino que el original. La opción recomendada.'
  },
  fabric: {
    name: 'Mods (Fabric)',
    hint: 'Mods ligeros y actualizaciones rápidas.'
  },
  forge: {
    name: 'Mods (Forge)',
    hint: 'El ecosistema de mods más grande. La instalación tarda más.'
  }
}

/** Lo propio de un servidor de Minecraft dentro del manifiesto (`manifest.data`). */
export interface MinecraftData {
  distribution: Distribution
  minecraftVersion: string
  /** Build de Paper, versión de loader de Fabric o versión de Forge. */
  build?: string
  javaMajor: number
  memoryMb: number
  jvmArgs: string[]
}

/** Lo que el asistente elige para un servidor de Minecraft nuevo. */
export interface MinecraftCreateOptions {
  distribution: Distribution
  minecraftVersion: string
  build?: string
  memoryMb: number
  /**
   * Ajustes de `server.properties` elegidos en el asistente (modo de juego,
   * dificultad, tipo de mundo…). Se aplican encima de los valores por defecto
   * al crear, para que el servidor arranque ya como el usuario lo quiso y no
   * haya que ir después a Ajustes. Solo se aceptan claves del catálogo.
   */
  properties?: Record<string, string>
}

export type VersionChannel = 'release' | 'snapshot' | 'old'

/**
 * Identificador de versión de Minecraft.
 *
 * ⚠ Minecraft usa versionado por año (`26.2`) conviviendo con el histórico
 * semántico (`1.21.8`). `26.2` es MÁS NUEVA que `1.21.11`, así que comparar
 * o mostrar por el string `id` produce resultados incorrectos.
 *
 * El orden autoritativo es `orderIndex`, que proviene del manifiesto de Mojang
 * (ya viene en orden cronológico descendente). Usa siempre `compareVersions`.
 */
export interface VersionId {
  id: string
  channel: VersionChannel
  releaseTime: string
  /** Posición en el manifiesto de Mojang. Menor = más reciente. */
  orderIndex: number
}

/** Orden cronológico: más reciente primero. Nunca compares `id` como string. */
export function compareVersions(a: VersionId, b: VersionId): number {
  return a.orderIndex - b.orderIndex
}

export interface JavaRequirement {
  majorVersion: number
  component: string
}

/** Una versión ofrecible para una distribución concreta. */
export interface DistributionVersion {
  minecraftVersion: string
  /** Build/loader recomendado; la interfaz básica no lo muestra. */
  build?: string
  channel: VersionChannel
  recommended: boolean
}

/**
 * Definición de una opción de `server.properties` con etiquetas humanas (§8).
 * Vive en `shared` porque la interfaz la necesita para pintar los controles.
 */
export interface PropertyDefinition {
  key: string
  label: string
  help: string
  level: 'basic' | 'advanced'
  type: 'boolean' | 'enum' | 'number' | 'text'
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  default: string
  /** Cambiarlo puede destruir el mundo existente: exige confirmación (§8). */
  destructive?: boolean
}

// --- Plugins y mods (§4.8) ---------------------------------------------------

/**
 * Qué admite cada distribución.
 *
 * ⚠ No son lo mismo, y confundirlos es el error nº 1:
 *  - `plugins` (Paper/Bukkit) se instalan SOLO en el servidor.
 *  - `mods` (Forge/Fabric) hay que instalarlos también en el Minecraft de cada
 *    jugador, o no podrá entrar.
 */
export type ContentKind = 'plugins' | 'mods'

export function contentKindFor(distribution: Distribution): ContentKind | null {
  if (distribution === 'paper') return 'plugins'
  if (distribution === 'fabric' || distribution === 'forge') return 'mods'
  return null // Vanilla no admite ni una cosa ni la otra.
}

export interface ContentItem {
  fileName: string
  sizeBytes: number
  addedAt: string
  /** Los desactivados siguen en la carpeta pero el servidor los ignora. */
  enabled: boolean
}

export interface ContentInfo {
  kind: ContentKind | null
  /** Nombre de la carpeta donde van los ficheros: `plugins` o `mods`. */
  folderName: string
  items: ContentItem[]
}

export interface ContentSource {
  name: string
  url: string
  description: string
  /** La opción que recomendamos para esta distribución. */
  primary?: boolean
}

/** Dónde descargar, según el tipo de servidor. */
export const CONTENT_SOURCES: Record<Distribution, ContentSource[]> = {
  vanilla: [],
  paper: [
    {
      name: 'Hangar',
      url: 'https://hangar.papermc.io',
      description: 'El repositorio oficial de PaperMC. Todo lo de aquí está pensado para tu servidor.',
      primary: true
    },
    {
      name: 'Modrinth',
      url: 'https://modrinth.com/plugins',
      description: 'Buscador cómodo y moderno. Filtra por versión y por Paper.'
    },
    {
      name: 'SpigotMC',
      url: 'https://www.spigotmc.org/resources/',
      description: 'El catálogo clásico, enorme. Algunos plugins solo están aquí.'
    }
  ],
  fabric: [
    {
      name: 'Modrinth',
      url: 'https://modrinth.com/mods',
      description: 'La referencia para Fabric. Filtra por versión y por Fabric.',
      primary: true
    },
    {
      name: 'CurseForge',
      url: 'https://www.curseforge.com/minecraft/mc-mods',
      description: 'El otro gran catálogo. Comprueba siempre que el mod sea de Fabric.'
    }
  ],
  forge: [
    {
      name: 'CurseForge',
      url: 'https://www.curseforge.com/minecraft/mc-mods',
      description: 'El catálogo más grande para Forge, con diferencia.',
      primary: true
    },
    {
      name: 'Modrinth',
      url: 'https://modrinth.com/mods',
      description: 'Buscador más limpio. Filtra por versión y por Forge.'
    }
  ]
}

// --- Mundos ------------------------------------------------------------------

/**
 * Un mundo del servidor.
 *
 * Un servidor puede tener varias carpetas de mundo, pero **solo una activa**:
 * la que indica `level-name` en server.properties. Cambiar de mundo es cambiar
 * esa clave y reiniciar.
 */
export interface WorldInfo {
  /** Nombre de la carpeta, que es también el valor de `level-name`. */
  name: string
  active: boolean
  sizeBytes: number
  /** Última modificación de level.dat: cuándo se jugó por última vez. */
  lastPlayed: string | null
  /**
   * false cuando el mundo está elegido pero el servidor aún no lo ha generado
   * (se crea en el siguiente arranque).
   */
  generated: boolean
  /** Carpetas heredadas `<nombre>_nether` / `_the_end` de versiones antiguas. */
  legacyFolders: string[]
}

export interface CreateWorldRequest {
  name: string
  /** Vacío = aleatoria. */
  seed?: string
  levelType?: string
}

/** Tipos de mundo ofrecidos al crear uno nuevo. */
export const LEVEL_TYPES: { value: string; label: string; help: string }[] = [
  { value: 'minecraft:normal', label: 'Normal', help: 'El mundo de siempre.' },
  {
    value: 'minecraft:flat',
    label: 'Superplano',
    help: 'Terreno liso, sin relieve. Útil para construir.'
  },
  {
    value: 'minecraft:large_biomes',
    label: 'Biomas grandes',
    help: 'Mismo mundo, con biomas mucho más extensos.'
  },
  {
    value: 'minecraft:amplified',
    label: 'Amplificado',
    help: 'Montañas enormes. Exige bastante al servidor.'
  }
]
