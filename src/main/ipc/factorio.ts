import { ipcMain } from 'electron'
import { FACTORIO_IPC } from '@shared/ipc'
import type { FactorioListKind } from '@shared/games/factorio/types'
import { service } from '../core/service'
import { steamLogin, type SteamAccount } from '../core/tools/steamcmd'
import { findLocalFactorio, inspectFactorioFolder } from '../core/games/factorio/steamLibrary'
import {
  credentialsFromGame,
  installMod,
  listMods,
  loginToPortal,
  removeMod,
  searchMods,
  setModEnabled,
  type PortalCredentials
} from '../core/games/factorio/mods'

/**
 * Puente IPC de las operaciones exclusivas de Factorio.
 *
 * Lo que lo distingue de los demás juegos es la cuenta de Steam: es el único
 * que la necesita, porque su «servidor» es el juego. La contraseña llega aquí,
 * se le pasa a SteamCMD y **no se guarda en ninguna parte**; a partir de ahí
 * valen las credenciales que Steam deja en su propia caché.
 */
export function registerFactorioIpc(): void {
  const fa = service.factorio

  // --- Cuenta de Steam e instalaciones que ya existen ---------------------------

  ipcMain.handle(FACTORIO_IPC.steamLogin, async (_e, account: SteamAccount) => {
    await steamLogin(account)
  })
  ipcMain.handle(FACTORIO_IPC.findLocal, async () => findLocalFactorio())
  ipcMain.handle(FACTORIO_IPC.inspectFolder, async (_e, path: string) =>
    inspectFactorioFolder(path)
  )

  // --- Partidas -----------------------------------------------------------------

  ipcMain.handle(FACTORIO_IPC.listSaves, async (_e, id: string) => fa.listSaves(id))
  ipcMain.handle(FACTORIO_IPC.restoreAutosave, async (_e, id: string, name: string) =>
    fa.restoreAutosave(id, name)
  )
  ipcMain.handle(FACTORIO_IPC.deleteSave, async (_e, id: string, name: string) =>
    fa.deleteSave(id, name)
  )
  ipcMain.handle(FACTORIO_IPC.saveNow, async (_e, id: string) => fa.saveNow(id))

  // --- Moderación ---------------------------------------------------------------

  ipcMain.handle(FACTORIO_IPC.getList, async (_e, id: string, kind: FactorioListKind) =>
    fa.getList(id, kind)
  )
  ipcMain.handle(
    FACTORIO_IPC.addToList,
    async (_e, id: string, kind: FactorioListKind, player: string) =>
      fa.addToList(id, kind, player)
  )
  ipcMain.handle(
    FACTORIO_IPC.removeFromList,
    async (_e, id: string, kind: FactorioListKind, player: string) =>
      fa.removeFromList(id, kind, player)
  )
  ipcMain.handle(FACTORIO_IPC.kick, async (_e, id: string, player: string, reason?: string) =>
    fa.kick(id, player, reason)
  )
  ipcMain.handle(FACTORIO_IPC.onlinePlayers, async (_e, id: string) => fa.onlinePlayers(id))

  // --- Mods del portal ----------------------------------------------------------

  ipcMain.handle(FACTORIO_IPC.searchMods, async (_e, query: string) => searchMods(query))
  ipcMain.handle(FACTORIO_IPC.listMods, async (_e, id: string) => listMods(id))
  ipcMain.handle(
    FACTORIO_IPC.installMod,
    async (_e, id: string, name: string, credentials: PortalCredentials, gameVersion?: string) =>
      installMod(id, name, credentials, gameVersion)
  )
  ipcMain.handle(
    FACTORIO_IPC.setModEnabled,
    async (_e, id: string, name: string, enabled: boolean) => setModEnabled(id, name, enabled)
  )
  ipcMain.handle(FACTORIO_IPC.removeMod, async (_e, id: string, name: string) =>
    removeMod(id, name)
  )
  /**
   * Las credenciales de la sesión del juego solo se leen cuando el usuario lo
   * pide desde la interfaz: son un secreto suyo, aunque estén en su disco.
   */
  ipcMain.handle(FACTORIO_IPC.credentialsFromGame, async () => credentialsFromGame())
  ipcMain.handle(FACTORIO_IPC.portalLogin, async (_e, username: string, password: string) =>
    loginToPortal(username, password)
  )
}
