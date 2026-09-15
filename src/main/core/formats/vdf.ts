/**
 * KeyValues de Valve en texto (VDF): el formato de los `appmanifest_*.acf` que
 * deja SteamCMD y de la salida de `app_info_print`.
 *
 * ```
 * "AppState"
 * {
 *     "appid"     "896660"
 *     "InstalledDepots" { ... }
 * }
 * ```
 *
 * Solo lectura: la app nunca escribe estos ficheros, son de Steam.
 */

export type VdfValue = string | VdfObject
export interface VdfObject {
  [key: string]: VdfValue
}

/**
 * Convierte el texto en objetos anidados. Ignora lo que no sea VDF alrededor
 * (la salida de SteamCMD trae líneas de estado antes y después), y las claves
 * repetidas se quedan con el último valor, como hace Steam.
 */
export function parseVdf(text: string): VdfObject {
  const tokens = tokenize(text)
  let i = 0

  const parseObject = (): VdfObject => {
    const obj: VdfObject = {}
    while (i < tokens.length) {
      const token = tokens[i]
      if (token.kind === 'close') {
        i++
        return obj
      }
      if (token.kind !== 'string') {
        i++
        continue
      }
      const key = token.value
      i++
      const next = tokens[i]
      if (!next) break
      if (next.kind === 'open') {
        i++
        obj[key] = parseObject()
      } else if (next.kind === 'string') {
        i++
        obj[key] = next.value
      }
    }
    return obj
  }

  return parseObject()
}

type Token = { kind: 'string'; value: string } | { kind: 'open' } | { kind: 'close' }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      let value = ''
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          const esc = text[i + 1]
          value += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc
          i += 2
        } else {
          value += text[i++]
        }
      }
      i++
      tokens.push({ kind: 'string', value })
    } else if (ch === '{') {
      tokens.push({ kind: 'open' })
      i++
    } else if (ch === '}') {
      tokens.push({ kind: 'close' })
      i++
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else {
      i++
    }
  }
  return tokens
}

/** Recorre claves anidadas sin distinguir mayúsculas (Steam no es consistente). */
export function vdfGet(obj: VdfValue | undefined, ...path: string[]): VdfValue | undefined {
  let current: VdfValue | undefined = obj
  for (const key of path) {
    if (!current || typeof current === 'string') return undefined
    const lower = key.toLowerCase()
    const found: string | undefined = Object.keys(current).find((k) => k.toLowerCase() === lower)
    current = found === undefined ? undefined : current[found]
  }
  return current
}
