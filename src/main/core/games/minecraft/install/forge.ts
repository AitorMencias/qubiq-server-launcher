import { join } from 'node:path'
import { access, readdir, readFile } from 'node:fs/promises'
import type { Installer, InstallContext, InstallResult, LaunchPlan } from './types'
import { defaultJvmArgs } from './jvmArgs'
import { argfileLaunchPlan, findArgsFile, nothingInstalledError, runInstaller } from './argfile'
import { download } from '../../../net/downloader'
import { cacheDir, ensureDir } from '../../../paths'
import * as forgeCatalog from '../versions/forge'

/**
 * Forge (§6, §15.1). La estrategia más compleja del MVP, y la razón por la que
 * `Installer` devuelve una lista de argumentos en lugar de una ruta a un jar.
 *
 * Instalación en dos fases:
 *   1. Descargar el instalador oficial desde Maven.
 *   2. Ejecutarlo con `--installServer`, que descarga las librerías y genera
 *      el argfile con el que hay que arrancar.
 *
 * Forge >= 1.17 NO produce un jar ejecutable. Asumir `-jar server.jar`
 * funciona en 1.16 y falla en todo lo posterior. Lo que comparte con NeoForge
 * vive en `argfile.ts`.
 */

/** Carpeta de Forge dentro de `libraries`. */
const LIBRARY_PATH = ['net', 'minecraftforge', 'forge']

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Forge <= 1.16 sí deja un jar ejecutable en la raíz. */
async function findLegacyJar(serverDir: string): Promise<string | null> {
  try {
    const entries = await readdir(serverDir)
    const jar = entries.find(
      (e) => e.startsWith('forge-') && e.endsWith('.jar') && !e.includes('installer')
    )
    return jar ? join(serverDir, jar) : null
  } catch {
    return null
  }
}

export const forgeInstaller: Installer = {
  distribution: 'forge',

  async install(ctx: InstallContext): Promise<InstallResult> {
    ctx.onProgress('resolve', null, 'Buscando la versión de Forge recomendada')
    const build = ctx.build
      ? await resolveExplicitBuild(ctx.minecraftVersion, ctx.build)
      : await forgeCatalog.resolveBuild(ctx.minecraftVersion)

    await ensureDir(ctx.serverDir)
    await ensureDir(cacheDir())

    const installerPath = join(cacheDir(), build.installerFileName)
    ctx.onProgress('download', 0, 'Descargando el instalador de Forge')
    await download({
      url: build.installerUrl,
      destination: installerPath,
      signal: ctx.signal,
      onProgress: (received, total) => {
        ctx.onProgress('download', total ? received / total : null, 'Descargando Forge')
      }
    })

    // Fase 2: el instalador descarga cientos de MB de librerías. Puede tardar
    // varios minutos y es el punto que más falla (red, antivirus, rutas raras).
    ctx.onProgress('install', null, 'Instalando Forge (esto puede tardar unos minutos)')
    await runInstaller(ctx, installerPath, 'Forge')

    const argsFile = await findArgsFile(ctx.serverDir, LIBRARY_PATH, build.fullVersion)
    const legacyJar = await findLegacyJar(ctx.serverDir)
    if (!argsFile && !legacyJar) throw nothingInstalledError('Forge')

    return { build: build.forgeVersion }
  },

  async buildLaunchPlan(ctx: InstallContext): Promise<LaunchPlan> {
    const fullVersion = ctx.build ? `${ctx.minecraftVersion}-${ctx.build}` : ''
    const argsFile = await findArgsFile(ctx.serverDir, LIBRARY_PATH, fullVersion)
    if (argsFile) return argfileLaunchPlan(ctx, argsFile)

    const legacyJar = await findLegacyJar(ctx.serverDir)
    if (legacyJar) {
      return {
        args: [...defaultJvmArgs(ctx.memoryMb), '-jar', legacyJar, 'nogui'],
        memoryHandledExternally: false
      }
    }

    throw new Error(
      'No se encuentra cómo arrancar este servidor de Forge. ' +
        'Puede que la instalación quedara a medias: prueba a reinstalar la instancia.'
    )
  }
}

/** Comprueba que la versión de Forge pedida existe realmente en Maven. */
async function resolveExplicitBuild(
  minecraftVersion: string,
  forgeVersion: string
): Promise<forgeCatalog.ForgeBuild> {
  const all = await forgeCatalog.listAllBuilds()
  const full = `${minecraftVersion}-${forgeVersion}`
  if (!all.includes(full)) {
    // No abortamos: Maven puede tardar en indexar. Lo intentamos igual.
    return {
      forgeVersion,
      fullVersion: full,
      installerUrl: `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`,
      installerFileName: `forge-${full}-installer.jar`,
      recommended: false
    }
  }
  return forgeCatalog.resolveBuild(minecraftVersion)
}

/** Lee la versión de Forge instalada leyendo el argfile presente en disco. */
export async function detectInstalledVersion(serverDir: string): Promise<string | null> {
  const base = join(serverDir, 'libraries', ...LIBRARY_PATH)
  try {
    const entries = await readdir(base)
    for (const entry of entries) {
      if (await exists(join(base, entry, 'win_args.txt'))) {
        const dash = entry.indexOf('-')
        return dash > 0 ? entry.slice(dash + 1) : entry
      }
    }
  } catch {
    return null
  }
  return null
}

/** Utilidad de diagnóstico: devuelve el contenido del argfile si existe. */
export async function readArgsFile(serverDir: string, fullVersion: string): Promise<string | null> {
  const path = await findArgsFile(serverDir, LIBRARY_PATH, fullVersion)
  if (!path) return null
  return readFile(path, 'utf8')
}
