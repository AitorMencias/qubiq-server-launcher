/**
 * Prueba de extremo a extremo de un servidor a medida (§19.x).
 *
 * Monta un «server pack» de verdad en una carpeta que no es de QubiQ (como si
 * el usuario lo hubiera descargado): NeoForge instalado con su instalador
 * oficial, que deja su run.bat con `pause` al final y su user_jvm_args.txt.
 * Después lo trae como lo haría el asistente y comprueba lo que importa:
 *
 *   - la carpeta se MUEVE: deja de estar donde estaba y llega entera;
 *   - arranca con su run.bat, pero con el Java de la app (no el del PATH);
 *   - la memoria elegida llega a user_jvm_args.txt sin perder lo demás;
 *   - Parar lo cierra limpio y enseguida, sin quedarse en el `pause`;
 *   - con un script que se reinicia solo, forzar el cierre mata también Java.
 *
 * Todo con datos aislados en un temporal. Ejecutar con:  npm run e2e:custom
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

import { setDataRoot, setResourcesRoot, serverDir } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import * as java from '../../src/main/core/games/minecraft/java/manager'
import * as neoforge from '../../src/main/core/games/minecraft/versions/neoforge'
import { neoforgeInstaller } from '../../src/main/core/games/minecraft/install/neoforge'
import { inspectFolder } from '../../src/main/core/games/minecraft/custom/inspect'
import { runPowerShell, psQuote } from '../../src/main/core/system/powershell'
import { minecraftOf } from '../../src/shared/games/minecraft/types'

const MINECRAFT = '1.21.1'
const PORT = 25598

let failed = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Se pone a true si el servidor se cierra solo: esperar a «Done» ya no tiene sentido. */
let exited = false

function waitFor(predicate: () => boolean, timeoutMs: number, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (exited && !predicate()) {
        clearInterval(timer)
        reject(new Error(`El servidor se cerró antes de: ${what}`))
      } else if (predicate()) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`Tiempo agotado esperando: ${what}`))
      }
    }, 250)
  })
}

