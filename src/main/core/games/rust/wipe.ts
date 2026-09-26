import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { RustMapOnDisk } from '@shared/games/rust/types'
import { identityDir } from './config'

/**
 * El borrado de Rust (*wipe*), visto desde el disco.
 *
 * Lo medido en `server/<identidad>` tras arrancar el servidor real:
 *
 *     proceduralmap.3000.12345.288.map        el terreno generado
 *     proceduralmap.3000.12345.288.sav        lo construido (y .sav.1, .sav.2…)
 *     proceduralmap.3000.12345.288.navmesh    rutas de los NPC
 *     player.states.288.db   sv.files.288.db   relationship.288.db   clans.288.db
 *     player.blueprints.17.db   player.identities.17.db   player.deaths.17.db
 *
 * Dos números de versión distintos, y ahí está el borrado mensual entero:
 * `288` es la versión de guardado del mapa y `17` la de los planos. El parche
 * del primer jueves sube la primera, así que el servidor actualizado ya no
 * encuentra su mapa ni lo que colgaba de él y empieza de cero **él solo**. Los
 * planos solo se van cuando Facepunch sube la segunda, que es de vez en cuando.
 *
 * Por eso un borrado hecho desde la app borra lo mismo que borraría el parche:
 * el mapa y lo que va con su versión. Los planos, solo si se pide.
 */

/** Ficheros que renueva un borrado de mapa, igual que el del parche mensual. */
const MAP_FILES = /^(proceduralmap\.|player\.states\.|sv\.files\.|relationship\.|clans\.)/

/** Y los de los planos aprendidos. */
const BLUEPRINT_FILES = /^player\.blueprints\./

/** `proceduralmap.3000.12345.288.sav`, y sus copias `.sav.1`, `.sav.2`… */
const MAP_NAME = /^proceduralmap\.(\d+)\.(\d+)\.(\d+)(?:[._].*)?$/

/** Los mapas que hay en disco, del más reciente al más viejo. */
export async function mapsOnDisk(id: string): Promise<RustMapOnDisk[]> {
  const dir = identityDir(id)
  const maps = new Map<string, RustMapOnDisk>()

  for (const name of await readdir(dir).catch((): string[] => [])) {
    const match = MAP_NAME.exec(name)
    if (!match) continue
    const key = `${match[1]}.${match[2]}.${match[3]}`
    const info = await stat(join(dir, name)).catch(() => null)
    if (!info?.isFile()) continue

    const map = maps.get(key) ?? {
      size: Number(match[1]),
      seed: Number(match[2]),
      saveVersion: Number(match[3]),
      bytes: 0,
      bornAt: null,
      savedAt: null
    }
    map.bytes += info.size
    if (name.endsWith('.map')) map.bornAt = info.mtime.toISOString()
    if (name.endsWith('.sav')) map.savedAt = info.mtime.toISOString()
    maps.set(key, map)
  }

  return [...maps.values()].sort(
    (a, b) => b.saveVersion - a.saveVersion || (b.savedAt ?? '').localeCompare(a.savedAt ?? '')
  )
}

/**
 * El mapa que carga el servidor con este tamaño y esta semilla: el de versión
 * de guardado más alta, que es el del juego instalado.
 */
export function currentMap(
  maps: RustMapOnDisk[],
  size: number,
  seed: number
): RustMapOnDisk | undefined {
  return maps
    .filter((m) => m.size === size && m.seed === seed)
    .sort((a, b) => b.saveVersion - a.saveVersion)[0]
}

/** Lo que borraría un borrado, sin borrar nada: para enseñarlo antes. */
export async function wipeTargets(id: string, blueprints: boolean): Promise<string[]> {
  const names = await readdir(identityDir(id)).catch((): string[] => [])
  return names.filter((name) => MAP_FILES.test(name) || (blueprints && BLUEPRINT_FILES.test(name)))
}

/**
 * Borra el mapa (y los planos, si se pide). El servidor tiene que estar
 * parado: los `.db` los tiene abiertos mientras corre.
 *
 * Borra **todos** los mapas que haya, no solo el actual: los de meses pasados
 * ya no los puede cargar el juego actualizado y un mapa grande son 100 MB.
 */
export async function wipeFiles(id: string, blueprints: boolean): Promise<string[]> {
  const targets = await wipeTargets(id, blueprints)
  for (const name of targets) {
    await rm(join(identityDir(id), name), { force: true })
  }
  return targets
}
