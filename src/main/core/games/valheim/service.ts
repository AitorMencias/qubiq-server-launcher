import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ValheimManifest } from '@shared/types'
import {
  MODERATION_LISTS,
  type ValheimListEntry,
  type ValheimListKind,
  type ValheimWorld
} from '@shared/games/valheim/types'
import type {
  ModCatalogItem,
  ModEntry,
  ModInstallResult,
  ModRef,
  ModsView
} from '@shared/games/mods'
import { listModeration } from '@shared/journal'
import type { GameHost } from '../minecraft/service'
import { dropStash, pathsSize, removePaths, stashPaths, unstashPaths } from '../modFiles'
import { childPath } from '../../paths'
import { saveDirFor, worldsDirFor, worldSize } from './adapter'
import * as mods from './mods'

/**
 * Operaciones exclusivas de Valheim: mundos y listas de moderación.
 *
 * Al revés que Satisfactory, aquí **todo se hace con el servidor parado**,
 * porque todo son ficheros: el mundo activo va en la línea de órdenes del
 * arranque y las listas las lee el servidor de disco. No hay API ni consola a
 * la que pedirle nada en caliente.
 *
 * Lo único que se puede tocar con el servidor en marcha son las listas, y con
 * matices: el servidor las relee, pero a quien ya está dentro no lo echa.
 */

/** Los ficheros de un mundo (`Nombre/_main.4.db2`...) cuelgan de esta carpeta. */
/** El nombre llega de la interfaz: `childPath` impide salir de la carpeta de mundos. */
function worldDir(id: string, name: string): string {
  return childPath(worldsDirFor(id), name)
}

/**
 * Valida el nombre de un mundo.
 *
 * Es el nombre de una carpeta y va en la línea de órdenes: un nombre con
 * caracteres raros hace que el servidor arranque y no guarde, que es el peor
 * fallo posible porque no se nota hasta que se pierde la partida.
 */
function validWorldName(name: string): boolean {
  return /^[\w áéíóúñÁÉÍÓÚÑ.-]{1,40}$/.test(name)
}

/**
 * Una línea de una lista de moderación.
 *
 * El formato del juego es un identificador por línea. Las líneas que empiezan
 * por `//` son los comentarios de ejemplo que el propio servidor escribe al
 * crear el fichero, y hay que conservarlos: si se borran, el usuario que abra
 * el fichero a mano se queda sin saber qué va ahí.
 */
function parseList(raw: string): ValheimListEntry[] {
  const entries: ValheimListEntry[] = []
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim()
    if (clean.length === 0 || clean.startsWith('//')) continue
    const match = /^(\S+)\s*(?:\/\/\s*(.*))?$/.exec(clean)
    if (!match) continue
    entries.push({ id: match[1]!, ...(match[2] ? { note: match[2].trim() } : {}) })
  }
  return entries
}

function formatList(kind: ValheimListKind, entries: ValheimListEntry[]): string {
  const info = MODERATION_LISTS.find((l) => l.kind === kind)!
  const header = `// ${info.label}: un identificador por línea. Lo gestiona QubiQ Server Launcher.`
  const lines = entries.map((e) => (e.note ? `${e.id} // ${e.note}` : e.id))
  return [header, ...lines, ''].join('\r\n')
}

/** Un identificador de Steam son 17 dígitos; el de PlayFab, letras y números. */
function validPlayerId(id: string): boolean {
  return /^[A-Za-z0-9]{6,32}$/.test(id)
}

