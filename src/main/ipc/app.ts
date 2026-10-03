import { app, dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions } from 'electron'
import type { BootInfo, DataFolderInfo, RelocationPlan, RelocationStatus } from '@shared/dataFolder'
import { detectLanguage, getLanguage, t } from '@shared/i18n'
import { IPC, EVENTS } from '@shared/ipc'
import { service } from '../core/service'
import { dataRoot } from '../core/paths'
import { listInstances } from '../core/instances/manager'
import { planRelocation, samePath } from '../core/dataFolder/plan'
import {
  configDir,
  dismissRelocation,
  onRelocation,
  relocationStatus,
  requestRelocation
} from '../dataFolder'

/**
 * Lo que es de la app y no de un servidor: el arranque de la interfaz y la
 * carpeta de datos. Los ajustes (modo e idioma) van por `common.ts`.
 */
export function registerAppIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    IPC.bootInfo,
    (): BootInfo => ({
      language: getLanguage(),
      systemLanguage: detectLanguage(app.getPreferredSystemLanguages()),
      relocation: relocationStatus()
    })
  )

  ipcMain.handle(IPC.relocationDismiss, () => dismissRelocation())

  ipcMain.handle(
    IPC.dataFolderInfo,
    (): DataFolderInfo => ({
      current: dataRoot(),
      defaultPath: configDir(),
      isDefault: samePath(dataRoot(), configDir())
    })
  )

  ipcMain.handle(IPC.dataFolderOpen, async () => {
    await shell.openPath(dataRoot())
  })

  ipcMain.handle(IPC.dataFolderChoose, async (): Promise<string | null> => {
    const window = getWindow()
    const options: OpenDialogOptions = {
      title: t('settings.dataFolder.pickTitle'),
      properties: ['openDirectory', 'createDirectory']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  const plan = async (chosen: string): Promise<RelocationPlan> =>
    planRelocation({
      from: dataRoot(),
      chosen,
      defaultRoot: configDir(),
      manifests: await listInstances(),
      busy: await service.busyServerNames()
    })

  ipcMain.handle(IPC.dataFolderPlan, async (_e, chosen: string) => plan(chosen))

  /**
   * Se vuelve a comprobar todo aquí: entre enseñar el plan y pulsar el botón
   * alguien ha podido encender un servidor. Si sigue sin haber problemas, se
   * deja apuntado y se reinicia la app, que es donde se mueve.
   */
  ipcMain.handle(IPC.dataFolderApply, async (_e, chosen: string): Promise<RelocationPlan> => {
    const checked = await plan(chosen)
    if (checked.problems.length > 0) return checked
    await requestRelocation(dataRoot(), checked.target)
    app.relaunch()
    app.quit()
    return checked
  })

  onRelocation((status: RelocationStatus) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(EVENTS.relocation, status)
  })
}
