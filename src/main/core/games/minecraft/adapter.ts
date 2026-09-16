import { join } from 'node:path'
import { access, writeFile } from 'node:fs/promises'
import type { MinecraftCreateRequest, MinecraftManifest } from '@shared/types'
import type { MinecraftData } from '@shared/games/minecraft/types'
import type { GameAdapter } from '../types'
import { serverDir } from '../../paths'
import { installerFor, type InstallContext } from './install'
import { defaultJvmArgs, suggestedMemoryMb } from './install/jvmArgs'
import * as java from './java/manager'
import * as catalog from './versions/catalog'
import { PropertiesFile, initialProperties } from './config/properties'
import * as worlds from './worlds/manager'
import { parseLine, diagnoseExit } from './logParser'
import { serverListPing, checkFromInternet } from './ping'

/**
 * Minecraft como juego del núcleo.
 *
 * Aquí está todo lo que antes el núcleo hacía dando por hecho que cualquier
 * servidor era de Minecraft: Java, los instaladores de cada distribución,
 * `server.properties`, el EULA, qué carpetas forman una copia y cómo se deja
 * el mundo consistente para copiarlo en caliente.
 */

/**
 * Ficheros de configuración que merece la pena conservar en una copia.
 * Las carpetas de mundo NO se listan aquí: dependen de `level-name`, así que
 * se resuelven en tiempo de ejecución (ver `worlds.foldersForWorld`).
 */
const BACKED_UP_FILES = [
  'server.properties',
  'ops.json',
  'whitelist.json',
  'banned-players.json',
  'banned-ips.json'
]

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Contexto de instalación y arranque, con el Java que toque ya asegurado. */
async function installContext(
  manifest: MinecraftManifest,
  onProgress: InstallContext['onProgress'] = () => undefined
): Promise<InstallContext> {
  const runtime = await java.ensureJava(manifest.data.javaMajor)
  return {
    instanceId: manifest.id,
    serverDir: serverDir(manifest.id),
    minecraftVersion: manifest.data.minecraftVersion,
    build: manifest.data.build,
    javaPath: runtime.javaPath,
    memoryMb: manifest.data.memoryMb,
    onProgress
  }
}

export const minecraftAdapter: GameAdapter<MinecraftManifest, MinecraftCreateRequest> = {
  id: 'minecraft',

  async prepareCreate(request, name) {
    const options = request.options

    // Se valida ANTES de tocar el disco: un ajuste no válido no debe dejar a
    // medio crear una carpeta de servidor que luego aparezca en la lista.
    initialProperties(request.port, name, request.expectedPlayers, options.properties)

    const javaMajor = await catalog.javaMajorFor(options.minecraftVersion)
    const memoryMb = options.memoryMb > 0 ? options.memoryMb : suggestedMemoryMb()

    return {
      distribution: options.distribution,
      minecraftVersion: options.minecraftVersion,
      build: options.build,
      javaMajor,
      memoryMb,
      jvmArgs: defaultJvmArgs(memoryMb)
    }
  },

  async writeInitialFiles(manifest, request) {
    const dir = serverDir(manifest.id)

    // server.properties inicial: valores por defecto más lo elegido al crear.
    const path = join(dir, 'server.properties')
    const props = await PropertiesFile.load(path)
    props.setAll(
      initialProperties(manifest.port, manifest.name, manifest.expectedPlayers, request.options.properties)
    )
    await props.save(path)

    // eula.txt solo porque el usuario ya lo aceptó de forma explícita.
    await writeFile(
      join(dir, 'eula.txt'),
      [
        '# Aceptado desde QubiQ Server Launcher por decision explicita del usuario.',
        '# https://aka.ms/MinecraftEULA',
        'eula=true',
        ''
      ].join('\r\n'),
      'utf8'
    )
  },

  async install(manifest, onProgress) {
    // 1. Java. El usuario nunca lo instala a mano (§4.7).
    onProgress('java', null, `Comprobando Java ${manifest.data.javaMajor}`)
    await java.ensureJava(manifest.data.javaMajor, (phase, value, detail) => {
      onProgress(phase === 'download' ? 'java-download' : 'java-extract', value, detail)
    })

    // 2. La distribución elegida.
    const installer = installerFor(manifest.data.distribution)
    const result = await installer.install(await installContext(manifest, onProgress))

    if (result.build && result.build !== manifest.data.build) return { build: result.build }
    return undefined
  },

  applyChanges(current, next, changes) {
    // Los flags de la JVM dependen de la memoria: si cambia, se regeneran.
    // `changes.data` es de cualquier juego: aquí ya se sabe que es de Minecraft
    // porque quien llama busca el adaptador por el juego del manifiesto.
    const memoryMb = (changes.data as Partial<MinecraftData> | undefined)?.memoryMb
    if (memoryMb && memoryMb !== current.data.memoryMb) {
      next.data = { ...next.data, jvmArgs: defaultJvmArgs(memoryMb) }
    }
    return next
  },

  async launch(manifest) {
    const ctx = await installContext(manifest)
    // El plan de arranque se recalcula siempre desde el disco: en Forge el
    // argfile puede haber cambiado tras una reinstalación (§6).
    const plan = await installerFor(manifest.data.distribution).buildLaunchPlan(ctx)
    return { command: ctx.javaPath, args: plan.args, cwd: ctx.serverDir }
  },

  // Windows no tiene SIGTERM: la única forma de parar sin corromper chunks es
  // escribir `stop` y esperar a que el servidor termine solo.
  stop: () => ({ kind: 'stdin', command: 'stop' }),

  parseLine,
  diagnoseExit,

  async backupEntries(manifest) {
    // ⚠ El mundo NO se llama siempre "world": lo dice `level-name`. Asumirlo
    // haría que, en cuanto el usuario cambiara de mundo, las copias guardaran
    // el mundo equivocado o ninguno.
    const worldName = await worlds.activeWorldName(manifest.id)
    const worldFolders = await worlds.foldersForWorld(manifest.id, worldName)

    // Sin mundo no hay copia que valga: guardar solo la configuración de una
    // instancia recién creada llenaría el historial de ruido inútil.
    if (worldFolders.length === 0) return []

    const entries = [...worldFolders]
    for (const candidate of BACKED_UP_FILES) {
      if (await exists(join(serverDir(manifest.id), candidate))) entries.push(candidate)
    }
    return entries
  },

  async restoreTargets(manifest) {
    const worldName = await worlds.activeWorldName(manifest.id)
    return worlds.foldersForWorld(manifest.id, worldName)
  },

  backupMeta(manifest) {
    return { version: manifest.data.minecraftVersion, variant: manifest.data.distribution }
  },

  async holdSaves(_manifest, supervisor) {
    if (!supervisor.isRunning) return true

    supervisor.sendCommand('save-off')
    // El acuse varía entre versiones y distribuciones: "Saved the game",
    // "Saved the world" o "Saved the chunks".
    const confirmed = supervisor.waitForLog(/Saved the (game|world|chunks)/i, 60_000)
    supervisor.sendCommand('save-all flush')
    return confirmed
  },

  resumeSaves(_manifest, supervisor) {
    if (!supervisor.isRunning) return
    supervisor.sendCommand('save-on')
  },

  ping(manifest) {
    return serverListPing('127.0.0.1', manifest.port)
  },

  checkFromInternet
}
