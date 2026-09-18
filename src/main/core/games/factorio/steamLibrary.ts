import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { FACTORIO_APP_ID } from '@shared/games/factorio/types'

/**
 * Busca instalaciones de Factorio que ya estén en el equipo.
 *
 * Existe para no hacer descargar 5 GB a quien ya tiene el juego. Solo **lee**:
 * la instalación del usuario no se toca nunca, se copia de ella (y la copia es
 * la que se adelgaza).
 *
 * Steam reparte los juegos entre varias bibliotecas, y cuáles hay está en
 * `steamapps/libraryfolders.vdf` de la instalación principal.
 */

export interface LocalFactorio {
  /** Carpeta raíz del juego (la que tiene `bin/` y `data/`). */
  path: string
  /** Versión, leída de `data/base/info.json`. */
  version: string | null
  /** true si trae el DLC: solo está si la cuenta lo tiene. */
  spaceAge: boolean
  /** Cómo se encontró, para decirlo en la interfaz. */
  source: 'steam'
}

/** Dónde suele estar Steam. El registro haría falta para casos raros. */
const STEAM_ROOTS = [
  join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam'),
  join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Steam'),
  join(process.env['LOCALAPPDATA'] ?? '', 'Steam')
]

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

/**
 * Las carpetas de biblioteca declaradas en `libraryfolders.vdf`.
 *
 * El fichero es VDF (el formato de Valve), pero aquí solo hace falta una cosa:
 * las líneas `"path" "D:\\SteamLibrary"`. Escribir un analizador entero de VDF
 * para eso sería pasarse.
 */
async function libraryFolders(steamRoot: string): Promise<string[]> {
  const vdf = join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  try {
    const raw = await readFile(vdf, 'utf8')
    const folders: string[] = []
    for (const match of raw.matchAll(/"path"\s*"([^"]+)"/g)) {
      folders.push(match[1]!.replace(/\\\\/g, '\\'))
    }
    return folders.length > 0 ? folders : [steamRoot]
  } catch {
    return [steamRoot]
  }
}

async function describe(path: string): Promise<LocalFactorio | null> {
  if (!(await exists(join(path, 'bin', 'x64', 'factorio.exe')))) return null
  let version: string | null = null
  try {
    const info = JSON.parse(await readFile(join(path, 'data', 'base', 'info.json'), 'utf8')) as {
      version?: string
    }
    version = info.version ?? null
  } catch {
    // Sin info.json no se sabe la versión, pero la instalación puede servir.
  }
  return {
    path,
    version,
    spaceAge: await exists(join(path, 'data', 'space-age')),
    source: 'steam'
  }
}

/** Instalaciones encontradas, sin repetir. Vacío si el usuario no tiene el juego. */
export async function findLocalFactorio(): Promise<LocalFactorio[]> {
  const seen = new Set<string>()
  const found: LocalFactorio[] = []

  for (const root of STEAM_ROOTS) {
    if (!root || !(await exists(root))) continue
    for (const folder of await libraryFolders(root)) {
      const path = join(folder, 'steamapps', 'common', 'Factorio')
      const key = path.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const info = await describe(path)
      if (info) found.push(info)
    }
  }
  return found
}

/** Comprueba una carpeta que el usuario señale a mano. */
export async function inspectFactorioFolder(path: string): Promise<LocalFactorio> {
  const info = await describe(path)
  if (!info) {
    throw new Error(
      'En esa carpeta no está Factorio. Tiene que ser la que contiene «bin» y «data» ' +
        `(por ejemplo, ...\\steamapps\\common\\Factorio, de la app ${FACTORIO_APP_ID}).`
    )
  }
  return info
}
