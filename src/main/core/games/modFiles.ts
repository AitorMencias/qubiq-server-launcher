import { execFile } from 'node:child_process'
import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { promisify } from 'node:util'
import { ensureDir, instanceDir, serverDir, systemTarPath } from '../paths'

const execFileAsync = promisify(execFile)

/**
 * Lo que comparten los mods de Satisfactory y los de Valheim: descomprimir un
 * paquete, repartir sus ficheros por la carpeta del servidor y saber después
 * cuáles eran suyos.
 *
 * Los dos catálogos entregan un zip, pero ninguno de los dos lo entrega con la
 * forma en que va al servidor: en ficsit el zip **es** la carpeta del mod (su
 * raíz lleva el `.uplugin`), y en Thunderstore el zip lleva el `manifest.json`
 * y el `.dll` sueltos, o dentro de un `plugins/`. Por eso cada juego decide a
 * dónde va cada fichero (`place`) y esto se encarga del resto.
 *
 * **Apagar un mod no es renombrarlo.** Los dos cargadores buscan por contenido,
 * no por nombre: BepInEx recorre `plugins/` entero buscando `.dll`, y el
 * servidor de Satisfactory mira todas las carpetas de `Mods`. Un mod apagado
 * tiene que salir de ahí, así que se aparta a la carpeta de la instancia —no a
 * la del servidor— y se devuelve a su sitio al encenderlo.
 */

/** Dónde va un fichero del paquete y qué se apunta como suyo. */
export interface Placement {
  /** Destino, relativo a la carpeta del servidor y con barras normales. */
  dest: string
  /**
   * Ruta que se apunta como del mod, para poder quitarla o apartarla después.
   *
   * Suele ser la carpeta propia del mod (`BepInEx/plugins/Autor-Mod`), y el
   * fichero suelto cuando cae en una carpeta compartida con los demás
   * (`BepInEx/config/algo.cfg`): apuntar ahí la carpeta se llevaría por delante
   * la configuración de todos.
   */
  owns: string
}

/** Carpeta donde esperan los mods apagados, fuera de la del servidor. */
export function disabledModsDir(instanceId: string): string {
  return join(instanceDir(instanceId), 'mods-apagados')
}

/** Carpeta de trabajo donde se descarga y se descomprime lo que llega. */
export function modStagingDir(instanceId: string): string {
  return join(instanceDir(instanceId), '.mods-descarga')
}

/**
 * Descomprime con el bsdtar de Windows, igual que el resto de la app.
 *
 * Por la ruta absoluta y nunca por el PATH: ver `systemTarPath`.
 */
export async function extractZip(zipPath: string, destination: string): Promise<void> {
  await ensureDir(destination)
  try {
    await execFileAsync(systemTarPath(), ['-xf', zipPath, '-C', destination], {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`No se pudo descomprimir el mod: ${message}`)
  }
}

/** Todos los ficheros de una carpeta, en rutas relativas con barras normales. */
export async function filesIn(root: string, prefix = ''): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true }).catch(() => [])) {
    const relative = prefix ? posix.join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) found.push(...(await filesIn(root, relative)))
    else found.push(relative)
  }
  return found
}

/**
 * Reparte lo descomprimido por la carpeta del servidor.
 *
 * Devuelve las rutas que quedan a nombre del mod, sin repetir y sin las que
 * cuelguen de otra que ya esté apuntada.
 */
export async function placeFiles(
  instanceId: string,
  stagingDir: string,
  place: (entry: string) => Placement | null
): Promise<string[]> {
  const destino = serverDir(instanceId)
  const owns = new Set<string>()

  for (const entry of await filesIn(stagingDir)) {
    const placement = place(entry)
    if (!placement) continue
    const target = join(destino, ...placement.dest.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await cp(join(stagingDir, ...entry.split('/')), target)
    owns.add(placement.owns)
  }

  return collapse([...owns])
}

/**
 * Quita las rutas que cuelgan de otra de la lista.
 *
 * Un mod que dejara apuntados `BepInEx/plugins/X` y `BepInEx/plugins/X/config`
 * estaría apuntando dos veces a lo mismo: al apagarlo, la segunda ya se habría
 * movido con la primera y no estaría donde se la busca. Se queda la de arriba.
 */
function collapse(paths: string[]): string[] {
  const ordenadas = [...new Set(paths)].sort()
  return ordenadas.filter(
    (path) => !ordenadas.some((otra) => otra !== path && path.startsWith(`${otra}/`))
  )
}

/**
 * Lo que ocupa un mod en disco.
 *
 * Un mod apagado no está en la carpeta del servidor sino apartado, y sigue
 * ocupando: por eso se mira donde toca en cada caso y no siempre en el servidor.
 */
export async function pathsSize(
  instanceId: string,
  modId: string,
  paths: string[],
  enabled: boolean
): Promise<number> {
  const base = enabled ? serverDir(instanceId) : join(disabledModsDir(instanceId), modId)
  let total = 0
  for (const path of paths) {
    total += await pathSize(join(base, ...path.split('/')))
  }
  return total
}

async function pathSize(path: string): Promise<number> {
  const info = await stat(path).catch(() => null)
  if (!info) return 0
  if (info.isFile()) return info.size
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    total += await pathSize(join(path, entry.name))
  }
  return total
}

/**
 * Borra del servidor lo que era de un mod, esté puesto o apartado.
 *
 * Las dos cosas a la vez porque un mod apagado tiene sus ficheros fuera de la
 * carpeta del servidor: quitarlo mirando solo ahí dejaría 200 MB escondidos.
 */
export async function removePaths(
  instanceId: string,
  modId: string,
  paths: string[]
): Promise<void> {
  for (const path of paths) {
    await rm(join(serverDir(instanceId), ...path.split('/')), { recursive: true, force: true })
  }
  await dropStash(instanceId, modId)
}

/**
 * Aparta un mod del servidor sin borrarlo, conservando sus rutas.
 *
 * Mover en vez de copiar y borrar es a propósito: un mod de 200 MB se apaga al
 * instante y nunca queda a medias entre los dos sitios.
 */
export async function stashPaths(
  instanceId: string,
  modId: string,
  paths: string[]
): Promise<void> {
  await moveEach(paths, serverDir(instanceId), join(disabledModsDir(instanceId), modId))
}

/** Devuelve a su sitio un mod apagado. */
export async function unstashPaths(
  instanceId: string,
  modId: string,
  paths: string[]
): Promise<void> {
  await moveEach(paths, join(disabledModsDir(instanceId), modId), serverDir(instanceId))
}

/** Borra lo que un mod tuviera apartado por estar apagado. */
export async function dropStash(instanceId: string, modId: string): Promise<void> {
  await rm(join(disabledModsDir(instanceId), modId), { recursive: true, force: true })
}

async function moveEach(paths: string[], from: string, to: string): Promise<void> {
  for (const path of paths) {
    const origen = join(from, ...path.split('/'))
    if (!(await stat(origen).catch(() => null))) continue
    const destino = join(to, ...path.split('/'))
    await mkdir(dirname(destino), { recursive: true })
    await rm(destino, { recursive: true, force: true })
    await rename(origen, destino)
  }
}

/** Deja la carpeta de trabajo vacía, venga de donde venga lo anterior. */
export async function resetStaging(instanceId: string): Promise<string> {
  const dir = modStagingDir(instanceId)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  return dir
}
