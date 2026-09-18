import type { ConfigChange, ConfigOption } from '@shared/editableConfig'
import {
  Lines,
  describe,
  formatNumber,
  plainType,
  resolveChanges,
  type EditableDocument
} from './common'

/**
 * `.properties` de mods, con las mismas reglas que `KeyValueFile`: se cambia el
 * valor de una clave que ya existe y todo lo demás se queda igual.
 *
 * Se admite `clave=valor` y `clave: valor`. Los valores partidos en varias
 * líneas con `\` al final se enseñan sin dejar tocarlos.
 */

interface PropertiesRecord {
  option: ConfigOption
  line: number
  start: number
}

const COMMENT = /^[#!]+/

export function parseProperties(content: string): EditableDocument {
  const text = Lines.parse(content)
  const lines = text.lines
  const records: PropertiesRecord[] = []
  let pending: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const trimmed = raw.trim()
    if (trimmed === '') {
      pending = []
      continue
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
      pending.push(trimmed)
      continue
    }

    const sep = /[=:]/.exec(raw)
    if (!sep) {
      pending = []
      continue
    }
    const key = raw.slice(0, sep.index).trim()
    let start = sep.index + 1
    while (raw[start] === ' ' || raw[start] === '\t') start++
    const value = raw.slice(start)
    const description = describe(pending, COMMENT)
    pending = []

    if (/(^|[^\\])(\\\\)*\\$/.test(value)) {
      // Sigue en la línea de abajo.
      let to = i
      while (to < lines.length - 1 && /\\$/.test(lines[to]!)) to++
      records.push({
        option: {
          path: [key],
          type: 'text',
          value: value.replace(/\\$/, '…'),
          editable: false,
          readOnlyReason: 'ocupa varias líneas',
          description
        },
        line: i,
        start
      })
      i = to
      continue
    }

    records.push({
      option: { path: [key], type: plainType(value), value, editable: true, description },
      line: i,
      start
    })
  }

  return {
    config: { format: 'properties', options: records.map((r) => r.option), sections: [] },
    apply(changes: ConfigChange[]): void {
      for (const { record, value } of resolveChanges(records, changes)) {
        const { option } = record
        const written =
          option.type === 'boolean' || option.type === 'integer'
            ? String(value)
            : option.type === 'number'
              ? formatNumber(value as number, /[.eE]/.test(option.value))
              : String(value)
        const raw = text.lines[record.line]!
        text.replace(record.line, record.line, [raw.slice(0, record.start) + written])
      }
    },
    serialize: () => text.serialize()
  }
}
