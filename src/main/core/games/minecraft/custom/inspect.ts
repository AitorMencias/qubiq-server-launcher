import { basename, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { access, lstat, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import type {
  Distribution,
  ImportInspection,
  MemoryControl,
  StartFileInfo
} from '@shared/games/minecraft/types'
import { dataRoot } from '../../../paths'
import { PropertiesFile } from '../config/properties'
import * as neoforge from '../versions/neoforge'

/**
 * Servidores a medida: reconocer una carpeta antes de traerla (§19.x).
 *
 * Se mira qué es (NeoForge, Forge, Fabric, Paper, el original), de qué versión
 * de Minecraft, con qué se arranca y si hay algo que impida traerla. Todo es
 * lectura: aquí no se toca nada de la carpeta del usuario.
 *
 * ⚠ Traerla es MOVERLA (decisión del usuario): la carpeta deja de estar donde
 * estaba. Por eso las comprobaciones de `problems` son estrictas: elegir por
 * error el Escritorio o la carpeta del usuario no puede acabar llevándose todo
 * lo que hay dentro.
 */

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

// --- Archivos de inicio ------------------------------------------------------

const SCRIPT_EXTENSIONS = ['.bat', '.cmd']

/**
 * Prefijo de la copia sin pausas que se arranca en lugar de un script que las
 * tiene (ver `launch.ts`). Delante del nombre, para que se vea junto al original.
 */
export const NO_PAUSE_PREFIX = 'qubiq-'

function isGeneratedCopy(name: string): boolean {
  return name.toLowerCase().startsWith(NO_PAUSE_PREFIX) && SCRIPT_EXTENSIONS.includes(extname(name).toLowerCase())
}

/** Nombres de inicio habituales, por orden de preferencia. */
const PREFERRED_SCRIPTS = ['run.bat', 'startserver.bat', 'start.bat', 'start-server.bat', 'launch.bat']

/** Los jars que se sabe que arrancan un servidor van antes que cualquier otro. */
const SERVER_JAR = /^(server|minecraft_server|fabric-server|paper|purpur|spigot|forge|neoforge)/i

/**
 * Los instaladores no arrancan el servidor, lo preparan. (El `-shim.jar` de
 * Forge moderno sí arranca: existe para los sitios que solo saben `-jar`.)
 */
const NOT_A_START_JAR = /installer/i

export interface ScriptAnalysis {
  restartLoop: boolean
  setsMemory: boolean
  usesJvmArgsFile: boolean
  pauses: boolean
}

/** Líneas que ejecuta cmd, sin comentarios ni vacías. */
function codeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^@?(rem\b|::)/i.test(line))
}

/**
 * Lo que interesa de un script de inicio para arrancarlo desde la app.
 *
 * - Un bucle (`:start` … `goto start`) vuelve a lanzar el servidor al cerrarse:
 *   con la app no hace falta, y hace que Parar no pueda pararlo del todo.
 * - `-Xmx` en el script manda sobre cualquier memoria que ponga la app.
 * - `pause` deja la ventana esperando una tecla que nunca llega.
 */
export function analyzeScript(text: string): ScriptAnalysis {
  const lines = codeLines(text)
  const labels = new Map<string, number>()
  let restartLoop = false

  lines.forEach((line, index) => {
    const label = /^:([^\s:]+)/.exec(line)
    if (label) labels.set(label[1]!.toLowerCase(), index)
  })
  lines.forEach((line, index) => {
    const re = /\bgoto\s+:?([^\s&|)]+)/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(line)) !== null) {
      const target = match[1]!.toLowerCase()
      if (target === 'eof') continue
      const at = labels.get(target)
      // Saltar hacia atrás es volver a pasar por el arranque.
      if (at !== undefined && at < index) restartLoop = true
    }
  })

  const code = lines.join('\n')
  return {
    restartLoop,
    setsMemory: /-Xmx/i.test(code),
    usesJvmArgsFile: /user_jvm_args\.txt/i.test(code),
    pauses: /(^|&|\|\|)\s*@?pause\b/im.test(code)
  }
}

/** Quién decide la memoria si se arranca con ese archivo. */
export function memoryControlFor(
  kind: StartFileInfo['kind'],
  analysis: ScriptAnalysis | null,
  hasJvmArgsFile: boolean
): MemoryControl {
  if (kind === 'jar') return 'app'
  if (!analysis || analysis.setsMemory) return 'script'
  return analysis.usesJvmArgsFile && hasJvmArgsFile ? 'jvm-args' : 'script'
}

/**
 * Describe un archivo de inicio. `path` es relativo a la carpeta del servidor.
 * Lanza si no está dentro de ella o no es un .bat, .cmd o .jar.
 */
