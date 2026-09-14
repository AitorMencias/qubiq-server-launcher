import { join } from 'node:path'
import { readFile, writeFile, readdir, rm, access } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { CreateInstanceRequest, InstanceManifest } from '@shared/types'
import {
  ensureDir,
  instanceDir,
  instancesDir,
  manifestPath,
  serverDir,
  backupsDir,
  slugify
} from '../paths'
import { defaultJvmArgs, suggestedMemoryMb } from '../install/jvmArgs'
import { PropertiesFile, initialProperties } from '../config/properties'
import * as catalog from '../versions/catalog'

/**
 * Ciclo de vida de las instancias (§5.1).
 *
 * El manifiesto guarda INTENCIÓN (qué quiso el usuario), no estado derivado.
 * Lo que hay realmente en disco se consulta al disco.
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

export async function readManifest(id: string): Promise<InstanceManifest | null> {
  try {
    const raw = await readFile(manifestPath(id), 'utf8')
    return JSON.parse(raw) as InstanceManifest
  } catch {
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
 * Crea la instancia en disco: manifiesto, carpetas y server.properties inicial.
 * NO descarga nada todavía; de eso se encarga el instalador.
 */
export async function createInstance(request: CreateInstanceRequest): Promise<InstanceManifest> {
  if (!request.eulaAccepted) {
    // El EULA se acepta explícitamente; nunca se marca por nosotros (§6).
    throw new Error('Hay que aceptar el EULA de Minecraft antes de crear el servidor.')
  }

  const name = request.name.trim() || 'Servidor'

  // Se valida ANTES de tocar el disco: un ajuste no válido no debe dejar a
  // medio crear una carpeta de servidor que luego aparezca en la lista.
  const properties = initialProperties(
    request.port,
    name,
    request.expectedPlayers,
    request.properties
  )
  if (request.exposure && !['local', 'router', 'tunnel'].includes(request.exposure.mode)) {
    throw new Error(`Forma de conexión desconocida: ${request.exposure.mode}`)
  }

  const id = await uniqueId(request.name)
  const javaMajor = await catalog.javaMajorFor(request.minecraftVersion)
  const memoryMb = request.memoryMb > 0 ? request.memoryMb : suggestedMemoryMb()

  const manifest: InstanceManifest = {
    schemaVersion: 1,
    id,
    name,
    distribution: request.distribution,
    minecraftVersion: request.minecraftVersion,
    build: request.build,
    javaMajor,
    expectedPlayers: request.expectedPlayers,
    memoryMb,
    jvmArgs: defaultJvmArgs(memoryMb),
    port: request.port,
    autoRestart: false,
    backup: { enabled: true, intervalHours: 6, keep: 10 },
    ...(request.exposure ? { exposure: request.exposure } : {}),
    createdAt: new Date().toISOString(),
    eulaAccepted: true
  }

  await ensureDir(instanceDir(id))
  await ensureDir(serverDir(id))
  await ensureDir(backupsDir(id))
  await writeManifest(manifest)

  // server.properties inicial: valores por defecto más lo elegido al crear.
  const props = await PropertiesFile.load(join(serverDir(id), 'server.properties'))
  props.setAll(properties)
  await props.save(join(serverDir(id), 'server.properties'))

  // eula.txt solo porque el usuario ya lo aceptó de forma explícita.
  await writeFile(
    join(serverDir(id), 'eula.txt'),
    [
      '# Aceptado desde QubiQ Server Launcher por decision explicita del usuario.',
      '# https://aka.ms/MinecraftEULA',
      'eula=true',
      ''
    ].join('\r\n'),
    'utf8'
  )

  return manifest
}

export async function updateInstance(
  id: string,
  changes: Partial<Omit<InstanceManifest, 'id' | 'schemaVersion'>>
): Promise<InstanceManifest> {
  const current = await readManifest(id)
  if (!current) throw new Error(`No existe la instancia ${id}.`)

  const updated: InstanceManifest = { ...current, ...changes, id: current.id, schemaVersion: 1 }

  // Si cambia la memoria, hay que regenerar los flags de JVM que dependen de ella.
  if (changes.memoryMb && changes.memoryMb !== current.memoryMb) {
    updated.jvmArgs = defaultJvmArgs(changes.memoryMb)
  }

  await writeManifest(updated)
  return updated
}

/** Borra la instancia entera, mundo incluido. Irreversible. */
export async function deleteInstance(id: string): Promise<void> {
  await rm(instanceDir(id), { recursive: true, force: true })
}

/** Lee server.properties de una instancia. */
export async function readProperties(id: string): Promise<Record<string, string>> {
  const props = await PropertiesFile.load(join(serverDir(id), 'server.properties'))
  return props.entries()
}

/**
 * Escribe server.properties preservando claves desconocidas y comentarios (§8).
 * El servidor debe estar parado: si está arrancado, reescribe el fichero al
 * cerrarse y machacaría estos cambios.
 */
export async function writeProperties(
  id: string,
  values: Record<string, string>
): Promise<Record<string, string>> {
  const path = join(serverDir(id), 'server.properties')
  const props = await PropertiesFile.load(path)
  props.setAll(values)
  await props.save(path)

  // El puerto vive en dos sitios; mantenemos el manifiesto sincronizado.
  const port = values['server-port']
  if (port && Number.isFinite(Number(port))) {
    await updateInstance(id, { port: Number(port) })
  }

  return props.entries()
}
