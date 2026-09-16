import type { SatisfactoryManifest } from '@shared/types'
import type {
  SatisfactorySessions,
  SatisfactoryState
} from '@shared/games/satisfactory/types'
import type { GameHost } from '../minecraft/service'
import * as api from './api'
import { waitForGame, withToken } from './adapter'

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

    // --- Contraseñas ---------------------------------------------------------

    /** Cambia la contraseña que piden los jugadores al entrar. */
    async setClientPassword(id: string, password: string): Promise<void> {
      const manifest = await requireRunning(id, 'cambiar la contraseña de los jugadores')
      await withToken(manifest, (target) => api.setClientPassword(target, password))
      await host.updateInstance(id, { data: { clientPassword: password } })
    }
  }
}

export type SatisfactoryService = ReturnType<typeof createSatisfactoryService>
