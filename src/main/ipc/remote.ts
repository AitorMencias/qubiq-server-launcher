import { ipcMain, type BrowserWindow } from 'electron'
import { EVENTS, REMOTE_IPC } from '@shared/ipc'
import type { RemotePermissions } from '@shared/remote'
import type { RemoteAccess } from '../core/remote'

/** Configuración → Acceso remoto. */
export function registerRemoteIpc(
  remote: RemoteAccess,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(REMOTE_IPC.status, () => remote.status())
  ipcMain.handle(REMOTE_IPC.activity, (_e, limit?: number) => remote.activity(limit))
  ipcMain.handle(REMOTE_IPC.setEnabled, (_e, enabled: boolean) => remote.setEnabled(enabled === true))
  ipcMain.handle(REMOTE_IPC.setPort, (_e, port: number) => remote.setPort(port))
  ipcMain.handle(REMOTE_IPC.createInvite, (_e, permissions: RemotePermissions) =>
    remote.createInvite(permissions)
  )
  ipcMain.handle(REMOTE_IPC.cancelInvite, () => remote.cancelInvite())
  ipcMain.handle(REMOTE_IPC.updateDevice, (_e, id: string, permissions: RemotePermissions) =>
    remote.updateDevice(id, permissions)
  )
  ipcMain.handle(REMOTE_IPC.revokeDevice, (_e, id: string) => remote.revokeDevice(id))

  remote.on('changed', () => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(EVENTS.remote)
  })
}
