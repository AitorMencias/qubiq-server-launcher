import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { check, section } from './harness'
import { guardianExitPath, guardianRecordPath, instanceDir, serverDir } from '../../src/main/core/paths'
import { DirectProcess, pidAlive, type ServerProcess } from '../../src/main/core/runtime/process'
import {
  GuardedProcess,
  guardianExe,
  guardianProblem,
  launchGuarded,
  reattachGuarded,
  rememberGuardianState
} from '../../src/main/core/runtime/guardian'
import { argumentsLine, quoteArg } from '../../src/main/core/runtime/guardian/commandLine'
import { parseExitFile, parseGuardianLine } from '../../src/main/core/runtime/guardian/protocol'

/**
 * El guardián (§19.34): el proceso que se queda con las tuberías del servidor
 * para que la app pueda cerrarse de golpe y volver a conectarse. Se prueba de
 * verdad: se compila con el csc de Windows y se lanzan servidores de mentira
 * en Node.
 */

/** Un servidor de mentira: repite lo que le llega y sale cuando se le pide. */
const ECHO_SERVER = [
  "process.stdout.write('HOLA\\n')",
  "let resto = ''",
  "process.stdin.on('data', (d) => {",
  '  resto += String(d)',
  '  let i',
  "  while ((i = resto.indexOf('\\n')) !== -1) {",
  '    const linea = resto.slice(0, i).replace(/\\r$/, "")',
  '    resto = resto.slice(i + 1)',
  "    if (linea === 'salir') process.exit(0)",
  "    if (linea === 'salir-luego') setTimeout(() => process.exit(3), 1500)",
  "    if (linea === 'menos-uno') process.exit(-1)",
  "    if (linea === 'chorro') { for (let n = 1; n <= 20000; n++) process.stdout.write('N ' + n + '\\n') }",
  "    process.stdout.write('ECO ' + linea + '\\n')",
  '  }',
  '})'
].join('\n')

const ARGV_SERVER = "process.stdout.write(JSON.stringify(process.argv.slice(1)) + '\\n')"

interface Collected {
  lines: string[]
  replays: boolean[]
  exit: number | null | undefined
  errors: string[]
}

function collect(proc: ServerProcess): Collected {
  const got: Collected = { lines: [], replays: [], exit: undefined, errors: [] }
  proc.on('line', (text: string, replay?: boolean) => {
    got.lines.push(text)
    got.replays.push(replay === true)
  })
  proc.on('error', (err: Error) => got.errors.push(err.message))
  proc.once('exit', (code: number | null) => (got.exit = code))
  proc.resume?.()
  return got
}

async function waitFor(condition: () => boolean, ms: number): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (condition()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return condition()
}

async function prepare(id: string): Promise<string> {
  await rm(instanceDir(id), { recursive: true, force: true })
  await mkdir(serverDir(id), { recursive: true })
  return serverDir(id)
}

