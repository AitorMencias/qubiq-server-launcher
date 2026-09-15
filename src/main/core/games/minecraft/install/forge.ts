import { join } from 'node:path'
import { access, readdir, writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { Installer, InstallContext, InstallResult, LaunchPlan } from './types'
import { defaultJvmArgs } from './jvmArgs'
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
 * funciona en 1.16 y falla en todo lo posterior.
 */

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Ruta del argfile que genera el instalador, si existe. */
async function findArgsFile(serverDir: string, fullVersion: string): Promise<string | null> {
  const expected = join(
    serverDir,
    'libraries',
    'net',
    'minecraftforge',
    'forge',
    fullVersion,
    'win_args.txt'
  )
  if (await exists(expected)) return expected

  // Rutas alternativas según la versión del instalador.
  const base = join(serverDir, 'libraries', 'net', 'minecraftforge', 'forge')
  try {
    const entries = await readdir(base)
    for (const entry of entries) {
      const candidate = join(base, entry, 'win_args.txt')
      if (await exists(candidate)) return candidate
    }
  } catch {
    // No existe la carpeta: instalación antigua sin argfile.
  }
  return null
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
    await runInstaller(ctx, installerPath)

    const argsFile = await findArgsFile(ctx.serverDir, build.fullVersion)
    const legacyJar = await findLegacyJar(ctx.serverDir)
    if (!argsFile && !legacyJar) {
      throw new Error(
        'El instalador de Forge terminó pero no generó ni argfile ni jar ejecutable. ' +
          'Suele deberse a que el antivirus bloqueó la escritura o a que la descarga ' +
          'de librerías se cortó. Revisa launcher.log e inténtalo de nuevo.'
      )
    }

    return { build: build.forgeVersion }
  },

  async buildLaunchPlan(ctx: InstallContext): Promise<LaunchPlan> {
    const fullVersion = ctx.build ? `${ctx.minecraftVersion}-${ctx.build}` : ''
    const argsFile = await findArgsFile(ctx.serverDir, fullVersion)

    if (argsFile) {
      // Forge moderno: la memoria va en user_jvm_args.txt, no en la línea de
      // comandos, porque el argfile ya define el resto de la invocación.
      const jvmArgsFile = join(ctx.serverDir, 'user_jvm_args.txt')
      await writeUserJvmArgs(jvmArgsFile, ctx.memoryMb)

      return {
        args: [`@${jvmArgsFile}`, `@${argsFile}`, 'nogui'],
        memoryHandledExternally: true
      }
    }

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

/**
 * Escribe user_jvm_args.txt preservando los comentarios de Forge.
 * Un argumento por línea: Java no acepta varios separados por espacios aquí
 * de forma fiable cuando hay rutas con espacios.
 */
async function writeUserJvmArgs(path: string, memoryMb: number): Promise<void> {
  const args = defaultJvmArgs(memoryMb)
  const header = [
    '# Generado por QubiQ Server Launcher.',
    '# Un argumento por linea. Las lineas que empiezan por # se ignoran.',
    ''
  ]
  await writeFile(path, [...header, ...args].join('\r\n'), 'utf8')
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

/**
 * Ejecuta el instalador y vuelca su salida al progreso.
 * Se captura todo porque es el fallo más frecuente y sin log no hay diagnóstico.
 */
function runInstaller(ctx: InstallContext, installerPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ctx.javaPath, ['-jar', installerPath, '--installServer'], {
      cwd: ctx.serverDir,
      windowsHide: true
    })

    let output = ''
    const capture = (chunk: Buffer): void => {
      const text = chunk.toString()
      output += text
      const lastLine = text.trim().split(/\r?\n/).pop()
      if (lastLine) ctx.onProgress('install', null, lastLine.slice(0, 120))
    }

    child.stdout.on('data', capture)
    child.stderr.on('data', capture)

    child.on('error', (err) => {
      reject(new Error(`No se pudo ejecutar el instalador de Forge: ${err.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const tail = output.trim().split(/\r?\n/).slice(-15).join('\n')
      reject(
        new Error(
          `El instalador de Forge terminó con código ${code}.\n` +
            `Últimas líneas:\n${tail}`
        )
      )
    })

    ctx.signal?.addEventListener('abort', () => child.kill())
  })
}

/** Lee la versión de Forge instalada leyendo el argfile presente en disco. */
export async function detectInstalledVersion(serverDir: string): Promise<string | null> {
  const base = join(serverDir, 'libraries', 'net', 'minecraftforge', 'forge')
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
  const path = await findArgsFile(serverDir, fullVersion)
  if (!path) return null
  return readFile(path, 'utf8')
}