export function createValheimService(host: GameHost) {
  async function requireManifest(id: string): Promise<ValheimManifest> {
    const manifest = await host.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (manifest.game !== 'valheim') {
      throw new Error('Esta operación solo existe para servidores de Valheim.')
    }
    return manifest
  }

  function listPath(id: string, kind: ValheimListKind): string {
    const info = MODERATION_LISTS.find((l) => l.kind === kind)
    if (!info) throw new Error(`Lista desconocida: ${kind}`)
    return join(saveDirFor(id), info.fileName)
  }

  async function readList(id: string, kind: ValheimListKind): Promise<ValheimListEntry[]> {
    try {
      return parseList(await readFile(listPath(id, kind), 'utf8'))
    } catch {
      // Todavía no existe: el servidor las crea en su primer arranque.
      return []
    }
  }

  async function writeList(
    id: string,
    kind: ValheimListKind,
    entries: ValheimListEntry[]
  ): Promise<ValheimListEntry[]> {
    await mkdir(saveDirFor(id), { recursive: true })
    await writeFile(listPath(id, kind), formatList(kind, entries), 'utf8')
    return entries
  }

  return {
    // --- Mundos ---------------------------------------------------------------

    /**
     * Los mundos que hay en la carpeta del servidor.
     *
     * Cada uno es una carpeta dentro de `worlds_local`; el que carga el
     * servidor es el que diga el manifiesto, y puede que todavía no exista en
     * disco si nunca se ha arrancado.
     */
    async listWorlds(id: string): Promise<ValheimWorld[]> {
      const manifest = await requireManifest(id)
      const dir = worldsDirFor(id)
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

      const worlds: ValheimWorld[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const { bytes, savedAt } = await worldSize(join(dir, entry.name))
        worlds.push({
          name: entry.name,
          active: entry.name === manifest.data.worldName,
          sizeBytes: bytes,
          savedAt
        })
      }

      // El mundo activo sale aunque aún no se haya generado: si no, el usuario
      // vería una lista vacía justo después de crear el servidor.
      if (!worlds.some((w) => w.active)) {
        worlds.push({
          name: manifest.data.worldName,
          active: true,
          sizeBytes: 0,
          savedAt: null
        })
      }

      return worlds.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    },

    /**
     * Crea un mundo y lo deja activo. No genera nada: el servidor lo hace en el
     * siguiente arranque, que es cuando decide el terreno a partir del nombre.
     */
    async createWorld(id: string, name: string): Promise<ValheimWorld[]> {
      host.assertStopped(id, 'crear un mundo')
      const manifest = await requireManifest(id)
      const clean = name.trim()

      if (!validWorldName(clean)) {
        throw new Error(
          'El nombre del mundo solo puede llevar letras, números, espacios, puntos y guiones.'
        )
      }
      const existing = await readdir(worldsDirFor(id)).catch((): string[] => [])
      if (existing.some((entry) => entry.toLowerCase() === clean.toLowerCase())) {
        throw new Error(`Ya hay un mundo que se llama «${clean}».`)
      }

      await host.updateInstance(id, { data: { ...manifest.data, worldName: clean } })
      return this.listWorlds(id)
    },

    /** Cambia el mundo que cargará el servidor la próxima vez que arranque. */
    async activateWorld(id: string, name: string): Promise<ValheimWorld[]> {
      host.assertStopped(id, 'cambiar de mundo')
      const manifest = await requireManifest(id)
      if (manifest.data.worldName === name) return this.listWorlds(id)

      const worlds = await readdir(worldsDirFor(id)).catch((): string[] => [])
      if (!worlds.includes(name)) throw new Error(`No existe el mundo «${name}».`)

      await host.updateInstance(id, { data: { ...manifest.data, worldName: name } })
      return this.listWorlds(id)
    },

    /**
     * Borra un mundo. Nunca el activo: borrar lo que el servidor va a cargar
     * dejaría la instancia arrancando un mundo nuevo sin que nadie lo pidiera.
     */
    async deleteWorld(id: string, name: string): Promise<ValheimWorld[]> {
      host.assertStopped(id, 'borrar un mundo')
      const manifest = await requireManifest(id)
      if (manifest.data.worldName === name) {
        throw new Error(
          'No se puede borrar el mundo en el que estáis jugando. Cambia antes a otro.'
        )
      }

      // Copia de seguridad antes de una operación que no tiene vuelta atrás,
      // igual que en Minecraft (§12). Si falla, se avisa y no se borra nada.
      await host.createBackup(id, `Copia previa a borrar el mundo ${name}`, true)
      await rm(worldDir(id, name), { recursive: true, force: true })
      return this.listWorlds(id)
    },

    /** Renombrar es mover la carpeta; el juego no guarda el nombre por dentro. */
    async renameWorld(id: string, name: string, newName: string): Promise<ValheimWorld[]> {
      host.assertStopped(id, 'renombrar un mundo')
      const manifest = await requireManifest(id)
      const clean = newName.trim()
      if (!validWorldName(clean)) {
        throw new Error(
          'El nombre del mundo solo puede llevar letras, números, espacios, puntos y guiones.'
        )
      }

      await rename(worldDir(id, name), worldDir(id, clean)).catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') throw new Error(`No existe el mundo «${name}».`)
        throw err
      })
      if (manifest.data.worldName === name) {
        await host.updateInstance(id, { data: { ...manifest.data, worldName: clean } })
      }
      return this.listWorlds(id)
    },

    // --- Moderación -----------------------------------------------------------

    async getList(id: string, kind: ValheimListKind): Promise<ValheimListEntry[]> {
      await requireManifest(id)
      return readList(id, kind)
    },

    /**
     * Añade a alguien a una lista.
     *
     * Aquí no se valida que el identificador exista: no hay forma de saberlo
     * sin preguntarle a Steam por una cuenta que quizá no es de este usuario.
     * Lo que sí se comprueba es que tenga forma de identificador, para que no
     * se cuele un nombre de personaje (que el servidor ignoraría en silencio).
     */
    async addToList(
      id: string,
      kind: ValheimListKind,
      playerId: string,
      note?: string
    ): Promise<ValheimListEntry[]> {
      await requireManifest(id)
      const clean = playerId.trim()
      if (!validPlayerId(clean)) {
        throw new Error(
          'Eso no parece un identificador. Valheim va por el ID de Steam (17 dígitos), no por el ' +
            'nombre del personaje: aparece en la consola cuando esa persona entra.'
        )
      }

      const entries = await readList(id, kind)
      if (entries.some((e) => e.id === clean)) return entries
      const written = await writeList(id, kind, [...entries, { id: clean, ...(note ? { note } : {}) }])
      host.journal(id, { kind: 'moderation', action: listModeration(kind, true), player: clean })
      return written
    },

    async removeFromList(
      id: string,
      kind: ValheimListKind,
      playerId: string
    ): Promise<ValheimListEntry[]> {
      await requireManifest(id)
      const entries = await readList(id, kind)
      const written = await writeList(
        id,
        kind,
        entries.filter((e) => e.id !== playerId)
      )
      if (entries.some((e) => e.id === playerId)) {
        host.journal(id, { kind: 'moderation', action: listModeration(kind, false), player: playerId })
      }
      return written
    },

    // --- Mods de Thunderstore -----------------------------------------------

    /** Busca en el catálogo. No toca el servidor: da igual si está arrancado. */
    async searchMods(text: string): Promise<ModCatalogItem[]> {
      return mods.searchMods(text)
    },

    /** El cargador y los mods que lleva el servidor, con lo que hay en disco. */
    async listMods(id: string): Promise<ModsView> {
      const manifest = await requireManifest(id)
      return buildView(id, manifest)
    },

    /**
     * Añade un mod con todo lo que necesita, y BepInEx si aún no estaba.
     *
     * Con el servidor parado: BepInEx se engancha al arrancar el proceso, y los
     * mods se cargan una sola vez, al principio.
     */
    async addMod(
      id: string,
      modId: string,
      onProgress?: (detail: string) => void
    ): Promise<ModInstallResult> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'instalar un mod')
      if (modsOf(manifest).some((mod) => mod.id === modId)) {
        throw new Error('Ese mod ya está en este servidor.')
      }

      const plan = await mods.planInstall(modId, {
        installed: new Map(modsOf(manifest).map((mod) => [mod.id, mod.version])),
        loaderVersion: manifest.data.loaderVersion ?? null
      })

      let loaderVersion = manifest.data.loaderVersion
      // Sin cargador no hay mods: si el paquete no lo declara como dependencia
      // —hay mods que se olvidan— se pone igualmente el último publicado.
      const cargador = plan.loader ?? (await loaderIfMissing(id))
      if (cargador) {
        onProgress?.('Instalando BepInEx, el cargador de mods')
        await mods.installLoader(id, cargador, onProgress)
        loaderVersion = cargador.version_number
      }

      const nuevos: ModRef[] = []
      for (const entry of plan.entries) {
        const paths = await mods.installPackage(id, entry.id, entry.version, onProgress)
        nuevos.push({
          id: entry.id,
          name: entry.name,
          version: entry.version.version_number,
          enabled: true,
          dependency: entry.id !== modId,
          paths,
          addedAt: new Date().toISOString()
        })
      }

      const actualizado = await host.updateInstance(id, {
        data: {
          ...manifest.data,
          ...(loaderVersion ? { loaderVersion } : {}),
          mods: [
            ...modsOf(manifest).filter((mod) => !nuevos.some((nuevo) => nuevo.id === mod.id)),
            ...nuevos
          ]
        }
      })

      return {
        view: await buildView(id, actualizado as ValheimManifest),
        dependencies: nuevos.filter((mod) => mod.dependency).map((mod) => mod.name)
      }
    },

    /** Quita un mod del servidor y del disco. */
    async removeMod(id: string, modId: string): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'quitar un mod')
      const ref = modsOf(manifest).find((mod) => mod.id === modId)
      if (!ref) throw new Error('Ese mod no está en este servidor.')

      await removePaths(id, ref.id, ref.paths)
      const actualizado = await host.updateInstance(id, {
        data: { ...manifest.data, mods: modsOf(manifest).filter((mod) => mod.id !== modId) }
      })
      return buildView(id, actualizado as ValheimManifest)
    },

    /**
     * Enciende o apaga un mod sin borrarlo.
     *
     * Apagarlo lo saca de `BepInEx/plugins`: el cargador recorre esa carpeta
     * entera buscando `.dll`, así que cambiarle el nombre no lo apagaría.
     */
    async setModEnabled(id: string, modId: string, enabled: boolean): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'encender o apagar un mod')
      const ref = modsOf(manifest).find((mod) => mod.id === modId)
      if (!ref) throw new Error('Ese mod no está en este servidor.')

      if (enabled) await unstashPaths(id, ref.id, ref.paths)
      else await stashPaths(id, ref.id, ref.paths)

      const actualizado = await host.updateInstance(id, {
        data: {
          ...manifest.data,
          mods: modsOf(manifest).map((mod) => (mod.id === modId ? { ...mod, enabled } : mod))
        }
      })
      return buildView(id, actualizado as ValheimManifest)
    },

    /**
     * ¿Hay versión nueva de algún mod o del cargador?
     *
     * Una consulta por mod, que es como está hecha la API de Thunderstore. No
     * se actualiza nada solo: un mod nuevo puede cambiar el mundo guardado.
     */
    async modUpdates(id: string): Promise<Record<string, string>> {
      const manifest = await requireManifest(id)
      const nuevas: Record<string, string> = {}

      for (const ref of modsOf(manifest)) {
        const info = await mods.latestVersion(ref.id).catch(() => null)
        const ultima = info?.latest.version_number
        if (ultima && mods.compareVersions(ultima, ref.version) > 0) nuevas[ref.id] = ultima
      }

      if (manifest.data.loaderVersion) {
        const info = await mods.latestVersion(mods.LOADER_ID).catch(() => null)
        const ultima = info?.latest.version_number
        if (ultima && mods.compareVersions(ultima, manifest.data.loaderVersion) > 0) {
          nuevas[mods.LOADER_ID] = ultima
        }
      }
      return nuevas
    },

    /** Pone la última versión de un mod, con copia de seguridad antes. */
    async updateMod(
      id: string,
      modId: string,
      onProgress?: (detail: string) => void
    ): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'actualizar un mod')

      // Un mod nuevo puede tocar lo que ya está construido en el mundo.
      await host.createBackup(id, `Antes de actualizar ${modId}`, true).catch(() => undefined)

      if (modId === mods.LOADER_ID) {
        const info = await mods.latestVersion(mods.LOADER_ID)
        await mods.installLoader(id, info.latest, onProgress)
        const actualizado = await host.updateInstance(id, {
          data: { ...manifest.data, loaderVersion: info.latest.version_number }
        })
        return buildView(id, actualizado as ValheimManifest)
      }

      const ref = modsOf(manifest).find((mod) => mod.id === modId)
      if (!ref) throw new Error('Ese mod no está en este servidor.')

      const info = await mods.latestVersion(modId)
      // Se quita lo anterior antes de poner lo nuevo: un mod que cambia de
      // ficheros dejaría el `.dll` viejo cargándose junto al nuevo.
      await removePaths(id, ref.id, ref.paths)
      const paths = await mods.installPackage(id, modId, info.latest, onProgress)
      if (!ref.enabled) await stashPaths(id, ref.id, paths)

      const actualizado = await host.updateInstance(id, {
        data: {
          ...manifest.data,
          mods: modsOf(manifest).map((mod) =>
            mod.id === modId ? { ...mod, version: info.latest.version_number, paths } : mod
          )
        }
      })
      return buildView(id, actualizado as ValheimManifest)
    },

    /**
     * Quita BepInEx y deja el servidor como vino de Steam.
     *
     * Solo cuando no queda ningún mod: sin cargador, los que hubiera se
     * quedarían en el disco sin cargarse y sin decir por qué.
     */
    async removeLoader(id: string): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'quitar el cargador de mods')
      if (modsOf(manifest).length > 0) {
        throw new Error('Quita antes los mods: sin BepInEx no se cargaría ninguno.')
      }
      await mods.removeLoader(id)
      await dropStash(id, mods.LOADER_ID)
      const actualizado = await host.updateInstance(id, {
        data: { ...manifest.data, loaderVersion: undefined }
      })
      return buildView(id, actualizado as ValheimManifest)
    }
  }
}

