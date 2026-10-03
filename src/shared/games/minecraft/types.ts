/**
 * Tipos de Minecraft compartidos entre el núcleo y la interfaz: distribuciones,
 * versiones, opciones de server.properties, plugins y mods, y mundos.
 *
 * Lo común a cualquier juego (estado, registro, copias, conexión) vive en
 * `shared/types.ts`. No debe importar nada de Node ni de Electron.
 */
import type { InstanceManifest, MinecraftManifest } from '../../types'
import type { ConfigFormat, EditableConfig } from '../../editableConfig'
import { t, type MessageKey } from '../../i18n'
export type Distribution = 'vanilla' | 'paper' | 'fabric' | 'forge' | 'neoforge'

export const DISTRIBUTIONS: Distribution[] = ['vanilla', 'paper', 'fabric', 'forge', 'neoforge']

/** Nombre y explicación de una distribución, traducidos al leerlos. */
function distributionLabel(id: Distribution): { name: string; hint: string } {
  return {
    get name() {
      return t(`mc.dist.${id}.name`)
    },
    get hint() {
      return t(`mc.dist.${id}.hint`)
    }
  }
}

/** Etiquetas orientadas al usuario, no al desarrollador (§8). */
export const DISTRIBUTION_LABELS: Record<Distribution, { name: string; hint: string }> = {
  vanilla: distributionLabel('vanilla'),
  paper: distributionLabel('paper'),
  fabric: distributionLabel('fabric'),
  forge: distributionLabel('forge'),
  neoforge: distributionLabel('neoforge')
}

/** Lo propio de un servidor de Minecraft dentro del manifiesto (`manifest.data`). */
export interface MinecraftData {
  distribution: Distribution
  minecraftVersion: string
  /** Build de Paper, versión de loader de Fabric o versión de Forge. */
  build?: string
  /**
   * El usuario aceptó instalar builds en pruebas (alpha/beta) de la
   * distribución. Solo lo usa Paper, que publica builds experimentales de una
   * versión nueva de Minecraft días antes del primer estable. Queda guardado
   * porque las reinstalaciones y las actualizaciones de build vuelven a pasar
   * por aquí, y no se le puede volver a preguntar en ese momento.
   */
  allowExperimental?: boolean
  javaMajor: number
  memoryMb: number
  jvmArgs: string[]
  /**
   * Servidor a medida: traído de una carpeta que el usuario ya tenía (un server
   * pack, un modpack montado a mano) y que arranca con su propio archivo de
   * inicio. La app no lo instala ni le cambia la versión: solo pone Java, lo
   * arranca y lo para. Sin esto, es un servidor instalado por la app.
   */
  custom?: CustomStart
}

/** Cómo arranca un servidor a medida (ver `MinecraftData.custom`). */
export interface CustomStart {
  /** Archivo de inicio, relativo a la carpeta del servidor y con `/`: `run.bat`. */
  startFile: string
  /** Quién decide la memoria del servidor. Ver `MemoryControl`. */
  memory: MemoryControl
  /**
   * Carpeta de la que se trae, mientras no se haya terminado de mover. Si el
   * traslado falla, queda aquí para poder reintentarlo; la carpeta de origen
   * no se toca hasta que la copia está completa.
   */
  importFrom?: string
}

/**
 * Quién pone la memoria en un servidor a medida:
 *  - `app`: la pone la app en la línea de órdenes (el inicio es un .jar).
 *  - `jvm-args`: el script lee `user_jvm_args.txt` (lo normal en Forge y
 *    NeoForge), y la app cambia allí solo las líneas de memoria.
 *  - `script`: la decide el script y la app no la puede cambiar sin tocarlo.
 */
export type MemoryControl = 'app' | 'jvm-args' | 'script'

/** Lo que se pide para traer un servidor a medida. */
export interface MinecraftImportOptions {
  /** Carpeta del servidor. Se MUEVE a la de QubiQ: deja de estar donde estaba. */
  folder: string
  /** Archivo de inicio, relativo a esa carpeta. */
  startFile: string
}

/** Lo que el asistente elige para un servidor de Minecraft nuevo. */
export interface MinecraftCreateOptions {
  distribution: Distribution
  minecraftVersion: string
  build?: string
  /** Se eligió una versión que solo tiene builds en pruebas (ver `MinecraftData`). */
  allowExperimental?: boolean
  memoryMb: number
  /**
   * Ajustes de `server.properties` elegidos en el asistente (modo de juego,
   * dificultad, tipo de mundo…). Se aplican encima de los valores por defecto
   * al crear, para que el servidor arranque ya como el usuario lo quiso y no
   * haya que ir después a Ajustes. Solo se aceptan claves del catálogo.
   */
  properties?: Record<string, string>
  /**
   * Traer un servidor que ya existe en vez de instalar uno. `distribution` y
   * `minecraftVersion` son entonces lo que se ha reconocido en la carpeta (o
   * lo que ha corregido el usuario): deciden el Java y qué pestañas salen.
   */
  import?: MinecraftImportOptions
}

/** Un archivo con el que se puede arrancar un servidor traído de fuera. */
export interface StartFileInfo {
  /** Relativo a la carpeta del servidor, con `/`. */
  path: string
  kind: 'script' | 'jar'
  /** El script vuelve a arrancar el servidor cuando se cierra (un bucle con goto). */
  restartLoop: boolean
  /** El script fija la memoria él mismo (-Xmx): el control de la app no le llega. */
  setsMemory: boolean
  /** Quién decidiría la memoria si se arranca con este archivo. */
  memory: MemoryControl
}

