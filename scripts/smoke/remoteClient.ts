import { generateKeyPairSync, randomBytes, sign as nodeSign, type KeyObject } from 'node:crypto'
import { request } from 'node:https'
import {
  orderMessage,
  pairMessage,
  type KeyAlgorithm,
  type RemoteArgs,
  type RemoteOrder
} from '../../src/shared/remote'

/**
 * Un dispositivo de prueba del control remoto: claves, firmas como las hace
 * WebCrypto y peticiones HTTPS. Lo usan el smoke y el e2e (`e2e:remote`).
 */

export interface TestDevice {
  algorithm: KeyAlgorithm
  privateKey: KeyObject
  publicKey: string
  client: string
}

export type TestKey = Omit<TestDevice, 'client'>

export function newKey(algorithm: KeyAlgorithm): TestKey {
  const pair =
    algorithm === 'Ed25519'
      ? generateKeyPairSync('ed25519')
      : generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return {
    algorithm,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  }
}

/** Firma como lo hace WebCrypto: Ed25519 tal cual, ECDSA en formato r||s. */
export function signText(key: TestKey, text: string): string {
  const data = Buffer.from(text, 'utf8')
  const signature =
    key.algorithm === 'Ed25519'
      ? nodeSign(null, data, key.privateKey)
      : nodeSign('sha256', data, { key: key.privateKey, dsaEncoding: 'ieee-p1363' })
  return signature.toString('base64')
}

export function signedOrder(
  device: TestDevice,
  order: RemoteOrder,
  args: RemoteArgs,
  ts: number
): Record<string, unknown> {
  const unsigned = { client: device.client, ts, nonce: randomBytes(16).toString('base64url'), order, args }
  return { ...unsigned, sig: signText(device, orderMessage(unsigned)) }
}

export function pairBody(key: TestKey, code: string, name = 'Móvil de prueba'): Record<string, unknown> {
  return {
    code,
    name,
    publicKey: key.publicKey,
    algorithm: key.algorithm,
    sig: signText(key, pairMessage(code, key.publicKey))
  }
}

export interface HttpResult {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}

export function https(
  method: string,
  port: number,
  path: string,
  body?: string,
  headers: Record<string, string> = {}
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      // El certificado es autofirmado: aquí no se comprueba la cadena.
      { host: '127.0.0.1', port, path, method, headers, rejectUnauthorized: false, timeout: 10_000 },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    if (body !== undefined) req.write(body)
    req.end()
  })
}

/** POST de JSON y la respuesta ya leída. */
export async function postJson<T>(port: number, path: string, body: unknown): Promise<{ status: number; reply: T }> {
  const result = await https('POST', port, path, JSON.stringify(body), { 'Content-Type': 'application/json' })
  return { status: result.status, reply: JSON.parse(result.body.toString('utf8')) as T }
}
