import { join } from 'node:path'
import { lstat, readdir } from 'node:fs/promises'

/**
 * Recorrer lo que hay dentro de la carpeta de datos: cuánto ocupa, qué hay que
 * copiar y si hay enlaces.
 *
 * Los enlaces (y las uniones de `mklink /J`, que Node ve igual) no se siguen:
 * copiarlos entre discos arrastraría lo que hay al otro lado, así que se
 * apuntan y quien pregunta decide. Renombrar en el mismo disco sí los respeta.
 */

export interface TreeListing {
  dirs: string[]
  files: { path: string; size: number }[]
  totalBytes: number
  /** El primer enlace encontrado, relativo a la raíz, o null. */
  link: string | null
}

/** Todo lo que hay dentro de `root`, relativo a ella. Si es un fichero, él solo. */
export async function listTree(root: string): Promise<TreeListing> {
  const listing: TreeListing = { dirs: [], files: [], totalBytes: 0, link: null }
  const info = await lstat(root)
  if (info.isSymbolicLink()) {
    listing.link = ''
    return listing
  }
  if (info.isFile()) {
    listing.files.push({ path: '', size: info.size })
    listing.totalBytes = info.size
    return listing
  }

  const pending = ['']
  while (pending.length > 0) {
    const rel = pending.pop()!
    const entries = await readdir(join(root, rel), { withFileTypes: true })
    for (const entry of entries) {
      const child = rel ? join(rel, entry.name) : entry.name
      if (entry.isSymbolicLink()) {
        listing.link ??= child
      } else if (entry.isDirectory()) {
        listing.dirs.push(child)
        pending.push(child)
      } else if (entry.isFile()) {
        const size = (await lstat(join(root, child))).size
        listing.files.push({ path: child, size })
        listing.totalBytes += size
      }
    }
  }
  return listing
}
