import { ipcMain, shell } from 'electron'
import type { CreateWorldRequest, Distribution } from '@shared/games/minecraft/types'
import { MINECRAFT_IPC, type MemoryInfo } from '@shared/ipc'
import { service } from '../core/service'
import * as catalog from '../core/games/minecraft/versions/catalog'
import { PROPERTY_CATALOG } from '../core/games/minecraft/config/properties'
import {
  suggestedMemoryMb,
  totalMemoryMb,
  memoryWarningThresholdMb,
  recommendedMemoryMb
} from '../core/games/minecraft/install/jvmArgs'

/** Puente IPC de las operaciones exclusivas de Minecraft. */
export function registerMinecraftIpc(): void {
  const mc = service.minecraft

  // --- Catálogo -------------------------------------------------------------

  ipcMain.handle(
    MINECRAFT_IPC.listVersions,
    async (_e, distribution: Distribution, includeUnstable = false) =>
      catalog.versionsFor(distribution, { includeUnstable })
  )

  ipcMain.handle(MINECRAFT_IPC.defaultVersion, async (_e, distribution: Distribution) =>
    catalog.defaultVersionFor(distribution)
  )

  ipcMain.handle(MINECRAFT_IPC.suggestedMemory, (): MemoryInfo => ({
    suggestedMb: suggestedMemoryMb(),
    totalMb: totalMemoryMb(),
    warningThresholdMb: memoryWarningThresholdMb()
  }))

  ipcMain.handle(MINECRAFT_IPC.recommendMemory, (_e, players: number, distribution: Distribution) =>
    recommendedMemoryMb(players, distribution)
  )

  // --- Configuración --------------------------------------------------------

  ipcMain.handle(MINECRAFT_IPC.getProperties, async (_e, id: string) => mc.getProperties(id))
  ipcMain.handle(
    MINECRAFT_IPC.setProperties,
    async (_e, id: string, values: Record<string, string>) => mc.setProperties(id, values)
  )
  ipcMain.handle(MINECRAFT_IPC.propertyCatalog, () => PROPERTY_CATALOG)

  // --- Plugins y mods -------------------------------------------------------

  ipcMain.handle(MINECRAFT_IPC.listContent, async (_e, id: string) => mc.listContent(id))
  ipcMain.handle(
    MINECRAFT_IPC.setContentEnabled,
    async (_e, id: string, file: string, on: boolean) => mc.setContentEnabled(id, file, on)
  )
  ipcMain.handle(MINECRAFT_IPC.removeContent, async (_e, id: string, file: string) =>
    mc.removeContent(id, file)
  )
  ipcMain.handle(MINECRAFT_IPC.contentFolder, async (_e, id: string) => {
    const folder = await mc.contentFolder(id)
    if (folder) await shell.openPath(folder)
    return folder
  })

  // --- Plugins oficiales ----------------------------------------------------

  ipcMain.handle(MINECRAFT_IPC.listOfficialPlugins, async (_e, id: string) =>
    mc.listOfficialPlugins(id)
  )
  ipcMain.handle(
    MINECRAFT_IPC.installOfficialPlugin,
    async (_e, id: string, pluginId: string, role?: string) =>
      mc.installOfficialPlugin(id, pluginId, role)
  )
  ipcMain.handle(
    MINECRAFT_IPC.uninstallOfficialPlugin,
    async (_e, id: string, pluginId: string, removeConfig: boolean) =>
      mc.uninstallOfficialPlugin(id, pluginId, removeConfig)
  )
  ipcMain.handle(
    MINECRAFT_IPC.setOfficialPluginConfig,
    async (_e, id: string, pluginId: string, values: Record<string, string | number | boolean>) =>
      mc.setOfficialPluginConfig(id, pluginId, values)
  )

  // --- Mundos ---------------------------------------------------------------

  ipcMain.handle(MINECRAFT_IPC.listWorlds, async (_e, id: string) => mc.listWorlds(id))
  ipcMain.handle(MINECRAFT_IPC.createWorld, async (_e, id: string, request: CreateWorldRequest) =>
    mc.createWorld(id, request)
  )
  ipcMain.handle(MINECRAFT_IPC.activateWorld, async (_e, id: string, name: string) =>
    mc.activateWorld(id, name)
  )
  ipcMain.handle(MINECRAFT_IPC.deleteWorld, async (_e, id: string, name: string) =>
    mc.deleteWorld(id, name)
  )
}
