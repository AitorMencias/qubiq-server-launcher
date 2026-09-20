import type { ConfigFormat } from '@shared/editableConfig'
import { finalizeOptions, type EditableDocument } from './common'
import { parseYaml } from './yaml'
import { parseToml } from './toml'
import { parseJson } from './json'
import { parseProperties } from './properties'
import { parseLua } from './lua'

/**
 * Editores de ficheros de configuración ajenos (§19.20).
 *
 * Todos siguen la misma regla: se sustituye el trozo exacto del valor y el
 * resto del fichero sale igual que entró. Lo que no saben leer con seguridad
 * lo enseñan como «solo lectura» en vez de adivinar.
 */

export type { EditableDocument } from './common'

/** Formato por la extensión, o null si no lo sabemos editar. */
export function formatForFile(fileName: string): ConfigFormat | null {
  const ext = /\.([^.]+)$/.exec(fileName.toLowerCase())?.[1]
  switch (ext) {
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'toml':
      return 'toml'
    case 'json':
    case 'json5':
      return 'json'
    case 'properties':
      return 'properties'
    case 'lua':
      return 'lua'
    default:
      return null
  }
}

export function parseEditable(format: ConfigFormat, content: string): EditableDocument {
  const doc = parsers[format](content)
  finalizeOptions(doc.config.options)
  return doc
}

const parsers: Record<ConfigFormat, (content: string) => EditableDocument> = {
  yaml: parseYaml,
  toml: parseToml,
  json: parseJson,
  properties: parseProperties,
  lua: parseLua
}
