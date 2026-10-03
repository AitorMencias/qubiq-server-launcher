import { createPublicKey, randomBytes, randomInt, verify, type KeyObject } from 'node:crypto'
import { CODE_ALPHABET, CODE_LENGTH, type KeyAlgorithm } from '@shared/remote'

/**
 * Criptografía del control remoto, toda con `node:crypto`.
 *
 * Los dispositivos firman con lo que trae el navegador (WebCrypto): Ed25519 o,
 * si no lo tiene, ECDSA P-256. WebCrypto da la firma ECDSA como `r || s`
 * (IEEE P1363), no en DER como espera OpenSSL por defecto: de ahí el
 * `dsaEncoding`.
 */

/** Null si la clave no es del tipo que dice ser (o no es una clave). */
export function importPublicKey(spkiBase64: string, algorithm: KeyAlgorithm): KeyObject | null {
  let key: KeyObject
  try {
    key = createPublicKey({ key: Buffer.from(spkiBase64, 'base64'), format: 'der', type: 'spki' })
  } catch {
    return null
  }
  if (algorithm === 'Ed25519') return key.asymmetricKeyType === 'ed25519' ? key : null
  return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1'
    ? key
    : null
}

export function verifySignature(
  key: KeyObject,
  algorithm: KeyAlgorithm,
  message: string,
  signatureBase64: string
): boolean {
  try {
    const data = Buffer.from(message, 'utf8')
    const signature = Buffer.from(signatureBase64, 'base64')
    if (algorithm === 'Ed25519') return verify(null, data, key, signature)
    return verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature)
  } catch {
    return false
  }
}

/** Identificador aleatorio y seguro para URLs. */
export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString('base64url')
}

/** Código de emparejamiento: 8 caracteres de 30 posibles, unos 39 bits. */
export function randomCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}
