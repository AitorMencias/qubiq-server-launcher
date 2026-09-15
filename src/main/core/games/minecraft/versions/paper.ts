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

/** ¿El último build de esa versión se puede instalar sin el modo inestable? */
export async function hasStableLatestBuild(minecraftVersion: string): Promise<boolean> {
  const url = `${PROJECT_URL}/versions/${encodeURIComponent(minecraftVersion)}/builds/latest`
  const { data } = await fetchJson<BuildResponse>(url, { ttlMs: 60 * 60 * 1000 })
  return data.channel === 'STABLE' || data.channel === 'RECOMMENDED'
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
 * Solo se ofrece el canal STABLE salvo que se pida lo contrario (§4.2).
 */
export async function latestBuild(
  minecraftVersion: string,
  allowExperimental = false
): Promise<PaperBuild> {
  const url = `${PROJECT_URL}/versions/${encodeURIComponent(minecraftVersion)}/builds/latest`
  const { data } = await fetchJson<BuildResponse>(url, { ttlMs: 60 * 60 * 1000 })

  if (!allowExperimental && data.channel !== 'STABLE' && data.channel !== 'RECOMMENDED') {
    throw new Error(
      `El último build de Paper para ${minecraftVersion} es experimental (${data.channel}). ` +
        `Elige otra versión o activa el modo avanzado.`
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
