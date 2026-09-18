import { join } from 'node:path'
import type { Installer, InstallContext, InstallResult, LaunchPlan } from './types'
import { argfileLaunchPlan, findArgsFile, nothingInstalledError, runInstaller } from './argfile'
import { download } from '../../../net/downloader'
import { cacheDir, ensureDir } from '../../../paths'
import * as neoforgeCatalog from '../versions/neoforge'

/**
 * NeoForge (§4.4). Mismo patrón que Forge: instalador con `--installServer` y
 * arranque con el argfile que deja en `libraries/net/neoforged/neoforge/<v>/`.
 *
 * No hay caso antiguo con jar ejecutable: NeoForge empezó en 1.20.2, cuando
 * Forge ya solo producía argfile. (El NeoForge de 1.20.1 se publicó con el
 * nombre `forge` y no se ofrece: para esa versión está Forge.)
 */

const LIBRARY_PATH = ['net', 'neoforged', 'neoforge']

export const neoforgeInstaller: Installer = {
  distribution: 'neoforge',

  async install(ctx: InstallContext): Promise<InstallResult> {
    ctx.onProgress('resolve', null, 'Buscando la última versión de NeoForge')
    const build = ctx.build
      ? neoforgeCatalog.buildFor(ctx.build, false)
      : await neoforgeCatalog.resolveBuild(ctx.minecraftVersion, ctx.allowExperimental ?? false)

    await ensureDir(ctx.serverDir)
    await ensureDir(cacheDir())

    const installerPath = join(cacheDir(), build.installerFileName)
    ctx.onProgress('download', 0, 'Descargando el instalador de NeoForge')
    await download({
      url: build.installerUrl,
      destination: installerPath,
      signal: ctx.signal,
      onProgress: (received, total) => {
        ctx.onProgress('download', total ? received / total : null, 'Descargando NeoForge')
      }
    })

    ctx.onProgress('install', null, 'Instalando NeoForge (esto puede tardar unos minutos)')
    await runInstaller(ctx, installerPath, 'NeoForge')

    if (!(await findArgsFile(ctx.serverDir, LIBRARY_PATH, build.version))) {
      throw nothingInstalledError('NeoForge')
    }
    return { build: build.version }
  },

  async buildLaunchPlan(ctx: InstallContext): Promise<LaunchPlan> {
    // Tras un cambio de versión quedan las librerías de la anterior: se busca
    // primero la carpeta de la instalada, para no arrancar con la vieja.
    const argsFile = await findArgsFile(ctx.serverDir, LIBRARY_PATH, ctx.build ?? '')
    if (argsFile) return argfileLaunchPlan(ctx, argsFile)

    throw new Error(
      'No se encuentra cómo arrancar este servidor de NeoForge. ' +
        'Puede que la instalación quedara a medias: prueba a reinstalar la instancia.'
    )
  }
}
