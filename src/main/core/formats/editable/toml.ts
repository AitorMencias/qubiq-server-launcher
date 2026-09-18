import type { ConfigChange, ConfigOption, ConfigSection } from '@shared/editableConfig'
import { pathKey } from '@shared/editableConfig'
import {
  Lines,
  describe,
  extractForgeMeta,
  formatNumber,
  layoutList,
  resolveChanges,
  type EditableDocument,
  type ListLayout
} from './common'

/**
 * TOML de mods (Forge y NeoForge), editado por líneas.
 *
 * Es el formato que mejor se deja: Forge y NeoForge generan el fichero desde el
 * código del mod y escriben encima de cada opción su explicación, su valor por
 * defecto y lo que admite (§19.20). Aquí se aprovecha todo eso.
 *
 * Se editan valores sueltos y listas de valores sueltos, aunque ocupen varias
 * líneas. Las tablas en línea (`{ a = 1 }`), los textos de varias líneas y las
 * fechas se enseñan sin dejar tocarlos.
 */

interface TomlRecord {
  option: ConfigOption
  /** Tramo del valor: de `line:start` a `endLine:end`. */
  line: number
  start: number
  endLine: number
  end: number
  /** Cómo iba escrito un texto: `"` básico o `'` literal. */
  quote: '"' | "'" | null
  /** En las listas, de qué eran los elementos. */
  itemKind?: 'string' | 'number'
  itemQuote?: '"' | "'"
  /** Lista de números escritos con decimales (`[1.0, 2.5]`). */
  itemDecimal?: boolean
  layout?: ListLayout
}

const COMMENT = /^#+/

export function parseToml(content: string): EditableDocument {
  const text = Lines.parse(content)
  const lines = text.lines
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const records: TomlRecord[] = []
  const sections: ConfigSection[] = []

  let section: string[] = []
  const arrayTables = new Map<string, number>()
  let pending: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const trimmed = raw.trim()

    if (trimmed === '') {
      pending = []
      continue
    }
    if (trimmed.startsWith('#')) {
      pending.push(trimmed)
      continue
    }

    if (trimmed.startsWith('[')) {
      const header = /^\[\[(.+)\]\]|^\[(.+)\]/.exec(stripComment(trimmed).trim())
      if (header) {
        const path = splitDotted(header[1] ?? header[2]!)
        if (header[1] !== undefined) {
          // `[[tabla]]` se repite: cada aparición es un elemento distinto.
          const key = pathKey(path)
          const n = arrayTables.get(key) ?? 0
          arrayTables.set(key, n + 1)
          section = [...path, `#${n}`]
        } else {
          section = path
        }
        const description = describe(pending, COMMENT)
        if (description) sections.push({ path: section, description })
      }
      pending = []
      continue
    }

    const eq = findEquals(raw)
    if (eq === -1) {
      pending = []
      continue
    }

    const path = [...section, ...splitDotted(raw.slice(0, eq))]
    const meta = extractForgeMeta(pending)
    const base = {
      path,
      value: '',
      editable: true,
      description: describe(meta.rest, COMMENT),
      defaultValue: meta.defaultValue,
      allowed: meta.allowed,
      min: meta.min,
      max: meta.max
    }
    pending = []

    let start = eq + 1
    while (raw[start] === ' ' || raw[start] === '\t') start++
    const first = raw[start] ?? ''

    // --- Listas, que pueden ocupar varias líneas.
    if (first === '[') {
      const span = readArray(lines, i, start, eol)
      if (!span) {
        records.push(readOnly(base, raw.slice(start), 'es una lista que no se ha podido leer', i))
        continue
      }
      const editable = span.problem === null
      records.push({
        option: {
          ...base,
          type: 'list',
          items: span.items,
          editable,
          readOnlyReason: span.problem ?? undefined
        },
        line: i,
        start,
        endLine: span.endLine,
        end: span.end,
        quote: null,
        itemKind: span.itemKind,
        itemQuote: span.itemQuote,
        itemDecimal: span.itemDecimal,
        layout: span.layout
      })
      i = span.endLine
      continue
    }

    if (first === '{') {
      records.push(readOnly(base, stripComment(raw.slice(start)).trim(), 'es una tabla escrita en una línea', i))
      continue
    }

    if (raw.startsWith('"""', start) || raw.startsWith("'''", start)) {
      const fence = raw.slice(start, start + 3)
      let endLine = i
      if (raw.indexOf(fence, start + 3) === -1) {
        endLine = i + 1
        while (endLine < lines.length && !lines[endLine]!.includes(fence)) endLine++
      }
      records.push(readOnly(base, '', 'es un texto de varias líneas', i))
      i = Math.min(endLine, lines.length - 1)
      continue
    }

    const token = readScalar(raw, start)
    if (!token) {
      records.push(readOnly(base, stripComment(raw.slice(start)).trim(), 'tiene un formato que no se reconoce', i))
      continue
    }

    records.push({
      option: {
        ...base,
        type: token.type,
        value: token.value,
        editable: token.editable,
        readOnlyReason: token.editable ? undefined : 'tiene un formato que no se reconoce'
      },
      line: i,
      start,
      endLine: i,
      end: token.end,
      quote: token.quote
    })
  }

  return {
    config: { format: 'toml', options: records.map((r) => r.option), sections },
    apply(changes: ConfigChange[]): void {
      // Se da formato a todo antes de tocar nada: si un valor no vale, el
      // fichero se queda como estaba.
      const planned = resolveChanges(records, changes).map(({ record, value }) => ({
        record,
        replacement: format(record, value)
      }))
      planned.sort((a, b) => b.record.line - a.record.line)
      for (const { record, replacement } of planned) {
        const first = text.lines[record.line]!
        const last = text.lines[record.endLine]!
        text.replace(record.line, record.endLine, [
          first.slice(0, record.start) + replacement + last.slice(record.end)
        ])
      }
    },
    serialize: () => text.serialize()
  }
}

