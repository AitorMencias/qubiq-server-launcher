import { access, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { SERVER_NAME } from '@shared/games/zomboid/types'
import { serverDir } from '../../paths'

/**
 * Dónde está cada cosa de un servidor de Project Zomboid.
 *
 * Vive aparte del adaptador porque lo necesitan los dos lados: el adaptador,
 * para arrancar y para escribir la configuración, y los mods, para dejar lo
 * descargado donde el juego lo busca. Teniéndolo aquí no se miran entre ellos.
 */

/** Dentro de la instancia: el juego por un lado y lo que se guarda por otro. */
export const GAME_DIR = 'juego'

/**
 * La carpeta que hace de `user.home` del servidor. Todo lo suyo cuelga de
 * `datos/Zomboid`: partidas, configuración, registros, mods y base de datos.
 */
export const DATA_DIR = 'datos'

export function gameDirFor(id: string): string {
  return join(serverDir(id), GAME_DIR)
}

/** El `user.home` del servidor. */
export function homeDirFor(id: string): string {
  return join(serverDir(id), DATA_DIR)
}

/** Lo que el juego llama «su» carpeta: `<user.home>/Zomboid`. */
export function zomboidDirFor(id: string): string {
  return join(homeDirFor(id), 'Zomboid')
}

export function serverFilesDirFor(id: string): string {
  return join(zomboidDirFor(id), 'Server')
}

export function iniPathFor(id: string): string {
  return join(serverFilesDirFor(id), `${SERVER_NAME}.ini`)
}

export function sandboxPathFor(id: string): string {
  return join(serverFilesDirFor(id), `${SERVER_NAME}_SandboxVars.lua`)
}

export function savePathFor(id: string): string {
  return join(zomboidDirFor(id), 'Saves', 'Multiplayer', SERVER_NAME)
}

/** La base de datos de cuentas: quién es administrador y quién está vetado. */
export function databasePathFor(id: string): string {
  return join(zomboidDirFor(id), 'db', `${SERVER_NAME}.db`)
}

/**
 * Donde el juego busca los mods sueltos.
 *
 * Es el tercero de los tres sitios donde mira (`workshop,steam,mods`), y el
 * único que no necesita Steam.
 */
export function modsDirFor(id: string): string {
  return join(zomboidDirFor(id), 'mods')
}

export function javaPathFor(id: string): string {
  return join(gameDirFor(id), 'jre64', 'bin', 'java.exe')
}

/** Los presets de dificultad que trae el propio juego. */
export function presetPathFor(id: string, file: string): string {
  return join(gameDirFor(id), 'media', 'lua', 'shared', 'Sandbox', file)
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Tamaño de una carpeta, sumando todos sus ficheros. */
export async function folderSize(dir: string): Promise<number> {
  let bytes = 0
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) bytes += await folderSize(path)
    else bytes += await stat(path).then((s) => s.size, () => 0)
  }
  return bytes
}
