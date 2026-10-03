import { relative } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import type {
  CreateWorldRequest,
  Distribution,
  StartFileInfo
} from '@shared/games/minecraft/types'
import { MINECRAFT_IPC, type MemoryInfo } from '@shared/ipc'
import type { ConfigChange } from '@shared/editableConfig'
import { service } from '../core/service'
import { serverDir } from '../core/paths'
import { describeStartFile, inspectFolder } from '../core/games/minecraft/custom/inspect'
import * as catalog from '../core/games/minecraft/versions/catalog'
import { localizedCatalog } from '../core/games/minecraft/config/properties'
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
  ipcMain.handle(MINECRAFT_IPC.propertyCatalog, () => localizedCatalog())

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

  ipcMain.handle(MINECRAFT_IPC.contentConfigFiles, async (_e, id: string, file: string) =>
    mc.contentConfigFiles(id, file)
  )
  ipcMain.handle(MINECRAFT_IPC.readContentConfig, async (_e, id: string, path: string) =>
    mc.readContentConfig(id, path)
  )
  ipcMain.handle(
    MINECRAFT_IPC.writeContentConfig,
    async (_e, id: string, path: string, hash: string, changes: ConfigChange[]) =>
      mc.writeContentConfig(id, path, hash, changes)
  )
  ipcMain.handle(MINECRAFT_IPC.openContentConfig, async (_e, id: string, path: string) => {
    const target = await mc.contentConfigLocation(id, path)
    // Un .yml o un .toml puede no tener programa asociado en Windows: entonces
    // se enseña en el Explorador, que siempre funciona.
    const problem = await shell.openPath(target)
    if (problem) shell.showItemInFolder(target)
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

  // --- Servidores a medida --------------------------------------------------

  ipcMain.handle(MINECRAFT_IPC.pickImportFolder, async (e): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(e.sender)
    const options: OpenDialogOptions = {
      title: 'Carpeta del servidor que quieres traer',
      buttonLabel: 'Elegir esta carpeta',
      properties: ['openDirectory']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(MINECRAFT_IPC.inspectImport, async (_e, folder: string) => inspectFolder(folder))

  /**
   * Elegir a mano el archivo de inicio. `target` es la carpeta que se va a
   * traer o el servidor ya traído. Lo elegido tiene que estar dentro de ella.
   */
  ipcMain.handle(
    MINECRAFT_IPC.pickStartFile,
    async (e, target: { folder: string } | { instanceId: string }): Promise<StartFileInfo | null> => {
      const folder = 'folder' in target ? target.folder : serverDir(target.instanceId)
      const window = BrowserWindow.fromWebContents(e.sender)
      const options: OpenDialogOptions = {
        title: 'Archivo con el que arranca el servidor',
        defaultPath: folder,
        buttonLabel: 'Arrancar con este',
        filters: [{ name: 'Archivo de inicio (.bat, .cmd, .jar)', extensions: ['bat', 'cmd', 'jar'] }],
        properties: ['openFile']
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      const chosen = result.canceled ? null : result.filePaths[0]
      if (!chosen) return null
      return describeStartFile(folder, relative(folder, chosen))
    }
  )

  ipcMain.handle(MINECRAFT_IPC.listStartFiles, async (_e, id: string) => mc.startFiles(id))
  ipcMain.handle(MINECRAFT_IPC.setStartFile, async (_e, id: string, path: string) =>
    mc.setStartFile(id, path)
  )
}
