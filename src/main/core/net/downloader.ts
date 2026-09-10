import { createWriteStream } from 'node:fs'
import { rename, rm, stat, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createReadStream } from 'node:fs'
import { USER_AGENT, HttpError } from './http'

/**
 * Descargas con verificación de integridad (§12).
 *
 * Mojang publica SHA-1 y Paper SHA-256; ambos se comprueban siempre.
 * Una descarga que no cuadra se borra: nunca se ejecuta un binario sin verificar.
 */

export type HashAlgorithm = 'sha1' | 'sha256'

export interface DownloadOptions {
  url: string
  destination: string
  expectedHash?: { algorithm: HashAlgorithm; value: string }
  /** Tamaño esperado en bytes, si el catálogo lo publica. */
  expectedSize?: number
  onProgress?: (received: number, total: number | null) => void
  signal?: AbortSignal
}

export class IntegrityError extends Error {
  constructor(
    readonly url: string,
    readonly expected: string,
    readonly actual: string
  ) {
    super(
      `La descarga de ${url} no coincide con el hash publicado. ` +
        `Esperado ${expected}, obtenido ${actual}.`
    )
    this.name = 'IntegrityError'
  }
}

export async function hashFile(path: string, algorithm: HashAlgorithm): Promise<string> {
  const hash = createHash(algorithm)
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Descarga a un fichero temporal y solo lo mueve al destino si el hash cuadra.
 * Así nunca queda un fichero a medias que parezca válido en el siguiente arranque.
 */
export async function download(options: DownloadOptions): Promise<string> {
  const { url, destination, expectedHash, onProgress, signal } = options

  // Si ya está descargado y verificado, no repetimos el trabajo.
  if (expectedHash && (await fileExists(destination))) {
    const actual = await hashFile(destination, expectedHash.algorithm)
    if (actual.toLowerCase() === expectedHash.value.toLowerCase()) {
      onProgress?.(1, 1)
      return destination
    }
  }

  await mkdir(dirname(destination), { recursive: true })
  const tempPath = `${destination}.part`
  await rm(tempPath, { force: true })

  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal })
  if (!res.ok || !res.body) {
    throw new HttpError(`${res.status} ${res.statusText} al descargar ${url}`, res.status, url)
  }

  const lengthHeader = res.headers.get('content-length')
  const total = lengthHeader ? Number(lengthHeader) : (options.expectedSize ?? null)
  let received = 0

  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress?.(received, total)
  })

  await pipeline(source, createWriteStream(tempPath))

  if (expectedHash) {
    const actual = await hashFile(tempPath, expectedHash.algorithm)
    if (actual.toLowerCase() !== expectedHash.value.toLowerCase()) {
      await rm(tempPath, { force: true })
      throw new IntegrityError(url, expectedHash.value, actual)
    }
  }

  await rm(destination, { force: true })
  await rename(tempPath, destination)
  return destination
}
