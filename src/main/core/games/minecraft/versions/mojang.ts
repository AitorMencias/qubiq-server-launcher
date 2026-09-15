import { fetchJson, fetchJsonDirect } from '../../../net/http'
import type { VersionId, VersionChannel, JavaRequirement } from '@shared/games/minecraft/types'

/**
 * Catálogo oficial de Mojang (§4.1). Es además la fuente de verdad para:
 *  - el orden cronológico de versiones (§4.6)
 *  - la versión de Java que exige cada release (`javaVersion.majorVersion`)
 *  - el SHA-1 con el que verificar el jar del servidor
 */

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

interface ManifestEntry {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  time: string
  releaseTime: string
  sha1: string
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: ManifestEntry[]
}

export interface VersionMeta {
  id: string
  javaVersion?: JavaRequirement
  downloads?: {
    server?: { sha1: string; size: number; url: string }
  }
}

function toChannel(type: ManifestEntry['type']): VersionChannel {
  if (type === 'release') return 'release'
  if (type === 'snapshot') return 'snapshot'
  return 'old'
}

let manifestCache: { manifest: Manifest; stale: boolean } | null = null

async function loadManifest(force = false): Promise<{ manifest: Manifest; stale: boolean }> {
  if (manifestCache && !force) return manifestCache
  const { data, stale } = await fetchJson<Manifest>(MANIFEST_URL, { force })
  manifestCache = { manifest: data, stale }
  return manifestCache
}

/**
 * Lista de versiones en orden cronológico descendente.
 *
 * ⚠ `orderIndex` es la posición en el manifiesto, y es el ÚNICO orden fiable:
 * Minecraft mezcla versionado por año (`26.2`) y semántico (`1.21.8`), así que
 * ordenar por el string del id da resultados incorrectos (§4.6).
 */
export async function listVersions(force = false): Promise<VersionId[]> {
  const { manifest } = await loadManifest(force)
  return manifest.versions.map((entry, index) => ({
    id: entry.id,
    channel: toChannel(entry.type),
    releaseTime: entry.releaseTime,
    orderIndex: index
  }))
}

export async function latestRelease(): Promise<string> {
  const { manifest } = await loadManifest()
  return manifest.latest.release
}

/** Metadatos completos de una versión: incluye Java requerido y jar del servidor. */
export async function getVersionMeta(versionId: string): Promise<VersionMeta> {
  const { manifest } = await loadManifest()
  const entry = manifest.versions.find((v) => v.id === versionId)
  if (!entry) {
    throw new Error(`La versión ${versionId} no existe en el catálogo de Mojang.`)
  }
  // El metadato por versión es inmutable, así que se cachea con vigencia larga.
  const { data } = await fetchJson<VersionMeta>(entry.url, { ttlMs: 30 * 24 * 60 * 60 * 1000 })
  return data
}

/**
 * Java que exige una versión concreta.
 *
 * Se consulta al propio metadato de Mojang en lugar de mantener una tabla a mano,
 * que envejece mal. La tabla de respaldo solo cubre versiones antiguas que no
 * declaran `javaVersion` (§4.7).
 */
export async function requiredJavaMajor(versionId: string): Promise<number> {
  try {
    const meta = await getVersionMeta(versionId)
    if (meta.javaVersion?.majorVersion) return meta.javaVersion.majorVersion
  } catch {
    // Caemos a la tabla de respaldo.
  }
  return fallbackJavaMajor(versionId)
}

/** Respaldo para versiones que no declaran `javaVersion` (anteriores a 1.17). */
export function fallbackJavaMajor(versionId: string): number {
  const legacy = /^1\.(\d+)/.exec(versionId)
  if (legacy) {
    const minor = Number(legacy[1])
    if (minor <= 16) return 8
    if (minor === 17) return 17
    if (minor <= 20) return 17
    return 21
  }
  // Versionado por año (26.x en adelante): Java 25 o superior.
  return 25
}

/** Descarga del servidor vanilla, con su SHA-1 para verificar (§12). */
export async function serverDownload(
  versionId: string
): Promise<{ url: string; sha1: string; size: number }> {
  const meta = await getVersionMeta(versionId)
  const server = meta.downloads?.server
  if (!server) {
    throw new Error(
      `La versión ${versionId} no publica servidor descargable. ` +
        `Las versiones muy antiguas no traen server.jar (§4.1).`
    )
  }
  return { url: server.url, sha1: server.sha1, size: server.size }
}

/** Fuerza una relectura del manifiesto ignorando la caché. */
export async function refresh(): Promise<void> {
  manifestCache = null
  await fetchJsonDirect<Manifest>(MANIFEST_URL).catch(() => undefined)
  await loadManifest(true)
}
