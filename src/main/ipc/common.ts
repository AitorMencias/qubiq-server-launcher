import { totalmem } from 'node:os'
import { ipcMain, shell, type BrowserWindow } from 'electron'
import type {
  AppSettings,
  CreateInstanceRequest,
  Diagnosis,
  LogLine,
  ManifestChanges,
  ProgressUpdate,
  ServerStatus
} from '@shared/types'
import type { PortProtocol } from '@shared/games'
import { IPC, EVENTS, type SystemMemory } from '@shared/ipc'
import { service } from '../core/service'
import { instanceDir } from '../core/paths'

/** Puente IPC común a cualquier juego: instancias, ejecución, copias y red. */

export function registerCommonIpc(getWindow: () => BrowserWindow | null): void {
  // --- Ajustes de la aplicación ---------------------------------------------

  ipcMain.handle(IPC.getSettings, async () => service.getSettings())
  ipcMain.handle(IPC.updateSettings, async (_e, changes: Partial<AppSettings>) =>
    service.updateSettings(changes)
  )

  // --- Instancias -----------------------------------------------------------

  ipcMain.handle(IPC.listInstances, async () => service.list())
  ipcMain.handle(IPC.getInstance, async (_e, id: string) => service.get(id))
  ipcMain.handle(IPC.createInstance, async (_e, request: CreateInstanceRequest) =>
    service.create(request)
  )
  ipcMain.handle(
    IPC.updateInstance,
    async (_e, id: string, changes: ManifestChanges) => service.update(id, changes)
  )
  ipcMain.handle(IPC.deleteInstance, async (_e, id: string) => service.remove(id))
  ipcMain.handle(IPC.reinstallInstance, async (_e, id: string) => service.install(id))
  ipcMain.handle(IPC.checkForUpdate, async (_e, id: string) => service.checkForUpdate(id))
  ipcMain.handle(IPC.updateServer, async (_e, id: string) => service.updateServer(id))
  ipcMain.handle(IPC.listVersions, async (_e, id: string) => service.listVersions(id))
  ipcMain.handle(IPC.changeVersion, async (_e, id: string, versionId: string) =>
    service.changeVersion(id, versionId)
  )

  // --- Ejecución ------------------------------------------------------------

  ipcMain.handle(IPC.startServer, async (_e, id: string) => service.start(id))
  ipcMain.handle(IPC.stopServer, async (_e, id: string) => service.stop(id))
  ipcMain.handle(IPC.sendCommand, async (_e, id: string, command: string) =>
    service.sendCommand(id, command)
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
  ipcMain.handle(IPC.suggestFreePort, async (_e, from: number, protocol: PortProtocol = 'tcp') =>
    service.suggestFreePort(from, protocol)
  )
  ipcMain.handle(IPC.checkFromInternet, async (_e, id: string) => service.checkFromInternet(id))
  ipcMain.handle(IPC.publicIp, async () => service.publicIp())

  // --- Sistema --------------------------------------------------------------

  ipcMain.handle(IPC.openInstanceFolder, async (_e, id: string) => {
    await shell.openPath(instanceDir(id))
  })

  // Memoria del equipo: con ella el selector de juego puede decir si Satisfactory
  // va a ir justo ANTES de descargar 15 GB.
  ipcMain.handle(IPC.systemMemory, (): SystemMemory => ({
    totalMb: Math.round(totalmem() / (1024 * 1024))
  }))

  // --- Eventos hacia la interfaz -------------------------------------------

  const send = (channel: string, ...args: unknown[]): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, ...args)
    }
  }

  service.on('log', (id: string, line: LogLine) => send(EVENTS.log, id, line))
  service.on('status', (id: string, status: ServerStatus) => send(EVENTS.status, id, status))
  service.on('players', (id: string, players: string[], playerCount: number | null) =>
    send(EVENTS.players, id, players, playerCount)
  )
  service.on('joinCode', (id: string, code: string | null) => send(EVENTS.joinCode, id, code))
  service.on('progress', (update: ProgressUpdate) => send(EVENTS.progress, update))
  service.on('diagnosis', (id: string, diagnosis: Diagnosis) =>
    send(EVENTS.diagnosis, id, diagnosis)
  )
}
