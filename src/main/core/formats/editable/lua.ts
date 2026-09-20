import type { ConfigChange, ConfigOption, ConfigSection } from '@shared/editableConfig'
import {
  Lines,
  describe,
  formatNumber,
  resolveChanges,
  type EditableDocument
} from './common'

/**
 * Tablas Lua de configuración, con la misma regla que los demás editores: se
 * sustituye el trozo exacto del valor y el resto del fichero sale igual.
 *
 * El caso real y único por ahora es el `servertest_SandboxVars.lua` de Project
 * Zomboid: 300 y pico opciones, cada una con su comentario explicándola y, las
 * que van por lista, con sus valores enumerados. Comprobado contra el fichero
 * que escribe el servidor de la Build 42.20 (51 KB, 738 comentarios).
 *
 * No es un intérprete de Lua ni pretende serlo: entiende **la forma que tiene
 * este fichero**, que es una tabla de `clave = valor,` con un nivel de tablas
 * anidadas. Lo que no encaje se enseña como solo lectura en vez de adivinarlo,
 * que es peor.
 *
 *     SandboxVars = {
 *         -- La frecuencia con la que se añaden nuevos zombis al mundo. Por defecto=Ninguno
 *         -- 1 = Alto
 *         -- 4 = Ninguno
 *         ZombieRespawn = 4,
 *         ZombieLore = {
 *             Speed = 2,
 *         },
 *     }
 */

interface LuaRecord {
  option: ConfigOption
  line: number
  /** Dónde empieza y acaba el valor dentro de la línea. */
  start: number
  end: number
  /** El número iba con decimales: se vuelve a escribir igual. */
  decimal: boolean
}

const COMMENT = /^--+/

/** `Clave = {` abre una tabla; `}` o `},` la cierra. */
const OPEN = /^\s*([A-Za-z_]\w*)\s*=\s*\{\s*$/
const CLOSE = /^\s*\}\s*,?\s*$/
const ENTRY = /^(\s*)([A-Za-z_]\w*)\s*=\s*(.*?)\s*,?\s*$/

export function parseLua(content: string): EditableDocument {
  const text = Lines.parse(content)
  const lines = text.lines
  const records: LuaRecord[] = []
  const sections: ConfigSection[] = []
  /** Tablas abiertas. La de fuera (`SandboxVars = {`) no cuenta como sección. */
  const stack: string[] = []
  let pending: string[] = []
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const trimmed = raw.trim()

    if (trimmed === '') {
      pending = []
      continue
    }
    if (trimmed.startsWith('--')) {
      pending.push(trimmed)
      continue
    }
    if (CLOSE.test(trimmed)) {
      if (depth > 0) {
        depth--
        stack.pop()
      }
      pending = []
      continue
    }

    const open = OPEN.exec(raw)
    if (open) {
      depth++
      // La tabla de fuera es el envoltorio del fichero (`SandboxVars`), no una
      // sección que enseñar: dentro de ella es donde empiezan las opciones.
      if (depth > 1) {
        stack.push(open[1]!)
        sections.push({ path: [...stack], description: describe(pending, COMMENT) })
      }
      pending = []
      continue
    }

    const entry = ENTRY.exec(raw)
    if (!entry || depth === 0) {
      pending = []
      continue
    }

    const [, indent, key, literal] = entry as unknown as [string, string, string, string]
    const start = indent.length + raw.slice(indent.length).indexOf('=') + 1
    const valueStart = start + (raw.slice(start).length - raw.slice(start).trimStart().length)
    const description = describe(pending, COMMENT)
    const meta = extractZomboidMeta(description)
    pending = []

    const parsed = readValue(literal)
    records.push({
      option: {
        path: [...stack, key],
        type: parsed.type,
        value: parsed.value,
        editable: parsed.editable,
        ...(parsed.editable ? {} : { readOnlyReason: 'la app no sabe leer este valor' }),
        description: meta.description,
        ...(meta.defaultValue !== undefined ? { defaultValue: meta.defaultValue } : {}),
        ...(meta.allowed ? { allowed: meta.allowed, allowedLabels: meta.allowedLabels } : {}),
        ...(meta.min !== undefined ? { min: meta.min } : {}),
        ...(meta.max !== undefined ? { max: meta.max } : {})
      },
      line: i,
      start: valueStart,
      end: valueStart + literal.length,
      decimal: parsed.decimal
    })
  }

  return {
    config: { format: 'lua', options: records.map((r) => r.option), sections },
    apply(changes: ConfigChange[]): void {
      for (const { record, value } of resolveChanges(records, changes)) {
        const raw = text.lines[record.line]!
        const written = writeValue(record, value)
        text.replace(record.line, record.line, [
          raw.slice(0, record.start) + written + raw.slice(record.end)
        ])
      }
    },
    serialize: () => text.serialize()
  }
}

