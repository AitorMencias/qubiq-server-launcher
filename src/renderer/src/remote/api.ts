import {
  normalizeCode,
  orderMessage,
  pairMessage,
  type RemoteArgs,
  type RemoteError,
  type RemoteOrder,
  type RemotePairResult,
  type RemoteResponse
} from '@shared/remote'
import { createKey, randomNonce, sign, type DeviceRecord } from './keys'

/**
 * Llamadas al anfitrión. Cada orden va firmada (ver `shared/remote.ts`).
 *
 * Cada respuesta trae la hora del anfitrión: con ella se corrige la del
 * dispositivo, porque la firma solo vale si las dos se llevan menos de un
 * minuto. Un móvil con la hora puesta a mano no debería quedarse fuera.
 */

let clockOffset = 0

export class RemoteFailure extends Error {
  constructor(
    readonly code: RemoteError | 'offline',
    readonly detail?: string
  ) {
    super(code)
  }
}

const TIMEOUT_MS = 15_000

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch {
    throw new RemoteFailure('offline')
  }
  let reply: RemoteResponse<T>
  try {
    reply = (await response.json()) as RemoteResponse<T>
  } catch {
    throw new RemoteFailure('offline')
  }
  if (typeof reply.time === 'number') clockOffset = reply.time - Date.now()
  if (!reply.ok) throw new RemoteFailure(reply.error, reply.detail)
  return reply.data
}

/** Crea la clave, empareja con el código y devuelve lo que hay que guardar. */
export async function pair(code: string, name: string): Promise<DeviceRecord> {
  const key = await createKey()
  const clean = normalizeCode(code)
  const result = await post<RemotePairResult>('/api/pair', {
    code: clean,
    name,
    publicKey: key.publicKey,
    algorithm: key.algorithm,
    sig: await sign(key.algorithm, key.privateKey, pairMessage(clean, key.publicKey))
  })
  return {
    client: result.client,
    algorithm: key.algorithm,
    privateKey: key.privateKey,
    publicKey: key.publicKey,
    host: result.host,
    name
  }
}

export async function order<T>(device: DeviceRecord, name: RemoteOrder, args: RemoteArgs = {}): Promise<T> {
  try {
    return await signedOrder<T>(device, name, args)
  } catch (err) {
    // La respuesta de «hora desfasada» ya ha corregido el reloj: un reintento.
    if (err instanceof RemoteFailure && err.code === 'expired') return signedOrder<T>(device, name, args)
    throw err
  }
}

async function signedOrder<T>(device: DeviceRecord, name: RemoteOrder, args: RemoteArgs): Promise<T> {
  const unsigned = {
    client: device.client,
    ts: Date.now() + clockOffset,
    nonce: randomNonce(),
    order: name,
    args
  }
  const sig = await sign(device.algorithm, device.privateKey, orderMessage(unsigned))
  return post<T>('/api/order', { ...unsigned, sig })
}