export async function describeStartFile(folder: string, path: string): Promise<StartFileInfo> {
  const full = resolve(folder, path)
  const rel = relative(resolve(folder), full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('El archivo de inicio tiene que estar dentro de la carpeta del servidor.')
  }
  const ext = extname(full).toLowerCase()
  if (!SCRIPT_EXTENSIONS.includes(ext) && ext !== '.jar') {
    throw new Error('El archivo de inicio tiene que ser un .bat, un .cmd o un .jar.')
  }
  if (isGeneratedCopy(basename(full))) {
    throw new Error(
      `«${basename(full)}» lo hace QubiQ en cada arranque a partir del original. Elige el original.`
    )
  }
  const info = await stat(full).catch(() => null)
  if (!info?.isFile()) throw new Error(`No existe el archivo de inicio «${rel}».`)

  const kind = ext === '.jar' ? 'jar' : 'script'
  const hasJvmArgsFile = await exists(join(folder, 'user_jvm_args.txt'))
  const analysis = kind === 'script' ? analyzeScript(await readFile(full, 'latin1')) : null

  return {
    path: rel.split(sep).join('/'),
    kind,
    restartLoop: analysis?.restartLoop ?? false,
    setsMemory: analysis?.setsMemory ?? false,
    memory: memoryControlFor(kind, analysis, hasJvmArgsFile)
  }
}

/** Archivos de la raíz con los que se puede arrancar, el preferido primero. */
export async function startFilesIn(folder: string): Promise<StartFileInfo[]> {
  const names = (await listDir(folder)).filter((name) => {
    if (isGeneratedCopy(name)) return false
    const ext = extname(name).toLowerCase()
    if (SCRIPT_EXTENSIONS.includes(ext)) return true
    return ext === '.jar' && !NOT_A_START_JAR.test(name)
  })

  const rank = (name: string): number => {
    const lower = name.toLowerCase()
    const preferred = PREFERRED_SCRIPTS.indexOf(lower)
    if (preferred !== -1) return preferred
    if (SCRIPT_EXTENSIONS.includes(extname(lower))) return 100
    return SERVER_JAR.test(lower) ? 200 : 300
  }
  names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))

  const files: StartFileInfo[] = []
  for (const name of names) {
    try {
      files.push(await describeStartFile(folder, name))
    } catch {
      // Una carpeta con extensión .jar, o un fichero que no se deja leer.
    }
  }
  return files
}

// --- Qué servidor es ---------------------------------------------------------

export interface Detected {
  distribution: Distribution | null
  minecraftVersion: string | null
  build: string | null
}

/** Carpeta de versión con argfile de Windows; si no hay ninguna, la última. */
async function installedLibrary(folder: string, ...path: string[]): Promise<string | null> {
  const base = join(folder, 'libraries', ...path)
  const entries = await listDir(base)
  for (const entry of entries) {
    if (await exists(join(base, entry, 'win_args.txt'))) return entry
  }
  return entries.sort().pop() ?? null
}