/** Lo que hay a la derecha del `=`, ya sin la coma final. */
function readValue(literal: string): {
  type: ConfigOption['type']
  value: string
  editable: boolean
  decimal: boolean
} {
  if (/^(true|false)$/.test(literal)) {
    return { type: 'boolean', value: literal, editable: true, decimal: false }
  }
  if (/^-?\d+$/.test(literal)) {
    return { type: 'integer', value: literal, editable: true, decimal: false }
  }
  if (/^-?(\d+\.\d*|\.\d+)$/.test(literal)) {
    return { type: 'number', value: literal, editable: true, decimal: true }
  }
  const quoted = /^"((?:[^"\\]|\\.)*)"$/.exec(literal)
  if (quoted) {
    return { type: 'text', value: unescapeLua(quoted[1]!), editable: true, decimal: false }
  }
  // Una llamada, una concatenación, una tabla en la misma línea… Se enseña,
  // pero no se toca: reescribirla sería inventarse lo que quiso decir.
  return { type: 'text', value: literal, editable: false, decimal: false }
}

function writeValue(record: LuaRecord, value: unknown): string {
  switch (record.option.type) {
    case 'boolean':
      return String(value)
    case 'integer':
      return String(value)
    case 'number':
      return formatNumber(Number(value), record.decimal)
    default:
      return `"${escapeLua(String(value))}"`
  }
}

function escapeLua(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function unescapeLua(text: string): string {
  return text.replace(/\\(.)/g, '$1')
}

/**
 * Lo que Project Zomboid escribe dentro de los comentarios de su
 * `SandboxVars.lua`, en el idioma en el que se arrancó el servidor:
 *
 *     -- Cambiando esto se establece la opción avanzada. Por defecto=Normal
 *     -- 1 = Zombicidio
 *     -- 4 = Normal
 *     -- Tasa a la que se sube de nivel. Mínimo=0,00 Máximo=1000,00 Por defecto=1,00
 *
 * De ahí salen el valor por defecto, los límites y la lista de valores con su
 * nombre. Sin esto, la pantalla de ajustes avanzados enseñaría un número pelado
 * donde el juego enseña «Muy alto».
 *
 * ⚠ Los números van con **coma decimal** porque el servidor los escribe en el
 * idioma del juego. Leerlos con `Number()` daría NaN en la mitad de los casos.
 */
function extractZomboidMeta(description: string | null): {
  description: string | null
  defaultValue?: string
  allowed?: string[]
  allowedLabels?: Record<string, string>
  min?: number
  max?: number
} {
  if (description === null) return { description: null }

  const kept: string[] = []
  const allowed: string[] = []
  const allowedLabels: Record<string, string> = {}
  let defaultValue: string | undefined
  let min: number | undefined
  let max: number | undefined

  for (const line of description.split('\n')) {
    const option = /^(-?\d+)\s*=\s*(.+)$/.exec(line.trim())
    if (option) {
      allowed.push(option[1]!)
      allowedLabels[option[1]!] = option[2]!.trim()
      continue
    }

    let rest = line
    rest = rest.replace(/\bMínimo\s*=\s*([-\d.,]+)/i, (_m, n: string) => {
      min = decimal(n)
      return ''
    })
    rest = rest.replace(/\bMáximo\s*=\s*([-\d.,]+)/i, (_m, n: string) => {
      max = decimal(n)
      return ''
    })
    rest = rest.replace(/\bPor defecto\s*=\s*(.+?)\s*$/i, (_m, v: string) => {
      defaultValue = v.trim()
      return ''
    })
    const clean = quoteMarks(rest.trim())
    if (clean !== '') kept.push(clean)
  }

  // «Por defecto=Normal» es el NOMBRE de un valor, no el valor: si se dejara
  // así, el botón de «volver a este valor» escribiría la palabra donde el
  // fichero espera un número. Y «Por defecto=1,00» es un número escrito con la
  // coma del idioma del servidor, que hay que devolver como lo escribe él.
  if (defaultValue !== undefined) {
    const porNombre = Object.entries(allowedLabels).find(
      ([, label]) => label.toLowerCase() === defaultValue!.toLowerCase()
    )
    if (porNombre) defaultValue = porNombre[0]
    else if (/^-?[\d.,]+$/.test(defaultValue)) {
      const n = decimal(defaultValue)
      if (n !== undefined) defaultValue = /,/.test(defaultValue) ? n.toFixed(1) : String(n)
    }
  }

  return {
    description: kept.length > 0 ? kept.join('\n') : null,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(allowed.length > 0 ? { allowed, allowedLabels } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {})
  }
}

/**
 * El juego usa barras invertidas donde quería poner comillas.
 *
 * Su traducción al español trae, por ejemplo, «la opción avanzada
 * \Multiplicador de Población\»: son las comillas que escapó al generar el
 * fichero. Enseñadas tal cual parecen un fallo de la app.
 */
function quoteMarks(text: string): string {
  return text.replace(/\\(.+?)\\/g, '«$1»').replace(/\\/g, '')
}

/** «1000,00» y «1000.00» son el mismo número: el servidor escribe el del idioma. */
function decimal(text: string): number | undefined {
  const n = Number(text.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export const luaInternals = { extractZomboidMeta, readValue }
