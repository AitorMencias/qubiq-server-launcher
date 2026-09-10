import type { Distribution, DistributionVersion, VersionId } from '@shared/types'
import * as mojang from './mojang'
import * as paper from './paper'
import * as fabric from './fabric'
import * as forge from './forge'

/**
 * Catálogo unificado (§5). Cruza el manifiesto de Mojang —que es quien manda en
 * el ORDEN cronológico (§4.6)— con lo que cada distribución soporta realmente.
 *
 * Consecuencia práctica: nunca se ofrece al usuario una versión que la
 * distribución elegida no pueda instalar.
 */

export interface CatalogOptions {
  force?: boolean
  /** Incluir snapshots y versiones antiguas. Apagado por defecto (§3). */
  includeUnstable?: boolean
}

/** Versiones ofrecibles para una distribución, más recientes primero. */
export async function versionsFor(
  distribution: Distribution,
  options: CatalogOptions = {}
): Promise<DistributionVersion[]> {
  const { force = false, includeUnstable = false } = options

  const mojangVersions = await mojang.listVersions(force)
  // El orden del manifiesto es la única referencia fiable (§4.6).
  const order = new Map<string, VersionId>()
  for (const v of mojangVersions) order.set(v.id, v)

  const supported = await supportedIds(distribution, force)

  const result: DistributionVersion[] = []
  for (const id of supported) {
    const meta = order.get(id)
    if (!meta) continue // La distribución declara una versión que Mojang no lista.
    if (!includeUnstable && meta.channel !== 'release') continue
    result.push({
      minecraftVersion: id,
      channel: meta.channel,
      recommended: false
    })
  }

  result.sort((a, b) => {
    const ai = order.get(a.minecraftVersion)!.orderIndex
    const bi = order.get(b.minecraftVersion)!.orderIndex
    return ai - bi
  })

  if (result[0]) result[0].recommended = true
  return result
}

async function supportedIds(distribution: Distribution, force: boolean): Promise<string[]> {
  switch (distribution) {
    case 'vanilla': {
      const all = await mojang.listVersions(force)
      return all.map((v) => v.id)
    }
    case 'paper':
      return paper.listVersions(force)
    case 'fabric':
      return fabric.listVersions(force)
    case 'forge':
      return forge.listVersions(force)
  }
}

/** Versión que la app propone por defecto: la última estable de esa distribución. */
export async function defaultVersionFor(distribution: Distribution): Promise<string> {
  const versions = await versionsFor(distribution)
  const first = versions[0]
  if (!first) {
    throw new Error(`No hay ninguna versión disponible para ${distribution}.`)
  }
  return first.minecraftVersion
}

/** Java que necesita la combinación elegida (§4.7). */
export async function javaMajorFor(minecraftVersion: string): Promise<number> {
  return mojang.requiredJavaMajor(minecraftVersion)
}
