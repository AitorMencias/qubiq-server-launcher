import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

/**
 * Disposición en disco (§5.1). Todo lo específico de Windows vive aquí,
 * para que portar a otro sistema sea cuestión de tocar este fichero (§14.1).
 *
 * Este módulo NO importa Electron a propósito: la raíz de datos se inyecta
 * desde el proceso principal. Así el núcleo se puede ejecutar y probar fuera
 * de Electron, que es lo que exige la separación núcleo/interfaz de §5.
 */

let dataRootPath: string | null = null

/**
 * Carpeta de recursos que viajan con la aplicación (los jars de los plugins
 * oficiales). Cambia entre desarrollo y empaquetado, así que la inyecta el
 * proceso principal igual que la raíz de datos.
 */
let resourcesRootPath: string | null = null

/** La fija el proceso principal al arrancar, o una prueba con un directorio temporal. */
export function setDataRoot(path: string): void {
  dataRootPath = path
}

export function setResourcesRoot(path: string): void {
  resourcesRootPath = path
}

export function resourcesRoot(): string {
  if (!resourcesRootPath) {
    throw new Error(
      'La carpeta de recursos no está inicializada. Llama a setResourcesRoot() antes de usarla.'
    )
  }
  return resourcesRootPath
}

/**
 * Fichero de un plugin oficial dentro de los recursos empaquetados.
 * Cada plugin tiene su carpeta con el jar y la plantilla de configuración.
 */
export function bundledPluginPath(pluginId: string, fileName: string): string {
  return join(resourcesRoot(), 'plugins', pluginId, fileName)
}

export function dataRoot(): string {
  if (!dataRootPath) {
    throw new Error(
      'La raíz de datos no está inicializada. Llama a setDataRoot() antes de usar el núcleo.'
    )
  }
  return dataRootPath
}

export function runtimesDir(): string {
  return join(dataRoot(), 'runtimes')
}

export function cacheDir(): string {
  return join(dataRoot(), 'cache')
}

export function instancesDir(): string {
  return join(dataRoot(), 'instances')
}

export function instanceDir(id: string): string {
  return join(instancesDir(), id)
}

/** Directorio de trabajo real del servidor, separado del manifiesto (§5.1). */
export function serverDir(id: string): string {
  return join(instanceDir(id), 'server')
}

export function manifestPath(id: string): string {
  return join(instanceDir(id), 'instance.json')
}

export function backupsDir(id: string): string {
  return join(instanceDir(id), 'backups')
}

export function launcherLogPath(id: string): string {
  return join(instanceDir(id), 'launcher.log')
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

/**
 * Ruta absoluta al bsdtar que trae Windows 10/11.
 *
 * Nunca invoques `tar.exe` a secas: Git para Windows, MSYS2 y Cygwin instalan
 * un tar de GNU y, si su carpeta está en el PATH, gana él. GNU tar interpreta
 * `C:\...` como «máquina C, ruta ...» e intenta conectarse por red, así que
 * falla con un «Cannot connect to C: resolve failed» que no se parece en nada
 * al problema real. Con la ruta absoluta no hay ambigüedad posible.
 */
export function systemTarPath(): string {
  const windowsDir = process.env['SystemRoot'] || process.env['windir']
  return windowsDir ? join(windowsDir, 'System32', 'tar.exe') : 'tar.exe'
}

export async function ensureBaseDirs(): Promise<void> {
  await Promise.all([ensureDir(runtimesDir()), ensureDir(cacheDir()), ensureDir(instancesDir())])
}

/**
 * Convierte un nombre escrito por el usuario en un id de carpeta seguro.
 * Windows prohíbe < > : " / \ | ? * y los nombres reservados tipo CON, PRN, AUX.
 */
const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
])

export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita tildes: "Añoranza" -> "anoranza"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  const safe = base.length > 0 ? base : 'servidor'
  return WINDOWS_RESERVED.has(safe) ? `${safe}-1` : safe
}
