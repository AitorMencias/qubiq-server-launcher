import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { cacheDir, ensureDir } from '../paths'

/**
 * Acceso HTTP a los catálogos de terceros (§4).
 *
 * Regla de diseño (§16): las APIs externas cambian sin aviso — la v2 de Paper
 * devolvió 410 de un día para otro. Por eso toda respuesta se cachea en disco y,
 * si la petición falla, se sirve la copia cacheada aunque esté vencida.
 * Vale más un catálogo de ayer que una app que no arranca.
 */

const USER_AGENT = 'QubiQServerLauncher/0.1 (+privado)'

/** Vigencia por defecto del catálogo en memoria/disco: 6 horas. */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

interface CacheEnvelope<T> {
  fetchedAt: number
  data: T
}

function cacheFileFor(url: string): string {
  const key = createHash('sha1').update(url).digest('hex').slice(0, 16)
  return join(cacheDir(), `catalog-${key}.json`)
}

async function readCache<T>(url: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await readFile(cacheFileFor(url), 'utf8')
    return JSON.parse(raw) as CacheEnvelope<T>
  } catch {
    return null
  }
}

async function writeCache<T>(url: string, data: T): Promise<void> {
  try {
    await ensureDir(cacheDir())
    const envelope: CacheEnvelope<T> = { fetchedAt: Date.now(), data }
    await writeFile(cacheFileFor(url), JSON.stringify(envelope), 'utf8')
  } catch {
    // Un fallo de caché nunca debe tumbar la operación en curso.
  }
}

export interface FetchJsonOptions {
  ttlMs?: number
  /** Ignora la caché fresca y fuerza la petición (el usuario pulsó "actualizar"). */
  force?: boolean
  timeoutMs?: number
}

/**
 * Descarga JSON con caché en disco y degradación elegante.
 * Devuelve además si el dato vino de la red o de una caché de emergencia,
 * para que la interfaz pueda avisar de que está viendo datos antiguos.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<{ data: T; stale: boolean }> {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS
  const cached = await readCache<T>(url)

  if (!options.force && cached && Date.now() - cached.fetchedAt < ttl) {
    return { data: cached.data, stale: false }
  }

  try {
    const data = await fetchJsonDirect<T>(url, options.timeoutMs)
    await writeCache(url, data)
    return { data, stale: false }
  } catch (err) {
    if (cached) {
      // Modo degradado: la API no responde pero tenemos una copia (§16).
      return { data: cached.data, stale: true }
    }
    throw err
  }
}

/** Petición sin caché. Úsala solo cuando el dato debe ser fresco sí o sí. */
export async function fetchJsonDirect<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) {
      throw new HttpError(`${res.status} ${res.statusText} en ${url}`, res.status, url)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Igual que el anterior pero para respuestas de texto (XML de Maven, por ejemplo). */
export async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: controller.signal
    })
    if (!res.ok) {
      throw new HttpError(`${res.status} ${res.statusText} en ${url}`, res.status, url)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Petición POST con un formulario, sin caché.
 *
 * La necesita la API pública de Steam que da los datos de un objeto del taller
 * (`GetPublishedFileDetails`): no admite GET y quiere los identificadores como
 * campos de formulario numerados. A cambio no pide clave de API.
 */
export async function postForm(
  url: string,
  fields: Record<string, string>,
  timeoutMs = 20_000
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(fields).toString(),
      signal: controller.signal
    })
    if (!res.ok) {
      throw new HttpError(`${res.status} ${res.statusText} en ${url}`, res.status, url)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export { USER_AGENT }
