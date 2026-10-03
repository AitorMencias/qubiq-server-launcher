import { connect, type TLSSocket } from 'node:tls'
import { request } from 'node:http'
import {
  formatRemoteAddress,
  sameFingerprint,
  type RemoteAddress,
  type RemoteClientError,
  type RemoteResponse
} from '@shared/remote'

/**
 * Llamadas HTTPS de un QubiQ a otro (0.13.0), con la huella del certificado
 * fijada.
 *
 * El certificado del anfitrión es autofirmado: ninguna autoridad responde por
 * él, así que la cadena no se comprueba (`rejectUnauthorized: false`) y en su
 * lugar se compara su huella SHA-256 con la que el usuario dio por buena al
 * emparejar. La comparación se hace con la conexión TLS ya establecida y
 * ANTES de escribir la petición: a un certificado que no es el fijado no le
 * llega ni la orden firmada ni nada de lo que lleva.
 *
 * Por eso la conexión se abre a mano (`tls.connect`) y se le pasa a la
 * petición ya comprobada (`createConnection`), en vez de dejar que `https`
 * conecte y escriba por su cuenta.
 */

export class ClientFailure extends Error {
  constructor(
    readonly code: RemoteClientError,
    readonly detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

export interface PeerCertificate {
  /** SHA-256 en pares hexadecimales separados por «:», como lo enseña el anfitrión. */
  fingerprint: string
  expires: string
}

export const CONNECT_TIMEOUT_MS = 8_000
export const REQUEST_TIMEOUT_MS = 20_000
/** Una respuesta más grande que esto no es del anfitrión (las de verdad no llegan a 200 KB). */
const MAX_REPLY = 4 * 1024 * 1024

/**
 * Conecta y comprueba la huella. Con `pinned` null (antes de emparejar) solo
 * la lee. Si no coincide: `cert-changed`, con la huella nueva en `detail`.
 */
export function openPinned(
  address: RemoteAddress,
  pinned: string | null
): Promise<{ socket: TLSSocket; cert: PeerCertificate }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const socket = connect({
      host: address.host,
      port: address.port,
      // Autofirmado: lo que vale es la huella, comprobada abajo.
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      ALPNProtocols: ['http/1.1']
    })
    const fail = (err: ClientFailure): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      reject(err)
    }
    const timer = setTimeout(() => fail(new ClientFailure('offline', 'timeout')), CONNECT_TIMEOUT_MS)
    socket.once('error', (err) => fail(new ClientFailure('offline', err.message)))
    socket.once('secureConnect', () => {
      const peer = socket.getPeerCertificate()
      if (!peer || typeof peer.fingerprint256 !== 'string' || peer.fingerprint256.length === 0) {
        return fail(new ClientFailure('not-qubiq', 'sin certificado'))
      }
      const cert: PeerCertificate = {
        fingerprint: peer.fingerprint256.toUpperCase(),
        expires: new Date(peer.valid_to).toISOString()
      }
      if (pinned !== null && !sameFingerprint(cert.fingerprint, pinned)) {
        return fail(new ClientFailure('cert-changed', cert.fingerprint))
      }
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ socket, cert })
    })
  })
}

/**
 * POST de JSON a un anfitrión, con la huella fijada. Devuelve la respuesta
 * tal cual (con `ok: false` incluido): qué hacer con cada «no» lo decide
 * quien llama. Lanza `ClientFailure` si no se llega o lo que contesta no es
 * un QubiQ.
 */
export async function postPinned<T>(
  address: RemoteAddress,
  pinned: string | null,
  path: '/api/pair' | '/api/order',
  body: unknown
): Promise<{ reply: RemoteResponse<T>; cert: PeerCertificate }> {
  const { socket, cert } = await openPinned(address, pinned)
  const payload = JSON.stringify(body)

  const reply = await new Promise<RemoteResponse<T>>((resolve, reject) => {
    let settled = false
    const done = (err: ClientFailure | null, value?: RemoteResponse<T>): void => {
      if (settled) return
      settled = true
      if (err) {
        req.destroy()
        socket.destroy()
        reject(err)
      } else resolve(value!)
    }
    const req = request(
      {
        createConnection: () => socket,
        method: 'POST',
        path,
        headers: {
          Host: formatRemoteAddress(address),
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Connection: 'close'
        },
        timeout: REQUEST_TIMEOUT_MS
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_REPLY) return done(new ClientFailure('not-qubiq', 'respuesta demasiado grande'))
          chunks.push(chunk)
        })
        res.on('error', (err) => done(new ClientFailure('offline', err.message)))
        res.on('end', () => {
          let parsed: unknown
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            return done(new ClientFailure('not-qubiq', `HTTP ${res.statusCode ?? '?'}`))
          }
          if (!isResponse(parsed)) return done(new ClientFailure('not-qubiq', `HTTP ${res.statusCode ?? '?'}`))
          done(null, parsed as RemoteResponse<T>)
        })
      }
    )
    req.on('error', (err) => done(new ClientFailure('offline', err.message)))
    req.on('timeout', () => done(new ClientFailure('offline', 'timeout')))
    req.end(payload)
  })
  return { reply, cert }
}

/** Tiene la forma de una respuesta del anfitrión (`shared/remote.ts`). */
function isResponse(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const reply = value as Record<string, unknown>
  if (typeof reply['time'] !== 'number' || !Number.isFinite(reply['time'])) return false
  if (reply['ok'] === true) return 'data' in reply
  return reply['ok'] === false && typeof reply['error'] === 'string'
}
