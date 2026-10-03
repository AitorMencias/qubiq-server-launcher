import { ipcMain, type BrowserWindow } from 'electron'
import { EVENTS, REMOTE_LINKS_IPC } from '@shared/ipc'
import type { RemoteArgs, RemoteLinkRequest, RemoteLinksState, RemoteOrder } from '@shared/remote'
import type { RemoteLinks } from '../core/remote/links'

/** Servidores de otros QubiQ (0.13.0). `RemoteLinks` comprueba todo lo que llega. */
export function registerRemoteLinksIpc(links: RemoteLinks, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(REMOTE_LINKS_IPC.state, () => links.state())
  ipcMain.handle(REMOTE_LINKS_IPC.probe, (_e, address: string) => links.probe(String(address ?? '')))
  ipcMain.handle(REMOTE_LINKS_IPC.pair, (_e, request: RemoteLinkRequest) => links.pair(request))
  ipcMain.handle(REMOTE_LINKS_IPC.order, (_e, id: string, order: RemoteOrder, args?: RemoteArgs) =>
    links.order(String(id), order, args ?? {})
  )
  ipcMain.handle(REMOTE_LINKS_IPC.refresh, (_e, id: string) => links.refresh(String(id)))
  ipcMain.handle(REMOTE_LINKS_IPC.trust, (_e, id: string, fingerprint: string) =>
    links.trust(String(id), String(fingerprint))
  )
  ipcMain.handle(REMOTE_LINKS_IPC.remove, (_e, id: string) => links.remove(String(id)))

  links.on('changed', (state: RemoteLinksState) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(EVENTS.remoteLinks, state)
  })
}