function readOnly(
  base: Omit<ConfigOption, 'type'>,
  value: string,
  reason: string,
  line: number
): TomlRecord {
  return {
    option: { ...base, type: 'text', value, editable: false, readOnlyReason: reason },
    line,
    start: 0,
    endLine: line,
    end: 0,
    quote: null
  }
}

// --- Lectura -----------------------------------------------------------------

/** El `=` de `clave = valor`, fuera de las comillas de la clave. */
function findEquals(raw: string): number {
  let quote: string | null = null
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '=') return i
    else if (c === '#') return -1
  }
  return -1
}

/** `a.b."c.d"` -> ['a', 'b', 'c.d']. */
function splitDotted(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  for (const c of text.trim()) {
    if (quote) {
      if (c === quote) quote = null
      else current += c
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '.') {
      parts.push(current.trim())
      current = ''
    } else current += c
  }
  parts.push(current.trim())
  return parts
}

/** Quita el comentario del final (`# ...`) respetando las comillas. */
function stripComment(text: string): string {
  let quote: string | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '#') return text.slice(0, i)
  }
  return text
}

interface Scalar {
  type: 'boolean' | 'integer' | 'number' | 'text'
  value: string
  end: number
  quote: '"' | "'" | null
  editable: boolean
}

/** Un valor suelto desde `start`: texto, número o booleano. */
function readScalar(raw: string, start: number): Scalar | null {
  const c = raw[start]
  if (c === '"' || c === "'") {
    const str = readString(raw, start)
    if (!str) return null
    return { type: 'text', value: str.value, end: str.end, quote: c, editable: true }
  }

  const token = /^[^\s,\]#]+/.exec(raw.slice(start))?.[0]
  if (!token) return null
  const end = start + token.length

  if (token === 'true' || token === 'false') {
    return { type: 'boolean', value: token, end, quote: null, editable: true }
  }
  if (/^[+-]?\d[\d_]*$/.test(token)) {
    return { type: 'integer', value: token.replace(/_/g, ''), end, quote: null, editable: true }
  }
  if (/^[+-]?\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d[\d_]*)?$/.test(token)) {
    return { type: 'number', value: token.replace(/_/g, ''), end, quote: null, editable: true }
  }
  // Hexadecimales, `inf`, `nan`, fechas: se enseñan tal cual.
  return { type: 'text', value: token, end, quote: null, editable: false }
}

function readString(raw: string, start: number): { value: string; end: number } | null {
  const q = raw[start]!
  let value = ''
  for (let i = start + 1; i < raw.length; i++) {
    const c = raw[i]!
    if (c === q) return { value, end: i + 1 }
    if (q === '"' && c === '\\') {
      const n = raw[++i]
      if (n === 'n') value += '\n'
      else if (n === 't') value += '\t'
      else if (n === 'r') value += '\r'
      else if (n === 'u' || n === 'U') {
        const len = n === 'u' ? 4 : 8
        value += String.fromCodePoint(parseInt(raw.slice(i + 1, i + 1 + len), 16))
        i += len
      } else value += n ?? ''
      continue
    }
    value += c
  }
  return null
}

