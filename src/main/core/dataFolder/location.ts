import { join } from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

/**
 * Dónde están los datos de la app.
 *
 * Es un fichero diminuto que se queda SIEMPRE en la carpeta de siempre
 * (`%APPDATA%\qubiq-server-launcher`), se muevan los datos adonde se muevan:
 * al arrancar hay que saber dónde buscarlos antes de poder leer nada de ellos.
 * Sin el fichero, los datos están en la carpeta de siempre, que es lo que pasa
 * en todas las instalaciones anteriores a esta opción.
 *
 * No va dentro de `settings.json` porque ese fichero viaja con los datos.
 */

export const LOCATION_FILE = 'data-location.json'

export interface DataLocation {
  /** Donde están los datos. Sin él, en la carpeta de siempre. */
  dataRoot?: string
  /**
   * Traslado pedido y aún no hecho. Se hace en el siguiente arranque, antes de
   * que el núcleo abra nada: así es seguro que ningún servidor, descarga o
   * copia está usando los ficheros.
   */
  pendingMove?: { from: string; to: string }
}

export async function readLocation(configDir: string): Promise<DataLocation> {
  try {
    const raw = await readFile(join(configDir, LOCATION_FILE), 'utf8')
    const parsed = JSON.parse(raw) as DataLocation
    const location: DataLocation = {}
    if (typeof parsed.dataRoot === 'string' && parsed.dataRoot) location.dataRoot = parsed.dataRoot
    const move = parsed.pendingMove
    if (move && typeof move.from === 'string' && typeof move.to === 'string') {
      location.pendingMove = { from: move.from, to: move.to }
    }
    return location
  } catch {
    return {}
  }
}

/**
 * Se escribe a un temporal y se renombra: si el equipo se apaga a medias, queda
 * el fichero anterior entero y no uno cortado que mandaría la app a ninguna parte.
 */
export async function writeLocation(configDir: string, location: DataLocation): Promise<void> {
  await mkdir(configDir, { recursive: true })
  const path = join(configDir, LOCATION_FILE)
  const temp = `${path}.tmp`
  await writeFile(temp, JSON.stringify(location, null, 2), 'utf8')
  await rename(temp, path)
}