/**
 * Los mods del manifiesto.
 *
 * Un servidor creado antes de que la app supiera de mods no tiene la lista, y
 * leerla a pelo dejaría su pestaña rota en vez de vacía.
 */
function modsOf(manifest: ValheimManifest): ModRef[] {
  return manifest.data.mods ?? []
}

/**
 * La versión de BepInEx que hay que poner, o null si ya está.
 *
 * Se mira el disco y no el manifiesto: si alguien borró sus ficheros a mano, el
 * manifiesto seguiría diciendo que está y el mod se instalaría para nada.
 */
async function loaderIfMissing(id: string): Promise<mods.ThunderstoreVersion | null> {
  if (await mods.loaderInstalled(id)) return null
  return (await mods.latestVersion(mods.LOADER_ID)).latest
}

/**
 * La pestaña de mods de una vez.
 *
 * Lo que manda es el disco: el cargador se da por puesto cuando están sus dos
 * piezas (`winhttp.dll` y el preloader), no porque el manifiesto lo diga.
 */
async function buildView(id: string, manifest: ValheimManifest): Promise<ModsView> {
  const cargador = await mods.loaderInstalled(id)

  const entries: ModEntry[] = []
  for (const ref of modsOf(manifest)) {
    const sizeBytes = await pathsSize(id, ref.id, ref.paths, ref.enabled)
    const problem =
      ref.enabled && sizeBytes === 0 ? 'No está en la carpeta del servidor.' : undefined
    entries.push({ ...ref, sizeBytes, ...(problem ? { problem } : {}) })
  }

  // Lo que BepInEx hizo la última vez. Solo se mira si está puesto: preguntarlo
  // en un servidor sin mods sería leer ficheros que no existen en cada visita.
  const ultimo = cargador ? await mods.readLoaderLog(id) : null

  return {
    loader: {
      name: mods.LOADER_NAME,
      installed: cargador,
      version: cargador ? (manifest.data.loaderVersion ?? null) : null,
      ...(ultimo ? { lastRun: ultimo } : {})
    },
    mods: entries
  }
}

export { parseList, formatList, validWorldName, validPlayerId }
