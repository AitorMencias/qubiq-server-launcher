import { readFile, writeFile } from 'node:fs/promises'

/**
 * Ficheros `clave=valor` editados sin destrozarlos: `server.properties` de
 * Minecraft y, más adelante, `servertest.ini` de Project Zomboid.
 *
 * ⚠ Regla irrenunciable: preservar comentarios, orden y CLAVES DESCONOCIDAS.
 * Los plugins y las versiones nuevas añaden claves propias; reescribir el
 * fichero solo con las que conocemos las borraría de forma silenciosa.
 */

interface KeyValueLine {
  kind: 'comment' | 'entry' | 'blank'
  raw: string
  key?: string
  value?: string
}

export class KeyValueFile {
  private constructor(private lines: KeyValueLine[]) {}

  static parse(content: string): KeyValueFile {
    const lines: KeyValueLine[] = content.split(/\r?\n/).map((raw) => {
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
    return new KeyValueFile(lines)
  }

  static async load(path: string): Promise<KeyValueFile> {
    try {
      return KeyValueFile.parse(await readFile(path, 'utf8'))
    } catch {
      return new KeyValueFile([])
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
