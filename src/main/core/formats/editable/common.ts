import type {
  ConfigChange,
  ConfigChangeValue,
  ConfigOption,
  EditableConfig
} from '@shared/editableConfig'
import { pathKey } from '@shared/editableConfig'

/**
 * Piezas comunes de los editores de `core/formats/editable/`.
 *
 * ⚠ La regla de todos ellos es la de `KeyValueFile` y `PluginConfigFile`: el
 * fichero lo ha escrito su plugin o su mod, lleno de comentarios que explican
 * cada opción, y reescribirlo con un serializador los borraría. Aquí nunca se
 * reescribe nada entero: se localiza el trozo exacto del valor y se sustituye
 * ese trozo. Todo lo demás —comentarios, espacios, orden, saltos de línea—
 * sale byte a byte como entró.
 */

export interface EditableDocument {
  /** Lo que se ha leído. Tras `apply` queda desfasado: se vuelve a leer. */
  readonly config: EditableConfig
  /** Aplica los cambios o lanza un error legible sin haber tocado nada. */
  apply(changes: ConfigChange[]): void
  serialize(): string
}

// --- Líneas ------------------------------------------------------------------

/**
 * Un fichero partido en líneas que recuerda el salto de cada una, para que un
 * fichero con saltos de Unix siga siéndolo y uno mezclado no se "arregle".
 */
export class Lines {
  private constructor(
    readonly bom: boolean,
    readonly lines: string[],
    private readonly ends: string[]
  ) {}

  static parse(content: string): Lines {
    const bom = content.startsWith('\uFEFF')
    const text = bom ? content.slice(1) : content
    const parts = text.split(/(\r\n|\n|\r)/)
    const lines: string[] = []
    const ends: string[] = []
    for (let i = 0; i < parts.length; i += 2) {
      lines.push(parts[i]!)
      ends.push(parts[i + 1] ?? '')
    }
    return new Lines(bom, lines, ends)
  }

  /** Sustituye las líneas `from..to` (incluidas) por otras. */
  replace(from: number, to: number, replacement: string[]): void {
    const end = this.ends[to] ?? ''
    // Las líneas nuevas llevan el salto de la primera que sustituyen, y la
    // última el de la última: así el final del fichero queda igual.
    const eol = this.ends[from] || end || '\n'
    const newEnds = replacement.map((_, i) => (i === replacement.length - 1 ? end : eol))
    this.lines.splice(from, to - from + 1, ...replacement)
    this.ends.splice(from, to - from + 1, ...newEnds)
  }

  serialize(): string {
    let out = this.bom ? '\uFEFF' : ''
    for (let i = 0; i < this.lines.length; i++) out += this.lines[i]! + this.ends[i]!
    return out
  }
}

// --- Comentarios -------------------------------------------------------------

/**
 * Convierte las líneas de comentario que hay encima de una opción en su
 * descripción: sin marcas, sin banners de adorno y respetando los saltos.
 *
 * `marker` quita la marca de comentario del principio (`#`, `//`, `*`...).
 */
