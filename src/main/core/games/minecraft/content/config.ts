import { createHash } from 'node:crypto'
import { copyFile, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, sep } from 'node:path'
import type { ConfigChange } from '@shared/editableConfig'
import type {
  ContentConfigDocument,
  ContentConfigFile,
  ContentConfigInfo,
  ContentConfigSaveResult,
  Distribution
} from '@shared/games/minecraft/types'
import { contentKindFor } from '@shared/games/minecraft/types'
import { serverDir } from '../../../paths'
import { formatForFile, parseEditable } from '../../../formats/editable'
import { assertSafeName, folderNameFor } from './manager'
import { readJarEntries } from './jar'
import { activeWorldName } from '../worlds/manager'

/**
 * Configuración de los plugins y mods que ha puesto el usuario (§19.20).
 *
 * Tres pasos: saber cómo se llama el plugin o mod (leyendo su jar), encontrar
 * sus ficheros de configuración y editarlos sin destrozarlos.
 *
 * Dónde está cada cosa:
 *  - Un plugin de Paper guarda todo en `plugins/<name>/`, donde `<name>` es el
 *    de su `plugin.yml`, con los espacios cambiados por `_` (así lo hace
 *    Bukkit). No coincide con el nombre del jar: EssentialsX-2.21.jar escribe
 *    en `plugins/Essentials/`.
 *  - Un mod escribe en `config/`, en ficheros o carpetas que empiezan por su
 *    `modId`: `config/ae2-common.toml`, `config/iceandfire/`. En Forge, lo del
 *    servidor va además por mundo, en `<mundo>/serverconfig/<modId>-server.toml`,
 *    con la plantilla para mundos nuevos en `defaultconfigs/`.
 */

/** Más grande que esto no se abre en el editor: no es una configuración. */
const MAX_EDITABLE = 1024 * 1024
const MAX_FILES = 80

/** Extensiones que se enseñan. Las que no sabemos editar se ofrecen para abrirlas fuera. */
export const CONFIG_EXTENSIONS = /\.(ya?ml|toml|json5?|properties|conf|hocon|cfg|snbt)$/i

/**
 * Carpetas que no son configuración sino datos: la de Essentials con un
 * fichero por jugador puede tener miles, y ninguno es un ajuste.
 */
const DATA_FOLDERS = new Set([
  'userdata', 'playerdata', 'players', 'data', 'database', 'databases', 'storage', 'libs', 'lib',
  'libraries', 'logs', 'cache', 'backups', 'backup', 'temp', 'tmp', 'lang', 'languages', 'locale',
  'locales', 'translations', 'messages'
])

// --- Qué es cada jar ---------------------------------------------------------

export interface ContentIdentity {
  name: string
  /** Carpeta del plugin, o `modId` de cada mod que trae el jar. */
  ids: string[]
}

export async function identifyJar(path: string, fileName: string): Promise<ContentIdentity> {
  const entries = await readJarEntries(path, [
    'plugin.yml',
    'paper-plugin.yml',
    'META-INF/neoforge.mods.toml',
    'META-INF/mods.toml',
    'fabric.mod.json'
  ]).catch(() => new Map<string, Buffer>())

  const plugin = entries.get('paper-plugin.yml') ?? entries.get('plugin.yml')
  if (plugin) {
    const name = /^name\s*:\s*["']?([^"'#\r\n]+?)["']?\s*(#.*)?$/m.exec(plugin.toString('utf8'))?.[1]
    if (name) return { name, ids: [name.replace(/ /g, '_')] }
  }

  const modsToml = entries.get('META-INF/neoforge.mods.toml') ?? entries.get('META-INF/mods.toml')
  if (modsToml) {
    const mods = modsFromToml(modsToml.toString('utf8'))
    if (mods.ids.length > 0) return { name: mods.name ?? mods.ids[0]!, ids: mods.ids }
  }

  const fabric = entries.get('fabric.mod.json')
  if (fabric) {
    try {
      const json = JSON.parse(fabric.toString('utf8')) as { id?: string; name?: string }
      if (json.id) return { name: json.name ?? json.id, ids: [json.id] }
    } catch {
      // Algunos llevan comentarios o comas de más: se cae al nombre del jar.
    }
  }

  // Sin descriptor legible: `EssentialsX-2.21.0.jar` -> `EssentialsX`.
  const base = fileName.replace(/\.jar(\.disabled)?$/i, '')
  const guess = /^(.+?)[-_ ]v?\d/.exec(base)?.[1] ?? base
  return { name: guess, ids: [guess] }
}

/**
 * Los `modId` de un `mods.toml`. Solo cuentan los de las tablas `[[mods]]`: las
 * dependencias también llevan `modId` (`forge`, `minecraft`) y no son de este
 * jar.
 */
export function modsFromToml(text: string): { name: string | null; ids: string[] } {
  const ids: string[] = []
  let name: string | null = null
  let inMods = false
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (t.startsWith('[')) {
      inMods = /^\[\[\s*mods\s*\]\]/.test(t)
      continue
    }
    if (!inMods) continue
    const id = /^modId\s*=\s*["']([^"']+)["']/.exec(t)?.[1]
    if (id) ids.push(id)
    const display = /^displayName\s*=\s*["']([^"']+)["']/.exec(t)?.[1]
    if (display && name === null) name = display
  }
  return { name, ids }
}

