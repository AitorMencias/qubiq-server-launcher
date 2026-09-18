import { join } from 'node:path'
import { readdir, stat, rm, rename } from 'node:fs/promises'
import type { ContentInfo, ContentItem, Distribution } from '@shared/games/minecraft/types'
import { contentKindFor } from '@shared/games/minecraft/types'
import { serverDir, ensureDir } from '../../../paths'

/**
 * Plugins y mods (§4.8).
 *
 * La app no descarga nada por su cuenta: el usuario baja el `.jar` de la web
 * que prefiera y lo pega en la carpeta. Esto es deliberado —descargar código
 * ajeno en nombre del usuario es otra responsabilidad— y aquí lo que se ofrece
 * es el camino: abrir la carpeta correcta y ver qué hay dentro.
 *
 * Sufijo con el que se marcan los desactivados. Forge, Fabric y Paper solo
 * cargan ficheros que acaben en `.jar`, así que renombrarlos basta para
 * apagarlos sin perderlos.
 */
const DISABLED_SUFFIX = '.disabled'

export function folderNameFor(distribution: Distribution): string | null {
  const kind = contentKindFor(distribution)
  return kind === null ? null : kind
}

/** Carpeta donde van los ficheros, creada si aún no existe. */
export async function contentFolder(
  id: string,
  distribution: Distribution
): Promise<string | null> {
  const folder = folderNameFor(distribution)
  if (!folder) return null

  const path = join(serverDir(id), folder)
  // Se crea al vuelo: en un servidor recién instalado que no ha arrancado
  // nunca, esta carpeta todavía no existe y el botón "abrir carpeta" no
  // llevaría a ninguna parte.
  await ensureDir(path)
  return path
}

export async function listContent(
  id: string,
  distribution: Distribution
): Promise<ContentInfo> {
  const kind = contentKindFor(distribution)
  const folderName = folderNameFor(distribution)

  if (!kind || !folderName) {
    return { kind: null, folderName: '', items: [] }
  }

  const path = join(serverDir(id), folderName)
  let entries: string[]
  try {
    entries = await readdir(path)
  } catch {
    return { kind, folderName, items: [] }
  }

  const items: ContentItem[] = []
  for (const entry of entries) {
    const enabled = entry.toLowerCase().endsWith('.jar')
    const disabled = entry.toLowerCase().endsWith(`.jar${DISABLED_SUFFIX}`)
    if (!enabled && !disabled) continue // Carpetas de configuración, logs...

    try {
      const stats = await stat(join(path, entry))
      if (stats.isDirectory()) continue
      items.push({
        fileName: entry,
        sizeBytes: stats.size,
        addedAt: stats.mtime.toISOString(),
        enabled
      })
    } catch {
      // Un fichero que desaparece a mitad del listado no debe romper nada.
    }
  }

  items.sort((a, b) => a.fileName.localeCompare(b.fileName, 'es'))
  return { kind, folderName, items }
}

/** Comprueba que el nombre no se sale de la carpeta de contenido. */
export function assertSafeName(fileName: string): void {
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new Error('Nombre de fichero no válido.')
  }
}

/**
 * Activa o desactiva un fichero renombrándolo.
 * Desactivar en vez de borrar permite descartar el mod que impide arrancar sin
 * perderlo, que es justo lo que hace falta cuando algo va mal (§16).
 */
export async function setEnabled(
  id: string,
  distribution: Distribution,
  fileName: string,
  enabled: boolean
): Promise<ContentInfo> {
  assertSafeName(fileName)
  const folder = folderNameFor(distribution)
  if (!folder) throw new Error('Este tipo de servidor no admite plugins ni mods.')

  const path = join(serverDir(id), folder)
  const isDisabled = fileName.toLowerCase().endsWith(`.jar${DISABLED_SUFFIX}`)

  if (enabled && isDisabled) {
    const target = fileName.slice(0, -DISABLED_SUFFIX.length)
    await rename(join(path, fileName), join(path, target))
  } else if (!enabled && !isDisabled) {
    await rename(join(path, fileName), join(path, `${fileName}${DISABLED_SUFFIX}`))
  }

  return listContent(id, distribution)
}

export async function removeContent(
  id: string,
  distribution: Distribution,
  fileName: string
): Promise<ContentInfo> {
  assertSafeName(fileName)
  const folder = folderNameFor(distribution)
  if (!folder) throw new Error('Este tipo de servidor no admite plugins ni mods.')

  await rm(join(serverDir(id), folder, fileName), { force: true })
  return listContent(id, distribution)
}
