import { join } from 'node:path'
import { appendFile, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import {
  DEFAULT_PERMISSIONS,
  DEFAULT_REMOTE_PORT,
  cleanServerList,
  isConsoleLevel,
  isKeyAlgorithm,
  type RemoteActivityEntry,
  type RemoteDevice
} from '@shared/remote'
import { dataRoot, ensureDir } from '../paths'

/**
 * Lo que el control remoto guarda en disco, en `<datos>/remote/`:
 * - `config.json`: interruptor, puerto, dispositivos emparejados y la clave
 *   del certificado.
 * - `cert.pfx` y `cert.cer`: el certificado (ver `cert.ts`).
 * - `activity.jsonl`: el registro de actividad, una entrada por línea.
 *
 * La carpeta entera está en `DATA_ENTRIES`: se mueve con los datos.
 */

export interface StoredDevice extends RemoteDevice {
  /** Clave pública SPKI en base64. */
  publicKey: string
}

export interface RemoteConfig {
  enabled: boolean
  port: number
  /** Contraseña del PFX. Protege poco (vive al lado), pero Windows exige una para exportarlo. */
  certPassword: string | null
  devices: StoredDevice[]
}

const DEFAULTS: RemoteConfig = {
  enabled: false,
  port: DEFAULT_REMOTE_PORT,
  certPassword: null,
  devices: []
}

/** Entradas del registro que se conservan al recortarlo. */
const ACTIVITY_KEEP = 1000
/** Tamaño a partir del cual se recorta. */
const ACTIVITY_MAX_BYTES = 512 * 1024

export function remoteDir(): string {
  return join(dataRoot(), 'remote')
}

function configPath(): string {
  return join(remoteDir(), 'config.json')
}

function activityPath(): string {
  return join(remoteDir(), 'activity.jsonl')
}

export async function readConfig(): Promise<RemoteConfig> {
  let raw: string
  try {
    raw = await readFile(configPath(), 'utf8')
  } catch {
    return { ...DEFAULTS, devices: [] }
  }
  const parsed = JSON.parse(raw) as Partial<RemoteConfig>
  return {
    enabled: parsed.enabled === true,
    port: validPort(parsed.port) ? parsed.port : DEFAULT_REMOTE_PORT,
    certPassword: typeof parsed.certPassword === 'string' ? parsed.certPassword : null,
    // Un dispositivo con datos raros (editado a mano) se descarta: mejor que
    // vuelva a emparejarse que dejar entrar algo a medias.
    devices: (Array.isArray(parsed.devices) ? parsed.devices : []).filter(validDevice).map((device) => ({
      ...device,
      permissions: {
        control: device.permissions.control === true,
        console: isConsoleLevel(device.permissions.console)
          ? device.permissions.console
          : DEFAULT_PERMISSIONS.console,
        // Los emparejados antes de que existiera la lista se quedan sin
        // ninguno: no se da acceso a nada que no se haya marcado.
        servers: cleanServerList(device.permissions.servers)
      }
    }))
  }
}

/** Escritura atómica: un corte de luz a mitad no deja el fichero roto. */
export async function writeConfig(config: RemoteConfig): Promise<void> {
  await ensureDir(remoteDir())
  const temp = `${configPath()}.tmp`
  await writeFile(temp, JSON.stringify(config, null, 2), 'utf8')
  await rename(temp, configPath())
}

/**
 * Lo mismo, síncrono. Solo para el cierre de la app (`will-quit`), donde no
 * se puede esperar a nada: el proceso termina al volver del manejador.
 */
export function writeConfigSync(config: RemoteConfig): void {
  mkdirSync(remoteDir(), { recursive: true })
  const temp = `${configPath()}.tmp`
  writeFileSync(temp, JSON.stringify(config, null, 2), 'utf8')
  renameSync(temp, configPath())
}

export function validPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535
}

function validDevice(value: unknown): value is StoredDevice {
  const device = value as Partial<StoredDevice> | null
  return (
    !!device &&
    typeof device.id === 'string' &&
    typeof device.name === 'string' &&
    typeof device.publicKey === 'string' &&
    isKeyAlgorithm(device.algorithm) &&
    typeof device.createdAt === 'string' &&
    typeof device.permissions === 'object' &&
    device.permissions !== null
  )
}

export async function appendActivity(entry: RemoteActivityEntry): Promise<void> {
  try {
    await ensureDir(remoteDir())
    await appendFile(activityPath(), `${JSON.stringify(entry)}\n`, 'utf8')
    const { size } = await stat(activityPath())
    if (size > ACTIVITY_MAX_BYTES) {
      const lines = (await readFile(activityPath(), 'utf8')).split('\n').filter(Boolean)
      await writeFile(activityPath(), `${lines.slice(-ACTIVITY_KEEP).join('\n')}\n`, 'utf8')
    }
  } catch {
    // El registro nunca debe tumbar una orden.
  }
}

/** Las últimas entradas, la más reciente primero. */
export async function readActivity(limit: number): Promise<RemoteActivityEntry[]> {
  let raw: string
  try {
    raw = await readFile(activityPath(), 'utf8')
  } catch {
    return []
  }
  const entries: RemoteActivityEntry[] = []
  for (const line of raw.split('\n').filter(Boolean).slice(-limit)) {
    try {
      entries.push(JSON.parse(line) as RemoteActivityEntry)
    } catch {
      // Una línea a medias (corte al escribir) se salta.
    }
  }
  return entries.reverse()
}