// --- Dónde está su configuración ---------------------------------------------

export async function listConfigFiles(
  id: string,
  distribution: Distribution,
  fileName: string
): Promise<ContentConfigInfo> {
  assertSafeName(fileName)
  const kind = contentKindFor(distribution)
  const folder = folderNameFor(distribution)
  if (!kind || !folder) throw new Error('Este tipo de servidor no admite plugins ni mods.')

  const root = serverDir(id)
  const identity = await identifyJar(join(root, folder, fileName), fileName)
  const files: ContentConfigFile[] = []
  let hiddenClientFiles = 0

  if (kind === 'plugins') {
    const wanted = identity.ids[0]!
    // Windows no distingue mayúsculas, pero se busca igual por si el plugin
    // cambió de "Essentials" a "essentials" entre versiones.
    const existing = await findEntry(join(root, 'plugins'), (n) => n.toLowerCase() === wanted.toLowerCase(), true)
    const pluginFolder = `plugins/${existing ?? wanted}`
    if (existing) await walk(root, pluginFolder, 1, files)
    return { name: identity.name, files: sortFiles(files).slice(0, MAX_FILES), folder: pluginFolder, hiddenClientFiles }
  }

  const ids = identity.ids.map((i) => i.toLowerCase())
  const matches = (name: string): boolean => {
    const n = name.toLowerCase()
    return ids.some((i) => n === i || n.startsWith(`${i}-`) || n.startsWith(`${i}.`))
  }
  const isClient = (path: string): boolean => /[-_.]client[-_.]/i.test(path.replace(/.*\//, '') + '.')

  for (const entry of await safeReaddir(join(root, 'config'))) {
    if (!matches(entry)) continue
    const rel = `config/${entry}`
    const s = await stat(join(root, rel)).catch(() => null)
    if (!s) continue
    if (s.isDirectory()) await walk(root, rel, 3, files)
    else if (CONFIG_EXTENSIONS.test(entry)) files.push(await describeFile(root, rel))
  }

  // Forge: lo del servidor, por mundo, y su plantilla para los mundos nuevos.
  const world = await activeWorldName(id).catch(() => null)
  const perWorld: [string, string][] = []
  if (world) perWorld.push([`${world}/serverconfig`, `Ajustes de este mundo (${world})`])
  perWorld.push(['defaultconfigs', 'Plantilla que copian los mundos nuevos'])
  for (const [dir, note] of perWorld) {
    for (const entry of await safeReaddir(join(root, dir))) {
      if (matches(entry) && CONFIG_EXTENSIONS.test(entry)) {
        files.push({ ...(await describeFile(root, `${dir}/${entry}`)), note })
      }
    }
  }

  const visible = files.filter((f) => !isClient(f.path))
  hiddenClientFiles = files.length - visible.length
  return { name: identity.name, files: sortFiles(visible).slice(0, MAX_FILES), folder: null, hiddenClientFiles }
}

async function walk(root: string, rel: string, depth: number, out: ContentConfigFile[]): Promise<void> {
  if (out.length >= MAX_FILES * 2) return
  for (const entry of await safeReaddir(join(root, rel))) {
    const child = `${rel}/${entry}`
    const s = await stat(join(root, child)).catch(() => null)
    if (!s) continue
    if (s.isDirectory()) {
      if (depth > 0 && !DATA_FOLDERS.has(entry.toLowerCase())) await walk(root, child, depth - 1, out)
    } else if (CONFIG_EXTENSIONS.test(entry)) {
      out.push(await describeFile(root, child))
    }
  }
}

async function describeFile(root: string, rel: string): Promise<ContentConfigFile> {
  const { size } = await stat(join(root, rel))
  const format = formatForFile(rel)
  if (format && size > MAX_EDITABLE) {
    return { path: rel, format: null, sizeBytes: size, note: 'Demasiado grande para editarlo aquí' }
  }
  return { path: rel, format, sizeBytes: size }
}

/** `config.yml` primero, luego lo de arriba antes que lo de las subcarpetas. */
function sortFiles(files: ContentConfigFile[]): ContentConfigFile[] {
  const rank = (f: ContentConfigFile): number =>
    (/(^|\/)config\.ya?ml$/i.test(f.path) ? 0 : 10) + f.path.split('/').length + (f.format ? 0 : 50)
  return [...files].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path, 'es'))
}

async function safeReaddir(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).sort((a, b) => a.localeCompare(b, 'es'))
  } catch {
    return []
  }
}

async function findEntry(
  dir: string,
  test: (name: string) => boolean,
  directory: boolean
): Promise<string | null> {
  for (const entry of await safeReaddir(dir)) {
    if (!test(entry)) continue
    const s = await stat(join(dir, entry)).catch(() => null)
    if (s && s.isDirectory() === directory) return entry
  }
  return null
}

