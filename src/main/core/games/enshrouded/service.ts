import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EnshroudedManifest } from '@shared/types'
import {
  changedFromPreset,
  presetSettings,
  roleProblems,
  validWorldName,
  type EnshroudedBan,
  type EnshroudedPreset,
  type EnshroudedRole,
  type EnshroudedSettings,
  type EnshroudedWorld
} from '@shared/games/enshrouded/types'
import type { ModEntry, ModRef, ModsView } from '@shared/games/mods'
import type { GameHost } from '../minecraft/service'
import { dropStash, pathsSize, stashPaths, unstashPaths } from '../modFiles'
import { worldDirFor, worldsDirFor, worldSize } from './adapter'
import { banToRaw, bansOf, configPath, readConfig, writeConfig } from './config'
import * as mods from './mods'
import { serverDir } from '../../paths'

/**
 * Operaciones exclusivas de Enshrouded.
 *
 * **Todo con el servidor parado**, y por el mismo motivo que en Valheim: aquí
 * no hay consola, ni RCON, ni API. Lo único que se puede preguntar en caliente
 * es cuánta gente hay, y eso va por la consulta de Steam (`poll` del adaptador).
 *
 * Y una razón más, propia de este juego: el servidor **reescribe su fichero de
 * configuración al arrancar**, así que cualquier cosa que la app escribiera con
 * él en marcha se perdería al cerrarlo, sin avisar.
 */

/**
 * Lo que la pantalla de ajustes necesita de una vez.
 *
 * `effectivePreset` es el que se le va a escribir al servidor de verdad, que no
 * siempre es el elegido: en cuanto algún valor se aparta del preajuste hay que
 * poner «A mi manera», o el servidor no miraría los ajustes.
 */
export interface EnshroudedConfigView {
  preset: EnshroudedPreset
  effectivePreset: string
  settings: EnshroudedSettings
  /** Ajustes que se apartan del preajuste elegido. */
  changed: string[]
  roles: EnshroudedRole[]
  tags: string[]
  enableTextChat: boolean
  enableVoiceChat: boolean
  voiceChatMode: 'Proximity' | 'Global'
  slotCount: number
}

export interface EnshroudedConfigChanges {
  preset?: EnshroudedPreset
  settings?: EnshroudedSettings
  roles?: EnshroudedRole[]
  tags?: string[]
  enableTextChat?: boolean
  enableVoiceChat?: boolean
  voiceChatMode?: 'Proximity' | 'Global'
}

