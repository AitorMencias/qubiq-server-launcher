import { open } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

/**
 * Lo justo para leer dos o tres ficheros pequeños de dentro de un `.jar`
 * (§19.20): el `plugin.yml` de un plugin o el `mods.toml` de un mod, que dicen
 * cómo se llama y, por tanto, dónde guarda su configuración.
 *
 * Un jar es un zip. No se descomprime entero ni se llama a `tar`: se lee el
 * directorio central del final del fichero, se buscan esas entradas por nombre
 * y se inflan solo ellas. Con jars de mods de 50 MB, la diferencia se nota.
 */

/** Más grande que esto, un descriptor no es un descriptor: no se lee. */
const MAX_ENTRY = 1024 * 1024

export async function readJarEntries(path: string, names: string[]): Promise<Map<string, Buffer>> {
  const found = new Map<string, Buffer>()
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    if (size < 22) return found

    // El registro de cierre (EOCD) está al final, detrás de un comentario de
    // hasta 64 KB.
    const tailSize = Math.min(size, 22 + 0xffff)
    const tail = Buffer.alloc(tailSize)
    await handle.read(tail, 0, tailSize, size - tailSize)
    let eocd = -1
    for (let i = tailSize - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd === -1) return found

    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    // Zip64 (más de 4 GB o 65 535 entradas): ningún jar de plugin llega ahí.
    if (cdOffset === 0xffffffff || cdOffset + cdSize > size) return found

    const cd = Buffer.alloc(cdSize)
    await handle.read(cd, 0, cdSize, cdOffset)

    const wanted = new Set(names)
    let p = 0
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const method = cd.readUInt16LE(p + 10)
      const compressed = cd.readUInt32LE(p + 20)
      const uncompressed = cd.readUInt32LE(p + 24)
      const nameLength = cd.readUInt16LE(p + 28)
      const extraLength = cd.readUInt16LE(p + 30)
      const commentLength = cd.readUInt16LE(p + 32)
      const localOffset = cd.readUInt32LE(p + 42)
      const name = cd.toString('utf8', p + 46, p + 46 + nameLength)
      p += 46 + nameLength + extraLength + commentLength

      if (!wanted.has(name) || uncompressed > MAX_ENTRY || compressed > MAX_ENTRY) continue

      // La cabecera local repite el nombre y puede traer otro "extra" distinto
      // del del directorio central: hay que leer sus longitudes.
      const local = Buffer.alloc(30)
      await handle.read(local, 0, 30, localOffset)
      if (local.readUInt32LE(0) !== 0x04034b50) continue
      const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)

      const data = Buffer.alloc(compressed)
      await handle.read(data, 0, compressed, dataStart)
      if (method === 0) found.set(name, data)
      else if (method === 8) found.set(name, inflateRawSync(data))

      if (found.size === wanted.size) break
    }
  } finally {
    await handle.close()
  }
  return found
}
