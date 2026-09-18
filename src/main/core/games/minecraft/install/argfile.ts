import { join } from 'node:path'
import { access, readdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { InstallContext, LaunchPlan } from './types'
import { defaultJvmArgs } from './jvmArgs'

/**
 * Lo que comparten Forge y NeoForge (§6, §15.1): un instalador oficial que se
 * ejecuta con `--installServer`, descarga las librerías y deja un argfile de
 * Windows (`win_args.txt`) con el que hay que arrancar. Ninguno de los dos
 * produce un jar ejecutable en las versiones modernas.
 */

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Ruta del argfile que genera el instalador, si existe.
 *
 * `libraryPath` es la carpeta de la distribución dentro de `libraries`
 * (`net/minecraftforge/forge`), y `expectedDir`, la subcarpeta de la versión
 * instalada. Si no está donde se espera, se busca en cualquier versión, porque
 * la ruta ha cambiado entre versiones del instalador.
 */
export async function findArgsFile(
  serverDir: string,
  libraryPath: string[],
  expectedDir: string
): Promise<string | null> {
  const base = join(serverDir, 'libraries', ...libraryPath)
  if (expectedDir) {
    const expected = join(base, expectedDir, 'win_args.txt')
    if (await exists(expected)) return expected
  }

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

/**
 * Plan de arranque con argfile. La memoria va en user_jvm_args.txt, no en la
 * línea de comandos, porque el argfile ya define el resto de la invocación.
 */
export async function argfileLaunchPlan(ctx: InstallContext, argsFile: string): Promise<LaunchPlan> {
  const jvmArgsFile = join(ctx.serverDir, 'user_jvm_args.txt')
  await writeUserJvmArgs(jvmArgsFile, ctx.memoryMb)
  return {
    args: [`@${jvmArgsFile}`, `@${argsFile}`, 'nogui'],
    memoryHandledExternally: true
  }
}

/**
 * Escribe user_jvm_args.txt entero con los argumentos de la app.
 * Un argumento por línea: Java no acepta varios separados por espacios aquí
 * de forma fiable cuando hay rutas con espacios.
 */
export async function writeUserJvmArgs(path: string, memoryMb: number): Promise<void> {
  const args = defaultJvmArgs(memoryMb)
  const header = [
    '# Generado por QubiQ Server Launcher.',
    '# Un argumento por linea. Las lineas que empiezan por # se ignoran.',
    ''
  ]
  await writeFile(path, [...header, ...args].join('\r\n'), 'utf8')
}

/**
 * Ejecuta el instalador y vuelca su salida al progreso.
 * Se captura todo porque es el fallo más frecuente y sin log no hay diagnóstico.
 */
export function runInstaller(ctx: InstallContext, installerPath: string, name: string): Promise<void> {
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
      reject(new Error(`No se pudo ejecutar el instalador de ${name}: ${err.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const tail = output.trim().split(/\r?\n/).slice(-15).join('\n')
      reject(
        new Error(`El instalador de ${name} terminó con código ${code}.\n` + `Últimas líneas:\n${tail}`)
      )
    })

    ctx.signal?.addEventListener('abort', () => child.kill())
  })
}

/** El mensaje de cuando el instalador dice que ha ido bien pero no ha dejado nada. */
export function nothingInstalledError(name: string): Error {
  return new Error(
    `El instalador de ${name} terminó pero no generó ni argfile ni jar ejecutable. ` +
      'Suele deberse a que el antivirus bloqueó la escritura o a que la descarga ' +
      'de librerías se cortó. Revisa launcher.log e inténtalo de nuevo.'
  )
}
