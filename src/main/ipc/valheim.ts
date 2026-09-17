import { ipcMain } from 'electron'
import { VALHEIM_IPC } from '@shared/ipc'
import type { ValheimListKind } from '@shared/games/valheim/types'
import { service } from '../core/service'

/**
 * Puente IPC de las operaciones exclusivas de Valheim.
 *
 * Al revés que las de Satisfactory, casi todas exigen el servidor **parado**:
 * son ficheros en disco y la línea de órdenes del arranque, no llamadas a una
 * API. Quien pone el error cuando está arrancado es el servicio, para que diga
 * lo mismo se llame desde donde se llame.
 */
export function registerValheimIpc(): void {
  const vh = service.valheim

  // --- Mundos -----------------------------------------------------------------

  ipcMain.handle(VALHEIM_IPC.listWorlds, async (_e, id: string) => vh.listWorlds(id))
  ipcMain.handle(VALHEIM_IPC.createWorld, async (_e, id: string, name: string) =>
    vh.createWorld(id, name)
  )
  ipcMain.handle(VALHEIM_IPC.activateWorld, async (_e, id: string, name: string) =>
    vh.activateWorld(id, name)
  )
  ipcMain.handle(VALHEIM_IPC.renameWorld, async (_e, id: string, name: string, newName: string) =>
    vh.renameWorld(id, name, newName)
  )
  ipcMain.handle(VALHEIM_IPC.deleteWorld, async (_e, id: string, name: string) =>
    vh.deleteWorld(id, name)
  )

  // --- Moderación ---------------------------------------------------------------

  ipcMain.handle(VALHEIM_IPC.getList, async (_e, id: string, kind: ValheimListKind) =>
    vh.getList(id, kind)
  )
  ipcMain.handle(
    VALHEIM_IPC.addToList,
    async (_e, id: string, kind: ValheimListKind, playerId: string, note?: string) =>
      vh.addToList(id, kind, playerId, note)
  )
  ipcMain.handle(
    VALHEIM_IPC.removeFromList,
    async (_e, id: string, kind: ValheimListKind, playerId: string) =>
      vh.removeFromList(id, kind, playerId)
  )
}
