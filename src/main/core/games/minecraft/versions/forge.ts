import { fetchJson, fetchText } from '../../../net/http'

/**
 * Forge (§4.4). El caso más complejo del MVP y por eso el primero en construirse:
 * obliga a que la abstracción `Installer` sea correcta desde el principio (§15.1).
 *
 * ⚠ Dos detalles que rompen implementaciones ingenuas:
 *  1. `promotions_slim.json` SOLO responde en files.minecraftforge.net.
 *     En maven.minecraftforge.net devuelve 404.
 *  2. Forge no produce un jar ejecutable desde 1.17: hay que leer el argfile
 *     que genera el instalador. Ver `install/forge.ts`.
 */

const PROMOTIONS_URL =
  'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const MAVEN_BASE = 'https://maven.minecraftforge.net/net/minecraftforge/forge'
const MAVEN_METADATA = `${MAVEN_BASE}/maven-metadata.xml`

interface Promotions {
  homepage: string
  /** Claves del tipo "1.20.1-latest" y "1.20.1-recommended". */
  promos: Record<string, string>
}

/** Todas las versiones publicadas, en formato `<mc>-<forge>` (ej. `1.20.1-47.4.23`). */
export async function listAllBuilds(force = false): Promise<string[]> {
  const xml = await fetchText(MAVEN_METADATA)
  void force
  const versions: string[] = []
  const re = /<version>([^<]+)<\/version>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    versions.push(match[1]!)
  }
  return versions
}

/**
 * Versiones de Minecraft con Forge disponible.
 * Se derivan de las promociones, que es lo que Forge considera publicable.
 */
export async function listVersions(force = false): Promise<string[]> {
  const { data } = await fetchJson<Promotions>(PROMOTIONS_URL, { force })
  const seen = new Set<string>()
  for (const key of Object.keys(data.promos)) {
    const mc = key.replace(/-(latest|recommended)$/, '')
    seen.add(mc)
  }
  return [...seen]
}

export interface ForgeBuild {
  /** Versión de Forge sola, ej. `47.4.23`. */
  forgeVersion: string
  /** Identificador completo de Maven, ej. `1.20.1-47.4.23`. */
  fullVersion: string
  installerUrl: string
  installerFileName: string
  recommended: boolean
}

function buildFor(minecraftVersion: string, forgeVersion: string, recommended: boolean): ForgeBuild {
  const fullVersion = `${minecraftVersion}-${forgeVersion}`
  const installerFileName = `forge-${fullVersion}-installer.jar`
  return {
    forgeVersion,
    fullVersion,
    installerUrl: `${MAVEN_BASE}/${fullVersion}/${installerFileName}`,
    installerFileName,
    recommended
  }
}

/**
 * Build a usar para una versión de Minecraft.
 * Prefiere la "recommended" de Forge; si no existe, la "latest".
 * El usuario no ve este segundo eje de versión salvo en modo avanzado (§15.1).
 */
export async function resolveBuild(minecraftVersion: string): Promise<ForgeBuild> {
  const { data } = await fetchJson<Promotions>(PROMOTIONS_URL)

  const recommended = data.promos[`${minecraftVersion}-recommended`]
  if (recommended) return buildFor(minecraftVersion, recommended, true)

  const latest = data.promos[`${minecraftVersion}-latest`]
  if (latest) return buildFor(minecraftVersion, latest, false)

  // Algunas versiones nuevas aparecen en Maven antes que en las promociones.
  const all = await listAllBuilds()
  const prefix = `${minecraftVersion}-`
  const candidates = all.filter((v) => v.startsWith(prefix))
  const last = candidates[candidates.length - 1]
  if (last) {
    return buildFor(minecraftVersion, last.slice(prefix.length), false)
  }

  throw new Error(`Forge no publica ninguna versión para Minecraft ${minecraftVersion}.`)
}
