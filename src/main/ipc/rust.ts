import { ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { RUST_IPC } from '@shared/ipc'
import type { RustAdmin, RustWipePlan } from '@shared/games/rust/types'
import { service } from '../core/service'
import type { RustConfigChanges, RustWipeOptions } from '../core/games/rust/service'
import { rustPaths } from '../core/games/rust/adapter'

/**
 * Puente IPC de las operaciones exclusivas de Rust.
 *
 * Al revés que en Valheim o Enshrouded, casi todo vale con el servidor en
 * marcha: moderar va por la consola remota y Oxide carga plugins en caliente.
 * Lo que exige pararlo lo dice el servicio, para que el error sea el mismo se
 * llame desde donde se llame.
 */
export function registerRustIpc(): void {
  const rust = service.rust
  const progress =
    (id: string, phase: string) =>
    (detail: string): void =>
      service.emitProgress(id, phase, detail)

  // --- Ajustes ------------------------------------------------------------------

  ipcMain.handle(RUST_IPC.getConfig, async (_e, id: string) => rust.getConfig(id))
  ipcMain.handle(RUST_IPC.setConfig, async (_e, id: string, changes: RustConfigChanges) =>
    rust.setConfig(id, changes)
  )

  // --- El mapa y el borrado -----------------------------------------------------

  ipcMain.handle(RUST_IPC.getMap, async (_e, id: string) => rust.getMap(id))
  ipcMain.handle(RUST_IPC.wipePreview, async (_e, id: string, blueprints: boolean) =>
    rust.wipePreview(id, blueprints)
  )
  ipcMain.handle(RUST_IPC.setWipePlan, async (_e, id: string, plan: Partial<RustWipePlan>) =>
    rust.setWipePlan(id, plan)
  )
  ipcMain.handle(RUST_IPC.dismissWipeNotice, async (_e, id: string) => rust.dismissWipeNotice(id))
  ipcMain.handle(RUST_IPC.wipe, async (_e, id: string, options: RustWipeOptions) =>
    rust.wipe(id, options)
  )

  // --- Jugadores y moderación ---------------------------------------------------

  ipcMain.handle(RUST_IPC.listPlayers, async (_e, id: string) => rust.listPlayers(id))
  ipcMain.handle(RUST_IPC.listAdmins, async (_e, id: string) => rust.listAdmins(id))
  ipcMain.handle(
    RUST_IPC.setAdmin,
    async (_e, id: string, steamId: string, name: string, level: RustAdmin['level']) =>
      rust.setAdmin(id, steamId, name, level)
  )
  ipcMain.handle(RUST_IPC.removeAdmin, async (_e, id: string, steamId: string) =>
    rust.removeAdmin(id, steamId)
  )
  ipcMain.handle(RUST_IPC.makeAdmin, async (_e, id: string, player: string) =>
    rust.makeAdmin(id, player)
  )
  ipcMain.handle(RUST_IPC.listBans, async (_e, id: string) => rust.listBans(id))
  ipcMain.handle(RUST_IPC.ban, async (_e, id: string, player: string, reason: string) =>
    rust.ban(id, player, reason)
  )
  ipcMain.handle(RUST_IPC.unban, async (_e, id: string, steamId: string) => rust.unban(id, steamId))
  ipcMain.handle(RUST_IPC.kick, async (_e, id: string, player: string, reason?: string) =>
    rust.kick(id, player, reason)
  )

  // --- Oxide y plugins ----------------------------------------------------------

  ipcMain.handle(RUST_IPC.listPlugins, async (_e, id: string) => rust.listPlugins(id))
  ipcMain.handle(RUST_IPC.searchPlugins, async (_e, id: string, text: string) =>
    rust.searchPlugins(id, text)
  )
  ipcMain.handle(RUST_IPC.addPlugin, async (_e, id: string, name: string) =>
    rust.addPlugin(id, name, progress(id, 'mods'))
  )
  ipcMain.handle(RUST_IPC.removePlugin, async (_e, id: string, name: string) =>
    rust.removePlugin(id, name)
  )
  ipcMain.handle(
    RUST_IPC.setPluginEnabled,
    async (_e, id: string, name: string, enabled: boolean) => rust.setPluginEnabled(id, name, enabled)
  )
  ipcMain.handle(RUST_IPC.pluginUpdates, async (_e, id: string) => rust.pluginUpdates(id))
  ipcMain.handle(RUST_IPC.updatePlugin, async (_e, id: string, name: string) =>
    rust.updatePlugin(id, name, progress(id, 'mods'))
  )
  ipcMain.handle(RUST_IPC.installOxide, async (_e, id: string) =>
    rust.installOxide(id, progress(id, 'mods'))
  )
  ipcMain.handle(RUST_IPC.removeOxide, async (_e, id: string) =>
    rust.removeOxide(id, progress(id, 'mods'))
  )

  /** Abre la carpeta de plugins de Oxide, por si alguien quiere poner uno a mano. */
  ipcMain.handle(RUST_IPC.openPluginsFolder, async (_e, id: string): Promise<string> => {
    const folder = rustPaths.pluginsDir(id)
    await mkdir(folder, { recursive: true })
    await shell.openPath(folder)
    return folder
  })
}
