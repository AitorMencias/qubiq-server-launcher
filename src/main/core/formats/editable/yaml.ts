import type { ConfigChange, ConfigOption, ConfigSection } from '@shared/editableConfig'
import {
  Lines,
  describe,
  formatNumber,
  plainType,
  resolveChanges,
  type EditableDocument
} from './common'

/**
 * YAML de plugins (Bukkit, Spigot, Paper), editado por líneas.
 *
 * No es un parser de YAML y no pretende serlo: reconoce lo que escriben los
 * plugins de verdad —secciones anidadas, valores sueltos, listas con guiones y
 * listas entre corchetes— y todo lo demás lo enseña sin dejar tocarlo. Es la
 * misma idea que `PluginConfigFile`, pero para ficheros que no conocemos.
 *
 * Lo que se entiende como descripción: las líneas de comentario pegadas
 * encima de la clave. Una línea en blanco las separa, así que la cabecera del
 * fichero o el título de un bloque no se cuelan en la primera opción. Y una
 * opción desactivada con `#clave: valor` tampoco cuenta como explicación.
 */

interface YamlRecord {
  option: ConfigOption
  /** Línea de la clave. */
  line: number
  kind: 'scalar' | 'block-list' | 'flow-list'
  /** Columnas del valor en la línea de la clave (escalares y listas en corchetes). */
  start: number
  end: number
  quote: '"' | "'" | null
  /** Listas con guiones: sus líneas y cómo iban escritas. */
  itemsFrom?: number
  itemsTo?: number
  itemIndent?: string
  itemQuote?: '"' | "'" | null
}

const COMMENT = /^#+/