/** Versión de Minecraft que dejó escrita el propio servidor en su registro. */
async function versionFromLog(folder: string): Promise<string | null> {
  try {
    const text = await readFile(join(folder, 'logs', 'latest.log'), 'utf8')
    return /Starting minecraft server version (\S+)/i.exec(text.slice(0, 200_000))?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Reconoce el servidor por lo que hay en disco. Va de lo más concreto a lo
 * más genérico: un Forge también tiene `server.jar` y un Paper también tiene
 * `versions/`, así que el orden importa.
 */
export async function detectServer(folder: string): Promise<Detected> {
  const root = await listDir(folder)
  const found = (distribution: Distribution, minecraftVersion: string | null, build: string | null): Detected => ({
    distribution,
    minecraftVersion,
    build
  })

  // NeoForge instalado.
  const neo = await installedLibrary(folder, 'net', 'neoforged', 'neoforge')
  if (neo) return found('neoforge', neoforge.parseVersion(neo)?.minecraftVersion ?? null, neo)

  // El NeoForge de 1.20.1 se publicó con el nombre `forge` y numeración de Forge.
  const neoLegacy = await installedLibrary(folder, 'net', 'neoforged', 'forge')
  if (neoLegacy) {
    const [mc, build] = neoLegacy.split('-')
    return found('neoforge', mc ?? null, build ?? null)
  }

  // Forge instalado: la carpeta es `<minecraft>-<forge>`.
  const forge = await installedLibrary(folder, 'net', 'minecraftforge', 'forge')
  if (forge) {
    const dash = forge.indexOf('-')
    return found('forge', dash > 0 ? forge.slice(0, dash) : null, dash > 0 ? forge.slice(dash + 1) : null)
  }

  // Server packs que aún no se han instalado: traen el instalador en la raíz.
  for (const name of root) {
    const neoInstaller = /^neoforge-(.+)-installer\.jar$/i.exec(name)
    if (neoInstaller) {
      const version = neoInstaller[1]!
      return found('neoforge', neoforge.parseVersion(version)?.minecraftVersion ?? null, version)
    }
    const forgeInstaller = /^forge-([^-]+)-(.+?)-installer\.jar$/i.exec(name)
    if (forgeInstaller) return found('forge', forgeInstaller[1]!, forgeInstaller[2]!)
  }

  // Forge 1.16 y anteriores: jar ejecutable en la raíz, `forge-<mc>-<forge>.jar`.
  for (const name of root) {
    const legacy = /^forge-([^-]+)-([\d.]+)(-universal)?\.jar$/i.exec(name)
    if (legacy) return found('forge', legacy[1]!, legacy[2]!)
  }

  // Fabric.
  for (const name of root) {
    const fabric = /^fabric-server-mc\.(.+?)-loader\.(.+?)-launcher\..+\.jar$/i.exec(name)
    if (fabric) return found('fabric', fabric[1]!, fabric[2]!)
  }
  if (root.includes('fabric-server-launch.jar') || root.includes('.fabric')) {
    const cached = (await listDir(join(folder, '.fabric', 'server')))
      .map((name) => /^(.+)-server\.jar$/.exec(name)?.[1])
      .find((v): v is string => Boolean(v))
    return found('fabric', cached ?? (await versionFromLog(folder)), null)
  }

  // Paper y los que implementan su API (Purpur, Spigot...): se llevan los plugins.
  for (const name of root) {
    const paper = /^(paper|purpur|folia|pufferfish|leaf|spigot|craftbukkit)-(\d[\w.]*?)(?:-(\d+))?\.jar$/i.exec(name)
    if (paper) return found('paper', paper[2]!, paper[3] ?? null)
  }
  try {
    // Paper deja escrito `"currentVersion": "git-Paper-196 (MC: 1.21.1)"`.
    const history = await readFile(join(folder, 'version_history.json'), 'utf8')
    const mc = /\(MC: ([^)]+)\)/.exec(history)?.[1] ?? null
    return found('paper', mc, null)
  } catch {
    // No es un Paper que haya arrancado alguna vez.
  }
  if (root.includes('plugins')) return found('paper', await versionFromLog(folder), null)

  // Mods sin loader reconocible (un pack que se instala solo al arrancar).
  if (root.includes('mods')) {
    return { distribution: null, minecraftVersion: await versionFromLog(folder), build: null }
  }

  // El original: `server.jar`, `minecraft_server.<v>.jar` o su carpeta `versions/<v>`.
  const vanillaJar = root.map((name) => /^minecraft_server\.(.+)\.jar$/i.exec(name)?.[1]).find(Boolean)
  if (vanillaJar) return found('vanilla', vanillaJar, null)
  if (root.includes('server.jar')) {
    const bundled = (await listDir(join(folder, 'versions')))[0] ?? null
    return found('vanilla', bundled ?? (await versionFromLog(folder)), null)
  }

  return { distribution: null, minecraftVersion: await versionFromLog(folder), build: null }
}

// --- Si se puede traer -------------------------------------------------------

/**
 * Carpetas que nunca se pueden mover: la del usuario y las de sistema. Se
 * comparan en minúsculas, porque en Windows `C:\Users` y `c:\users` son la misma.
 */
function protectedFolders(): string[] {
  const env = process.env
  return [
    homedir(),
    env['SystemRoot'],
    env['ProgramFiles'],
    env['ProgramFiles(x86)'],
    env['ProgramData'],
    env['APPDATA'],
    env['LOCALAPPDATA'],
    env['OneDrive']
  ]
    .filter((p): p is string => Boolean(p))
    .map((p) => resolve(p).toLowerCase())
}

/** Nombres de las carpetas personales: moverlas sería llevarse todo lo del usuario. */
const PERSONAL_FOLDERS = new Set([
  'desktop', 'escritorio', 'documents', 'documentos', 'downloads', 'descargas',
  'pictures', 'imágenes', 'imagenes', 'music', 'música', 'musica', 'videos', 'vídeos',
  'onedrive', 'appdata', 'users', 'usuarios'
])

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Por qué no se puede traer esa carpeta. Vacío si se puede. */
export async function folderProblems(folder: string): Promise<string[]> {
  if (!isAbsolute(folder)) return ['La ruta de la carpeta no es completa.']

  const info = await lstat(folder).catch(() => null)
  if (!info) return ['Esa carpeta no existe.']
  if (info.isSymbolicLink()) return ['Esa carpeta es un acceso directo a otra. Elige la carpeta de verdad.']
  if (!info.isDirectory()) return ['Eso no es una carpeta.']

  const full = resolve(folder).toLowerCase()
  if (parse(full).root === full) return ['No se puede traer un disco entero. Elige la carpeta del servidor.']

  const problems: string[] = []
  const data = resolve(dataRoot()).toLowerCase()
  if (isInside(full, data)) {
    problems.push('Esa carpeta ya es de QubiQ.')
  } else if (isInside(data, full)) {
    problems.push('Esa carpeta contiene los datos de QubiQ. Elige la carpeta del servidor, no una que la contenga.')
  }

  if (
    PERSONAL_FOLDERS.has(basename(full)) ||
    protectedFolders().some((p) => isInside(p, full))
  ) {
    problems.push(
      'Es una carpeta personal o del sistema (Escritorio, Documentos, Descargas...). ' +
        'Elige la carpeta del servidor, no la que lo contiene: se va a mover entera.'
    )
  }
  return problems
}

/** Tamaño y número de ficheros, sin seguir enlaces. */
export async function measureFolder(folder: string): Promise<{ sizeBytes: number; fileCount: number }> {
  let sizeBytes = 0
  let fileCount = 0
  const pending = [folder]
  while (pending.length > 0) {
    const dir = pending.pop()!
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
      } else if (entry.isFile()) {
        fileCount++
        sizeBytes += (await stat(path).catch(() => null))?.size ?? 0
      }
    }
  }
  return { sizeBytes, fileCount }
}

