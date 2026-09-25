import type { SatisfactoryManifest } from '@shared/types'
import type {
  SatisfactorySessions,
  SatisfactoryState
} from '@shared/games/satisfactory/types'
import type {
  ModCatalogItem,
  ModEntry,
  ModInstallResult,
  ModRef,
  ModsView
} from '@shared/games/mods'
import type { GameHost } from '../minecraft/service'
import { dropStash, pathsSize, removePaths, stashPaths, unstashPaths } from '../modFiles'
import * as api from './api'
import { waitForGame, withToken } from './adapter'
import * as mods from './mods'

/**
 * Operaciones exclusivas de Satisfactory: partidas y ajustes del servidor.
 *
 * Todas hablan con la API del servidor, así que **solo funcionan con el
 * servidor arrancado**. Es lo contrario que en Minecraft, donde la
 * configuración se edita parado: aquí no hay fichero que tocar, y tocar los
 * `.sav` a mano es la mejor forma de romper una partida.
 */

export function createSatisfactoryService(host: GameHost) {
  async function requireManifest(id: string): Promise<SatisfactoryManifest> {
    const manifest = await host.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (manifest.game !== 'satisfactory') {
      throw new Error('Esta operación solo existe para servidores de Satisfactory.')
    }
    return manifest
  }

  /** El mismo error para todas: sin servidor en marcha no hay API que consultar. */
  async function requireRunning(id: string, action: string): Promise<SatisfactoryManifest> {
    const manifest = await requireManifest(id)
    if (!(await api.healthCheck(manifest.port))) {
      throw new Error(`Hay que arrancar el servidor para ${action}.`)
    }
    return manifest
  }

  return {
    /** Estado en vivo: partida cargada, jugadores dentro y ritmo del servidor. */
    async state(id: string): Promise<SatisfactoryState | null> {
      const manifest = await requireManifest(id)
      if (!(await api.healthCheck(manifest.port))) return null
      return withToken(manifest, (target) => api.queryState(target))
    },

    // --- Partidas -----------------------------------------------------------

    async listSessions(id: string): Promise<SatisfactorySessions> {
      const manifest = await requireRunning(id, 'ver las partidas')
      return withToken(manifest, (target) => api.enumerateSessions(target))
    },

    /**
     * Crea una partida nueva y la deja cargada. La anterior no se borra: queda
     * en la lista y se puede volver a ella cuando se quiera.
     */
    async createGame(id: string, sessionName: string): Promise<SatisfactorySessions> {
      const name = sessionName.trim()
      if (name.length === 0) throw new Error('La partida necesita un nombre.')

      const manifest = await requireRunning(id, 'crear una partida')
      await host.createBackup(id, `Copia previa a crear la partida ${name}`, true).catch(() => undefined)

      await withToken(manifest, (target) => api.createNewGame(target, { sessionName: name }))
      // El servidor contesta antes de tener el mapa hecho: si se preguntara ya
      // por las partidas, la nueva no saldría y parecería que no se ha creado.
      await withToken(manifest, (target) => waitForGame(target, name))
      await host.updateInstance(id, { data: { sessionName: name } })
      return withToken(manifest, (target) => api.enumerateSessions(target))
    },

    /** Carga un guardado. Lo que haya sin guardar de la partida actual se pierde. */
    async loadSave(id: string, saveName: string, sessionName: string): Promise<SatisfactorySessions> {
      const manifest = await requireRunning(id, 'cargar una partida')
      await host.createBackup(id, `Copia previa a cargar ${saveName}`, true).catch(() => undefined)

      await withToken(manifest, (target) => api.loadGame(target, saveName))
      await withToken(manifest, (target) => waitForGame(target, sessionName))
      await host.updateInstance(id, { data: { sessionName } })
      return withToken(manifest, (target) => api.enumerateSessions(target))
    },

    /** Guarda ahora mismo, con el nombre que se le dé. */
    async saveNow(id: string, saveName: string): Promise<SatisfactorySessions> {
      const manifest = await requireRunning(id, 'guardar la partida')
      await withToken(manifest, (target) => api.saveGame(target, saveName.trim()))
      return withToken(manifest, (target) => api.enumerateSessions(target))
    },

    /** Borra un guardado suelto. Irreversible, como el borrado de un mundo. */
    async deleteSave(id: string, saveName: string): Promise<SatisfactorySessions> {
      const manifest = await requireRunning(id, 'borrar un guardado')
      await withToken(manifest, (target) => api.deleteSaveFile(target, saveName))
      return withToken(manifest, (target) => api.enumerateSessions(target))
    },

    /** Borra una partida entera, con todos sus guardados. */
    async deleteSession(id: string, sessionName: string): Promise<SatisfactorySessions> {
      const manifest = await requireRunning(id, 'borrar una partida')
      if (sessionName === manifest.data.sessionName) {
        throw new Error(
          'Esa es la partida que está cargada. Carga otra antes de borrarla, para no quedarte sin ninguna.'
        )
      }
      await host.createBackup(id, `Copia previa a borrar la partida ${sessionName}`, true).catch(
        () => undefined
      )
      await withToken(manifest, (target) => api.deleteSaveSession(target, sessionName))
      return withToken(manifest, (target) => api.enumerateSessions(target))
    },

    // --- Ajustes ------------------------------------------------------------

    async getOptions(id: string): Promise<api.ServerOptions> {
      const manifest = await requireRunning(id, 'ver los ajustes')
      return withToken(manifest, (target) => api.getServerOptions(target))
    },

    async setOptions(id: string, options: Record<string, string>): Promise<api.ServerOptions> {
      const manifest = await requireRunning(id, 'cambiar los ajustes')
      await withToken(manifest, (target) => api.applyServerOptions(target, options))
      return withToken(manifest, (target) => api.getServerOptions(target))
    },

    async getGameRules(id: string): Promise<api.AdvancedSettings> {
      const manifest = await requireRunning(id, 'ver las reglas de la partida')
      return withToken(manifest, (target) => api.getAdvancedGameSettings(target))
    },

    /**
     * ⚠ Cambiar una regla marca la partida y le quita los logros para siempre.
     * El aviso lo da la pantalla; aquí se hace una copia antes, que es lo único
     * que puede devolver la partida a como estaba.
     */
    async setGameRules(id: string, settings: Record<string, string>): Promise<api.AdvancedSettings> {
      const manifest = await requireRunning(id, 'cambiar las reglas de la partida')
      await host.createBackup(id, 'Copia previa a cambiar las reglas de la partida', true).catch(
        () => undefined
      )
      await withToken(manifest, (target) => api.applyAdvancedGameSettings(target, settings))
      return withToken(manifest, (target) => api.getAdvancedGameSettings(target))
    },

    // --- Mods de ficsit.app ---------------------------------------------------

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
     * Añade un mod con todo lo que necesita.
     *
     * Con el servidor parado, porque el juego lee la carpeta `Mods` al arrancar
     * y no la vuelve a mirar: instalarlo en caliente daría la falsa impresión
     * de que ya está puesto.
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
        build: mods.buildNumber(manifest.data.gameVersion),
        installed: new Map(modsOf(manifest).map((mod) => [mod.id, mod.version])),
        loaderVersion: manifest.data.loaderVersion ?? null
      })

      // Sin cargador no hay mods. Normalmente lo arrastra el propio mod, que lo
      // declara como dependencia; si alguno se olvidara, se pone igualmente.
      let loaderVersion = manifest.data.loaderVersion
      const cargador = plan.loader ?? (await loaderIfMissing(id, manifest))
      if (cargador) {
        onProgress?.('Instalando SML, el cargador de mods')
        await mods.installPackage(id, mods.LOADER_ID, cargador, onProgress)
        loaderVersion = cargador.version
      }

      const nuevos: ModRef[] = []
      for (const entry of plan.entries) {
        const paths = await mods.installPackage(id, entry.id, entry.version, onProgress)
        nuevos.push({
          id: entry.id,
          name: entry.name,
          version: entry.version.version,
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
        view: await buildView(id, actualizado as SatisfactoryManifest),
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
      return buildView(id, actualizado as SatisfactoryManifest)
    },

    /**
     * Enciende o apaga un mod sin borrarlo.
     *
     * Apagado sale de `FactoryGame/Mods` y espera en la carpeta de la
     * instancia: el servidor carga todo lo que haya ahí dentro, así que dejarlo
     * con otro nombre no serviría de nada.
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
      return buildView(id, actualizado as SatisfactoryManifest)
    },

    /**
     * ¿Hay versión nueva de algún mod o del cargador?
     *
     * No se actualiza nada solo: un mod nuevo a mitad de partida puede dejarla
     * sin poder cargarse, así que actualizar es siempre decisión del usuario.
     */
    async modUpdates(id: string): Promise<Record<string, string>> {
      const manifest = await requireManifest(id)
      const ids = modsOf(manifest).map((mod) => mod.id)
      if (ids.length === 0 && manifest.data.loaderVersion === undefined) return {}

      const build = mods.buildNumber(manifest.data.gameVersion)
      const consulta = [...ids, mods.LOADER_ID].map((modId) => ({ id: modId, range: '>=0.0.0' }))
      const resueltas = await mods.resolveVersions(consulta)

      const nuevas: Record<string, string> = {}
      for (const ref of modsOf(manifest)) {
        const mejor = mods.pickBest(resueltas.get(ref.id) ?? [], build)
        if (mejor && mods.compareVersions(mejor.version, ref.version) > 0) {
          nuevas[ref.id] = mejor.version
        }
      }
      const cargador = mods.pickBest(resueltas.get(mods.LOADER_ID) ?? [], build)
      const instalado = manifest.data.loaderVersion
      if (cargador && instalado && mods.compareVersions(cargador.version, instalado) > 0) {
        nuevas[mods.LOADER_ID] = cargador.version
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
      const build = mods.buildNumber(manifest.data.gameVersion)

      // Actualizar un mod puede dejar sin cargar una partida que ya lo usaba,
      // así que primero la copia.
      await host.createBackup(id, `Antes de actualizar ${modId}`, true).catch(() => undefined)

      const versiones = await mods.resolveVersions([{ id: modId, range: '>=0.0.0' }])
      const mejor = mods.pickBest(versiones.get(modId) ?? [], build)

      if (modId === mods.LOADER_ID) {
        if (!mejor) throw new Error('No hay ninguna versión de SML que se pueda instalar.')
        await mods.installPackage(id, mods.LOADER_ID, mejor, onProgress)
        const actualizado = await host.updateInstance(id, {
          data: { ...manifest.data, loaderVersion: mejor.version }
        })
        return buildView(id, actualizado as SatisfactoryManifest)
      }

      const ref = modsOf(manifest).find((mod) => mod.id === modId)
      if (!ref) throw new Error('Ese mod no está en este servidor.')
      if (!mejor) throw new Error(`«${ref.name}» ya no publica versión para servidor.`)

      // Un mod apagado se actualiza igual, pero su sitio está apartado: se
      // devuelve, se cambia y se vuelve a apartar.
      if (!ref.enabled) await unstashPaths(id, ref.id, ref.paths)
      const paths = await mods.installPackage(id, modId, mejor, onProgress)
      if (ref.enabled) await dropStash(id, ref.id)
      else await stashPaths(id, ref.id, paths)

      const actualizado = await host.updateInstance(id, {
        data: {
          ...manifest.data,
          mods: modsOf(manifest).map((mod) =>
            mod.id === modId ? { ...mod, version: mejor.version, paths } : mod
          )
        }
      })
      return buildView(id, actualizado as SatisfactoryManifest)
    },

    /**
     * Quita el cargador. Solo cuando no queda ningún mod: sin SML, los mods que
     * hubiera se quedarían en el disco sin cargarse y sin decir por qué.
     */
    async removeLoader(id: string): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'quitar el cargador de mods')
      if (modsOf(manifest).length > 0) {
        throw new Error('Quita antes los mods: sin SML no se cargaría ninguno.')
      }
      await removePaths(id, mods.LOADER_ID, [`${mods.MODS_DIR}/${mods.LOADER_ID}`])
      const actualizado = await host.updateInstance(id, {
        data: { ...manifest.data, loaderVersion: undefined }
      })
      return buildView(id, actualizado as SatisfactoryManifest)
    },

    // --- Contraseñas ---------------------------------------------------------

    /** Cambia la contraseña que piden los jugadores al entrar. */
    async setClientPassword(id: string, password: string): Promise<void> {
      const manifest = await requireRunning(id, 'cambiar la contraseña de los jugadores')
      await withToken(manifest, (target) => api.setClientPassword(target, password))
      await host.updateInstance(id, { data: { clientPassword: password } })
    }
  }
}

