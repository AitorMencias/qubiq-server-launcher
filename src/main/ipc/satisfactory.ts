import { ipcMain } from 'electron'
import { SATISFACTORY_IPC } from '@shared/ipc'
import { service } from '../core/service'

/**
 * Puente IPC de las operaciones exclusivas de Satisfactory.
 *
 * Todas pasan por la API del servidor, así que todas exigen que esté arrancado.
 * El error que sale cuando no lo está lo redacta el servicio, para que diga lo
 * mismo se llame desde donde se llame.
 */
export function registerSatisfactoryIpc(): void {
  const sf = service.satisfactory

  ipcMain.handle(SATISFACTORY_IPC.state, async (_e, id: string) => sf.state(id))

  // --- Partidas ---------------------------------------------------------------

  ipcMain.handle(SATISFACTORY_IPC.listSessions, async (_e, id: string) => sf.listSessions(id))
  ipcMain.handle(SATISFACTORY_IPC.createGame, async (_e, id: string, sessionName: string) =>
    sf.createGame(id, sessionName)
  )
  ipcMain.handle(
    SATISFACTORY_IPC.loadSave,
    async (_e, id: string, saveName: string, sessionName: string) =>
      sf.loadSave(id, saveName, sessionName)
  )
  ipcMain.handle(SATISFACTORY_IPC.saveNow, async (_e, id: string, saveName: string) =>
    sf.saveNow(id, saveName)
  )
  ipcMain.handle(SATISFACTORY_IPC.deleteSave, async (_e, id: string, saveName: string) =>
    sf.deleteSave(id, saveName)
  )
  ipcMain.handle(SATISFACTORY_IPC.deleteSession, async (_e, id: string, sessionName: string) =>
    sf.deleteSession(id, sessionName)
  )

  // --- Ajustes ----------------------------------------------------------------

  ipcMain.handle(SATISFACTORY_IPC.getOptions, async (_e, id: string) => sf.getOptions(id))
  ipcMain.handle(
    SATISFACTORY_IPC.setOptions,
    async (_e, id: string, options: Record<string, string>) => sf.setOptions(id, options)
  )
  ipcMain.handle(SATISFACTORY_IPC.getGameRules, async (_e, id: string) => sf.getGameRules(id))
  ipcMain.handle(
    SATISFACTORY_IPC.setGameRules,
    async (_e, id: string, settings: Record<string, string>) => sf.setGameRules(id, settings)
  )

  // --- Contraseñas ------------------------------------------------------------

  ipcMain.handle(SATISFACTORY_IPC.setClientPassword, async (_e, id: string, password: string) =>
    sf.setClientPassword(id, password)
  )
}