// --- Leer y escribir ----------------------------------------------------------

/**
 * Ruta absoluta de un fichero de configuración, comprobando que no se sale de
 * los sitios donde los plugins y mods guardan la suya. La ruta viene de la
 * interfaz: sin esto, se podría escribir cualquier fichero del equipo.
 */
export function resolveConfigPath(id: string, rel: string, opts: { folder?: boolean } = {}): string {
  const clean = normalize(rel.replace(/\//g, sep))
  const parts = clean.split(sep)
  if (isAbsolute(clean) || parts.includes('..') || parts.some((p) => p === '')) {
    throw new Error('Ruta de configuración no válida.')
  }
  const root = ['plugins', 'config', 'defaultconfigs'].includes(parts[0]!.toLowerCase())
  const allowed = root || parts[1]?.toLowerCase() === 'serverconfig'
  // La carpeta `config` a secas solo se deja abrir; leer o escribir, nunca.
  const tooShort = parts.length < 2 && !(opts.folder && root)
  if (!allowed || tooShort) throw new Error('Ese fichero no es de un plugin ni de un mod.')
  return join(serverDir(id), clean)
}

function hashOf(content: Buffer): string {
  return createHash('sha1').update(content).digest('hex')
}

export async function readConfig(id: string, rel: string): Promise<ContentConfigDocument> {
  const path = resolveConfigPath(id, rel)
  const format = formatForFile(path)
  if (!format) throw new Error('Este formato no se puede editar desde la aplicación.')

  const raw = await readFile(path)
  if (raw.length > MAX_EDITABLE) throw new Error('El fichero es demasiado grande para editarlo aquí.')
  const content = raw.toString('utf8')
  const doc = parseEditable(format, content)

  // Un fichero que no es UTF-8 (plugins antiguos en Latin-1) se estropearía al
  // escribirlo de vuelta: se enseña, pero no se deja guardar.
  const utf8 = Buffer.from(content, 'utf8').equals(raw)
  if (!utf8) {
    for (const option of doc.config.options) {
      option.editable = false
      option.readOnlyReason = 'el fichero no está en UTF-8'
    }
  }

  return {
    path: rel,
    hash: hashOf(raw),
    config: doc.config,
    readOnlyReason: utf8
      ? undefined
      : 'El fichero no está guardado en UTF-8 y podría estropearse al escribirlo. Ábrelo con un editor de texto.'
  }
}

export async function writeConfig(
  id: string,
  rel: string,
  hash: string,
  changes: ConfigChange[]
): Promise<ContentConfigSaveResult> {
  const path = resolveConfigPath(id, rel)
  const format = formatForFile(path)
  if (!format) throw new Error('Este formato no se puede editar desde la aplicación.')

  const raw = await readFile(path)
  // Si ha cambiado desde que se abrió (el plugin lo reescribió al arrancar, o
  // alguien lo editó a mano), guardar encima con los valores viejos del
  // formulario se llevaría esos cambios por delante.
  if (hashOf(raw) !== hash) {
    throw new Error(
      'El fichero ha cambiado desde que lo abriste: puede que lo haya reescrito el propio plugin o ' +
        'que lo hayas editado a mano. Vuelve a abrirlo para ver lo que tiene ahora.'
    )
  }
  const content = raw.toString('utf8')
  if (!Buffer.from(content, 'utf8').equals(raw)) {
    throw new Error('El fichero no está guardado en UTF-8: ábrelo con un editor de texto.')
  }

  const doc = parseEditable(format, content)
  const before = doc.config.options
  doc.apply(changes)
  const output = doc.serialize()

  if (output === content) {
    return { document: await readConfig(id, rel), written: 0, backupPath: null }
  }

  // Nada de lo escrito puede dejar el fichero sin poder leerse: se vuelve a
  // leer antes de guardarlo, y si falla no se guarda.
  const reread = parseEditable(format, output)
  if (reread.config.options.length !== before.length) {
    throw new Error('No se ha guardado: el resultado no se leía igual que el original. Cuéntanoslo, por favor.')
  }

  // Copia de cómo estaba, al lado, y escritura atómica: primero a un
  // temporal y luego se cambia por el bueno, para no dejar medio fichero si
  // algo se corta.
  const backupPath = `${path}.bak`
  await copyFile(path, backupPath)
  const temp = `${path}.qubiq-tmp`
  await writeFile(temp, output, 'utf8')
  await rename(temp, path)

  const written = countWritten(before, reread.config.options)
  return { document: await readConfig(id, rel), written, backupPath: `${rel}.bak` }
}

function countWritten(
  before: { path: string[]; value: string; items?: string[] }[],
  after: { path: string[]; value: string; items?: string[] }[]
): number {
  let n = 0
  for (let i = 0; i < before.length; i++) {
    const a = before[i]!
    const b = after[i]
    if (!b || a.value !== b.value || JSON.stringify(a.items) !== JSON.stringify(b.items)) n++
  }
  return n
}