export function parseYaml(content: string): EditableDocument {
  const text = Lines.parse(content)
  const lines = text.lines
  const records: YamlRecord[] = []
  const sections: ConfigSection[] = []

  let pending: string[] = []
  const stack: { indent: number; key: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const trimmed = raw.trim()

    if (trimmed === '') {
      pending = []
      continue
    }
    if (trimmed.startsWith('#')) {
      // `#clave: valor` sin espacio es una opción apagada, no una explicación.
      if (/^#[^\s#]/.test(trimmed) && parseKey(trimmed.slice(1))) pending = []
      else pending.push(trimmed)
      continue
    }
    if (trimmed === '---' || trimmed === '...' || trimmed.startsWith('%')) {
      pending = []
      continue
    }

    const indent = raw.length - raw.trimStart().length
    const key = parseKey(raw.slice(indent))
    if (!key || trimmed.startsWith('- ') || trimmed === '-') {
      // Un elemento suelto de lista que no ha recogido ninguna clave, o algo
      // que no sabemos leer: no se enseña ni se toca.
      pending = []
      continue
    }

    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const path = [...stack.map((s) => s.key), key.name]

    const valueCol = indent + key.valueOffset
    const { value, valueStart, valueEnd, comment } = splitComment(raw, valueCol)
    const description = joinDescription(describe(pending, COMMENT), comment)
    pending = []

    const base = { path, description, value: '', editable: true }

    if (value === '') {
      const next = nextSignificant(lines, i + 1)
      const nextLine = next === -1 ? '' : lines[next]!
      const nextIndent = nextLine.length - nextLine.trimStart().length
      const nextTrim = nextLine.trim()

      if (next !== -1 && (nextTrim.startsWith('- ') || nextTrim === '-') && nextIndent >= indent) {
        const list = readBlockList(lines, next, nextIndent)
        records.push({
          option: {
            ...base,
            type: 'list',
            items: list.items,
            editable: list.simple,
            readOnlyReason: list.simple ? undefined : list.reason
          },
          line: i,
          kind: 'block-list',
          start: valueStart,
          end: valueEnd,
          quote: null,
          itemsFrom: next,
          itemsTo: list.to,
          itemIndent: nextLine.slice(0, nextIndent),
          itemQuote: list.quote
        })
        i = list.to
        continue
      }

      if (next !== -1 && nextIndent > indent) {
        // Una sección: sus claves van debajo, más adentro.
        stack.push({ indent, key: key.name })
        if (description) sections.push({ path, description })
        continue
      }

      // `clave:` sin nada es un valor vacío (null). Si debajo hay ejemplos
      // comentados con guiones (`#- Notch`), es una lista que se ha dejado
      // vacía: se ofrece como lista y se escribe entre corchetes.
      if (/^\s*#\s*-(\s|$)/.test(lines[i + 1] ?? '')) {
        records.push({
          option: { ...base, type: 'list', items: [] },
          line: i,
          kind: 'flow-list',
          start: valueStart,
          end: valueEnd,
          quote: null
        })
        continue
      }
      records.push(readOnly(base, 'text', '', 'está vacío y no se sabe qué tipo de valor espera', i))
      continue
    }

    const first = value[0]!

    if (first === '|' || first === '>') {
      const to = skipDeeper(lines, i + 1, indent)
      records.push(readOnly(base, 'text', blockText(lines, i + 1, to), 'es un texto de varias líneas', i))
      i = to
      continue
    }

    if (first === '[') {
      const items = value.endsWith(']') ? splitFlow(value.slice(1, -1)) : null
      if (items) {
        records.push({
          option: { ...base, type: 'list', items: items.map(unquote) },
          line: i,
          kind: 'flow-list',
          start: valueStart,
          end: valueEnd,
          quote: null
        })
      } else {
        const to = skipDeeper(lines, i + 1, indent)
        records.push(readOnly(base, 'text', value, 'es una lista con elementos compuestos', i))
        i = to
      }
      continue
    }

    if (first === '{') {
      const to = skipDeeper(lines, i + 1, indent)
      records.push(readOnly(base, 'text', value, 'es un grupo de valores escrito en una línea', i))
      i = to
      continue
    }

    if (first === '&' || first === '*' || first === '!') {
      const to = skipDeeper(lines, i + 1, indent)
      records.push(readOnly(base, 'text', value, 'usa anclas o etiquetas de YAML', i))
      i = to
      continue
    }

    const quote = first === '"' || first === "'" ? first : null
    const closed = quote === null || closesQuote(value, quote)
    const continued = skipDeeper(lines, i + 1, indent)
    if (!closed || continued > i) {
      // Texto partido en varias líneas: se enseña, pero reescribirlo por
      // líneas es fácil de hacer mal.
      records.push(readOnly(base, 'text', unquote(value), 'es un texto de varias líneas', i))
      i = continued
      continue
    }

    records.push({
      option: {
        ...base,
        type: quote ? 'text' : plainType(value),
        value: unquote(value)
      },
      line: i,
      kind: 'scalar',
      start: valueStart,
      end: valueEnd,
      quote
    })
  }

  return {
    config: { format: 'yaml', options: records.map((r) => r.option), sections },
    apply(changes: ConfigChange[]): void {
      const resolved = resolveChanges(records, changes)
      // De abajo arriba: cambiar una lista mueve las líneas de lo que va detrás.
      resolved.sort((a, b) => b.record.line - a.record.line)
      for (const { record, value } of resolved) write(text, record, value)
    },
    serialize: () => text.serialize()
  }

  function readOnly(
    base: { path: string[]; description: string | null },
    type: 'text',
    value: string,
    reason: string,
    line: number
  ): YamlRecord {
    return {
      option: { ...base, type, value, editable: false, readOnlyReason: reason },
      line,
      kind: 'scalar',
      start: 0,
      end: 0,
      quote: null
    }
  }
}

// --- Lectura -----------------------------------------------------------------

/**
 * `clave: valor`, `"clave con: dos puntos": valor`. Devuelve dónde empieza el
 * valor, contando desde el principio de la clave.
 */
function parseKey(s: string): { name: string; valueOffset: number } | null {
  if (s.startsWith('"') || s.startsWith("'")) {
    const q = s[0]!
    let j = 1
    while (j < s.length) {
      if (s[j] === q) {
        if (q === "'" && s[j + 1] === "'") {
          j += 2
          continue
        }
        break
      }
      if (q === '"' && s[j] === '\\') j++
      j++
    }
    if (j >= s.length) return null
    const after = /^\s*:(?=\s|$)/.exec(s.slice(j + 1))
    if (!after) return null
    return { name: unquote(s.slice(0, j + 1)), valueOffset: j + 1 + after[0].length }
  }

  const colon = /:(?=\s|$)/.exec(s)
  if (!colon) return null
  const name = s.slice(0, colon.index).trimEnd()
  if (name === '' || name.includes(' #') || /^[#[\]{},&*!|>%@`?-]\s/.test(name)) return null
  if (/^[[{]/.test(name)) return null
  return { name, valueOffset: colon.index + 1 }
}

/**
 * Separa el valor del comentario del final de la línea, teniendo en cuenta que
 * `#` dentro de unas comillas es texto. Devuelve el valor ya recortado y la
 * columna donde acaba, para poder sustituir exactamente ese trozo.
 */
function splitComment(
  raw: string,
  from: number
): { value: string; valueStart: number; valueEnd: number; comment: string | null } {
  let i = from
  while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) i++
  const start = i
  let end = raw.length
  let comment: string | null = null

  const q = raw[start]
  let j = start
  if (q === '"' || q === "'") {
    j++
    while (j < raw.length) {
      if (raw[j] === q) {
        if (q === "'" && raw[j + 1] === "'") {
          j += 2
          continue
        }
        j++
        break
      }
      if (q === '"' && raw[j] === '\\') j++
      j++
    }
  }
  for (; j < raw.length; j++) {
    if (raw[j] === '#' && (j === start || raw[j - 1] === ' ' || raw[j - 1] === '\t')) {
      end = j
      comment = raw.slice(j + 1).trim()
      break
    }
  }
  while (end > start && (raw[end - 1] === ' ' || raw[end - 1] === '\t')) end--

  return { value: raw.slice(start, end), valueStart: start, valueEnd: end, comment: comment || null }
}

function joinDescription(above: string | null, inline: string | null): string | null {
  if (above && inline) return `${above}\n${inline}`
  return above ?? inline
}

/** Siguiente línea que no es blanca ni comentario, o -1. */
function nextSignificant(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    const t = lines[i]!.trim()
    if (t !== '' && !t.startsWith('#')) return i
  }
  return -1
}

/**
 * Última línea que pertenece a la clave de sangría `indent` (lo que va más
 * adentro), sin llevarse los comentarios y blancos que ya son de la siguiente.
 * Si no hay nada más adentro, devuelve `from - 1`.
 */
function skipDeeper(lines: string[], from: number, indent: number): number {
  let last = from - 1
  for (let i = from; i < lines.length; i++) {
    const raw = lines[i]!
    const t = raw.trim()
    if (t === '' || t.startsWith('#')) continue
    if (raw.length - raw.trimStart().length <= indent) break
    last = i
  }
  return last
}

function blockText(lines: string[], from: number, to: number): string {
  return lines
    .slice(from, to + 1)
    .map((l) => l.trim())
    .join('\n')
}

/**
 * Una lista con guiones. Es editable si todos sus elementos son valores
 * sueltos de una línea y no hay comentarios entre ellos (se perderían al
 * reescribirla).
 */
function readBlockList(
  lines: string[],
  from: number,
  itemIndent: number
): { items: string[]; to: number; simple: boolean; reason: string; quote: '"' | "'" | null } {
  const items: string[] = []
  let to = from
  let simple = true
  let reason = ''
  let quote: '"' | "'" | null = null
  let sawComment = false

  for (let i = from; i < lines.length; i++) {
    const raw = lines[i]!
    const t = raw.trim()
    if (t === '') continue
    const indent = raw.length - raw.trimStart().length
    if (t.startsWith('#')) {
      if (indent < itemIndent) break
      sawComment = true
      continue
    }
    if (indent < itemIndent) break
    if (indent === itemIndent && !(t.startsWith('- ') || t === '-')) break

    if (indent > itemIndent) {
      simple = false
      reason = 'sus elementos tienen varias partes'
      to = i
      continue
    }

    // Los comentarios entre elementos cuentan; los que van detrás del último
    // son ya de la opción siguiente.
    if (sawComment) {
      simple = false
      reason = 'tiene comentarios entre sus elementos'
    }

    const item = t === '-' ? '' : t.slice(2).trim()
    const { value } = splitComment(item, 0)
    if (value === '' || /^[[{&*!|>]/.test(value) || parseKey(value)) {
      simple = false
      reason = 'sus elementos tienen varias partes'
    }
    if (items.length === 0) quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : null
    items.push(unquote(value))
    to = i
  }

  return { items, to, simple, reason, quote }
}

/** Elementos de `[a, "b, c", 'd']`, o null si hay algo anidado. */
function splitFlow(inner: string): string[] | null {
  const items: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!
    if (quote) {
      current += c
      if (c === '\\' && quote === '"') current += inner[++i] ?? ''
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    if (c === '[' || c === ']' || c === '{' || c === '}') return null
    if (c === ',') {
      items.push(current.trim())
      current = ''
      continue
    }
    current += c
  }
  if (quote) return null
  if (current.trim() !== '') items.push(current.trim())
  return items
}

function closesQuote(value: string, q: string): boolean {
  if (value.length < 2 || !value.endsWith(q)) return false
  if (q === '"') {
    let backslashes = 0
    for (let i = value.length - 2; i >= 0 && value[i] === '\\'; i--) backslashes++
    return backslashes % 2 === 0
  }
  return true
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\/nt])/g, (_, c: string) =>
      c === 'n' ? '\n' : c === 't' ? '\t' : c
    )
  }
  return value
}

// --- Escritura ---------------------------------------------------------------

/** ¿Hay que entrecomillar este texto para que YAML no lo lea como otra cosa? */
function needsQuotes(value: string, inFlow: boolean): boolean {
  if (value === '' || value !== value.trim()) return true
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true
  if (value.includes(': ') || value.includes(' #') || value.endsWith(':')) return true
  if (/^(true|false|yes|no|on|off|y|n|null|~)$/i.test(value)) return true
  if (plainType(value) !== 'text') return true
  if (inFlow && /[,[\]{}]/.test(value)) return true
  return false
}

function quoteWith(value: string, quote: '"' | "'"): string {
  return quote === "'"
    ? `'${value.replace(/'/g, "''")}'`
    : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function formatText(value: string, original: '"' | "'" | null, inFlow = false): string {
  if (original) return quoteWith(value, original)
  return needsQuotes(value, inFlow) ? quoteWith(value, '"') : value
}

function formatScalar(record: YamlRecord, value: unknown): string {
  const { option } = record
  if (option.type === 'boolean') return value ? 'true' : 'false'
  if (option.type === 'integer') return String(value)
  if (option.type === 'number') {
    return formatNumber(value as number, /[.eE]/.test(option.value))
  }
  return formatText(String(value), record.quote)
}

/**
 * Pone `value` en el hueco `start..end` de la línea. Si ahí no había nada
 * (`clave:` a secas, o seguida de un comentario) se separa con un espacio.
 */
function splice(raw: string, start: number, end: number, value: string): string {
  const before = raw.slice(0, start)
  const after = raw.slice(end)
  const lead = /\s$/.test(before) ? '' : ' '
  const trail = after !== '' && !/^\s/.test(after) ? ' ' : ''
  return `${before}${lead}${value}${trail}${after}`
}

function write(text: Lines, record: YamlRecord, value: unknown): void {
  const raw = text.lines[record.line]!

  if (record.kind === 'scalar') {
    text.replace(record.line, record.line, [
      splice(raw, record.start, record.end, formatScalar(record, value))
    ])
    return
  }

  const items = value as string[]

  if (record.kind === 'flow-list') {
    const flow = `[${items.map((v) => formatText(v, null, true)).join(', ')}]`
    text.replace(record.line, record.line, [splice(raw, record.start, record.end, flow)])
    return
  }

  // Lista con guiones. Lo que hay entre la clave y el primer elemento
  // (comentarios, blancos) se queda donde está; solo cambian los elementos.
  const itemLines = items.map((v) => `${record.itemIndent}- ${formatText(v, record.itemQuote ?? null)}`)
  text.replace(record.itemsFrom!, record.itemsTo!, itemLines)

  // Vacía no se puede escribir con guiones: pasa a `clave: []`.
  if (items.length === 0) {
    text.replace(record.line, record.line, [splice(raw, record.start, record.end, '[]')])
  }
}
