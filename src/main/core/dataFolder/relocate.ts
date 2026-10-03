import { join } from 'node:path'
import { constants } from 'node:fs'
import { access, copyFile, mkdir, rename, rm, rmdir } from 'node:fs/promises'
import type { RelocationErrorCode, RelocationProgress } from '@shared/dataFolder'
import { DATA_ENTRIES } from '../paths'
import { listTree, type TreeListing } from './tree'
import { hasContent, samePath } from './plan'

/**
 * Llevar los datos de la app de una carpeta a otra.
 *
 * Mismo principio que traer un servidor a medida (`custom/move.ts`): en ningún
 * momento dejan de existir enteros en algún sitio.
 *
 *  - **En el mismo disco** se renombra cada entrada de `DATA_ENTRIES`. Es
 *    instantáneo; si falla una a medias, las ya movidas vuelven a su sitio.
 *  - **Entre discos** Windows no sabe renombrar: se copia todo a una carpeta
 *    temporal junto al destino, se comprueba que ha llegado lo mismo (número de
 *    ficheros y bytes), se pone en su sitio y SOLO ENTONCES se borra el origen.
 *
 * Se ejecuta al arrancar la app, antes que el núcleo, así que nada tiene
 * ficheros abiertos en los datos.
 */

export class RelocationError extends Error {
  constructor(
    readonly code: RelocationErrorCode,
    detail?: string
  ) {
    super(detail ?? code)
  }
}

export interface RelocationResult {
  /** Entre discos: quedaron restos en el origen que no se pudieron borrar. */
  leftovers: boolean
  copied: boolean
}

type Progress = (progress: RelocationProgress) => void

/** Carpeta temporal de la copia entre discos, junto al destino. */
export const STAGING_DIR = '.qubiq-moviendo'

const LOCK_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

function wrap(err: unknown): RelocationError {
  if (err instanceof RelocationError) return err
  const code = (err as NodeJS.ErrnoException).code ?? ''
  const message = err instanceof Error ? err.message : String(err)
  if (LOCK_CODES.has(code)) return new RelocationError('locked', message)
  if (code === 'ENOENT') return new RelocationError('missing', message)
  return new RelocationError('other', message)
}

/**
 * Deja libre en el destino el sitio de cada entrada que se va a mover. Una
 * carpeta vacía se quita (la pudo dejar una versión anterior o un traslado
 * deshecho); si hay algo dentro, se para sin tocar nada: la comprobación previa
 * ya lo impide, y esto es la red por si algo ha cambiado desde entonces.
 */
async function clearTargets(to: string, entries: readonly string[]): Promise<void> {
  for (const entry of entries) {
    const path = join(to, entry)
    if (!(await hasContent(path))) {
      await rmdir(path).catch(() => undefined)
      continue
    }
    throw new RelocationError('other', `«${entry}» ya existe en ${to}`)
  }
}

export async function relocateData(
  from: string,
  to: string,
  onProgress: Progress = () => undefined
): Promise<RelocationResult> {
  if (samePath(from, to)) throw new RelocationError('other', 'origen y destino son la misma carpeta')
  onProgress({ phase: 'measuring' })
  const present: string[] = []
  for (const entry of DATA_ENTRIES) {
    if (await exists(join(from, entry))) present.push(entry)
  }
  if (!(await exists(from))) throw new RelocationError('missing', from)

  try {
    await mkdir(to, { recursive: true })
    await clearTargets(to, present)
  } catch (err) {
    throw wrap(err)
  }

  onProgress({ phase: 'moving' })
  const moved: string[] = []
  try {
    for (const entry of present) {
      await rename(join(from, entry), join(to, entry))
      moved.push(entry)
    }
    return { leftovers: false, copied: false }
  } catch (err) {
    // Lo ya movido vuelve a su sitio antes de decidir nada.
    for (const entry of moved.reverse()) {
      await rename(join(to, entry), join(from, entry)).catch(() => undefined)
    }
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw wrap(err)
  }

  return copyThenRemove(from, to, present, onProgress)
}

/**
 * El camino entre discos. Exportado para poder probarlo sin tener dos discos:
 * el smoke lo llama directamente en el mismo.
 */
export async function copyThenRemove(
  from: string,
  to: string,
  entries: readonly string[] = DATA_ENTRIES,
  onProgress: Progress = () => undefined
): Promise<RelocationResult> {
  if (samePath(from, to)) throw new RelocationError('other', 'origen y destino son la misma carpeta')
  const present: string[] = []
  for (const entry of entries) {
    if (await exists(join(from, entry))) present.push(entry)
  }
  try {
    await mkdir(to, { recursive: true })
    await clearTargets(to, present)
  } catch (err) {
    throw wrap(err)
  }

  onProgress({ phase: 'measuring' })
  const listings = new Map<string, TreeListing>()
  let totalBytes = 0
  try {
    for (const entry of present) {
      const listing = await listTree(join(from, entry))
      if (listing.link !== null) {
        throw new RelocationError('links', listing.link ? join(entry, listing.link) : entry)
      }
      listings.set(entry, listing)
      totalBytes += listing.totalBytes
    }
  } catch (err) {
    throw wrap(err)
  }

  const staging = join(to, STAGING_DIR)
  const placed: string[] = []
  try {
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true })

    let copiedBytes = 0
    let lastReport = 0
    onProgress({ phase: 'copying', copiedBytes, totalBytes })
    for (const entry of present) {
      const listing = listings.get(entry)!
      const source = join(from, entry)
      const dest = join(staging, entry)
      if (listing.files.length === 1 && listing.files[0]!.path === '') {
        // Una entrada que es un fichero suelto (settings.json).
        await copyFile(source, dest, constants.COPYFILE_EXCL)
        copiedBytes += listing.totalBytes
        continue
      }
      await mkdir(dest, { recursive: true })
      for (const dir of listing.dirs) await mkdir(join(dest, dir), { recursive: true })
      for (const file of listing.files) {
        await copyFile(join(source, file.path), join(dest, file.path), constants.COPYFILE_EXCL)
        copiedBytes += file.size
        const now = Date.now()
        if (now - lastReport > 250) {
          lastReport = now
          onProgress({ phase: 'copying', copiedBytes, totalBytes })
        }
      }
    }

    // Lo copiado tiene que ser exactamente lo que había.
    onProgress({ phase: 'verifying' })
    for (const entry of present) {
      const original = listings.get(entry)!
      const copy = await listTree(join(staging, entry))
      if (copy.files.length !== original.files.length || copy.totalBytes !== original.totalBytes) {
        throw new RelocationError('mismatch', entry)
      }
    }

    for (const entry of present) {
      await rename(join(staging, entry), join(to, entry))
      placed.push(entry)
    }
    await rmdir(staging)
  } catch (err) {
    // El origen no se ha tocado: se deshace lo copiado y se deja todo como estaba.
    // Solo se borra en el destino lo que se ha puesto ahí en esta llamada.
    for (const entry of placed) {
      await rm(join(to, entry), { recursive: true, force: true }).catch(() => undefined)
    }
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw wrap(err)
  }

  onProgress({ phase: 'cleaning' })
  let leftovers = false
  for (const entry of present) {
    try {
      await rm(join(from, entry), { recursive: true, force: false, maxRetries: 3 })
    } catch {
      // Los datos ya están enteros en el destino: que quede algo en el origen
      // no es un fallo del traslado, pero hay que decirlo.
      leftovers = true
    }
  }
  return { leftovers, copied: true }
}