export function createEnshroudedService(host: GameHost) {
  async function requireManifest(id: string): Promise<EnshroudedManifest> {
    const manifest = await host.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (manifest.game !== 'enshrouded') {
      throw new Error('Esta operación solo existe para servidores de Enshrouded.')
    }
    return manifest
  }

  function view(manifest: EnshroudedManifest): EnshroudedConfigView {
    const { data } = manifest
    const changed = data.preset === 'Custom' ? [] : changedFromPreset(data.preset, data.settings)
    return {
      preset: data.preset,
      effectivePreset: data.preset === 'Custom' || changed.length > 0 ? 'Custom' : data.preset,
      settings: { ...data.settings },
      changed,
      roles: data.roles.map((r) => ({ ...r })),
      tags: [...data.tags],
      enableTextChat: data.enableTextChat,
      enableVoiceChat: data.enableVoiceChat,
      voiceChatMode: data.voiceChatMode,
      slotCount: manifest.expectedPlayers ?? 4
    }
  }

  /** Los mods del manifiesto, tolerando los servidores creados antes. */
  function modsOf(manifest: EnshroudedManifest): ModRef[] {
    return manifest.data.mods ?? []
  }

  async function buildModsView(id: string, manifest: EnshroudedManifest): Promise<ModsView> {
    const cargador = await mods.loaderInstalled(id)

    const entries: ModEntry[] = []
    for (const ref of modsOf(manifest)) {
      const sizeBytes = await pathsSize(id, ref.id, ref.paths, ref.enabled)
      const problem =
        ref.enabled && sizeBytes === 0
          ? 'No está en la carpeta del servidor. ¿Se ha borrado a mano?'
          : undefined
      entries.push({ ...ref, sizeBytes, ...(problem ? { problem } : {}) })
    }

    // Lo que el usuario haya dejado a mano en `mods/`: la carpeta se puede
    // abrir desde la pantalla, así que pasa de verdad.
    const sueltos = await mods.strayMods(
      id,
      modsOf(manifest).map((m) => m.id)
    )
    for (const nombre of sueltos) {
      entries.push({
        id: nombre,
        name: nombre,
        version: 'puesto a mano',
        enabled: true,
        dependency: false,
        paths: [`${mods.MODS_DIR}/${nombre}`],
        addedAt: '',
        sizeBytes: await mods.sizeOf(join(serverDir(id), mods.MODS_DIR, nombre)),
        problem:
          'Lo has puesto tú en la carpeta, no desde aquí. El servidor lo cargará igual, pero la ' +
          'app no puede apagarlo ni quitarlo.'
      })
    }

    return {
      loader: {
        name: mods.LOADER_NAME,
        installed: cargador,
        version: cargador ? (manifest.data.loaderVersion ?? null) : null
      },
      mods: entries
    }
  }

  return {
    // --- Configuración --------------------------------------------------------

    async getConfig(id: string): Promise<EnshroudedConfigView> {
      return view(await requireManifest(id))
    },

    /**
     * Guarda los ajustes.
     *
     * Aquí vive la regla que salva la fase: si lo que se guarda se aparta del
     * preajuste, **el preajuste pasa a «A mi manera»**, porque con cualquier
     * otro el servidor ignoraría los valores en silencio y la pantalla estaría
     * mintiendo. Se hace aquí y no solo al escribir el fichero para que lo que
     * se enseña y lo que se aplica no puedan divergir.
     */
    async setConfig(id: string, changes: EnshroudedConfigChanges): Promise<EnshroudedConfigView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'cambiar los ajustes del servidor')

      if (changes.roles) {
        const problema = roleProblems(changes.roles)
        if (problema) throw new Error(problema)
      }

      let preset = changes.preset ?? manifest.data.preset
      // Cambiar de preajuste trae sus valores: si no, la pantalla enseñaría los
      // del anterior y al pasar a «A mi manera» cambiaría la partida de golpe.
      const settings =
        changes.settings ??
        (changes.preset && changes.preset !== manifest.data.preset
          ? presetSettings(changes.preset)
          : manifest.data.settings)

      if (preset !== 'Custom' && changedFromPreset(preset, settings).length > 0) {
        preset = 'Custom'
      }

      const actualizado = (await host.updateInstance(id, {
        data: {
          ...manifest.data,
          preset,
          settings,
          ...(changes.roles ? { roles: changes.roles } : {}),
          ...(changes.tags ? { tags: changes.tags } : {}),
          ...(changes.enableTextChat !== undefined
            ? { enableTextChat: changes.enableTextChat }
            : {}),
          ...(changes.enableVoiceChat !== undefined
            ? { enableVoiceChat: changes.enableVoiceChat }
            : {}),
          ...(changes.voiceChatMode ? { voiceChatMode: changes.voiceChatMode } : {})
        }
      })) as EnshroudedManifest

      // El fichero se deja al día ya, aunque el arranque lo vuelva a escribir:
      // así quien lo abra a mano ve lo mismo que la pantalla.
      await writeConfig(actualizado)
      return view(actualizado)
    },

    // --- Mundos ---------------------------------------------------------------

    /**
     * Los mundos que hay. Cada uno es una carpeta dentro de `mundos`, y el que
     * carga el servidor es el que diga el manifiesto.
     */
    async listWorlds(id: string): Promise<EnshroudedWorld[]> {
      const manifest = await requireManifest(id)
      const dir = worldsDirFor(id)
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

      const worlds: EnshroudedWorld[] = []
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
        worlds.push({ name: manifest.data.worldName, active: true, sizeBytes: 0, savedAt: null })
      }

      return worlds.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    },

    /**
     * Crea un mundo y lo deja activo. No genera nada: el servidor lo hace en el
     * siguiente arranque, que es cuando decide el terreno.
     */
    async createWorld(id: string, name: string): Promise<EnshroudedWorld[]> {
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

      await mkdir(worldDirFor(id, clean), { recursive: true })
      const actualizado = (await host.updateInstance(id, {
        data: { ...manifest.data, worldName: clean }
      })) as EnshroudedManifest
      await writeConfig(actualizado)
      return this.listWorlds(id)
    },

    /** Cambia el mundo que cargará el servidor la próxima vez que arranque. */
    async activateWorld(id: string, name: string): Promise<EnshroudedWorld[]> {
      host.assertStopped(id, 'cambiar de mundo')
      const manifest = await requireManifest(id)
      if (manifest.data.worldName === name) return this.listWorlds(id)

      const worlds = await readdir(worldsDirFor(id)).catch((): string[] => [])
      if (!worlds.includes(name)) throw new Error(`No existe el mundo «${name}».`)

      const actualizado = (await host.updateInstance(id, {
        data: { ...manifest.data, worldName: name }
      })) as EnshroudedManifest
      await writeConfig(actualizado)
      return this.listWorlds(id)
    },

    /**
     * Borra un mundo. Nunca el activo: borrar lo que el servidor va a cargar
     * dejaría la instancia generando uno nuevo sin que nadie lo pidiera.
     */
    async deleteWorld(id: string, name: string): Promise<EnshroudedWorld[]> {
      host.assertStopped(id, 'borrar un mundo')
      const manifest = await requireManifest(id)
      if (manifest.data.worldName === name) {
        throw new Error('No se puede borrar el mundo en el que estáis jugando. Cambia antes a otro.')
      }

      // Copia de seguridad antes de algo que no tiene vuelta atrás (§12).
      await host.createBackup(id, `Copia previa a borrar el mundo ${name}`, true)
      await rm(worldDirFor(id, name), { recursive: true, force: true })
      return this.listWorlds(id)
    },

    /** Renombrar es mover la carpeta: el juego no guarda el nombre por dentro. */
    async renameWorld(id: string, name: string, newName: string): Promise<EnshroudedWorld[]> {
      host.assertStopped(id, 'renombrar un mundo')
      const manifest = await requireManifest(id)
      const clean = newName.trim()
      if (!validWorldName(clean)) {
        throw new Error(
          'El nombre del mundo solo puede llevar letras, números, espacios, puntos y guiones.'
        )
      }

      await rename(worldDirFor(id, name), worldDirFor(id, clean)).catch(
        (err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT') throw new Error(`No existe el mundo «${name}».`)
          throw err
        }
      )
      if (manifest.data.worldName === name) {
        const actualizado = (await host.updateInstance(id, {
          data: { ...manifest.data, worldName: clean }
        })) as EnshroudedManifest
        await writeConfig(actualizado)
      }
      return this.listWorlds(id)
    },

    // --- Vetados --------------------------------------------------------------

    /**
     * Quién está vetado.
     *
     * Es lo único que se puede moderar desde fuera del juego, y se lee del
     * fichero de configuración, que es donde el servidor los guarda. Leerlo se
     * puede siempre, esté el servidor como esté.
     */
    async listBans(id: string): Promise<EnshroudedBan[]> {
      await requireManifest(id)
      return bansOf(await readConfig(id))
    },

    /**
     * Quita un veto.
     *
     * Con el servidor parado, porque él reescribe el fichero al cerrarse: un
     * veto quitado en caliente volvería solo.
     */
    async removeBan(id: string, accountId: number): Promise<EnshroudedBan[]> {
      await requireManifest(id)
      host.assertStopped(id, 'quitar un veto')

      const config = (await readConfig(id)) ?? {}
      const quedan = bansOf(config).filter((ban) => ban.accountId !== accountId)
      await writeFile(
        configPath(id),
        `${JSON.stringify({ ...config, bannedAccounts: quedan.map(banToRaw) }, null, '\t')}\n`,
        'utf8'
      )
      host.journal(id, { kind: 'moderation', action: 'unban', player: String(accountId) })
      return quedan
    },

    // --- Mods -----------------------------------------------------------------

    async listMods(id: string): Promise<ModsView> {
      const manifest = await requireManifest(id)
      return buildModsView(id, manifest)
    },

    /** ¿Hay versión nueva del cargador? No se actualiza nada solo. */
    async loaderUpdate(id: string): Promise<string | null> {
      const manifest = await requireManifest(id)
      if (!manifest.data.loaderVersion) return null
      const ultima = await mods.latestLoader().catch(() => null)
      if (!ultima) return null
      return mods.compareVersions(ultima.version, manifest.data.loaderVersion) > 0
        ? ultima.version
        : null
    },

    /**
     * Pone (o actualiza) Shroudtopia.
     *
     * Con el servidor parado: se engancha al arrancar el proceso, con un
     * `winmm.dll` al lado del ejecutable.
     */
    async installLoader(id: string, onProgress?: (detail: string) => void): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'instalar el cargador de mods')

      const release = await mods.latestLoader()
      await mods.installLoader(id, release, onProgress)

      const actualizado = (await host.updateInstance(id, {
        data: { ...manifest.data, loaderVersion: release.version }
      })) as EnshroudedManifest
      return buildModsView(id, actualizado)
    },

    /**
     * Quita el cargador. Solo cuando no queda ningún mod: sin él, los que
     * hubiera se quedarían en el disco sin cargarse y sin decir por qué.
     */
    async removeLoader(id: string): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'quitar el cargador de mods')
      if (modsOf(manifest).length > 0) {
        throw new Error('Quita antes los mods: sin Shroudtopia no se cargaría ninguno.')
      }
      await mods.removeLoader(id)
      await dropStash(id, mods.LOADER_ID)
      const actualizado = (await host.updateInstance(id, {
        data: { ...manifest.data, loaderVersion: undefined }
      })) as EnshroudedManifest
      return buildModsView(id, actualizado)
    },

    /**
     * Instala un mod a partir de un fichero que el usuario ha traído.
     *
     * No hay buscador porque Nexus Mods no deja descargar sin cuenta de pago,
     * así que la app hace lo que sí puede: reconocer el paquete, dejarlo donde
     * el cargador lo busca y poder apagarlo o quitarlo después.
     */
    async addModFile(
      id: string,
      filePath: string,
      onProgress?: (detail: string) => void
    ): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'instalar un mod')

      // Sin cargador, un `.dll` en `mods/` no hace absolutamente nada.
      if (!(await mods.loaderInstalled(id))) {
        onProgress?.('Instalando Shroudtopia, el cargador de mods')
        const release = await mods.latestLoader()
        await mods.installLoader(id, release, onProgress)
        await host.updateInstance(id, {
          data: { ...manifest.data, loaderVersion: release.version }
        })
      }

      onProgress?.('Comprobando el paquete')
      const staged = await mods.stageModFile(id, filePath)

      const actual = (await host.readManifest(id)) as EnshroudedManifest
      if (modsOf(actual).some((mod) => mod.id === staged.id)) {
        throw new Error(`Ya hay un mod instalado que se llama «${staged.id}».`)
      }

      const paths = await mods.placeStagedMod(id, staged)
      const ref: ModRef = {
        id: staged.id,
        name: staged.name,
        version: staged.version,
        enabled: true,
        dependency: false,
        paths,
        addedAt: new Date().toISOString()
      }

      const actualizado = (await host.updateInstance(id, {
        data: { ...actual.data, mods: [...modsOf(actual), ref] }
      })) as EnshroudedManifest
      return buildModsView(id, actualizado)
    },

    /** Quita un mod del servidor y del disco. */
    async removeMod(id: string, modId: string): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'quitar un mod')
      const ref = modsOf(manifest).find((mod) => mod.id === modId)
      if (!ref) throw new Error('Ese mod no está en este servidor.')

      for (const path of ref.paths) {
        await rm(join(serverDir(id), ...path.split('/')), { recursive: true, force: true })
      }
      await dropStash(id, ref.id)

      const actualizado = (await host.updateInstance(id, {
        data: { ...manifest.data, mods: modsOf(manifest).filter((mod) => mod.id !== modId) }
      })) as EnshroudedManifest
      return buildModsView(id, actualizado)
    },

    /**
     * Enciende o apaga un mod sin borrarlo.
     *
     * Apagarlo lo saca de `mods/`. Poner `"active": false` en
     * `shroudtopia.json` **no vale**: medido contra el servidor real, el
     * cargador sigue cargando el `.dll` y solo se salta activarlo, así que el
     * mod ya ha corrido su `Load()`.
     */
    async setModEnabled(id: string, modId: string, enabled: boolean): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'encender o apagar un mod')
      const ref = modsOf(manifest).find((mod) => mod.id === modId)
      if (!ref) throw new Error('Ese mod no está en este servidor.')

      if (enabled) await unstashPaths(id, ref.id, ref.paths)
      else await stashPaths(id, ref.id, ref.paths)

      const actualizado = (await host.updateInstance(id, {
        data: {
          ...manifest.data,
          mods: modsOf(manifest).map((mod) => (mod.id === modId ? { ...mod, enabled } : mod))
        }
      })) as EnshroudedManifest
      return buildModsView(id, actualizado)
    }
  }
}

/** Para el smoke: leer el fichero tal cual sin pasar por el servicio. */
export async function rawConfig(id: string): Promise<string> {
  return readFile(configPath(id), 'utf8')
}
