import { join } from 'node:path'
import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import type { MinecraftCreateRequest, MinecraftManifest } from '@shared/types'
import type { MinecraftData } from '@shared/games/minecraft/types'
import { DISTRIBUTION_LABELS } from '@shared/games/minecraft/types'
import type { InstallableVersion } from '@shared/games'
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
import { describeStartFile, inspectFolder } from './custom/inspect'
import { moveServerFolder } from './custom/move'
import { customLaunch } from './custom/launch'

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

const EULA_ACCEPTED = [
  '# Aceptado desde QubiQ Server Launcher por decision explicita del usuario.',
  '# https://aka.ms/MinecraftEULA',
  'eula=true',
  ''
].join('\r\n')

/**
 * Prepara un servidor a medida: lo trae de su carpeta (si aún no se ha
 * traído), pone su Java, el EULA aceptado y el puerto elegido. No descarga ni
 * instala nada del servidor: eso ya lo trae la carpeta.
 */
async function installCustom(
  manifest: MinecraftManifest,
  onProgress: InstallContext['onProgress']
): Promise<Partial<MinecraftData>> {
  const custom = manifest.data.custom!
  const dir = serverDir(manifest.id)

  if (custom.importFrom) {
    // Si la carpeta de QubiQ ya tiene el servidor, el traslado terminó en un
    // intento anterior (y falló algo de después, como bajar Java): no se
    // vuelve a mover nada. El traslado deja la carpeta vacía o completa,
    // nunca a medias.
    const alreadyMoved = (await readdir(dir).catch(() => [])).length > 0
    if (!alreadyMoved) {
      const result = await moveServerFolder(custom.importFrom, dir, (fraction, detail) =>
        onProgress('move', fraction, detail)
      )
      if (result.leftovers) {
        onProgress(
          'move',
          1,
          `El servidor ya está en QubiQ, pero no se pudo borrar todo lo de ${custom.importFrom}. ` +
            'Ya no hace falta: bórralo cuando quieras.'
        )
      }
    }
  }

  onProgress('java', null, `Comprobando Java ${manifest.data.javaMajor}`)
  await java.ensureJava(manifest.data.javaMajor, (phase, value, detail) => {
    onProgress(phase === 'download' ? 'java-download' : 'java-extract', value, detail)
  })

  // El EULA lo aceptó el usuario al añadirlo; un server pack no suele traerlo.
  const eulaPath = join(dir, 'eula.txt')
  const eula = await readFile(eulaPath, 'utf8').catch(() => '')
  if (!/^\s*eula\s*=\s*true\s*$/im.test(eula)) await writeFile(eulaPath, EULA_ACCEPTED, 'utf8')

  // El puerto vive en dos sitios (§8): manda el que se eligió al añadirlo.
  const propsPath = join(dir, 'server.properties')
  const props = await PropertiesFile.load(propsPath)
  if (props.get('server-port') !== String(manifest.port)) {
    props.set('server-port', String(manifest.port))
    await props.save(propsPath)
  }

  // Quién pone la memoria se vuelve a mirar: el script puede haber cambiado.
  const start = await describeStartFile(dir, custom.startFile)
  return { custom: { startFile: start.path, memory: start.memory } }
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
    allowExperimental: manifest.data.allowExperimental,
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

    if (options.import) {
      // Se vuelve a mirar aquí aunque el asistente ya lo hiciera: la carpeta se
      // va a MOVER, y la comprobación que lo permite no puede depender de que
      // la interfaz la haya hecho bien.
      const inspection = await inspectFolder(options.import.folder)
      if (inspection.problems.length > 0) throw new Error(inspection.problems.join(' '))
      const start = await describeStartFile(options.import.folder, options.import.startFile)
      return {
        distribution: options.distribution,
        minecraftVersion: options.minecraftVersion,
        ...(inspection.build ? { build: inspection.build } : {}),
        javaMajor,
        memoryMb,
        jvmArgs: defaultJvmArgs(memoryMb),
        custom: { startFile: start.path, memory: start.memory, importFrom: options.import.folder }
      }
    }

    return {
      distribution: options.distribution,
      minecraftVersion: options.minecraftVersion,
      build: options.build,
      // Solo se guarda cuando el asistente avisó y el usuario lo aceptó: así
      // una reinstalación futura no vuelve a fallar por el canal del build.
      ...(options.allowExperimental ? { allowExperimental: true } : {}),
      javaMajor,
      memoryMb,
      jvmArgs: defaultJvmArgs(memoryMb)
    }
  },

  async writeInitialFiles(manifest, request) {
    // Un servidor a medida trae sus ficheros, y todavía no ha llegado: lo que
    // haga falta se escribe al traerlo (`installCustom`).
    if (manifest.data.custom) return

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
    if (manifest.data.custom) return installCustom(manifest, onProgress)

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

  /**
   * Minecraft no se actualiza solo: la versión la elige el usuario y cambiarla
   * obliga a todos sus amigos a cambiar la suya. Lo que sí se puede decir es si
   * ha salido una más nueva que la que tiene puesta.
   */
  async checkUpdate(manifest) {
    // Uno a medida lo montó el usuario: su versión la decide su modpack.
    if (manifest.data.custom) {
      return { installed: manifest.data.minecraftVersion, latest: null, available: false }
    }
    const list = await catalog.versionsFor(manifest.data.distribution)
    const installed = manifest.data.minecraftVersion
    const installedIndex = list.findIndex((v) => v.minecraftVersion === installed)
    const recommendedIndex = list.findIndex((v) => v.recommended)
    const recommended = list[recommendedIndex]

    return {
      installed,
      latest: recommended?.minecraftVersion ?? null,
      // Solo si de verdad va por detrás. El catálogo viene de más nueva a más
      // vieja, así que un índice menor es una versión posterior: quien está en
      // una versión en pruebas va por delante y no tiene nada que actualizar.
      available:
        installedIndex >= 0 && recommendedIndex >= 0 && recommendedIndex < installedIndex
    }
  },

  async listVersions(manifest) {
    if (manifest.data.custom) return []
    const list = await catalog.versionsFor(manifest.data.distribution)
    const installed = manifest.data.minecraftVersion
    const index = list.findIndex((v) => v.minecraftVersion === installed)

    const versions: InstallableVersion[] = list.map((v, i) => ({
      id: v.minecraftVersion,
      label: v.minecraftVersion,
      ...(v.experimental ? { experimental: true } : {}),
      ...(v.recommended ? { recommended: true } : {}),
      ...(v.minecraftVersion === installed ? { installed: true } : {}),
      // El orden del catálogo es el del manifiesto de Mojang (§4.6), que es la
      // única referencia fiable: comparar los números del nombre no vale.
      relation: index < 0 ? 'unknown' : i < index ? 'newer' : i > index ? 'older' : 'same'
    }))

    // La instalada puede haber desaparecido del catálogo (una snapshot, o una
    // versión que la distribución dejó de publicar). Se enseña igual: esconder
    // la que está puesta haría pensar que el servidor no tiene ninguna.
    if (index < 0) {
      versions.unshift({ id: installed, label: installed, installed: true, relation: 'same' })
    }
    return versions
  },

  async prepareVersionChange(manifest, versionId) {
    if (manifest.data.custom) {
      throw new Error(
        'Un servidor a medida no cambia de versión desde la app: lo que hay en su carpeta lo ' +
          'decide su modpack o su instalador.'
      )
    }
    const list = await catalog.versionsFor(manifest.data.distribution)
    const target = list.find((v) => v.minecraftVersion === versionId)
    if (!target) {
      const tipo = DISTRIBUTION_LABELS[manifest.data.distribution].name
      throw new Error(`«${tipo}» no publica servidor para la versión ${versionId}.`)
    }

    return {
      minecraftVersion: target.minecraftVersion,
      // Cada versión pide su Java (§4.7), y el salto de 1.20 a 26.x cambia de
      // 17 a 25: sin recalcularlo aquí el servidor arrancaría con el que no es.
      javaMajor: await catalog.javaMajorFor(target.minecraftVersion),
      allowExperimental: target.experimental === true,
      // El build guardado es el de la versión anterior; lo resuelve `install`.
      build: undefined
    }
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
    const custom = manifest.data.custom
    if (custom) {
      if (custom.importFrom && (await readdir(serverDir(manifest.id)).catch(() => [])).length === 0) {
        throw new Error(
          'Este servidor no se terminó de traer, y su carpeta sigue donde estaba. Bórralo y ' +
            'vuelve a añadirlo (en modo avanzado también se puede reintentar con «Reinstalar servidor»).'
        )
      }
      const runtime = await java.ensureJava(manifest.data.javaMajor)
      return customLaunch(serverDir(manifest.id), custom, runtime.javaPath, manifest.data.memoryMb)
    }

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
