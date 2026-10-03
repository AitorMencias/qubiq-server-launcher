import { createServer, type Server } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import { gzip as gzipCallback } from 'node:zlib'

/**
 * Servidor HTTPS del control remoto.
 *
 * Sirve tres cosas y nada más:
 * - `GET /`: la página remota (`remote.html` de la compilación de la interfaz).
 * - `GET /assets/<fichero>`: sus scripts, estilos e iconos. El nombre se
 *   comprueba con una expresión cerrada: sin barras ni `..`, no hay forma de
 *   salir de esa carpeta.
 * - `POST /api/pair` y `POST /api/order`: JSON firmado (ver `index.ts`).
 *
 * No hay CORS: el navegador no deja a otra web llamar a la API, y aunque lo
 * hiciera, no podría firmar nada.
 */

export interface ApiReply {
  status: number
  body: unknown
}

export interface RemoteServerOptions {
  pfx: Buffer
  passphrase: string
  port: number
  /**
   * Dónde escuchar. En la app, sin dar ninguna: todas las interfaces, IPv4 e
   * IPv6, que es lo que necesita lo que reenvía el router y lo que entra por
   * Tailscale. Las pruebas dan `127.0.0.1` para no abrirse a la red de casa.
   */
  listenHost?: string
  /** Carpeta con `remote.html` y `assets/`. Null si no hay página compilada. */
  staticRoot: string | null
  onPair: (body: unknown, address: string) => Promise<ApiReply>
  onOrder: (body: unknown, address: string) => Promise<ApiReply>
}

const gzip = promisify(gzipCallback)

const MAX_BODY = 16 * 1024
const ASSET_NAME = /^[A-Za-z0-9._-]+$/

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
}

/** Arranca y espera a estar escuchando. Rechaza con el error de `listen` (EADDRINUSE…). */
export function startRemoteServer(options: RemoteServerOptions): Promise<Server> {
  const server = createServer(
    { pfx: options.pfx, passphrase: options.passphrase, minVersion: 'TLSv1.2' },
    (req, res) => {
      void handle(options, req, res).catch(() => {
        if (!res.headersSent) send(res, 500, 'application/json', '{"ok":false,"error":"failed"}')
        else res.destroy()
      })
    }
  )
  server.headersTimeout = 10_000
  server.requestTimeout = 20_000
  server.keepAliveTimeout = 5_000
  server.maxHeadersCount = 50
  // Escáneres y navegadores que no aceptan el certificado: ruido, no errores.
  server.on('tlsClientError', () => undefined)
  server.on('clientError', (_err, socket) => socket.destroy())

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    const ready = (): void => {
      server.off('error', reject)
      resolve(server)
    }
    if (options.listenHost) server.listen(options.port, options.listenHost, ready)
    else server.listen(options.port, ready)
  })
}

export function stopRemoteServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections()
  })
}

/** `::ffff:192.168.1.5` → `192.168.1.5`. */
export function clientAddress(req: IncomingMessage): string {
  return (req.socket.remoteAddress ?? 'desconocida').replace(/^::ffff:/, '')
}

async function handle(options: RemoteServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = new URL(req.url ?? '/', 'https://qubiq.local').pathname

  if (req.method === 'POST' && (path === '/api/pair' || path === '/api/order')) {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      return sendJson(res, { status: 415, body: { ok: false, error: 'bad-request', time: Date.now() } })
    }
    const raw = await readBody(req)
    if (raw === null) {
      return sendJson(res, { status: 413, body: { ok: false, error: 'bad-request', time: Date.now() } })
    }
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      body = null
    }
    const address = clientAddress(req)
    const reply = path === '/api/pair' ? await options.onPair(body, address) : await options.onOrder(body, address)
    return sendJson(res, reply)
  }

  if (req.method === 'GET' && options.staticRoot) {
    if (path === '/' || path === '/index.html') {
      return serveFile(req, res, join(options.staticRoot, 'remote.html'), false)
    }
    const asset = /^\/assets\/([^/]+)$/.exec(path)?.[1]
    if (asset && ASSET_NAME.test(asset) && !asset.startsWith('.')) {
      return serveFile(req, res, join(options.staticRoot, 'assets', asset), true)
    }
  }

  send(res, 404, 'text/plain; charset=utf-8', 'Not found')
}

/**
 * Ficheros ya comprimidos. Los diccionarios de los diez idiomas viajan con la
 * página (unos 3 MB): comprimidos son una fracción, y en el móvil se nota.
 * Se comprime una vez por fichero; lo que se sirve no cambia mientras la app
 * está abierta.
 */
const gzipped = new Map<string, Buffer>()
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg'])

async function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  immutable: boolean
): Promise<void> {
  const ext = extname(file).toLowerCase()
  const type = TYPES[ext]
  if (!type) return send(res, 404, 'text/plain; charset=utf-8', 'Not found')
  let content: Buffer
  try {
    content = await readFile(file)
  } catch {
    return send(res, 404, 'text/plain; charset=utf-8', 'Not found')
  }
  // Los ficheros de `assets/` llevan un resumen en el nombre: cambian de nombre
  // si cambian de contenido, así que se pueden guardar para siempre.
  const cache = immutable ? 'public, max-age=31536000, immutable' : 'no-store'
  const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
  if (acceptsGzip && COMPRESSIBLE.has(ext)) {
    let packed = gzipped.get(file)
    if (!packed) {
      packed = await gzip(content)
      gzipped.set(file, packed)
    }
    return send(res, 200, type, packed, cache, { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' })
  }
  send(res, 200, type, content, cache)
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooBig = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        tooBig = true
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(tooBig ? null : Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, reply: ApiReply): void {
  send(res, reply.status, 'application/json; charset=utf-8', JSON.stringify(reply.body))
}

function send(
  res: ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
  cache = 'no-store',
  extra: Record<string, string> = {}
): void {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...extra,
    'Content-Type': type,
    'Cache-Control': cache,
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}
