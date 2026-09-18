import type { ConfigChange, ConfigOption, ConfigSection } from '@shared/editableConfig'
import {
  describe,
  formatNumber,
  layoutList,
  resolveChanges,
  type EditableDocument,
  type ListLayout
} from './common'

/**
 * JSON y JSON5 de mods (sobre todo de Fabric), editados en su sitio.
 *
 * Se recorre el texto a mano en vez de usar `JSON.parse` por dos motivos: hay
 * que saber en qué posición exacta está cada valor para sustituir solo ese
 * trozo, y los JSON5 llevan comentarios, claves sin comillas y comas al final,
 * que `JSON.parse` no acepta.
 *
 * El JSON normal no admite comentarios, así que ahí no hay descripciones: el
 * mod no ha tenido dónde ponerlas. En JSON5 se leen igual que en los otros
 * formatos, del comentario pegado encima de la clave.
 */

interface JsonRecord {
  option: ConfigOption
  start: number
  end: number
  /** En las listas, de qué eran los elementos. */
  itemKind?: 'string' | 'number'
  itemDecimal?: boolean
  layout?: ListLayout
}

const COMMENT = /^(\/\/+|\/\*+|\*+\/?)\s?/

export function parseJson(content: string): EditableDocument {
  const records: JsonRecord[] = []
  const sections: ConfigSection[] = []
  let pos = 0

  const fail = (what: string): never => {
    const line = content.slice(0, pos).split('\n').length
    throw new Error(`El fichero no es un JSON válido (línea ${line}: ${what}).`)
  }

  /** Salta blancos y comentarios; devuelve los comentarios que ha pasado. */
  function skip(): string[] {
    const comments: string[] = []
    for (;;) {
      const c = content[pos]
      if (c === undefined) return comments
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c.charCodeAt(0) === 0xfeff) {
        // Una línea en blanco separa el comentario de la clave, igual que en
        // los otros formatos.
        if (c === '\n' && blankLineFollows(content, pos + 1)) comments.length = 0
        pos++
        continue
      }
      if (content.startsWith('//', pos)) {
        const end = content.indexOf('\n', pos)
        const stop = end === -1 ? content.length : end
        comments.push(content.slice(pos, stop))
        pos = stop
        continue
      }
      if (content.startsWith('/*', pos)) {
        const end = content.indexOf('*/', pos + 2)
        if (end === -1) fail('comentario sin cerrar')
        for (const line of content.slice(pos, end + 2).split(/\r?\n/)) comments.push(line.replace(/\*\/\s*$/, ''))
        pos = end + 2
        continue
      }
      return comments
    }
  }

  function readString(): string {
    const q = content[pos]!
    let value = ''
    pos++
    while (pos < content.length) {
      const c = content[pos]!
      if (c === q) {
        pos++
        return value
      }
      if (c === '\\') {
        const n = content[pos + 1]
        pos += 2
        if (n === 'n') value += '\n'
        else if (n === 't') value += '\t'
        else if (n === 'r') value += '\r'
        else if (n === 'b') value += '\b'
        else if (n === 'f') value += '\f'
        else if (n === 'u') {
          value += String.fromCharCode(parseInt(content.slice(pos, pos + 4), 16))
          pos += 4
        } else if (n === '\r' || n === '\n') {
          // Continuación de línea de JSON5.
          if (n === '\r' && content[pos] === '\n') pos++
        } else value += n ?? ''
        continue
      }
      value += c
      pos++
    }
    return fail('texto sin cerrar')
  }

  function readKey(): string {
    const c = content[pos]
    if (c === '"' || c === "'") return readString()
    const m = /^[A-Za-z_$][\w$-]*/.exec(content.slice(pos, pos + 256))
    if (!m) fail('se esperaba el nombre de una clave')
    pos += m![0].length
    return m![0]
  }

  type Scalar = { type: 'boolean' | 'integer' | 'number' | 'text' | 'null'; value: string; quoted: boolean }

  function readScalar(): Scalar | null {
    const c = content[pos]
    if (c === '"' || c === "'") return { type: 'text', value: readString(), quoted: true }
    const m = /^[^\s,\]}/]+/.exec(content.slice(pos, pos + 512))
    if (!m) return null
    const token = m[0]
    pos += token.length
    if (token === 'true' || token === 'false') return { type: 'boolean', value: token, quoted: false }
    if (token === 'null') return { type: 'null', value: '', quoted: false }
    if (/^[-+]?\d+$/.test(token)) return { type: 'integer', value: token.replace(/^\+/, ''), quoted: false }
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(token)) {
      return { type: 'number', value: token.replace(/^\+/, ''), quoted: false }
    }
    // Hexadecimales, Infinity, NaN: se enseñan, no se tocan.
    return { type: 'text', value: token, quoted: false }
  }

  function readValue(path: string[], description: string | null): void {
    const c = content[pos]
    const start = pos

    if (c === '{') {
      if (path.length > 0 && description) sections.push({ path, description })
      const from = records.length
      pos++
      for (;;) {
        const comments = skip()
        if (content[pos] === '}') {
          pos++
          foldSlashComments(path, from)
          return
        }
        const key = readKey()
        skip()
        if (content[pos] !== ':') fail(`faltan los dos puntos después de «${key}»`)
        pos++
        skip()
        readValue([...path, key], describe(comments, COMMENT))
        skip()
        if (content[pos] === ',') pos++
        else if (content[pos] !== '}') fail('falta una coma o el cierre de un grupo')
      }
    }

    if (c === '[') {
      pos++
      const scalars: Scalar[] = []
      let compound = false
      let commented = false
      let index = 0
      let firstItem = -1
      let close = -1
      for (;;) {
        if (skip().length > 0) commented = true
        if (content[pos] === ']') {
          close = pos
          pos++
          break
        }
        if (firstItem === -1) firstItem = pos
        const next = content[pos]
        if (next === '{' || next === '[') {
          compound = true
          readValue([...path, `#${index}`], null)
        } else {
          const s = readScalar()
          if (!s) fail('valor no válido dentro de una lista')
          scalars.push(s!)
        }
        index++
        if (skip().length > 0) commented = true
        if (content[pos] === ',') pos++
        else if (content[pos] !== ']') fail('falta una coma o el cierre de una lista')
      }
      if (compound) return // Sus partes se han recogido una a una.

      const kinds = new Set(scalars.map((s) => (s.type === 'integer' || s.type === 'number' ? 'number' : s.type)))
      const kind = [...kinds][0] ?? 'text'
      const problem = commented
        ? 'tiene comentarios entre sus elementos'
        : kinds.size > 1
          ? 'mezcla distintos tipos de valores'
          : kind === 'text' && scalars.some((s) => !s.quoted)
            ? 'tiene un formato que no se reconoce'
            : kind === 'boolean' || kind === 'null'
              ? 'es una lista de sí o no'
              : null
      records.push({
        option: {
          path,
          type: 'list',
          value: '',
          items: scalars.map((s) => s.value),
          editable: problem === null,
          readOnlyReason: problem ?? undefined,
          description
        },
        start,
        end: pos,
        itemKind: kind === 'number' ? 'number' : 'string',
        itemDecimal: scalars.some((s) => s.type === 'number'),
        layout: layoutOf(start, firstItem, close)
      })
      return
    }

    const s = readScalar()
    if (!s) fail('se esperaba un valor')
    const scalar = s!
    const unknown = scalar.type === 'text' && !scalar.quoted
    const option: ConfigOption =
      scalar.type === 'null'
        ? {
            path,
            type: 'text',
            value: '',
            editable: false,
            readOnlyReason: 'está vacío (null) y no se sabe qué tipo de valor espera',
            description
          }
        : {
            path,
            type: scalar.type,
            value: scalar.value,
            editable: !unknown,
            readOnlyReason: unknown ? 'tiene un formato que no se reconoce' : undefined,
            description
          }
    records.push({ option, start, end: pos })
  }

  /**
   * Una lista con un elemento por línea se reescribe igual. Una vacía, o en
   * una sola línea, se queda en una línea.
   */
  function layoutOf(open: number, firstItem: number, close: number): ListLayout | undefined {
    const eol = content.includes('\r\n') ? '\r\n' : '\n'
    const indentAt = (at: number): string | null => {
      const lineStart = content.lastIndexOf('\n', at - 1) + 1
      const before = content.slice(lineStart, at)
      return lineStart > open && /^[ \t]*$/.test(before) ? before : null
    }
    const closeIndent = indentAt(close)
    if (closeIndent === null) return undefined
    const itemIndent = firstItem === -1 ? null : indentAt(firstItem)
    if (itemIndent === null) return undefined
    return { itemIndent, closeIndent, eol }
  }

  /**
   * Convención de algunos autores (Darkhax: Botany Pots, Enchantment
   * Descriptions...) para poder explicar sus opciones en un JSON:
   *
   *     "opcion": { "//": ["Explicación"], "//default": true, "value": false }
   *
   * Las claves `//` no son opciones: pasan a ser la descripción y el valor por
   * defecto de `value`, que es la que se edita.
   */
  function foldSlashComments(path: string[], from: number): void {
    const inside = records.slice(from)
    const isNote = (r: JsonRecord): boolean =>
      r.option.path.length === path.length + 1 && r.option.path[path.length]!.startsWith('//')
    const notes = inside.filter(isNote)
    if (notes.length === 0) return

    const text = notes.find((r) => r.option.path[path.length] === '//')
    const description = text
      ? (text.option.items ?? [text.option.value]).map((l) => l.trim()).join('\n') || null
      : null
    const def = notes.find((r) => r.option.path[path.length] === '//default')

    const value = inside.find(
      (r) => r.option.path.length === path.length + 1 && r.option.path[path.length] === 'value'
    )
    if (value) {
      value.option.description ??= description
      if (def) value.option.defaultValue = def.option.items?.join(', ') ?? def.option.value
    } else if (description) {
      sections.push({ path, description })
    }

    records.splice(from, records.length - from, ...inside.filter((r) => !isNote(r)))
  }

  const header = skip()
  if (pos >= content.length) fail('el fichero está vacío')
  readValue([], describe(header, COMMENT))
  skip()
  if (pos < content.length) fail('sobra texto al final')

  return {
    config: { format: 'json', options: records.map((r) => r.option), sections },
    apply(changes: ConfigChange[]): void {
      const planned = resolveChanges(records, changes).map(({ record, value }) => ({
        record,
        text: format(record, value)
      }))
      // De atrás adelante, para que las posiciones de lo anterior sigan valiendo.
      planned.sort((a, b) => b.record.start - a.record.start)
      for (const { record, text } of planned) {
        content = content.slice(0, record.start) + text + content.slice(record.end)
      }
    },
    serialize: () => content
  }
}

/** ¿La línea que empieza en `from` está vacía? */
function blankLineFollows(content: string, from: number): boolean {
  for (let i = from; i < content.length; i++) {
    const c = content[i]
    if (c === '\n') return true
    if (c !== ' ' && c !== '\t' && c !== '\r') return false
  }
  return false
}

function format(record: JsonRecord, value: unknown): string {
  const { option } = record
  switch (option.type) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'integer':
      return String(value)
    case 'number':
      return formatNumber(value as number, /[.eE]/.test(option.value))
    case 'text':
      return JSON.stringify(String(value))
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
        items.map((v) => JSON.stringify(v)),
        record.layout
      )
    }
  }
}
