import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { ENSHROUDED_IPC } from '@shared/ipc'
import { service } from '../core/service'
import type { EnshroudedConfigChanges } from '../core/games/enshrouded/service'
import { ACCEPTED_EXTENSIONS, MODS_DIR } from '../core/games/enshrouded/mods'
import { serverDir } from '../core/paths'

/**
 * Puente IPC de las operaciones exclusivas de Enshrouded.
 *
 * Todas exigen el servidor **parado**, como en Valheim: aquí no hay consola ni
 * API a la que pedir nada en caliente, y además el servidor reescribe su
 * fichero de configuración al cerrarse, así que lo escrito con él en marcha se
 * perdería. Quien pone el error es el servicio, para que diga lo mismo se llame
 * desde donde se llame.
 */
export function registerEnshroudedIpc(): void {
  const en = service.enshrouded

  // --- Configuración ----------------------------------------------------------

  ipcMain.handle(ENSHROUDED_IPC.getConfig, async (_e, id: string) => en.getConfig(id))
  ipcMain.handle(ENSHROUDED_IPC.setConfig, async (_e, id: string, changes: EnshroudedConfigChanges) =>
    en.setConfig(id, changes)
  )

  // --- Mundos -----------------------------------------------------------------

  ipcMain.handle(ENSHROUDED_IPC.listWorlds, async (_e, id: string) => en.listWorlds(id))
  ipcMain.handle(ENSHROUDED_IPC.createWorld, async (_e, id: string, name: string) =>
    en.createWorld(id, name)
  )
  ipcMain.handle(ENSHROUDED_IPC.activateWorld, async (_e, id: string, name: string) =>
    en.activateWorld(id, name)
  )
  ipcMain.handle(
    ENSHROUDED_IPC.renameWorld,
    async (_e, id: string, name: string, newName: string) => en.renameWorld(id, name, newName)
  )
  ipcMain.handle(ENSHROUDED_IPC.deleteWorld, async (_e, id: string, name: string) =>
    en.deleteWorld(id, name)
  )

  // --- Vetados ----------------------------------------------------------------

  ipcMain.handle(ENSHROUDED_IPC.listBans, async (_e, id: string) => en.listBans(id))
  ipcMain.handle(ENSHROUDED_IPC.removeBan, async (_e, id: string, accountId: number) =>
    en.removeBan(id, accountId)
  )

  // --- Mods de Shroudtopia ----------------------------------------------------

  ipcMain.handle(ENSHROUDED_IPC.listMods, async (_e, id: string) => en.listMods(id))
  ipcMain.handle(ENSHROUDED_IPC.installLoader, async (_e, id: string) =>
    en.installLoader(id, (detail) => service.emitProgress(id, 'mods', detail))
  )
  ipcMain.handle(ENSHROUDED_IPC.removeLoader, async (_e, id: string) => en.removeLoader(id))

  /**
   * Elegir el fichero del mod. No hay buscador porque Nexus Mods no deja
   * descargar sin cuenta de pago, así que el usuario se lo baja y lo trae.
   */
  ipcMain.handle(ENSHROUDED_IPC.pickModFile, async (e): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(e.sender)
    const options: OpenDialogOptions = {
      title: 'Fichero del mod que quieres instalar',
      buttonLabel: 'Instalar este',
      filters: [
        {
          name: 'Mod de Enshrouded (.dll, .zip)',
          extensions: ACCEPTED_EXTENSIONS.map((ext) => ext.replace('.', ''))
        }
      ],
      properties: ['openFile']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  /** Abre la carpeta donde el cargador busca los mods. */
  ipcMain.handle(ENSHROUDED_IPC.openModsFolder, async (_e, id: string): Promise<string> => {
    const folder = join(serverDir(id), MODS_DIR)
    await mkdir(folder, { recursive: true })
    await shell.openPath(folder)
    return folder
  })

  ipcMain.handle(ENSHROUDED_IPC.addModFile, async (_e, id: string, filePath: string) =>
    en.addModFile(id, filePath, (detail) => service.emitProgress(id, 'mods', detail))
  )
  ipcMain.handle(ENSHROUDED_IPC.removeMod, async (_e, id: string, modId: string) =>
    en.removeMod(id, modId)
  )
  ipcMain.handle(
    ENSHROUDED_IPC.setModEnabled,
    async (_e, id: string, modId: string, enabled: boolean) => en.setModEnabled(id, modId, enabled)
  )
  ipcMain.handle(ENSHROUDED_IPC.loaderUpdate, async (_e, id: string) => en.loaderUpdate(id))
}