/** Lo que se reconoce en una carpeta antes de traerla (servidor a medida). */
export interface ImportInspection {
  folder: string
  /** Lo que ocupa: si está en otro disco, es lo que hay que copiar. */
  sizeBytes: number
  fileCount: number
  /**
   * Está en el mismo disco que los datos de la app: moverla es instantáneo.
   * Si no, se copia entera y después se borra la original.
   */
  sameDrive: boolean
  distribution: Distribution | null
  minecraftVersion: string | null
  /** Versión del loader o build reconocido (NeoForge 21.1.77, Forge 47.4.0...). */
  build: string | null
  startFiles: StartFileInfo[]
  /** El que se propone: run.bat si existe. */
  suggestedStartFile: string | null
  /** `server-port` de su server.properties, si lo tiene. */
  port: number | null
  maxPlayers: number | null
  /** Cuántos mods o plugins trae. */
  contentCount: number
  hasWorld: boolean
  /** Motivos por los que NO se puede traer. Vacío si se puede. */
  problems: string[]
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
  /** La que la app propone: la más reciente que no está en pruebas. */
  recommended: boolean
  /**
   * La distribución todavía no publica un build estable para esta versión,
   * solo alpha/beta. Se puede instalar, pero avisando (§4.2).
   */
  experimental?: boolean
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
  if (distribution === 'fabric' || distribution === 'forge' || distribution === 'neoforge') {
    return 'mods'
  }
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

// --- Configuración de plugins y mods (§19.20) --------------------------------

export interface ContentConfigFile {
  /** Ruta relativa a la carpeta del servidor, con `/`: `plugins/Essentials/config.yml`. */
  path: string
  /** Null si la app no sabe editar ese formato: solo se ofrece abrirlo. */
  format: ConfigFormat | null
  sizeBytes: number
  /** Aclaración para el usuario: "Ajustes de este mundo", "Demasiado grande"... */
  note?: string
}

export interface ContentConfigInfo {
  /** Nombre del plugin o mod, sacado de su jar; si no, del nombre del fichero. */
  name: string
  files: ContentConfigFile[]
  /** Carpeta propia del plugin (relativa), exista o no todavía. Null en los mods. */
  folder: string | null
  /**
   * Ficheros `-client` que no se enseñan: solo cuentan en el Minecraft de cada
   * jugador, y cambiarlos en el servidor no hace nada.
   */
  hiddenClientFiles: number
}

export interface ContentConfigDocument {
  path: string
  /** Huella de lo leído. Al guardar se comprueba que el fichero no ha cambiado entre medias. */
  hash: string
  config: EditableConfig
  /** Si no se puede guardar nada (codificación rara, fichero ilegible), por qué. */
  readOnlyReason?: string
}

export interface ContentConfigSaveResult {
  document: ContentConfigDocument
  /** Opciones que se han escrito de verdad (las que no cambiaban no cuentan). */
  written: number
  /** Copia del fichero tal y como estaba, o null si no ha hecho falta escribir. */
  backupPath: string | null
}

export interface ContentSource {
  name: string
  url: string
  description: string
  /** La opción que recomendamos para esta distribución. */
  primary?: boolean
}

/** Una fuente con su descripción traducida al leerla. */
function source(name: string, url: string, key: MessageKey, primary = false): ContentSource {
  return {
    name,
    url,
    get description() {
      return t(key)
    },
    ...(primary ? { primary } : {})
  }
}

/** Dónde descargar, según el tipo de servidor. */
export const CONTENT_SOURCES: Record<Distribution, ContentSource[]> = {
  vanilla: [],
  paper: [
    source('Hangar', 'https://hangar.papermc.io', 'mc.source.paper.hangar', true),
    source('Modrinth', 'https://modrinth.com/plugins', 'mc.source.paper.modrinth'),
    source('SpigotMC', 'https://www.spigotmc.org/resources/', 'mc.source.paper.spigot')
  ],
  fabric: [
    source('Modrinth', 'https://modrinth.com/mods', 'mc.source.fabric.modrinth', true),
    source('CurseForge', 'https://www.curseforge.com/minecraft/mc-mods', 'mc.source.fabric.curseforge')
  ],
  forge: [
    source('CurseForge', 'https://www.curseforge.com/minecraft/mc-mods', 'mc.source.forge.curseforge', true),
    source('Modrinth', 'https://modrinth.com/mods', 'mc.source.forge.modrinth')
  ],
  neoforge: [
    source('CurseForge', 'https://www.curseforge.com/minecraft/mc-mods', 'mc.source.neoforge.curseforge', true),
    source('Modrinth', 'https://modrinth.com/mods', 'mc.source.neoforge.modrinth')
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
export const LEVEL_TYPES: { value: string; label: string; help: string }[] = (
  ['normal', 'flat', 'large_biomes', 'amplified'] as const
).map((id) => ({
  value: `minecraft:${id}`,
  get label() {
    return t(`mc.level.${id}.label`)
  },
  get help() {
    return t(`mc.level.${id}.help`)
  }
}))

/**
 * El manifiesto visto como lo que es: de Minecraft.
 *
 * Desde la fase 2 `InstanceManifest` es una unión de juegos, así que leer
 * `manifest.data.minecraftVersion` sin mirar antes de qué juego es ya no
 * compila. Las pantallas de Minecraft pasan por aquí: solo las abre el juego
 * de Minecraft, y si alguna vez llegara otra cosa, salta con un error claro en
 * vez de pintar campos vacíos.
 */
export function minecraftOf(manifest: InstanceManifest): MinecraftManifest {
  if (manifest.game !== 'minecraft') {
    throw new Error(`Esta pantalla es de Minecraft, y el servidor es de ${manifest.game}.`)
  }
  return manifest
}