// --- Todo junto --------------------------------------------------------------

export async function inspectFolder(folder: string): Promise<ImportInspection> {
  const empty: ImportInspection = {
    folder,
    sizeBytes: 0,
    fileCount: 0,
    sameDrive: false,
    distribution: null,
    minecraftVersion: null,
    build: null,
    startFiles: [],
    suggestedStartFile: null,
    port: null,
    maxPlayers: null,
    contentCount: 0,
    hasWorld: false,
    problems: []
  }

  const problems = await folderProblems(folder)
  // Sin carpeta válida no se mira nada más: podría ser el disco entero.
  if (problems.length > 0) return { ...empty, problems }

  const root = await listDir(folder)
  const [detected, startFiles, size] = await Promise.all([
    detectServer(folder),
    startFilesIn(folder),
    measureFolder(folder)
  ])

  const hasProperties = root.includes('server.properties')
  let port: number | null = null
  let maxPlayers: number | null = null
  let levelName = 'world'
  if (hasProperties) {
    const props = await PropertiesFile.load(join(folder, 'server.properties'))
    const p = Number(props.get('server-port'))
    const m = Number(props.get('max-players'))
    port = Number.isInteger(p) && p > 0 && p < 65536 ? p : null
    maxPlayers = Number.isInteger(m) && m > 0 ? m : null
    levelName = props.get('level-name') || 'world'
  }

  const contentFolder = root.includes('mods') ? 'mods' : root.includes('plugins') ? 'plugins' : null
  const contentCount = contentFolder
    ? (await listDir(join(folder, contentFolder))).filter((n) => n.toLowerCase().endsWith('.jar')).length
    : 0

  // Tiene que parecer un servidor de Minecraft: sin esto, elegir una carpeta
  // cualquiera con un .bat dentro se la llevaría entera.
  const looksLikeServer =
    hasProperties ||
    root.includes('eula.txt') ||
    (startFiles.length > 0 && (detected.distribution !== null || contentFolder !== null))
  if (!looksLikeServer) {
    problems.push(
      'No parece un servidor de Minecraft: no tiene server.properties, eula.txt ni nada que ' +
        'lo arranque. Elige la carpeta donde está el run.bat (o el .jar) del servidor.'
    )
  } else if (startFiles.length === 0) {
    problems.push('No hay ningún .bat, .cmd ni .jar en la carpeta con el que arrancarlo.')
  }

  return {
    folder,
    sizeBytes: size.sizeBytes,
    fileCount: size.fileCount,
    sameDrive: parse(resolve(folder)).root.toLowerCase() === parse(resolve(dataRoot())).root.toLowerCase(),
    distribution: detected.distribution,
    minecraftVersion: detected.minecraftVersion,
    build: detected.build,
    startFiles,
    suggestedStartFile: startFiles[0]?.path ?? null,
    port,
    maxPlayers,
    contentCount,
    hasWorld: await exists(join(folder, levelName, 'level.dat')),
    problems
  }
}
