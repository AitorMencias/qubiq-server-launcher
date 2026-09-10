import { ipcMain, shell, type BrowserWindow } from 'electron'
import type {
  CreateInstanceRequest,
  CreateWorldRequest,
  Distribution,
  InstanceManifest,
  LogLine,
  ProgressUpdate,
  Diagnosis,
  ServerStatus
} from '@shared/types'
import { IPC, EVENTS, type MemoryInfo } from '@shared/ipc'
import { service } from './core/service'
import * as catalog from './core/versions/catalog'
import { PROPERTY_CATALOG } from './core/config/properties'
import {
  suggestedMemoryMb,
  totalMemoryMb,
  memoryWarningThresholdMb,
  recommendedMemoryMb
} from './core/install/jvmArgs'
import { instanceDir } from './core/paths'

/**
 * Puente entre el núcleo y la interfaz.
 *
 * Todo handler devuelve o lanza; los errores se propagan al renderer con su
 * mensaje intacto para que la interfaz pueda mostrarlo tal cual (§7).
 */

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // --- Catálogo -------------------------------------------------------------

  ipcMain.handle(IPC.listVersions, async (_e, distribution: Distribution, includeUnstable = false) =>
    catalog.versionsFor(distribution, { includeUnstable })
  )

  ipcMain.handle(IPC.defaultVersion, async (_e, distribution: Distribution) =>
    catalog.defaultVersionFor(distribution)
  )

  ipcMain.handle(IPC.suggestedMemory, (): MemoryInfo => ({
    suggestedMb: suggestedMemoryMb(),
    totalMb: totalMemoryMb(),
    warningThresholdMb: memoryWarningThresholdMb()
  }))

  ipcMain.handle(IPC.recommendMemory, (_e, players: number, distribution: Distribution) =>
    recommendedMemoryMb(players, distribution)
  )

  // --- Instancias -----------------------------------------------------------

  ipcMain.handle(IPC.listInstances, async () => service.list())
  ipcMain.handle(IPC.getInstance, async (_e, id: string) => service.get(id))
  ipcMain.handle(IPC.createInstance, async (_e, request: CreateInstanceRequest) =>
    service.create(request)
  )
  ipcMain.handle(
    IPC.updateInstance,
    async (_e, id: string, changes: Partial<InstanceManifest>) => service.update(id, changes)
  )
  ipcMain.handle(IPC.deleteInstance, async (_e, id: string) => service.remove(id))
  ipcMain.handle(IPC.reinstallInstance, async (_e, id: string) => service.install(id))

  // --- Ejecución ------------------------------------------------------------

  ipcMain.handle(IPC.startServer, async (_e, id: string) => service.start(id))
  ipcMain.handle(IPC.stopServer, async (_e, id: string) => service.stop(id))
  ipcMain.handle(IPC.sendCommand, async (_e, id: string, command: string) =>
    service.sendCommand(id, command)
  )

  // --- Configuración --------------------------------------------------------

  ipcMain.handle(IPC.getProperties, async (_e, id: string) => service.getProperties(id))
  ipcMain.handle(IPC.setProperties, async (_e, id: string, values: Record<string, string>) =>
    service.setProperties(id, values)
  )
  ipcMain.handle(IPC.propertyCatalog, () => PROPERTY_CATALOG)

  // --- Mundos ---------------------------------------------------------------

  ipcMain.handle(IPC.listWorlds, async (_e, id: string) => service.listWorlds(id))
  ipcMain.handle(IPC.createWorld, async (_e, id: string, request: CreateWorldRequest) =>
    service.createWorld(id, request)
  )
  ipcMain.handle(IPC.activateWorld, async (_e, id: string, name: string) =>
    service.activateWorld(id, name)
  )
  ipcMain.handle(IPC.deleteWorld, async (_e, id: string, name: string) =>
    service.deleteWorld(id, name)
  )

  // --- Copias de seguridad --------------------------------------------------

  ipcMain.handle(IPC.listBackups, async (_e, id: string) => service.listBackups(id))
  ipcMain.handle(IPC.backupEstimate, async (_e, id: string) => service.backupEstimate(id))
  ipcMain.handle(IPC.createBackup, async (_e, id: string, reason?: string) =>
    service.createBackup(id, reason)
  )
  ipcMain.handle(IPC.restoreBackup, async (_e, id: string, fileName: string) =>
    service.restoreBackup(id, fileName)
  )
  ipcMain.handle(IPC.deleteBackup, async (_e, id: string, fileName: string) =>
    service.deleteBackup(id, fileName)
  )

  // --- Red ------------------------------------------------------------------

  ipcMain.handle(IPC.connectionInfo, async (_e, id: string) => service.connectionInfo(id))
  ipcMain.handle(IPC.suggestFreePort, async (_e, from: number) => service.suggestFreePort(from))
  ipcMain.handle(IPC.checkFromInternet, async (_e, id: string) => service.checkFromInternet(id))

  // --- Sistema --------------------------------------------------------------

  ipcMain.handle(IPC.openInstanceFolder, async (_e, id: string) => {
    await shell.openPath(instanceDir(id))
  })

  // --- Eventos hacia la interfaz -------------------------------------------

  const send = (channel: string, ...args: unknown[]): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, ...args)
    }
  }

  service.on('log', (id: string, line: LogLine) => send(EVENTS.log, id, line))
  service.on('status', (id: string, status: ServerStatus) => send(EVENTS.status, id, status))
  service.on('players', (id: string, players: string[]) => send(EVENTS.players, id, players))
  service.on('progress', (update: ProgressUpdate) => send(EVENTS.progress, update))
  service.on('diagnosis', (id: string, diagnosis: Diagnosis) =>
    send(EVENTS.diagnosis, id, diagnosis)
  )
}