export async function guardianSmoke(): Promise<void> {
  await section('Guardián: protocolo y línea de órdenes', async () => {
    check('un argumento sin espacios va tal cual', quoteArg('-Xmx2G') === '-Xmx2G')
    check('vacío son dos comillas', quoteArg('') === '""')
    check('con espacios, entre comillas', quoteArg('C:\\Mis juegos\\server.jar') === '"C:\\Mis juegos\\server.jar"')
    check('las comillas se escapan', quoteArg('di "hola"') === '"di \\"hola\\""')
    check('la barra final se duplica', quoteArg('C:\\con espacio\\') === '"C:\\con espacio\\\\"')
    check('verbatim no toca nada', argumentsLine(['/d', '/s', '/c', '"a b"'], true) === '/d /s /c "a b"')

    const line = parseGuardianLine('L\t7\t1700000000000\tdice:\tcon tabuladores')
    check(
      'una línea con tabuladores llega entera',
      line.kind === 'line' && line.seq === 7 && line.text === 'dice:\tcon tabuladores'
    )
    const hello = parseGuardianLine('H\t1\t4242\t1700000000000')
    check('el saludo trae el PID del servidor', hello.kind === 'hello' && hello.serverPid === 4242)
    check('una línea rara no rompe nada', parseGuardianLine('Z\tlo que sea').kind === 'unknown')
    const left = parseExitFile('X\t3221225477\t1700000000000\nL\t1\t1\tuna\nL\t2\t2\totra\n')
    check(
      'el fichero de salida trae código y últimas líneas',
      left?.kind === 'exit' && left.code === 3221225477 && left.lines.map((l) => l.text).join('|') === 'una|otra'
    )
    const failed = parseExitFile('E\tEl sistema no puede encontrar el archivo especificado\n')
    check('y si no se pudo lanzar, por qué', failed?.kind === 'error' && failed.message.includes('archivo'))
  })

  await section('Guardián', async () => {
    const exe = await guardianExe()
    check('se compila con el csc de Windows', exe !== null && existsSync(exe), exe ?? guardianProblem() ?? '')
    if (!exe) return

    // Los argumentos llegan igual que lanzando directo con Node.
    const tricky = [
      'simple',
      'con espacio',
      'con"comilla',
      'barra\\',
      'C:\\Ruta con espacios\\fin\\',
      '',
      'tab\taquí',
      'a\\\\"b',
      'ñandú €'
    ]
    const argvDir = await prepare('guardian-argv')
    const direct = collect(
      new DirectProcess({ command: process.execPath, args: ['-e', ARGV_SERVER, ...tricky], cwd: argvDir })
    )
    const guardedArgv = await launchGuarded('guardian-argv', {
      command: process.execPath,
      args: ['-e', ARGV_SERVER, ...tricky],
      cwd: argvDir
    })
    const viaGuardian = collect(guardedArgv!)
    await waitFor(() => direct.exit !== undefined && viaGuardian.exit !== undefined, 15_000)
    check(
      'los argumentos llegan igual que lanzando directo',
      direct.lines[0] !== undefined && direct.lines[0] === viaGuardian.lines[0],
      viaGuardian.lines[0]
    )

    // --- Un servidor que sigue con la app «cerrada» ---------------------------
    const id = 'guardian-eco'
    const cwd = await prepare(id)
    const proc = (await launchGuarded(id, { command: process.execPath, args: ['-e', ECHO_SERVER], cwd })) as GuardedProcess
    check('arranca a través del guardián', proc instanceof GuardedProcess)
    const first = collect(proc)
    check('llega su salida', await waitFor(() => first.lines.includes('HOLA'), 10_000))
    check('el PID es el del servidor, no el del guardián', !!proc.pid && proc.pid !== proc.record.guardianPid && pidAlive(proc.pid))

    proc.writeStdin('hola\n')
    proc.writeStdin('ñandú €\n')
    proc.writeStdin('dos\tcampos\n')
    check('le llegan las órdenes', await waitFor(() => first.lines.includes('ECO hola'), 5_000))
    check('con tildes y euros', await waitFor(() => first.lines.includes('ECO ñandú €'), 5_000))
    check('y con tabuladores', await waitFor(() => first.lines.includes('ECO dos\tcampos'), 5_000))
    check('nada sale como repetido en un arranque', !first.replays.some(Boolean))

    // Lo visto hasta aquí, apuntado como lo apunta el servicio.
    await rememberGuardianState(id, {
      seq: proc.lastLine,
      ready: true,
      players: ['Ana'],
      playerCount: null,
      joinCode: null
    })
    const startedAt = proc.startedAt
    proc.detach()
    await new Promise((r) => setTimeout(r, 300))
    check('soltar la conexión no para el servidor', pidAlive(proc.pid!))

    // Mientras la app no está, el servidor sigue diciendo cosas.
    // (Se le habla desde una segunda conexión, como haría la app al volver.)
    const again = await reattachGuarded(id)
    check('al volver, se reengancha', again?.kind === 'attached')
    if (again?.kind !== 'attached') return
    check('con lo que se sabía', again.record.state?.players.join() === 'Ana' && again.record.state.ready)
    check('y la hora de arranque de verdad', again.process.startedAt === startedAt)
    const second = collect(again.process)
    await waitFor(() => second.lines.includes('ECO dos\tcampos'), 5_000)
    check(
      'lo ya visto llega marcado como repetido',
      second.lines.length >= 4 && second.replays.slice(0, 4).every(Boolean),
      `${second.lines.length} líneas`
    )
    again.process.writeStdin('después\n')
    check('y se le pueden mandar órdenes otra vez', await waitFor(() => second.lines.includes('ECO después'), 5_000))
    check(
      'lo nuevo no sale como repetido',
      second.replays[second.lines.indexOf('ECO después')] === false
    )

    // Un chorro de líneas no atasca nada ni se pierde ninguna.
    again.process.writeStdin('chorro\n')
    check(
      'veinte mil líneas seguidas llegan todas',
      await waitFor(() => second.lines.includes('ECO chorro'), 30_000) &&
        second.lines.filter((l) => l.startsWith('N ')).length === 20_000
    )

    // Sale con la app «cerrada»: deja dicho cómo.
    again.process.writeStdin('salir-luego\n')
    await waitFor(() => second.lines.includes('ECO salir-luego'), 5_000)
    again.process.detach()
    await waitFor(() => existsSync(guardianExitPath(id)), 10_000)
    const exited = await reattachGuarded(id)
    check(
      'si sale con la app cerrada, al volver se sabe con qué código',
      exited?.kind === 'exited' && exited.code === 3,
      exited?.kind
    )
    check(
      'y con sus últimas líneas para diagnosticar',
      exited?.kind === 'exited' && exited.lines.includes('ECO salir-luego')
    )
    check(
      'y no queda nada suyo',
      !existsSync(guardianRecordPath(id)) && !existsSync(guardianExitPath(id))
    )
    check('ni hay nada que recuperar la vez siguiente', (await reattachGuarded(id)) === null)

    // --- Sale con la app abierta ---------------------------------------------
    const live = (await launchGuarded(id, { command: process.execPath, args: ['-e', ECHO_SERVER], cwd })) as GuardedProcess
    const third = collect(live)
    await waitFor(() => third.lines.includes('HOLA'), 10_000)
    live.writeStdin('salir\n')
    check('la salida llega con su código', (await waitFor(() => third.exit !== undefined, 10_000)) && third.exit === 0)
    await new Promise((r) => setTimeout(r, 1_500))
    check(
      'y no deja fichero que al volver pareciera un cierre con la app cerrada',
      !existsSync(guardianExitPath(id)) && !existsSync(guardianRecordPath(id))
    )
    // Su carpeta queda libre (el guardián no trabaja en ella).
    await rm(cwd, { recursive: true })
    check('la carpeta del servidor se puede borrar en cuanto sale', !existsSync(cwd))
    await mkdir(cwd, { recursive: true })

    // --- Los códigos de salida, igual que directo --------------------------------
    const directExit = collect(
      new DirectProcess({ command: process.execPath, args: ['-e', 'process.exit(-1)'], cwd })
    )
    const guardedExit = collect(
      (await launchGuarded(id, { command: process.execPath, args: ['-e', 'process.exit(-1)'], cwd }))!
    )
    await waitFor(() => directExit.exit !== undefined && guardedExit.exit !== undefined, 10_000)
    check(
      'un código negativo sale igual que lanzando directo',
      directExit.exit === guardedExit.exit,
      `${directExit.exit} / ${guardedExit.exit}`
    )

    // --- Forzar el cierre -------------------------------------------------------
    const stuck = (await launchGuarded(id, { command: process.execPath, args: ['-e', ECHO_SERVER], cwd })) as GuardedProcess
    const fourth = collect(stuck)
    await waitFor(() => fourth.lines.includes('HOLA'), 10_000)
    stuck.kill(true)
    check('matarlo llega como salida', await waitFor(() => fourth.exit !== undefined, 10_000))

    // --- Un ejecutable que no existe ------------------------------------------
    const missing = await launchGuarded(id, { command: join(cwd, 'no-existe.exe'), args: [], cwd })
    const fifth = collect(missing!)
    await waitFor(() => fifth.exit !== undefined, 15_000)
    check(
      'si no se puede lanzar, avisa como lanzando directo',
      fifth.errors.length === 1 && fifth.exit === null,
      fifth.errors[0]
    )
    check('y no deja nada para recuperar', (await reattachGuarded(id)) === null)

    await rm(instanceDir(id), { recursive: true, force: true })
    await rm(instanceDir('guardian-argv'), { recursive: true, force: true })
    // Que la versión compilada esté donde se espera.
    check('el guardián vive en tools/guardian', (await readFile(exe)).length > 0 && exe.includes(join('tools', 'guardian')))
  })
}
