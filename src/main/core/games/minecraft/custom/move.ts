import { dirname, join } from 'node:path'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, rename, rm, rmdir } from 'node:fs/promises'

/**
 * Mover la carpeta de un servidor a medida a la de QubiQ (§19.x).
 *
 * Decisión del usuario: se MUEVE, no se copia. En el mismo disco es un
 * renombrado, instantáneo y atómico: o se ha movido entera o no se ha movido
 * nada. Entre discos distintos Windows no sabe renombrar, así que se copia
 * todo a una carpeta temporal, se comprueba que ha llegado todo y SOLO
 * ENTONCES se pone en su sitio y se borra la original.
 *
 * En ningún punto hay un momento en que el servidor no exista entero en algún
 * sitio: si algo falla a medias, la original sigue intacta.
 */

export interface MoveResult {
  /** Se copió entre discos y no se pudo borrar del todo la original. */
  leftovers: boolean
  copied: boolean
}

type Progress = (fraction: number | null, detail: string) => void

interface Listing {
  dirs: string[]
  files: { path: string; size: number }[]
  totalBytes: number
}

/** Todo lo que hay dentro, relativo a la raíz. Los enlaces no se siguen: se rechazan. */
async function listTree(root: string): Promise<Listing> {
  const listing: Listing = { dirs: [], files: [], totalBytes: 0 }
  const pending = ['']
  while (pending.length > 0) {
    const rel = pending.pop()!
    const entries = await readdir(join(root, rel), { withFileTypes: true })
    for (const entry of entries) {
      const child = rel ? join(rel, entry.name) : entry.name
      if (entry.isSymbolicLink()) {
        throw new Error(
          `La carpeta tiene un enlace a otro sitio («${child}») y no se puede copiar entre ` +
            'discos sin arrastrar lo que hay al otro lado. Quítalo o mueve la carpeta del servidor ' +
            'al mismo disco que QubiQ.'
        )
      }
      if (entry.isDirectory()) {
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

function lockedError(source: string): Error {
  return new Error(
    `No se puede mover «${source}»: hay algo usándola. Cierra el servidor si lo tienes abierto ` +
      'fuera de QubiQ, y cualquier programa o ventana de consola que tenga algo de dentro abierto, ' +
      'y vuelve a intentarlo. La carpeta sigue donde estaba, sin cambios.'
  )
}

/**
 * Deja la carpeta de destino libre para recibir el servidor. Solo quita una
 * carpeta VACÍA (la que crea la instancia) o los restos de un intento anterior
 * de copia; si hubiera algo más, falla en vez de borrarlo.
 */
async function clearTarget(target: string): Promise<void> {
  await rm(`${target}.importando`, { recursive: true, force: true })
  const info = await lstat(target).catch(() => null)
  if (!info) return
  if ((await readdir(target)).length > 0) {
    throw new Error(
      'La carpeta del servidor en QubiQ ya tiene cosas dentro, así que no se trae nada encima. ' +
        'Borra este servidor y vuelve a añadirlo.'
    )
  }
  // Una carpeta recién creada puede estar cogida un instante (el antivirus o
  // el indexador de Windows la abren nada más aparecer): se reintenta un poco.
  // `rmdir` nunca borra nada con contenido, así que reintentar es seguro.
  for (let attempt = 0; ; attempt++) {
    try {
      await rmdir(target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return
      if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) {
        throw new Error(
          `No se puede preparar la carpeta del servidor en QubiQ (${code}). Vuelve a intentarlo ` +
            'en un momento. Tu carpeta sigue donde estaba, sin cambios.'
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

export async function moveServerFolder(
  source: string,
  target: string,
  onProgress: Progress = () => undefined
): Promise<MoveResult> {
  await mkdir(dirname(target), { recursive: true })
  await clearTarget(target)

  onProgress(null, 'Moviendo la carpeta del servidor')
  try {
    await rename(source, target)
    return { leftovers: false, copied: false }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EXDEV') {
      // La instancia sigue esperando su carpeta: se deja como estaba.
      await mkdir(target, { recursive: true })
      if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') throw lockedError(source)
      if (code === 'ENOENT') throw new Error(`La carpeta «${source}» ya no existe.`)
      throw err
    }
  }

  return copyThenRemove(source, target, onProgress)
}

/**
 * El camino entre discos: copiar, comprobar, poner en su sitio y solo después
 * borrar la original. Aparte para poder probarlo sin tener dos discos.
 */
export async function copyThenRemove(
  source: string,
  target: string,
  onProgress: Progress = () => undefined
): Promise<MoveResult> {
  await mkdir(dirname(target), { recursive: true })
  await clearTarget(target)

  const temp = `${target}.importando`
  try {
    const listing = await listTree(source)
    const totalMb = Math.max(1, Math.round(listing.totalBytes / 1024 / 1024))
    await mkdir(temp, { recursive: true })
    for (const dir of listing.dirs) await mkdir(join(temp, dir), { recursive: true })

    let copiedBytes = 0
    let lastReport = 0
    for (const file of listing.files) {
      await copyFile(join(source, file.path), join(temp, file.path), constants.COPYFILE_EXCL)
      copiedBytes += file.size
      const now = Date.now()
      if (now - lastReport > 250) {
        lastReport = now
        onProgress(
          copiedBytes / Math.max(1, listing.totalBytes),
          `Copiando desde el otro disco: ${Math.round(copiedBytes / 1024 / 1024)} de ${totalMb} MB`
        )
      }
    }

    // Lo copiado tiene que ser exactamente lo que había.
    const check = await listTree(temp)
    if (check.files.length !== listing.files.length || check.totalBytes !== listing.totalBytes) {
      throw new Error(
        'La copia no ha salido igual que la original (faltan ficheros o no ocupan lo mismo). ' +
          'No se ha borrado nada: la carpeta sigue donde estaba.'
      )
    }
    await rename(temp, target)
  } catch (err) {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined)
    await mkdir(target, { recursive: true })
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') throw lockedError(source)
    throw err
  }

  onProgress(1, 'Copia completa. Borrando la carpeta original')
  try {
    await rm(source, { recursive: true, force: false, maxRetries: 3 })
    return { leftovers: false, copied: true }
  } catch {
    // El servidor ya está entero en QubiQ: que quede algo en la original no
    // es un fallo del traslado, pero hay que decirlo.
    return { leftovers: true, copied: true }
  }
}
