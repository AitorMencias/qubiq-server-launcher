import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { readFile, stat, writeFile } from 'node:fs/promises'
import type { CustomStart } from '@shared/games/minecraft/types'
import type { LaunchSpec } from '../../types'
import { defaultJvmArgs, memoryArgs } from '../install/jvmArgs'
import { NO_PAUSE_PREFIX, analyzeScript } from './inspect'

/**
 * Arrancar un servidor a medida con su propio archivo de inicio (§19.x).
 *
 * Un `.jar` se arranca como cualquier otro servidor, con el Java y la memoria
 * de la app. Un `.bat` se arranca con cmd, y ahí hay tres cosas que resolver:
 *
 * 1. **Qué Java usa.** El script llama a `java` a secas, que será el que haya
 *    en el PATH del equipo (o ninguno). Se pone delante el que corresponde a
 *    su versión de Minecraft, igual que en los servidores que instala la app.
 * 2. **`pause` al final.** Lo trae el run.bat de Forge y NeoForge. Con la
 *    consola en la app no hay tecla que pulsar: cuando el servidor se cierra,
 *    cmd se queda esperando para siempre y la app lo daría por arrancado. Se
 *    arranca una copia del script sin las pausas, junto al original.
 * 3. **Cerrarlo a la fuerza.** El proceso que ve la app es cmd, no Java: matar
 *    solo a cmd dejaría a Java vivo con el puerto y el mundo abiertos. Se pide
 *    matar el árbol entero (`killTree`).
 */

/** Ruta completa del archivo de inicio, comprobando que no se sale de la carpeta. */
export function startFilePath(serverDir: string, startFile: string): string {
  const full = resolve(serverDir, startFile)
  const rel = relative(resolve(serverDir), full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('El archivo de inicio tiene que estar dentro de la carpeta del servidor.')
  }
  return full
}

/** El script sin sus `pause`, para que cmd no se quede esperando una tecla. */
export function withoutPauses(text: string, original: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/).map((line) => {
    if (/^\s*@?(rem\b|::)/i.test(line)) return line
    if (/^\s*@?pause\b/i.test(line)) return '@REM pause (quitado por QubiQ)'
    // `java ... || pause` y `java ... & pause`: se quita solo la pausa.
    return line.replace(/\s*(&&|\|\||&)\s*@?pause\b[^&|]*/gi, '')
  })
  return [
    `@REM Copia de ${original} que hace QubiQ Server Launcher en cada arranque, sin las pausas.`,
    '@REM No la edites: los cambios se pierden. Edita el original.',
    ...lines
  ].join(eol)
}

/**
 * Pone la memoria en `user_jvm_args.txt` cambiando SOLO las opciones de
 * memoria (-Xms/-Xmx). Lo demás que tenga el fichero (el recolector que eligió
 * quien montó el modpack, sus propiedades) se queda como estaba.
 */
export function withMemory(text: string, memoryMb: number): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const kept: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) {
      // Nuestra marca de la vez anterior se vuelve a poner abajo.
      if (!/QubiQ/.test(line)) kept.push(line)
      continue
    }
    const cleaned = line.replace(/(^|\s)-Xm[sx]\S*/gi, '').trim()
    if (cleaned.length > 0) kept.push(cleaned)
    else if (line.trim().length === 0) kept.push(line)
  }
  while (kept.length > 0 && kept[kept.length - 1]!.trim() === '') kept.pop()
  return [
    ...kept,
    '# Memoria: la pone QubiQ Server Launcher en cada arranque (se cambia en la app).',
    ...memoryArgs(memoryMb),
    ''
  ].join(eol)
}

async function applyMemory(serverDir: string, memoryMb: number): Promise<void> {
  const path = join(serverDir, 'user_jvm_args.txt')
  const current = await readFile(path, 'utf8').catch(() => '')
  const next = withMemory(current, memoryMb)
  if (next !== current) await writeFile(path, next, 'utf8')
}

/** Clave del PATH tal como la tiene el proceso: en Windows suele ser `Path`. */
function pathKey(): string {
  return Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
}

/** Variables para que el script encuentre el Java que toca antes que ningún otro. */
export function javaEnv(javaPath: string): Record<string, string> {
  const bin = dirname(javaPath)
  const key = pathKey()
  const current = process.env[key] ?? ''
  return {
    [key]: current ? `${bin};${current}` : bin,
    JAVA_HOME: dirname(bin)
  }
}

export async function customLaunch(
  serverDir: string,
  custom: CustomStart,
  javaPath: string,
  memoryMb: number
): Promise<LaunchSpec> {
  const file = startFilePath(serverDir, custom.startFile)
  if (!(await stat(file).catch(() => null))?.isFile()) {
    throw new Error(
      `No se encuentra el archivo de inicio «${custom.startFile}». ` +
        'Elige otro en Ajustes → Archivo de inicio.'
    )
  }

  if (custom.memory === 'jvm-args') await applyMemory(serverDir, memoryMb)
  const env = javaEnv(javaPath)

  if (extname(file).toLowerCase() === '.jar') {
    return {
      command: javaPath,
      args: [...defaultJvmArgs(memoryMb), '-jar', file, 'nogui'],
      cwd: serverDir,
      env
    }
  }

  // Se arranca la copia sin pausas si hace falta; si no, el original.
  let script = file
  const text = await readFile(file, 'latin1')
  if (analyzeScript(text).pauses) {
    script = join(dirname(file), `${NO_PAUSE_PREFIX}${basename(file)}`)
    await writeFile(script, withoutPauses(text, basename(file)), 'latin1')
  }

  return {
    command: process.env['ComSpec'] || 'cmd.exe',
    // `/s` con comillas por fuera: cmd quita solo las de fuera y ejecuta lo de
    // dentro tal cual. Sin eso, una ruta con paréntesis o varios entrecomillados
    // hace que cmd quite las comillas que no son y parta la ruta por los espacios.
    //
    // `.\` delante: con `NoDefaultCurrentDirectoryInExePath` (equipos
    // endurecidos, algunas herramientas de desarrollo) cmd no busca en la
    // carpeta actual y un `run.bat` a secas «no se reconoce como un comando».
    //
    // `nogui` llega al servidor en los scripts que pasan sus argumentos (`%*`,
    // como el run.bat de Forge y NeoForge). Sin él, Minecraft abre su propia
    // ventana además de la consola de la app.
    args: ['/d', '/s', '/c', `"".\\${relative(serverDir, script)}" nogui"`],
    verbatimArguments: true,
    cwd: serverDir,
    env,
    killTree: true
  }
}
