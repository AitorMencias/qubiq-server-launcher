import type { PropertyDefinition } from '@shared/games/minecraft/types'
import { KeyValueFile } from '../../../formats/keyValue'
import { t, type MessageKey } from '@shared/i18n'

/**
 * server.properties (§8): el editor clave=valor común, que preserva
 * comentarios, orden y claves desconocidas, más el catálogo de opciones.
 */
export { KeyValueFile as PropertiesFile }

/**
 * Una opción del catálogo con su etiqueta, su ayuda y los nombres de sus
 * valores traducidos al leerlos (`mc.prop.<clave>.label`, `.help`, `.<valor>`).
 *
 * El catálogo vive en el núcleo, pero el proceso principal sigue el idioma de
 * la configuración, así que llega a la interfaz ya traducido (`localizedCatalog`).
 */
function property(
  def: Omit<PropertyDefinition, 'label' | 'help' | 'options'> & { options?: string[] }
): PropertyDefinition {
  const { options, ...rest } = def
  return {
    ...rest,
    get label() {
      return t(`mc.prop.${def.key}.label` as MessageKey)
    },
    get help() {
      return t(`mc.prop.${def.key}.help` as MessageKey)
    },
    ...(options
      ? {
          options: options.map((value) => ({
            value,
            get label() {
              return t(`mc.prop.${def.key}.${value}` as MessageKey)
            }
          }))
        }
      : {})
  }
}

/**
 * Catálogo de opciones con etiquetas humanas (§8).
 * `level: 'basic'` es lo único que ve un usuario no técnico.
 * El tipo vive en `shared` porque lo consume también la interfaz.
 */
export const PROPERTY_CATALOG: PropertyDefinition[] = [
  property({ key: 'motd', level: 'basic', type: 'text', default: 'Un servidor de Minecraft' }),
  property({
    key: 'difficulty',
    level: 'basic',
    type: 'enum',
    options: ['peaceful', 'easy', 'normal', 'hard'],
    default: 'easy'
  }),
  /*
   * ⚠ Hardcore NO es un valor de `gamemode`. Comprobado ejecutando un servidor
   * real y leyendo las 65 claves que genera: `gamemode` solo acepta
   * survival/creative/adventure/spectator, y `hardcore` es un booleano aparte.
   *
   * Ponerlo como quinta opción de `gamemode` haría que el servidor lo
   * rechazara. Por eso la interfaz muestra un único selector de 5 opciones
   * (ver `GameModeField` en ConfigPanel) que escribe las DOS claves.
   */
  property({
    key: 'gamemode',
    level: 'basic',
    type: 'enum',
    options: ['survival', 'creative', 'adventure', 'spectator'],
    default: 'survival'
  }),
  property({ key: 'hardcore', level: 'basic', type: 'boolean', default: 'false' }),
  property({ key: 'max-players', level: 'basic', type: 'number', min: 1, max: 200, default: '10' }),
  property({ key: 'pvp', level: 'basic', type: 'boolean', default: 'true' }),
  property({ key: 'white-list', level: 'basic', type: 'boolean', default: 'false' }),
  property({ key: 'online-mode', level: 'basic', type: 'boolean', default: 'true' }),
  property({ key: 'view-distance', level: 'basic', type: 'number', min: 3, max: 32, default: '10' }),
  property({
    key: 'spawn-protection',
    level: 'advanced',
    type: 'number',
    min: 0,
    max: 64,
    default: '16'
  }),
  property({
    key: 'simulation-distance',
    level: 'advanced',
    type: 'number',
    min: 3,
    max: 32,
    default: '10'
  }),
  property({ key: 'level-seed', level: 'advanced', type: 'text', default: '', destructive: true }),
  property({
    key: 'level-type',
    level: 'advanced',
    type: 'enum',
    options: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'],
    default: 'minecraft:normal',
    destructive: true
  }),
  property({ key: 'enable-command-block', level: 'advanced', type: 'boolean', default: 'false' }),
  property({ key: 'allow-flight', level: 'advanced', type: 'boolean', default: 'false' }),
  property({ key: 'accepts-transfers', level: 'advanced', type: 'boolean', default: 'false' })
]

/**
 * El catálogo como datos planos, con los textos ya en el idioma de ahora.
 * Es lo que viaja por IPC: así no depende de cómo copie los getters Electron.
 */
export function localizedCatalog(): PropertyDefinition[] {
  return PROPERTY_CATALOG.map((def) => ({
    ...def,
    ...(def.options ? { options: def.options.map((option) => ({ ...option })) } : {})
  }))
}

/**
 * Claves que la interfaz gestiona con un control combinado y que por tanto NO
 * debe pintar por separado. `hardcore` va dentro del selector de modo de juego.
 */
export const COMPOSITE_KEYS = new Set(['hardcore'])

/**
 * Valores iniciales de una instancia nueva con lo elegido en el asistente
 * encima.
 *
 * Una clave que no esté en el catálogo es un error y no se ignora: el asistente
 * solo manda claves conocidas, así que otra cosa sería un fallo de la interfaz,
 * y tragárselo dejaría un servidor distinto del que el usuario configuró sin
 * que nadie se enterase. El puerto tampoco se acepta aquí: viene aparte, ya
 * comprobado como libre.
 */
export function initialProperties(
  port: number,
  name: string,
  expectedPlayers?: number,
  overrides: Record<string, string> = {}
): Record<string, string> {
  const values = defaultProperties(port, name, expectedPlayers)

  for (const [key, value] of Object.entries(overrides)) {
    const def = PROPERTY_CATALOG.find((d) => d.key === key)
    if (!def) throw new Error(`Ajuste desconocido al crear el servidor: ${key}`)
    if (def.type === 'enum' && !def.options?.some((o) => o.value === value)) {
      throw new Error(`Valor no válido para "${def.label}": ${value}`)
    }
    if (def.type === 'boolean' && value !== 'true' && value !== 'false') {
      throw new Error(`Valor no válido para "${def.label}": ${value}`)
    }
    values[key] = value
  }

  // El juego fuerza Difícil en modo extremo; el fichero lo refleja para no
  // mostrar en Ajustes una dificultad que no es la real.
  if (values['hardcore'] === 'true') values['difficulty'] = 'hard'

  return values
}

/** Valores iniciales de una instancia nueva. */
export function defaultProperties(
  port: number,
  name: string,
  expectedPlayers?: number
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const def of PROPERTY_CATALOG) {
    if (def.default !== '') values[def.key] = def.default
  }
  values['server-port'] = String(port)
  values['motd'] = name
  if (expectedPlayers && expectedPlayers > 0) {
    // Lo que el usuario indicó en el asistente manda sobre el valor por defecto.
    values['max-players'] = String(expectedPlayers)
  }
  return values
}
