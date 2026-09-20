/**
 * Ficheros de configuración ajenos, vistos como una lista de opciones que se
 * pueden editar sin destrozar el fichero (§19.20).
 *
 * Es el modelo común de los lectores de `core/formats/editable/`: YAML, TOML,
 * JSON/JSON5, `.properties` y las tablas Lua de Project Zomboid. No conoce
 * Minecraft; lo usa para los plugins y mods, pero sirve igual para cualquier
 * juego que guarde su configuración en uno de esos formatos.
 */

export type ConfigFormat = 'yaml' | 'toml' | 'json' | 'properties' | 'lua'

/**
 * - `integer` y `number` se distinguen porque escribir `5.0` donde el fichero
 *   tenía `5` puede romper al plugin que lo lee como entero.
 * - `list` es una lista de valores sueltos, que se edita uno por línea.
 */
export type ConfigValueType = 'boolean' | 'integer' | 'number' | 'text' | 'list'

export interface ConfigOption {
  /** Ruta de claves hasta la opción. Los elementos de listas de tablas llevan `#n`. */
  path: string[]
  type: ConfigValueType
  /** Valor tal y como se enseña: sin comillas ni escapes. En las listas, vacío. */
  value: string
  /** Elementos, solo en las listas. */
  items?: string[]
  /** Si es false, se enseña pero no se puede cambiar desde la app. */
  editable: boolean
  /** Por qué no se puede cambiar aquí, dicho para el usuario. */
  readOnlyReason?: string
  /** Lo que el autor dejó escrito encima de la opción, ya sin almohadillas. */
  description: string | null
  /** Valor por defecto, cuando el fichero lo dice (los TOML de Forge y NeoForge). */
  defaultValue?: string
  /** Valores admitidos, cuando el fichero los enumera. */
  allowed?: string[]
  /**
   * Cómo se llama cada valor admitido, cuando el fichero lo dice.
   *
   * Project Zomboid enumera los suyos en el comentario de encima («1 =
   * Zombicidio», «2 = Muy alto»): sin esto, la app enseñaría un número pelado
   * donde el juego enseña un nombre.
   */
  allowedLabels?: Record<string, string>
  min?: number
  max?: number
}

export interface ConfigSection {
  path: string[]
  description: string | null
}

export interface EditableConfig {
  format: ConfigFormat
  /** En el orden del fichero. */
  options: ConfigOption[]
  /** Las secciones que tienen algo que contar. */
  sections: ConfigSection[]
}

export type ConfigChangeValue = string | number | boolean | string[]

export interface ConfigChange {
  path: string[]
  value: ConfigChangeValue
}

/** Clave estable de una ruta, para usarla en mapas y en `key` de React. */
export function pathKey(path: string[]): string {
  return JSON.stringify(path)
}
