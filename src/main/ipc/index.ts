import type { BrowserWindow } from 'electron'
import { registerCommonIpc } from './common'
import { registerMinecraftIpc } from './minecraft'
import { registerSatisfactoryIpc } from './satisfactory'
import { registerValheimIpc } from './valheim'
import { registerFactorioIpc } from './factorio'
import { registerZomboidIpc } from './zomboid'
import { registerEnshroudedIpc } from './enshrouded'
import { registerRustIpc } from './rust'

/**
 * Puente entre el núcleo y la interfaz.
 *
 * Todo handler devuelve o lanza; los errores se propagan al renderer con su
 * mensaje intacto para que la interfaz pueda mostrarlo tal cual (§7).
 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  registerCommonIpc(getWindow)
  registerMinecraftIpc()
  registerSatisfactoryIpc()
  registerValheimIpc()
  registerFactorioIpc()
  registerZomboidIpc()
  registerEnshroudedIpc()
  registerRustIpc()
}