/** true si nadie escucha en el puerto: el servidor (y su Java) se ha cerrado de verdad. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)))
  })
}

/** Procesos java.exe que salen del Java que instaló la app en esta prueba. */
async function javaProcessesUnder(root: string): Promise<string[]> {
  const { stdout } = await runPowerShell(
    `Get-CimInstance Win32_Process -Filter "Name='java.exe'" | ` +
      `Where-Object { $_.ExecutablePath -like (${psQuote(root)} + '*') } | ` +
      'ForEach-Object { $_.ProcessId }'
  )
  return stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'qubiq-e2e-custom-'))
  const data = join(root, 'datos')
  // La carpeta «del usuario» va FUERA de los datos de QubiQ, como en la vida real.
  const userSide = join(root, 'usuario')
  const pack = join(userSide, 'Mi Pack (NeoForge)')
  setDataRoot(data)
  setResourcesRoot(join(process.cwd(), 'resources'))
  await service.initialize()
  console.log(`Datos temporales en ${root}\n`)

  let ready = false
  const logs: string[] = []
  service.on('log', (_id: string, line: { text: string }) => {
    logs.push(line.text)
    if (/Done \(/.test(line.text)) ready = true
  })
  service.on('status', (_id: string, status: string) => {
    if (status === 'crashed' || status === 'stopped') exited = true
    if (status === 'starting') exited = false
  })
  service.on('progress', (u: { phase: string; detail?: string }) => {
    if (u.phase === 'move' && u.detail) console.log(`  ... ${u.detail}`)
  })

  // --- 1. Un server pack de verdad, fuera de QubiQ --------------------------------

  console.log(`== Montando un server pack de NeoForge ${MINECRAFT} fuera de QubiQ`)
  const runtime = await java.ensureJava(21)
  const build = await neoforge.resolveBuild(MINECRAFT)
  await mkdir(pack, { recursive: true })
  await neoforgeInstaller.install({
    instanceId: 'pack',
    serverDir: pack,
    minecraftVersion: MINECRAFT,
    build: build.version,
    javaPath: runtime.javaPath,
    memoryMb: 2048,
    onProgress: () => undefined
  })
  await writeFile(join(pack, 'server.properties'), `server-port=${PORT}\r\nmax-players=6\r\n`)
  // Lo que suele traer un pack en user_jvm_args: su recolector y su memoria.
  const originalJvmArgs = await readFile(join(pack, 'user_jvm_args.txt'), 'utf8')
  await writeFile(join(pack, 'user_jvm_args.txt'), `${originalJvmArgs}\r\n-XX:+UseG1GC\r\n-Xmx8G\r\n`)
  const runBat = await readFile(join(pack, 'run.bat'), 'utf8')
  check('el instalador oficial deja run.bat', runBat.includes('user_jvm_args.txt'))
  check('y termina en pause (el caso a resolver)', /^\s*pause\s*$/im.test(runBat))

  // --- 2. Reconocerlo -------------------------------------------------------------

  console.log('\n== Reconocer la carpeta')
  const found = await inspectFolder(pack)
  check('se puede traer', found.problems.length === 0, found.problems.join(' | '))
  check('reconoce NeoForge', found.distribution === 'neoforge', found.distribution ?? '')
  check('y Minecraft 1.21.1', found.minecraftVersion === MINECRAFT, found.minecraftVersion ?? '')
  check('propone run.bat', found.suggestedStartFile === 'run.bat')
  const run = found.startFiles.find((f) => f.path === 'run.bat')
  check('la memoria irá a user_jvm_args.txt', run?.memory === 'jvm-args', run?.memory)

  // --- 3. Traerlo -----------------------------------------------------------------

  console.log('\n== Traerlo a QubiQ')
  const manifest = await service.create({
    game: 'minecraft',
    name: 'Pack traído',
    expectedPlayers: 6,
    port: PORT,
    agreements: ['minecraft-eula'],
    options: {
      distribution: 'neoforge',
      minecraftVersion: MINECRAFT,
      memoryMb: 3072,
      import: { folder: pack, startFile: 'run.bat' }
    }
  })
  const dir = serverDir(manifest.id)
  const data1 = minecraftOf((await service.get(manifest.id)).manifest).data
  check('la carpeta original ya no está', !(await exists(pack)))
  check('está en QubiQ con su run.bat', await exists(join(dir, 'run.bat')))
  check('y con sus librerías', await exists(join(dir, 'libraries', 'net', 'neoforged', 'neoforge', build.version, 'win_args.txt')))
  check('ya no está pendiente de traer', data1.custom?.importFrom === undefined)
  check('recuerda el archivo de inicio', data1.custom?.startFile === 'run.bat')
  check('apunta el build reconocido', data1.build === build.version, data1.build)
  check('acepta el EULA', /eula=true/.test(await readFile(join(dir, 'eula.txt'), 'utf8')))
  check('conserva el puerto', (await service.minecraft.getProperties(manifest.id))['server-port'] === String(PORT))

  // --- 4. Arrancar y parar ----------------------------------------------------------

  console.log('\n== Arrancar con su run.bat')
  await service.start(manifest.id)
  try {
    await waitFor(() => ready, 5 * 60_000, 'que el servidor termine de arrancar')
  } catch (err) {
    console.error(logs.slice(-15).join('\n'))
    throw err
  }
  check('arranca y llega a Done', ready)
  check('arranca la copia sin pausas', await exists(join(dir, 'qubiq-run.bat')))
  const jvm = await readFile(join(dir, 'user_jvm_args.txt'), 'utf8')
  check('la memoria elegida está en user_jvm_args', jvm.includes('-Xmx3072M'), jvm.split(/\r?\n/).filter((l) => l.includes('Xm')).join(' '))
  check('y la del pack ya no', !/^-Xmx8G/m.test(jvm))
  check('sin perder lo demás', jvm.includes('-XX:+UseG1GC'))
  const ours = await javaProcessesUnder(data)
  check('usa el Java de la app, no el del PATH', ours.length === 1, `${ours.length} procesos`)
  check('sin ventana propia de Minecraft (nogui llega)', !logs.some((l) => /Server GUI|MinecraftServerGui/i.test(l)))

  logs.length = 0
  await service.sendCommand(manifest.id, 'list')
  await waitFor(() => logs.some((l) => /players online/i.test(l)), 15_000, 'la respuesta a list')
  check('los comandos llegan a través de cmd', true)

  const t0 = Date.now()
  await service.stop(manifest.id)
  const stopSeconds = (Date.now() - t0) / 1000
  check('Parar lo cierra limpio, sin esperar al pause', stopSeconds < 30, `${stopSeconds.toFixed(1)} s`)
  check('guardó el mundo', logs.some((l) => /Saving worlds|All dimensions are saved|Saved the/i.test(l)))
  check('el puerto queda libre', await portFree(PORT))
  check('no queda ningún Java suyo', (await javaProcessesUnder(data)).length === 0)

  // --- 5. Un script que se reinicia solo ---------------------------------------------

  console.log('\n== Script con reinicio automático (se tiene que forzar)')
  await writeFile(
    join(dir, 'bucle.bat'),
    [
      '@echo off',
      ':start',
      `java @user_jvm_args.txt @libraries/net/neoforged/neoforge/${build.version}/win_args.txt nogui`,
      'goto start',
      ''
    ].join('\r\n')
  )
  const files = await service.minecraft.startFiles(manifest.id)
  check('lo ofrece como inicio', files.some((f) => f.path === 'bucle.bat'))
  check('y avisa del bucle', files.find((f) => f.path === 'bucle.bat')?.restartLoop === true)
  check('no ofrece la copia sin pausas', !files.some((f) => f.path.startsWith('qubiq-')))
  await service.minecraft.setStartFile(manifest.id, 'bucle.bat')

  ready = false
  await service.start(manifest.id)
  await waitFor(() => ready, 5 * 60_000, 'que arranque el del bucle')
  const t1 = Date.now()
  await service.stop(manifest.id)
  console.log(`  ... parado en ${((Date.now() - t1) / 1000).toFixed(0)} s`)
  // El bucle vuelve a lanzar Java tras el stop: la app tiene que forzar y
  // llevarse por delante también a ese Java, no solo a cmd.
  await new Promise((r) => setTimeout(r, 2000))
  check('forzar el cierre mata también a Java', (await javaProcessesUnder(data)).length === 0)
  check('y el puerto queda libre', await portFree(PORT))

  // --- 6. Borrar ---------------------------------------------------------------------

  console.log('\n== Borrar')
  await service.remove(manifest.id)
  check('la carpeta desaparece', !(await exists(dir)))

  await rm(root, { recursive: true, force: true }).catch(() => undefined)
  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} comprobaciones fallidas.`)
  process.exit(failed === 0 ? 0 : 1)
}

void main().catch((err: Error) => {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
})