/**
 * Una lista `[...]` desde `line:start`, aunque siga en otras líneas. Solo es
 * editable si sus elementos son todos textos o todos números y no hay
 * comentarios dentro (se perderían al reescribirla).
 */
function readArray(
  lines: string[],
  line: number,
  start: number,
  eol: string
): {
  items: string[]
  endLine: number
  end: number
  problem: string | null
  itemKind?: 'string' | 'number'
  itemQuote?: '"' | "'"
  itemDecimal?: boolean
  layout?: ListLayout
} | null {
  const items: string[] = []
  const kinds = new Set<string>()
  let itemQuote: '"' | "'" | undefined
  let itemDecimal = false
  let problem: string | null = null
  /** Sangría del primer elemento, si empieza en su propia línea. */
  let itemIndent: string | null | undefined

  let l = line
  let i = start + 1
  while (l < lines.length) {
    while (i < lines[l]!.length) {
      const raw = lines[l]!
      const c = raw[i]!
      if (c === ' ' || c === '\t' || c === ',') {
        i++
        continue
      }
      if (c === '#') {
        problem = 'tiene comentarios entre sus elementos'
        break
      }
      if (c === ']') {
        const kind = [...kinds]
        if (kind.length > 1) problem ??= 'mezcla textos y números'
        const closeIndent = l > line && raw.slice(0, i).trim() === '' ? raw.slice(0, i) : null
        return {
          items,
          endLine: l,
          end: i + 1,
          problem,
          itemKind: kind[0] === 'number' ? 'number' : 'string',
          itemQuote,
          itemDecimal,
          layout:
            itemIndent && closeIndent !== null
              ? { itemIndent, closeIndent, eol }
              : undefined
        }
      }
      if (itemIndent === undefined) {
        itemIndent = l > line && raw.slice(0, i).trim() === '' ? raw.slice(0, i) : null
      }
      if (c === '[' || c === '{') {
        // Listas de listas o de tablas: se busca el cierre para no perderse,
        // pero no se ofrece editarla.
        problem = 'sus elementos tienen varias partes'
        const close = findClose(lines, l, i)
        if (!close) return null
        l = close.line
        i = close.end
        items.push('…')
        continue
      }
      const token = readScalar(raw, i)
      if (!token) return null
      if (token.type === 'text' && token.quote === null) problem ??= 'tiene un formato que no se reconoce'
      if (token.quote) itemQuote ??= token.quote
      kinds.add(token.type === 'text' ? 'string' : token.type === 'boolean' ? 'boolean' : 'number')
      if (token.type === 'boolean') problem ??= 'es una lista de sí o no'
      if (token.type === 'number') itemDecimal = true
      items.push(token.value)
      i = token.end
    }
    l++
    i = 0
  }
  return null
}

function findClose(lines: string[], line: number, start: number): { line: number; end: number } | null {
  let depth = 0
  let quote: string | null = null
  for (let l = line; l < lines.length; l++) {
    const raw = lines[l]!
    for (let i = l === line ? start : 0; i < raw.length; i++) {
      const c = raw[i]!
      if (quote) {
        if (c === '\\' && quote === '"') i++
        else if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'") quote = c
      else if (c === '#') break
      else if (c === '[' || c === '{') depth++
      else if (c === ']' || c === '}') {
        depth--
        if (depth === 0) return { line: l, end: i + 1 }
      }
    }
  }
  return null
}

// --- Escritura ---------------------------------------------------------------

function tomlString(value: string, original: '"' | "'" | null | undefined): string {
  // Un literal ('...') no admite escapes: solo se conserva si el texto nuevo
  // cabe en él.
  if (original === "'" && !value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/[\u0000-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `"${escaped}"`
}

function format(record: TomlRecord, value: unknown): string {
  const { option } = record
  switch (option.type) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'integer':
      return String(value)
    case 'number':
      // En TOML 5 y 5.0 son tipos distintos, y Forge rechaza el que no toca.
      return formatNumber(value as number, true)
    case 'text':
      return tomlString(String(value), record.quote)
    case 'list': {
      const items = value as string[]
      if (record.itemKind === 'number') {
        const bad = items.find((v) => !Number.isFinite(Number(v)))
        if (bad !== undefined) {
          throw new Error(`«${option.path.join('.')}» solo admite números, y «${bad}» no lo es.`)
        }
        return layoutList(
          items.map((v) => formatNumber(Number(v), record.itemDecimal ?? false)),
          record.layout
        )
      }
      return layoutList(
        items.map((v) => tomlString(v, record.itemQuote)),
        record.layout
      )
    }
  }
}
