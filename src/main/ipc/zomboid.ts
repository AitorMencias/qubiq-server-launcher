import { ipcMain } from 'electron'
import { ZOMBOID_IPC } from '@shared/ipc'
import type { ConfigChange } from '@shared/editableConfig'
import type { ZomboidRole } from '@shared/games/zomboid/types'
import { service } from '../core/service'

/**
 * Puente IPC de las operaciones exclusivas de Project Zomboid.
 *
 * Cada una tiene su propia exigencia sobre el estado del servidor —los ajustes
 * valen con él arrancado, las reglas de la partida no, y moderar solo con él
 * arrancado—, y quien la impone es el servicio, para que el error sea el mismo
 * venga de donde venga.
 */
export function registerZomboidIpc(): void {
  const pz = service.zomboid

  // --- Ajustes del servidor ---------------------------------------------------

  ipcMain.handle(ZOMBOID_IPC.getSettings, async (_e, id: string) => pz.getSettings(id))
  ipcMain.handle(ZOMBOID_IPC.setSettings, async (_e, id: string, changes: ConfigChange[]) =>
    pz.setSettings(id, changes)
  )

  // --- Reglas de la partida ----------------------------------------------------

  ipcMain.handle(ZOMBOID_IPC.getSandbox, async (_e, id: string) => pz.getSandbox(id))
  ipcMain.handle(ZOMBOID_IPC.setSandbox, async (_e, id: string, changes: ConfigChange[]) =>
    pz.setSandbox(id, changes)
  )
  ipcMain.handle(ZOMBOID_IPC.applyPreset, async (_e, id: string) => pz.applyPreset(id))

  // --- Cuentas y moderación -----------------------------------------------------

  ipcMain.handle(ZOMBOID_IPC.listAccounts, async (_e, id: string) => pz.listAccounts(id))
  ipcMain.handle(
    ZOMBOID_IPC.setRole,
    async (_e, id: string, username: string, role: ZomboidRole, reason?: string) =>
      pz.setRole(id, username, role, reason)
  )
  ipcMain.handle(
    ZOMBOID_IPC.addAccount,
    async (_e, id: string, username: string, password: string) =>
      pz.addAccount(id, username, password)
  )
  ipcMain.handle(
    ZOMBOID_IPC.setPassword,
    async (_e, id: string, username: string, password: string) =>
      pz.setPassword(id, username, password)
  )
  ipcMain.handle(ZOMBOID_IPC.kick, async (_e, id: string, username: string, reason?: string) =>
    pz.kick(id, username, reason)
  )
  ipcMain.handle(ZOMBOID_IPC.listBannedIps, async (_e, id: string) => pz.listBannedIps(id))
  ipcMain.handle(ZOMBOID_IPC.unbanIp, async (_e, id: string, ip: string) => pz.unbanIp(id, ip))

  // --- Lo que se le pide al servidor en marcha ----------------------------------

  ipcMain.handle(ZOMBOID_IPC.broadcast, async (_e, id: string, message: string) =>
    pz.broadcast(id, message)
  )
  ipcMain.handle(ZOMBOID_IPC.saveNow, async (_e, id: string) => pz.saveNow(id))

  // --- Mods del taller ----------------------------------------------------------

  ipcMain.handle(ZOMBOID_IPC.listMods, async (_e, id: string) => pz.listMods(id))
  ipcMain.handle(ZOMBOID_IPC.addMod, async (_e, id: string, text: string) =>
    pz.addMod(id, text, (detail) => service.emitProgress(id, 'mods', detail))
  )
  ipcMain.handle(ZOMBOID_IPC.removeMod, async (_e, id: string, workshopId: string) =>
    pz.removeMod(id, workshopId)
  )
  ipcMain.handle(
    ZOMBOID_IPC.setModEnabled,
    async (_e, id: string, workshopId: string, enabled: boolean) =>
      pz.setModEnabled(id, workshopId, enabled)
  )
  ipcMain.handle(ZOMBOID_IPC.moveMod, async (_e, id: string, workshopId: string, delta: number) =>
    pz.moveMod(id, workshopId, delta)
  )
  ipcMain.handle(ZOMBOID_IPC.modUpdates, async (_e, id: string) => pz.modUpdates(id))
  ipcMain.handle(ZOMBOID_IPC.updateMod, async (_e, id: string, workshopId: string) =>
    pz.updateMod(id, workshopId, (detail) => service.emitProgress(id, 'mods', detail))
  )
}
