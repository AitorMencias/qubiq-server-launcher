import type { InstallableVersion } from '@shared/games'
import {
  DEFAULT_BRANCH,
  ensureSteamCmd,
  installedBranch,
  installedBuildId,
  listBranches,
  type SteamBranch
} from '../tools/steamcmd'

/**
 * Las ramas de Steam, vistas como «versiones» de un servidor.
 *
 * En un juego de Steam no se elige una versión suelta: se elige una **rama**, y
 * Steam instala la última build de esa rama. Es lo único que hay, pero da justo
 * lo que hace falta: `public` es la de siempre, `experimental` va por delante y
 * las ramas antiguas que mantiene el estudio (Valheim publica media docena) son
 * la forma de volver atrás.
 *
 * Bajar por depósito a una build concreta no entra: exige los identificadores
 * de manifiesto de cada depósito y `download_depot`, que Valve no soporta de
 * forma anónima. Con las ramas se cubre el caso real —probar lo nuevo y poder
 * volver— sin depender de algo que se puede romper en cualquier momento.
 */

/** Nombres en cristiano de las ramas que se repiten entre juegos. */
const KNOWN_LABELS: Record<string, string> = {
  public: 'La de siempre',
  experimental: 'Experimental',
  beta: 'Beta'
}

/**
 * Cómo se enseña una rama.
 *
 * Se prefiere la descripción del estudio («Previous stable») a inventar una:
 * es la misma que ve el usuario en Steam, y así coinciden.
 */
export function branchLabel(branch: SteamBranch): string {
  return KNOWN_LABELS[branch.name] ?? branch.description ?? branch.name
}

/** Debajo del nombre: qué es esa rama, sin repetir lo que ya dice la etiqueta. */
function branchDescription(branch: SteamBranch): string | undefined {
  if (branch.name === DEFAULT_BRANCH) {
    return 'La versión que juega todo el mundo. Es la que tienen tus amigos.'
  }
  if (branch.name === 'experimental') {
    return 'Lo que el estudio está probando. Va por delante, pero puede fallar.'
  }
  // En las ramas antiguas la etiqueta YA es la descripción del estudio, así que
  // repetirla sobraría; lo que aporta es que es una versión anterior.
  return branch.description ? undefined : 'Rama publicada por el estudio.'
}

/**
 * Convierte las ramas publicadas en la lista que enseña la interfaz.
 *
 * El `relation` sale de comparar el número de build, que en Steam solo crece:
 * una rama con build mayor que la instalada es posterior, y una con build menor
 * es anterior. Es un dato de Valve, no una suposición nuestra.
 */
export async function steamVersions(
  appId: number,
  installDir: string,
  buildIdEnManifiesto: string | undefined
): Promise<InstallableVersion[]> {
  // Preguntar por las ramas es hablar con Steam, y eso necesita SteamCMD. En
  // un servidor que ya existe siempre está —se instaló con él—, pero
  // asegurarlo aquí evita un «no se encuentra el programa» incomprensible.
  await ensureSteamCmd()
  const [branches, current, enDisco] = await Promise.all([
    listBranches(appId),
    installedBranch(installDir, appId),
    installedBuildId(installDir, appId)
  ])
  // Manda lo que hay en disco: el manifiesto puede haberse quedado atrás, y
  // sobre eso se decide si una rama es anterior a la instalada.
  return toInstallableVersions(branches, current, enDisco ?? buildIdEnManifiesto)
}

/**
 * La conversión, sin tocar disco ni red: es la parte con criterio (etiquetas y
 * si una rama es anterior o posterior) y así el smoke la comprueba contra las
 * ramas reales grabadas.
 */
export function toInstallableVersions(
  branches: SteamBranch[],
  currentBranch: string,
  installedBuildId: string | undefined
): InstallableVersion[] {
  const installed = installedBuildId ? Number(installedBuildId) : NaN

  return branches.map((branch) => {
    const description = branchDescription(branch)
    return {
      id: branch.name,
      label: branchLabel(branch),
      ...(description ? { description } : {}),
      ...(branch.name === 'experimental' ? { experimental: true } : {}),
      ...(branch.name === DEFAULT_BRANCH ? { recommended: true } : {}),
      ...(branch.name === currentBranch ? { installed: true } : {}),
      relation: relationTo(installed, Number(branch.buildId))
    }
  })
}

function relationTo(installed: number, build: number): InstallableVersion['relation'] {
  if (!Number.isFinite(installed) || !Number.isFinite(build)) return 'unknown'
  if (build === installed) return 'same'
  return build > installed ? 'newer' : 'older'
}

/**
 * Comprueba que la rama pedida existe antes de reinstalar sobre ella. Sin esto,
 * SteamCMD instalaría la pública sin decir nada y el usuario se quedaría con
 * otra versión de la que pidió.
 */
export async function requireBranch(appId: number, branchName: string): Promise<string> {
  await ensureSteamCmd()
  const branches = await listBranches(appId)
  const found = branches.find((b) => b.name === branchName)
  if (!found) {
    const disponibles = branches.map((b) => b.name).join(', ')
    throw new Error(
      `Steam ya no publica la versión «${branchName}» de este servidor. Disponibles: ${disponibles}.`
    )
  }
  return found.name
}
