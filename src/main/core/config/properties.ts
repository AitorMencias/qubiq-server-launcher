import { readFile, writeFile } from 'node:fs/promises'
import type { PropertyDefinition } from '@shared/types'

/**
 * Lectura y escritura de server.properties (§8).
 *
 * ⚠ Regla irrenunciable: preservar comentarios, orden y CLAVES DESCONOCIDAS.
 * Los plugins y las versiones nuevas añaden claves propias; reescribir el
 * fichero solo con las que conocemos las borraría de forma silenciosa.
 */

interface PropertyLine {
  kind: 'comment' | 'entry' | 'blank'
  raw: string
  key?: string
  value?: string
}

export class PropertiesFile {
  private constructor(private lines: PropertyLine[]) {}

  static parse(content: string): PropertiesFile {
    const lines: PropertyLine[] = content.split(/\r?\n/).map((raw) => {
      const trimmed = raw.trim()
      if (trimmed.length === 0) return { kind: 'blank', raw }
      if (trimmed.startsWith('#') || trimmed.startsWith('!')) return { kind: 'comment', raw }

      const eq = raw.indexOf('=')
      if (eq === -1) return { kind: 'comment', raw }

      return {
        kind: 'entry',
        raw,
        key: raw.slice(0, eq).trim(),
        value: raw.slice(eq + 1)
      }
    })
    return new PropertiesFile(lines)
  }

  static async load(path: string): Promise<PropertiesFile> {
    try {
      return PropertiesFile.parse(await readFile(path, 'utf8'))
    } catch {
      return new PropertiesFile([])
    }
  }

  get(key: string): string | undefined {
    for (const line of this.lines) {
      if (line.kind === 'entry' && line.key === key) return line.value
    }
    return undefined
  }

  /** Modifica una clave existente in situ; si no existe, la añade al final. */
  set(key: string, value: string): void {
    for (const line of this.lines) {
      if (line.kind === 'entry' && line.key === key) {
        line.value = value
        line.raw = `${key}=${value}`
        return
      }
    }
    this.lines.push({ kind: 'entry', raw: `${key}=${value}`, key, value })
  }

  setAll(values: Record<string, string>): void {
    for (const [key, value] of Object.entries(values)) this.set(key, value)
  }

  /** Todas las claves presentes, incluidas las que la app no conoce. */
  entries(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const line of this.lines) {
      if (line.kind === 'entry' && line.key !== undefined) {
        result[line.key] = line.value ?? ''
      }
    }
    return result
  }

  serialize(): string {
    return this.lines.map((l) => l.raw).join('\r\n')
  }

  async save(path: string): Promise<void> {
    await writeFile(path, this.serialize(), 'utf8')
  }
}

/**
 * Catálogo de opciones con etiquetas humanas (§8).
 * `level: 'basic'` es lo único que ve un usuario no técnico.
 * El tipo vive en `shared` porque lo consume también la interfaz.
 */