export function describe(raw: string[], marker: RegExp): string | null {
  const out: string[] = []
  for (const line of raw) {
    let text = line.trim().replace(marker, '')
    // Banners como `# |  TEXTO  | #` o `#### TÍTULO ####`.
    text = text.replace(/#+\s*$/, '').trim()
    const boxed = /^\|(.*)\|$/.exec(text)
    if (boxed) text = boxed[1]!.trim()
    // Líneas que solo son adorno: `+-----+`, `=====`, `#####`.
    if (text !== '' && /^[-=+*_~#|.<>\s]+$/.test(text)) continue
    out.push(text)
  }

  // Sin huecos al principio ni al final, y nunca dos seguidos.
  const lines: string[] = []
  for (const line of out) {
    if (line === '' && (lines.length === 0 || lines[lines.length - 1] === '')) continue
    lines.push(line)
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * Los metadatos que Forge y NeoForge escriben en los comentarios de sus TOML:
 *
 *     # Default: 128
 *     # Range: > 0
 *     #Allowed Values: INFINITE, DEFAULT, X2
 *
 * Se sacan de la descripción y se devuelven aparte para que la interfaz
 * valide, ofrezca un desplegable y sepa restablecer.
 */
export function extractForgeMeta(raw: string[]): {
  rest: string[]
  defaultValue?: string
  allowed?: string[]
  min?: number
  max?: number
} {
  const rest: string[] = []
  const meta: { defaultValue?: string; allowed?: string[]; min?: number; max?: number } = {}

  for (const line of raw) {
    const m = /^\s*#\s*(Default|Range|Allowed Values)\s*:\s*(.*?)\s*$/.exec(line)
    if (!m) {
      rest.push(line)
      continue
    }
    const [, name, value] = m as unknown as [string, string, string]
    if (name === 'Default') {
      meta.defaultValue = value.replace(/^"(.*)"$/, '$1')
    } else if (name === 'Allowed Values') {
      meta.allowed = value.split(',').map((v) => v.trim()).filter((v) => v !== '')
    } else {
      // «0 ~ 100», «> 0» (sin tope) o «< 10» (sin suelo). Los extremos cuentan.
      const between = /^(\S+)\s*~\s*(\S+)$/.exec(value)
      const above = /^>\s*(\S+)$/.exec(value)
      const below = /^<\s*(\S+)$/.exec(value)
      if (between) {
        meta.min = finite(between[1]!)
        meta.max = finite(between[2]!)
      } else if (above) meta.min = finite(above[1]!)
      else if (below) meta.max = finite(below[1]!)
      else rest.push(line)
    }
  }
  return { rest, ...meta }
}

function finite(text: string): number | undefined {
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

// --- Validación --------------------------------------------------------------

/** Nombre de la opción para los errores: `settings.debug`. */
export function optionName(option: ConfigOption): string {
  return option.path.join('.')
}

/**
 * Comprueba un cambio contra lo que se sabe de la opción y lo deja en su tipo.
 * Los errores van dirigidos al usuario: se enseñan tal cual.
 */
export function normalizeChange(option: ConfigOption, value: ConfigChangeValue): ConfigChangeValue {
  const name = `«${optionName(option)}»`
  if (!option.editable) {
    throw new Error(`${name} no se puede cambiar desde aquí: ${option.readOnlyReason ?? 'formato no admitido'}.`)
  }

  switch (option.type) {
    case 'boolean': {
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 'false') return value === 'true'
      throw new Error(`${name} tiene que ser sí o no.`)
    }
    case 'integer': {
      // Como texto: hay mods con enteros de 64 bits (9223372036854775807) que
      // un `number` de JavaScript redondea.
      const text = String(value).trim().replace(/^\+/, '')
      if (!/^-?\d+$/.test(text)) {
        throw new Error(
          Number.isFinite(Number(text)) && text !== ''
            ? `${name} tiene que ser un número entero, sin decimales.`
            : `${name} tiene que ser un número.`
        )
      }
      const n = Number(text)
      if (option.min !== undefined && n < option.min) {
        throw new Error(`${name} no puede ser menor que ${option.min}.`)
      }
      if (option.max !== undefined && n > option.max) {
        throw new Error(`${name} no puede ser mayor que ${option.max}.`)
      }
      return text
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).trim())
      if (String(value).trim() === '' || !Number.isFinite(n)) {
        throw new Error(`${name} tiene que ser un número.`)
      }
      if (option.min !== undefined && n < option.min) {
        throw new Error(`${name} no puede ser menor que ${option.min}.`)
      }
      if (option.max !== undefined && n > option.max) {
        throw new Error(`${name} no puede ser mayor que ${option.max}.`)
      }
      return n
    }
    case 'text': {
      const text = String(value)
      if (/[\r\n]/.test(text)) throw new Error(`${name} no admite saltos de línea.`)
      if (option.allowed && !option.allowed.includes(text)) {
        throw new Error(`${name} tiene que ser uno de estos: ${option.allowed.join(', ')}.`)
      }
      return text
    }
    case 'list': {
      if (!Array.isArray(value)) throw new Error(`${name} tiene que ser una lista.`)
      const items = value.map((v) => String(v).trim()).filter((v) => v !== '')
      return items
    }
  }
}

/**
 * ¿El cambio deja la opción como estaba? Entonces no se toca: reescribir el
 * mismo valor cambiaría cómo iba escrito (`1.6E7` pasaría a `16000000.0`, una
 * lista de varias líneas a una sola) sin que nadie lo haya pedido.
 */
function unchanged(option: ConfigOption, value: ConfigChangeValue): boolean {
  switch (option.type) {
    case 'boolean':
      return String(value) === option.value.toLowerCase()
    case 'integer':
      try {
        return BigInt(String(value).trim().replace(/^\+/, '')) === BigInt(option.value)
      } catch {
        return false
      }
    case 'number':
      return String(value).trim() !== '' && Number(value) === Number(option.value)
    case 'text':
      return String(value) === option.value
    case 'list': {
      if (!Array.isArray(value)) return false
      const items = value.map((v) => String(v).trim()).filter((v) => v !== '')
      const current = option.items ?? []
      return items.length === current.length && items.every((v, i) => v === current[i])
    }
  }
}

/**
 * Casa cada cambio con su opción y lo valida, todos antes de escribir nada:
 * si uno está mal, no se aplica ninguno. Los que no cambian nada se descartan.
 */
export function resolveChanges<T extends { option: ConfigOption }>(
  records: T[],
  changes: ConfigChange[]
): { record: T; value: ConfigChangeValue }[] {
  const byPath = new Map(records.map((r) => [pathKey(r.option.path), r]))
  const resolved: { record: T; value: ConfigChangeValue }[] = []
  for (const change of changes) {
    const record = byPath.get(pathKey(change.path))
    if (!record) {
      throw new Error(
        `La opción «${change.path.join('.')}» ya no está en el fichero. Vuelve a abrirlo por si ha cambiado.`
      )
    }
    if (unchanged(record.option, change.value)) continue
    resolved.push({ record, value: normalizeChange(record.option, change.value) })
  }
  return resolved
}

/**
 * Cómo iba escrita una lista que ocupa varias líneas, para reescribirla igual:
 * un elemento por línea, con la misma sangría.
 */
export interface ListLayout {
  itemIndent: string
  closeIndent: string
  eol: string
}

export function layoutList(items: string[], layout: ListLayout | undefined): string {
  if (!layout || items.length === 0) return `[${items.join(', ')}]`
  const { itemIndent, closeIndent, eol } = layout
  return `[${eol}${items.map((i) => itemIndent + i).join(`,${eol}`)}${eol}${closeIndent}]`
}

/**
 * Últimos retoques comunes a todos los formatos: un texto con saltos de línea
 * no se puede editar en un campo de una línea sin destrozarlo.
 */
export function finalizeOptions(options: ConfigOption[]): void {
  for (const option of options) {
    if (option.type === 'text' && option.editable && /[\r\n]/.test(option.value)) {
      option.editable = false
      option.readOnlyReason = 'es un texto de varias líneas'
    }
  }
}

/** Tipo de un valor escrito sin comillas. */
export function plainType(text: string): 'boolean' | 'integer' | 'number' | 'text' {
  if (/^(true|false)$/i.test(text)) return 'boolean'
  if (/^[-+]?\d+$/.test(text)) return 'integer'
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(text)) return 'number'
  return 'text'
}

/**
 * Un número escrito respetando lo que había: si el fichero tenía `5.0`, un 5
 * se escribe `5.0`. Hay lectores que distinguen decimal de entero y no aceptan
 * el uno donde esperaban el otro.
 */
export function formatNumber(n: number, wasDecimal: boolean): string {
  const text = String(n)
  if (wasDecimal && Number.isInteger(n) && !/e/i.test(text)) return `${text}.0`
  return text
}
