import { join } from 'node:path'
import { readFile, writeFile, readdir, rm, access, copyFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { CreateInstanceRequest, InstanceManifest, ManifestChanges } from '@shared/types'
import { requiredAgreements } from '@shared/games'
import {
  ensureDir,
  instanceDir,
  instancesDir,
  manifestPath,
  serverDir,
  backupsDir,
  slugify
} from '../paths'
import type { GameAdapter } from '../games/types'
import { migrateManifest } from './migrations'

/**
 * Ciclo de vida de las instancias (§5.1), para cualquier juego.
 *
 * El manifiesto guarda INTENCIÓN (qué quiso el usuario), no estado derivado.
 * Lo que hay realmente en disco se consulta al disco. Lo propio de cada juego
 * lo resuelve su adaptador, que llega como parámetro: este módulo no importa el
 * registro de juegos para no crear un ciclo de dependencias.
 */

export async function listInstances(): Promise<InstanceManifest[]> {
  await ensureDir(instancesDir())
  const entries = await readdir(instancesDir(), { withFileTypes: true })
  const manifests: InstanceManifest[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifest = await readManifest(entry.name)
    if (manifest) manifests.push(manifest)
  }

  manifests.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return manifests
}

/**
 * Lee el manifiesto y, si es de un esquema anterior, lo migra y lo guarda.
 *
 * Antes de sobrescribir se deja una copia del original (`instance.v1.json`),
 * y solo si no existía ya: una segunda migración nunca debe pisar la copia del
 * fichero auténtico con uno ya migrado.
 */
export async function readManifest(id: string): Promise<InstanceManifest | null> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(manifestPath(id), 'utf8'))
  } catch {
    return null
  }

  try {
    const { manifest, fromSchema } = migrateManifest(raw)
    if (fromSchema !== manifest.schemaVersion) {
      const backup = join(instanceDir(id), `instance.v${fromSchema}.json`)
      if (!(await exists(backup))) await copyFile(manifestPath(id), backup)
      await writeManifest(manifest)
    }
    return manifest
  } catch {
    // Un manifiesto que no se entiende no debe tumbar la lista entera.
    return null
  }
}

export async function writeManifest(manifest: InstanceManifest): Promise<void> {
  await ensureDir(instanceDir(manifest.id))
  await writeFile(manifestPath(manifest.id), JSON.stringify(manifest, null, 2), 'utf8')
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Genera un id de carpeta libre a partir del nombre que escribió el usuario. */
async function uniqueId(name: string): Promise<string> {
  const base = slugify(name)
  if (!(await exists(instanceDir(base)))) return base

  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`
    if (!(await exists(instanceDir(candidate)))) return candidate
  }
  return `${base}-${randomUUID().slice(0, 8)}`
}

/**
 * Crea la instancia en disco: manifiesto, carpetas y ficheros iniciales del
 * juego. NO descarga nada todavía; de eso se encarga la instalación.
 */
export async function createInstance(
  request: CreateInstanceRequest,
  game: GameAdapter
): Promise<InstanceManifest> {
  // Las condiciones se aceptan explícitamente; nunca se marcan por el usuario (§6).
  for (const agreement of requiredAgreements(request.game)) {
    if (!request.agreements.includes(agreement.id)) {
      throw new Error(`Hay que aceptar ${agreement.label} antes de crear el servidor.`)
    }
  }

  const name = request.name.trim() || 'Servidor'

  if (request.exposure && !['local', 'router', 'tunnel'].includes(request.exposure.mode)) {
    throw new Error(`Forma de conexión desconocida: ${request.exposure.mode}`)
  }

  // Se valida ANTES de tocar el disco: una petición no válida no debe dejar a
  // medio crear una carpeta de servidor que luego aparezca en la lista.
  const data = await game.prepareCreate(request, name)

  const id = await uniqueId(request.name)
  // El juego y sus datos van emparejados por construcción (`data` sale del
  // adaptador de ESE juego), pero eso TypeScript no lo ve en la unión: por eso
  // el molde, y solo aquí.
  const manifest = {
    schemaVersion: 2,
    id,
    name,
    game: request.game,
    expectedPlayers: request.expectedPlayers,
    port: request.port,
    autoRestart: false,
    ...(request.exposure ? { exposure: request.exposure } : {}),
    backup: { enabled: true, intervalHours: 6, keep: 10 },
    createdAt: new Date().toISOString(),
    agreements: [...request.agreements],
    data
  } as InstanceManifest

  await ensureDir(instanceDir(id))
  await ensureDir(serverDir(id))
  await ensureDir(backupsDir(id))
  await writeManifest(manifest)
  await game.writeInitialFiles(manifest, request)

  return manifest
}

export async function updateInstance(
  id: string,
  changes: ManifestChanges,
  game?: GameAdapter
): Promise<InstanceManifest> {
  const current = await readManifest(id)
  if (!current) throw new Error(`No existe la instancia ${id}.`)

  const { data, ...rest } = changes
  // Los cambios de `data` son siempre del juego del manifiesto: quien llama
  // pide el adaptador por `manifest.game`. La unión no lo sabe, de ahí el molde.
  let updated = {
    ...current,
    ...rest,
    id: current.id,
    schemaVersion: current.schemaVersion,
    game: current.game,
    data: { ...current.data, ...data }
  } as InstanceManifest

  if (game?.applyChanges) updated = game.applyChanges(current, updated, changes)

  await writeManifest(updated)
  return updated
}

/** Borra la instancia entera, partida incluida. Irreversible. */
export async function deleteInstance(id: string): Promise<void> {
  await rm(instanceDir(id), { recursive: true, force: true })
}
