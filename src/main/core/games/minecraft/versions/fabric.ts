import { fetchJson } from '../../../net/http'

/**
 * Fabric (§4.5). La integración más limpia: su meta genera el jar de servidor
 * al vuelo, así que no hace falta ejecutar ningún instalador.
 *
 * Contrapartida: el launcher que entrega pesa ~180 KB y descarga sus
 * dependencias en el PRIMER arranque, que por tanto necesita conexión.
 */

const META = 'https://meta.fabricmc.net/v2'

interface GameVersion {
  version: string
  stable: boolean
}

interface LoaderVersion {
  version: string
  stable: boolean
}

interface InstallerVersion {
  version: string
  stable: boolean
}

export async function listVersions(force = false): Promise<string[]> {
  const { data } = await fetchJson<GameVersion[]>(`${META}/versions/game`, { force })
  return data.map((v) => v.version)
}

export async function stableVersions(force = false): Promise<string[]> {
  const { data } = await fetchJson<GameVersion[]>(`${META}/versions/game`, { force })
  return data.filter((v) => v.stable).map((v) => v.version)
}

async function latestStableLoader(): Promise<string> {
  const { data } = await fetchJson<LoaderVersion[]>(`${META}/versions/loader`)
  const stable = data.find((v) => v.stable) ?? data[0]
  if (!stable) throw new Error('Fabric no devolvió ninguna versión de loader.')
  return stable.version
}

async function latestStableInstaller(): Promise<string> {
  const { data } = await fetchJson<InstallerVersion[]>(`${META}/versions/installer`)
  const stable = data.find((v) => v.stable) ?? data[0]
  if (!stable) throw new Error('Fabric no devolvió ninguna versión de instalador.')
  return stable.version
}

export interface FabricServerJar {
  url: string
  loader: string
  installer: string
  fileName: string
}

/**
 * URL del launcher de servidor ya montado para esa combinación.
 * Fabric no publica hash, así que la verificación de integridad no aplica aquí:
 * se confía en HTTPS contra su dominio.
 */
export async function serverJar(minecraftVersion: string): Promise<FabricServerJar> {
  const [loader, installer] = await Promise.all([latestStableLoader(), latestStableInstaller()])
  return {
    url: `${META}/versions/loader/${encodeURIComponent(minecraftVersion)}/${loader}/${installer}/server/jar`,
    loader,
    installer,
    fileName: 'fabric-server-launch.jar'
  }
}