export const PROPERTY_CATALOG: PropertyDefinition[] = [
  {
    key: 'motd',
    label: 'Nombre que verán tus amigos',
    help: 'El texto que aparece en su lista de servidores.',
    level: 'basic',
    type: 'text',
    default: 'Un servidor de Minecraft'
  },
  {
    key: 'difficulty',
    label: 'Dificultad',
    help: 'En Pacífico no aparecen monstruos hostiles.',
    level: 'basic',
    type: 'enum',
    options: [
      { value: 'peaceful', label: 'Pacífico' },
      { value: 'easy', label: 'Fácil' },
      { value: 'normal', label: 'Normal' },
      { value: 'hard', label: 'Difícil' }
    ],
    default: 'easy'
  },
  /*
   * ⚠ Hardcore NO es un valor de `gamemode`. Comprobado ejecutando un servidor
   * real y leyendo las 65 claves que genera: `gamemode` solo acepta
   * survival/creative/adventure/spectator, y `hardcore` es un booleano aparte.
   *
   * Ponerlo como quinta opción de `gamemode` haría que el servidor lo
   * rechazara. Por eso la interfaz muestra un único selector de 5 opciones
   * (ver `GameModeField` en ConfigPanel) que escribe las DOS claves.
   */
  {
    key: 'gamemode',
    label: 'Modo de juego',
    help: 'Con qué modo entran los jugadores nuevos.',
    level: 'basic',
    type: 'enum',
    options: [
      { value: 'survival', label: 'Supervivencia' },
      { value: 'creative', label: 'Creativo' },
      { value: 'adventure', label: 'Aventura' },
      { value: 'spectator', label: 'Espectador' }
    ],
    default: 'survival'
  },
  {
    key: 'hardcore',
    label: 'Modo extremo (hardcore)',
    help:
      'Al morir, el jugador pasa a espectador y no puede volver a jugar en ese mundo. ' +
      'Fuerza la dificultad a Difícil.',
    level: 'basic',
    type: 'boolean',
    default: 'false'
  },
  {
    key: 'max-players',
    label: 'Jugadores como máximo',
    help: 'Cuántas personas pueden estar conectadas a la vez.',
    level: 'basic',
    type: 'number',
    min: 1,
    max: 200,
    default: '10'
  },
  {
    key: 'pvp',
    label: 'Los jugadores pueden pelearse entre sí',
    help: 'Desactívalo para un mundo pacífico entre amigos.',
    level: 'basic',
    type: 'boolean',
    default: 'true'
  },
  {
    key: 'white-list',
    label: 'Solo pueden entrar los invitados',
    help: 'Con esto activado, únicamente entra quien esté en tu lista.',
    level: 'basic',
    type: 'boolean',
    default: 'false'
  },
  {
    key: 'online-mode',
    label: 'Exigir cuenta oficial de Minecraft',
    help:
      'Déjalo activado. Desactivarlo permite que cualquiera entre usando el nombre ' +
      'de otra persona.',
    level: 'basic',
    type: 'boolean',
    default: 'true'
  },
  {
    key: 'view-distance',
    label: 'Distancia de visión',
    help: 'En chunks. Bajarlo mejora bastante el rendimiento.',
    level: 'basic',
    type: 'number',
    min: 3,
    max: 32,
    default: '10'
  },
  {
    key: 'spawn-protection',
    label: 'Zona protegida alrededor del punto de aparición',
    help: 'En bloques. Solo los operadores pueden construir ahí. 0 lo desactiva.',
    level: 'advanced',
    type: 'number',
    min: 0,
    max: 64,
    default: '16'
  },
  {
    key: 'simulation-distance',
    label: 'Distancia de simulación',
    help: 'Hasta dónde siguen ocurriendo cosas. Afecta mucho al rendimiento.',
    level: 'advanced',
    type: 'number',
    min: 3,
    max: 32,
    default: '10'
  },
  {
    key: 'level-seed',
    label: 'Semilla del mundo',
    help: 'Determina el terreno generado. Cambiarla genera un mundo distinto.',
    level: 'advanced',
    type: 'text',
    default: '',
    destructive: true
  },
  {
    key: 'level-type',
    label: 'Tipo de mundo',
    help: 'Normal, plano, amplificado... Cambiarlo afecta al terreno nuevo.',
    level: 'advanced',
    type: 'enum',
    options: [
      { value: 'minecraft:normal', label: 'Normal' },
      { value: 'minecraft:flat', label: 'Superplano' },
      { value: 'minecraft:large_biomes', label: 'Biomas grandes' },
      { value: 'minecraft:amplified', label: 'Amplificado' }
    ],
    default: 'minecraft:normal',
    destructive: true
  },
  {
    key: 'enable-command-block',
    label: 'Permitir bloques de comandos',
    help: 'Necesario para mapas de aventura y automatizaciones.',
    level: 'advanced',
    type: 'boolean',
    default: 'false'
  },
  {
    key: 'allow-flight',
    label: 'Permitir volar',
    help: 'Actívalo si usas mods o plugins que dan vuelo, o te expulsará por trampas.',
    level: 'advanced',
    type: 'boolean',
    default: 'false'
  },
  {
    key: 'accepts-transfers',
    label: 'Aceptar jugadores enviados desde otro servidor',
    help:
      'Necesario si usas un lobby o una red de servidores que mueve a los jugadores con /transfer. ' +
      'Si no, déjalo apagado.',
    level: 'advanced',
    type: 'boolean',
    default: 'false'
  }
]

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
