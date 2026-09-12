import { readFile, writeFile } from 'node:fs/promises'

/**
 * Editor mínimo del `config.yml` de un plugin.
 *
 * NO es un parser de YAML: es un editor por líneas, igual que `PropertiesFile`
 * lo es para `server.properties`. La razón es la misma y pesa más que la
 * comodidad: el fichero lo genera el plugin y está lleno de comentarios que
 * explican cada opción. Reescribirlo con un serializador los borraría todos, y
 * el usuario que abriera el fichero a mano se encontraría un YAML mudo.
 *
 * Por eso `set` solo sabe hacer una cosa: cambiar el valor de una clave que ya
 * existe, dejando intacto todo lo demás. Nunca crea claves ni secciones: si el
 * plugin cambia su esquema, esto no inventa nada.
 *
 * La única excepción es `addMissingFrom`, y no la contradice: ahí las claves no
 * se inventan, se copian de la plantilla oficial del plugin —con sus
 * comentarios y en su sitio— cuando el plugin estrena opciones y el fichero del
 * usuario es de una versión anterior. Sin eso, una opción nueva aparecería en
 * el formulario y al guardarla no pasaría nada.
 */

interface Line {
  raw: string
  indent: number
  key: string | null
}

/** `  api-port: 25580   # comentario` -> indent 2, key "api-port". */
function parseLine(raw: string): Line {
  const match = /^(\s*)([A-Za-z0-9_-]+):(.*)$/.exec(raw)
  if (!match) return { raw, indent: 0, key: null }
  return { raw, indent: match[1]!.length, key: match[2]! }
}

export type ConfigValue = string | number | boolean

export class PluginConfigFile {
  private constructor(private readonly lines: Line[]) {}

  static parse(content: string): PluginConfigFile {
    return new PluginConfigFile(content.split(/\r?\n/).map(parseLine))
  }

  static async load(path: string): Promise<PluginConfigFile> {
    return PluginConfigFile.parse(await readFile(path, 'utf8'))
  }

  /**
   * Localiza la línea de una ruta con puntos (`game.api-port`) siguiendo la
   * indentación: cada tramo tiene que estar más indentado que su padre.
   */
  private indexOf(path: string): number {
    const parts = path.split('.')
    let from = 0
    let until = this.lines.length
    let parentIndent = -1

    for (let depth = 0; depth < parts.length; depth++) {
      const part = parts[depth]!
      let found = -1

      for (let i = from; i < until; i++) {
        const line = this.lines[i]!
        if (line.key === null) continue

        // Al salir del bloque del padre se deja de buscar: una clave con el
        // mismo nombre en otra sección no debe confundirse con esta.
        if (parentIndent >= 0 && line.indent <= parentIndent) {
          until = i
          break
        }

        if (line.key === part && (parentIndent < 0 || line.indent > parentIndent)) {
          found = i
          break
        }
      }

      if (found === -1) return -1

      if (depth === parts.length - 1) return found

      parentIndent = this.lines[found]!.indent
      from = found + 1
    }

    return -1
  }

