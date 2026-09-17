import { fetchJson } from '../../../net/http'

/**
 * PaperMC (§4.2).
 *
 * ⚠ La API v2 (`api.papermc.io/v2`) fue retirada y devuelve 410 Gone.
 * La vigente es la v3 en `fill.papermc.io`, que además entrega la URL de
 * descarga y el SHA-256 directamente en la respuesta del build.
 */

const PROJECT_URL = 'https://fill.papermc.io/v3/projects/paper'

interface ProjectResponse {
  project: { id: string; name: string }
  /** Familia ("1.21") -> lista de versiones concretas, más nuevas primero. */
  versions: Record<string, string[]>
}

interface BuildDownload {
  name: string
  size: number
  url: string
  checksums: { sha256: string }
}

interface BuildResponse {
  id: number
  time: string
  channel: 'STABLE' | 'ALPHA' | 'BETA' | 'RECOMMENDED' | string
  downloads: Record<string, BuildDownload>
}

/** Versiones de Minecraft para las que Paper publica servidor. */
export async function listVersions(force = false): Promise<string[]> {
  const { data } = await fetchJson<ProjectResponse>(PROJECT_URL, { force })
  // El objeto viene agrupado por familia; lo aplanamos conservando el orden.
  return Object.values(data.versions).flat()
}

/** Un build que se puede instalar sin avisar de nada. */
function isStable(channel: string): boolean {
  return channel === 'STABLE' || channel === 'RECOMMENDED'
}

/**
 * Canal del último build de esa versión, o null si Paper no contesta o no
 * publica ninguno todavía.
 *
 * No lanza: quien llama lo usa para decidir si avisa de que la versión está en
 * pruebas, y un fallo de red no debe tumbar el catálogo entero.
 */
export async function latestChannel(minecraftVersion: string): Promise<string | null> {
  const url = `${PROJECT_URL}/versions/${encodeURIComponent(minecraftVersion)}/builds/latest`
  try {
    const { data } = await fetchJson<BuildResponse>(url, { ttlMs: 60 * 60 * 1000 })
    return data.channel
  } catch {
    return null
  }
}

/** ¿El último build de esa versión se puede instalar sin avisar? */
export async function hasStableLatestBuild(minecraftVersion: string): Promise<boolean> {
  const channel = await latestChannel(minecraftVersion)
  return channel !== null && isStable(channel)
}

export interface PaperBuild {
  build: string
  channel: string
  url: string
  sha256: string
  size: number
  fileName: string
}

/**
 * Último build de una versión.
 *
 * Solo se ofrece el canal STABLE salvo que se pida lo contrario (§4.2). Paper
 * publica builds alpha de una versión nueva de Minecraft días antes del primer
 * estable, y quien los quiera tiene que haberlo elegido a propósito.
 */
export async function latestBuild(
  minecraftVersion: string,
  allowExperimental = false
): Promise<PaperBuild> {
  const url = `${PROJECT_URL}/versions/${encodeURIComponent(minecraftVersion)}/builds/latest`
  const { data } = await fetchJson<BuildResponse>(url, { ttlMs: 60 * 60 * 1000 })

  if (!allowExperimental && !isStable(data.channel)) {
    throw new Error(
      `El último build de Paper para ${minecraftVersion} es experimental (${data.channel}). ` +
        `Elige otra versión o marca la casilla de versión en pruebas al crear el servidor.`
    )
  }

  const primary = data.downloads['server:default'] ?? Object.values(data.downloads)[0]
  if (!primary) {
    throw new Error(`Paper no publica descarga de servidor para ${minecraftVersion}.`)
  }

  return {
    build: String(data.id),
    channel: data.channel,
    url: primary.url,
    sha256: primary.checksums.sha256,
    size: primary.size,
    fileName: primary.name
  }
}
