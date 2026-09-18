import { fetchJson } from '../../../net/http'

/**
 * NeoForge (§4.4). Nació en 2023 como continuación de Forge y hoy es donde van
 * la mayoría de modpacks nuevos. Se instala igual que Forge (instalador con
 * `--installServer` y argfile), pero su catálogo es otro y numera distinto.
 *
 * ⚠ Su versión NO lleva la de Minecraft delante, como en Forge: se deduce.
 *   - Hasta 1.21.11: `21.1.77` es de Minecraft 1.21.1 y `21.0.167`, de 1.21.
 *   - Con el versionado por año de Mojang lleva cuatro números: `26.1.2.109`
 *     es de 26.1.2 y `26.2.0.88`, de 26.2 (el tercero a 0 no se escribe).
 *
 * El catálogo mezcla estables con `-beta`, `-alpha` y experimentos sueltos
 * (`0.25w14craftmine.3-beta`, la broma del 1 de abril). Los experimentos no
 * se corresponden con ninguna versión de Minecraft y se descartan solos.
 */

const MAVEN_BASE = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
const VERSIONS_URL =
  'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'

interface VersionsResponse {
  isSnapshot: boolean
  versions: string[]
}

export interface NeoForgeVersion {
  /** Tal cual la publica NeoForge: `21.1.77`, `26.3.0.6-beta`. */
  version: string
  minecraftVersion: string
  /** Beta o alpha: se puede instalar, pero avisando (como las alpha de Paper). */
  experimental: boolean
  /** Números para ordenar; comparar el texto pondría la 21.1.9 detrás de la 21.1.10. */
  numbers: number[]
}

/**
 * De qué versión de Minecraft es una de NeoForge, o null si no es de ninguna.
 * Exportada para la prueba de humo y para reconocer servidores importados.
 */
export function parseVersion(version: string): NeoForgeVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(-.+)?$/.exec(version)
  if (!match) return null
  const [, a, b, c, d, suffix] = match
  const major = Number(a)
  const minor = Number(b)
  const third = Number(c)

  let minecraftVersion: string
  let numbers: number[]
  if (d !== undefined) {
    // Versionado por año: 26.1.2.109 → 26.1.2, y 26.2.0.88 → 26.2.
    if (major < 26) return null
    minecraftVersion = third === 0 ? `${major}.${minor}` : `${major}.${minor}.${third}`
    numbers = [major, minor, third, Number(d)]
  } else {
    // Hasta 1.21.11: 21.1.77 → 1.21.1, y 21.0.167 → 1.21. Un 0 delante es un
    // experimento de abril (`0.25w14craftmine`), que ni siquiera casa aquí.
    if (major < 20 || major >= 26) return null
    minecraftVersion = minor === 0 ? `1.${major}` : `1.${major}.${minor}`
    numbers = [major, minor, 0, third]
  }

  return {
    version,
    minecraftVersion,
    experimental: suffix !== undefined,
    numbers
  }
}

function compareNumbers(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Todas las publicadas que corresponden a una versión de Minecraft, de más vieja a más nueva. */
export async function listAllBuilds(force = false): Promise<NeoForgeVersion[]> {
  const { data } = await fetchJson<VersionsResponse>(VERSIONS_URL, { force })
  const parsed: NeoForgeVersion[] = []
  for (const raw of data.versions) {
    const version = parseVersion(raw)
    if (version) parsed.push(version)
  }
  return parsed.sort((a, b) => compareNumbers(a.numbers, b.numbers))
}

/** Versiones de Minecraft con NeoForge, sea estable o en pruebas. */
export async function listVersions(force = false): Promise<string[]> {
  const builds = await listAllBuilds(force)
  return [...new Set(builds.map((b) => b.minecraftVersion))]
}

/**
 * Versiones de Minecraft que tienen al menos un NeoForge estable. Las demás se
 * ofrecen marcadas como en pruebas: 26.3 salió con NeoForge solo en beta, y
 * esconderla dejaría sin poder jugarla a quien sí quiere arriesgarse.
 */
export async function stableMinecraftVersions(force = false): Promise<Set<string>> {
  const builds = await listAllBuilds(force)
  return new Set(builds.filter((b) => !b.experimental).map((b) => b.minecraftVersion))
}

export interface NeoForgeBuild {
  version: string
  experimental: boolean
  installerUrl: string
  installerFileName: string
}

export function buildFor(version: string, experimental: boolean): NeoForgeBuild {
  const installerFileName = `neoforge-${version}-installer.jar`
  return {
    version,
    experimental,
    installerUrl: `${MAVEN_BASE}/${version}/${installerFileName}`,
    installerFileName
  }
}

/**
 * La más nueva para esa versión de Minecraft. Una beta solo si no hay estable
 * y el usuario lo aceptó al crear el servidor (§4.2).
 */
export async function resolveBuild(
  minecraftVersion: string,
  allowExperimental = false
): Promise<NeoForgeBuild> {
  const builds = (await listAllBuilds()).filter((b) => b.minecraftVersion === minecraftVersion)
  if (builds.length === 0) {
    throw new Error(`NeoForge no publica ninguna versión para Minecraft ${minecraftVersion}.`)
  }

  const stable = builds.filter((b) => !b.experimental).pop()
  if (stable) return buildFor(stable.version, false)

  const latest = builds[builds.length - 1]!
  if (!allowExperimental) {
    throw new Error(
      `NeoForge solo tiene versiones en pruebas para Minecraft ${minecraftVersion} ` +
        `(la última es ${latest.version}). Elige otra versión o acepta la versión en pruebas ` +
        'al crear el servidor.'
    )
  }
  return buildFor(latest.version, true)
}