/**
 * La versión de SML que hay que poner, o null si ya está.
 *
 * Se mira el disco y no el manifiesto: si alguien borró su carpeta a mano, el
 * manifiesto seguiría diciendo que está y el mod se instalaría para nada.
 */
async function loaderIfMissing(
  id: string,
  manifest: SatisfactoryManifest
): Promise<mods.FicsitVersion | null> {
  if ((await mods.installedOnDisk(id)).has(mods.LOADER_ID)) return null
  const versiones = await mods.resolveVersions([{ id: mods.LOADER_ID, range: '>=0.0.0' }])
  return mods.pickBest(
    versiones.get(mods.LOADER_ID) ?? [],
    mods.buildNumber(manifest.data.gameVersion)
  )
}

/**
 * Los mods del manifiesto.
 *
 * Un servidor creado antes de que la app supiera de mods no tiene la lista, y
 * leerla a pelo dejaría su pestaña rota en vez de vacía.
 */
function modsOf(manifest: SatisfactoryManifest): ModRef[] {
  return manifest.data.mods ?? []
}

/**
 * La pestaña de mods de una vez: el cargador y cada mod con lo que solo se sabe
 * mirando el disco.
 *
 * Lo que manda es el disco, no el manifiesto: si alguien borró una carpeta a
 * mano, aquí se dice en vez de enseñar un mod que ya no existe.
 */
async function buildView(id: string, manifest: SatisfactoryManifest): Promise<ModsView> {
  const enDisco = await mods.installedOnDisk(id)
  const loaderInfo = enDisco.get(mods.LOADER_ID)
  const lista = modsOf(manifest)

  const entries: ModEntry[] = []
  for (const ref of lista) {
    const info = enDisco.get(ref.id)
    const problem = ref.enabled && !info ? 'No está en la carpeta del servidor.' : undefined
    entries.push({
      ...ref,
      // Lo que diga el `.uplugin` gana: es lo que el servidor va a cargar.
      version: info?.version ?? ref.version,
      sizeBytes: await pathsSize(id, ref.id, ref.paths, ref.enabled),
      ...(problem ? { problem } : {})
    })
  }

  return {
    loader: {
      name: mods.LOADER_NAME,
      installed: loaderInfo !== undefined,
      version: loaderInfo?.version ?? manifest.data.loaderVersion ?? null
    },
    mods: entries
  }
}

export type SatisfactoryService = ReturnType<typeof createSatisfactoryService>