  get(path: string): string | null {
    const index = this.indexOf(path)
    if (index === -1) return null

    const raw = this.lines[index]!.raw
    const value = raw.slice(raw.indexOf(':') + 1)
    // Se corta el comentario final y se quitan comillas.
    const withoutComment = value.replace(/\s+#.*$/, '').trim()
    return withoutComment.replace(/^["'](.*)["']$/, '$1')
  }

  /** Cambia una clave existente. Devuelve false si la ruta no está. */
  set(path: string, value: ConfigValue): boolean {
    const index = this.indexOf(path)
    if (index === -1) return false

    const line = this.lines[index]!
    const raw = line.raw
    const colon = raw.indexOf(':')
    const after = raw.slice(colon + 1)

    // Un comentario al final de la línea se conserva.
    const comment = /\s+#.*$/.exec(after)?.[0] ?? ''

    this.lines[index] = {
      ...line,
      raw: `${raw.slice(0, colon)}: ${formatValue(value)}${comment}`
    }
    return true
  }

  has(path: string): boolean {
    return this.indexOf(path) !== -1
  }

  /**
   * Copia de `template` las claves que aquí no están, con los comentarios que
   * las explican y en la misma posición relativa que ocupan allí.
   *
   * Nunca toca un valor que ya exista: lo que el usuario haya configurado manda
   * sobre la plantilla. Devuelve las rutas añadidas.
   */
  addMissingFrom(template: PluginConfigFile): string[] {
    const added: string[] = []

    for (const entry of template.entries()) {
      if (this.has(entry.path)) continue

      const at = this.insertionPointFor(template, entry)
      if (at === -1) continue

      const block = template.blockFor(entry.index)

      // El hueco de antes se copia de la plantilla en vez de adivinarlo: así el
      // fichero acaba espaciado igual que el original, sin separar una clave de
      // su sección ni pegar dos bloques que allí iban sueltos.
      const previous = this.lines[at - 1]
      const wantsBlank =
        block.leadingBlank && previous !== undefined && previous.raw.trim() !== ''

      this.lines.splice(
        at,
        0,
        ...(wantsBlank ? [parseLine('')] : []),
        ...block.lines.map((raw) => parseLine(raw))
      )
      added.push(entry.path)
    }

    return added
  }

  /** Cada clave del fichero con su ruta con puntos y su línea. */
  private entries(): { path: string; index: number; indent: number; parent: string | null }[] {
    const result: { path: string; index: number; indent: number; parent: string | null }[] = []
    const stack: { key: string; indent: number }[] = []

    this.lines.forEach((line, index) => {
      if (line.key === null) return
      while (stack.length > 0 && stack[stack.length - 1]!.indent >= line.indent) stack.pop()

      const parent = stack.length > 0 ? stack.map((s) => s.key).join('.') : null
      const path = parent ? `${parent}.${line.key}` : line.key
      result.push({ path, index, indent: line.indent, parent })
      stack.push({ key: line.key, indent: line.indent })
    })

    return result
  }

  /**
   * Dónde meter una clave que viene de la plantilla: justo detrás del hermano
   * anterior que sí exista aquí, o del padre si no hay ninguno. Así las
   * opciones nuevas caen en su sección y no al final del fichero.
   */
  private insertionPointFor(
    template: PluginConfigFile,
    entry: { path: string; index: number; parent: string | null }
  ): number {
    const siblings = template
      .entries()
      .filter((e) => e.parent === entry.parent && e.index < entry.index)

    for (let i = siblings.length - 1; i >= 0; i--) {
      const anchor = this.indexOf(siblings[i]!.path)
      if (anchor !== -1) return this.endOfBlock(anchor) + 1
    }

    if (entry.parent === null) return this.lines.length
    const parentAt = this.indexOf(entry.parent)
    return parentAt === -1 ? -1 : parentAt + 1
  }

  /**
   * Última línea que pertenece a la clave de `index`: sus hijos, sin arrastrar
   * los comentarios que ya están documentando la clave siguiente.
   */
  private endOfBlock(index: number): number {
    const indent = this.lines[index]!.indent
    let end = index

    for (let i = index + 1; i < this.lines.length; i++) {
      const line = this.lines[i]!
      if (line.key !== null && line.indent <= indent) break
      if (line.key !== null) end = i
    }

    return end
  }

  /**
   * Las líneas de una clave de la plantilla: sus comentarios y ella misma, más
   * si allí venía precedida de una línea en blanco.
   */
  private blockFor(index: number): { lines: string[]; leadingBlank: boolean } {
    let start = index
    while (start > 0) {
      const previous = this.lines[start - 1]!
      if (previous.key !== null || previous.raw.trim() === '') break
      start--
    }
    const before = this.lines[start - 1]
    return {
      lines: this.lines.slice(start, index + 1).map((l) => l.raw),
      leadingBlank: before !== undefined && before.raw.trim() === ''
    }
  }

  serialize(): string {
    return this.lines.map((l) => l.raw).join('\r\n')
  }

  async save(path: string): Promise<void> {
    await writeFile(path, this.serialize(), 'utf8')
  }
}

/**
 * Las cadenas van entrecomilladas, como en el fichero que genera el plugin;
 * números y booleanos, desnudos. Así un host con dos puntos o un token con
 * símbolos no rompen el YAML.
 */
function formatValue(value: ConfigValue): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
