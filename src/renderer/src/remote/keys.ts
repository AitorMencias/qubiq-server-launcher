import type { KeyAlgorithm } from '@shared/remote'

/**
 * La clave de este dispositivo, guardada en el navegador.
 *
 * La privada se crea **no exportable**: el navegador firma con ella, pero ni
 * esta página ni un script que se colara en ella pueden leerla. Por eso va en
 * IndexedDB, que guarda el objeto `CryptoKey` tal cual (`localStorage` solo
 * guarda texto, y habría que exportarla).
 */

export interface DeviceRecord {
  client: string
  algorithm: KeyAlgorithm
  privateKey: CryptoKey
  publicKey: string
  host: string
  name: string
}

export interface KeyMaterial {
  algorithm: KeyAlgorithm
  privateKey: CryptoKey
  /** SPKI en base64. */
  publicKey: string
}

const DB_NAME = 'qubiq-remote'
const STORE = 'device'
const RECORD = 'current'

/** Sin contexto seguro (https) no hay `crypto.subtle`, y sin él no se puede firmar. */
export function cryptoAvailable(): boolean {
  return window.isSecureContext && !!globalThis.crypto?.subtle && typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexedDB'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? new Error('indexedDB'))
      transaction.onabort = () => reject(transaction.error ?? new Error('indexedDB'))
    })
  } finally {
    db.close()
  }
}

export async function loadDevice(): Promise<DeviceRecord | null> {
  const record = await withStore<DeviceRecord | undefined>('readonly', (store) => store.get(RECORD))
  return record ?? null
}

export async function saveDevice(record: DeviceRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record, RECORD))
}

export async function forgetDevice(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(RECORD))
}

/**
 * ¿Deja el navegador guardar? Se prueba ANTES de emparejar: si no, el
 * anfitrión apuntaría un dispositivo cuya clave se pierde al cerrar la página.
 */
export async function storageWorks(): Promise<boolean> {
  try {
    await withStore('readwrite', (store) => store.put('ok', 'probe'))
    await withStore('readwrite', (store) => store.delete('probe'))
    return true
  } catch {
    return false
  }
}

/** Ed25519 si el navegador lo tiene; si no, ECDSA P-256 (Safari antiguo). */
export async function createKey(): Promise<KeyMaterial> {
  try {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair
    return { algorithm: 'Ed25519', privateKey: pair.privateKey, publicKey: await exportPublic(pair.publicKey) }
  } catch {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    return { algorithm: 'ECDSA-P256', privateKey: pair.privateKey, publicKey: await exportPublic(pair.publicKey) }
  }
}

async function exportPublic(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('spki', key)))
}

export async function sign(algorithm: KeyAlgorithm, privateKey: CryptoKey, message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const params = algorithm === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' }
  return toBase64(new Uint8Array(await crypto.subtle.sign(params, privateKey, data)))
}

/** 16 bytes aleatorios en base64url: el número de uso único de cada orden. */
export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
