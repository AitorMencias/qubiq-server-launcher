import type { InstanceManifest } from '@shared/types'
import type { Distribution } from '@shared/games/minecraft/types'

/**
 * Migraciones del manifiesto (`instance.json`).
 *
 * Funciones puras: reciben lo leído del disco y devuelven la versión actual.
 * Quien las usa se encarga de guardar una copia del original antes de
 * sobrescribir, para que un fallo aquí no deje un servidor sin abrir.
 */

export const CURRENT_SCHEMA = 2

/** Lo que había en disco antes de la v2: todo servidor era de Minecraft. */
interface ManifestV1 {
  schemaVersion?: 1
  id: string
  name: string
  distribution: Distribution
  minecraftVersion: string
  build?: string
  javaMajor: number
  expectedPlayers?: number
  memoryMb: number
  jvmArgs: string[]
  port: number
  autoRestart?: boolean
  exposure?: InstanceManifest['exposure']
  backup?: InstanceManifest['backup']
  createdAt?: string
  eulaAccepted?: boolean
}

export interface MigrationResult {
  manifest: InstanceManifest
  /** Esquema con el que estaba escrito; igual a CURRENT_SCHEMA si no hizo falta migrar. */
  fromSchema: number
}

/**
 * Devuelve el manifiesto en el esquema actual.
 *
 * Es idempotente: pasarle uno ya migrado lo devuelve igual. Lanza si el
 * fichero es de un esquema más nuevo que esta app, en lugar de adivinar y
 * estropearlo al guardarlo.
 */
export function migrateManifest(raw: unknown): MigrationResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('El manifiesto está vacío o no es un objeto.')
  }

  const schema = (raw as { schemaVersion?: unknown }).schemaVersion ?? 1

  if (schema === CURRENT_SCHEMA) {
    return { manifest: raw as InstanceManifest, fromSchema: CURRENT_SCHEMA }
  }

  if (typeof schema === 'number' && schema > CURRENT_SCHEMA) {
    throw new Error(
      `Este servidor lo creó una versión más nueva de la app (esquema ${schema}). ` +
        'Actualiza la app para abrirlo.'
    )
  }

  if (schema !== 1) {
    throw new Error(`Esquema de manifiesto desconocido: ${String(schema)}`)
  }

  const v1 = raw as ManifestV1
  if (!v1.id || !v1.distribution || !v1.minecraftVersion) {
    throw new Error('El manifiesto v1 está incompleto: falta el id, la distribución o la versión.')
  }

  const manifest: InstanceManifest = {
    schemaVersion: 2,
    id: v1.id,
    name: v1.name,
    game: 'minecraft',
    ...(v1.expectedPlayers !== undefined ? { expectedPlayers: v1.expectedPlayers } : {}),
    port: v1.port,
    autoRestart: v1.autoRestart ?? false,
    ...(v1.exposure ? { exposure: v1.exposure } : {}),
    backup: v1.backup ?? { enabled: true, intervalHours: 6, keep: 10 },
    createdAt: v1.createdAt ?? new Date(0).toISOString(),
    // Solo se conserva el EULA si el usuario lo aceptó: nunca se da por hecho.
    agreements: v1.eulaAccepted ? ['minecraft-eula'] : [],
    data: {
      distribution: v1.distribution,
      minecraftVersion: v1.minecraftVersion,
      ...(v1.build !== undefined ? { build: v1.build } : {}),
      javaMajor: v1.javaMajor,
      memoryMb: v1.memoryMb,
      jvmArgs: v1.jvmArgs
    }
  }

  return { manifest, fromSchema: 1 }
}
