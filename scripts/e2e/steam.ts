/**
 * Prueba de extremo a extremo de los cimientos de Steam (fase 1), con
 * servidores de verdad:
 *
 * 1. SteamCMD: descarga, firma de Valve y autoactualización.
 * 2. Instalación anónima del servidor de Valheim (~2 GB) con progreso en vivo.
 * 3. Segunda ejecución: solo comprueba, no descarga.
 * 4. Comprobación de actualizaciones contra Steam.
 * 5. Arranque y parada con Ctrl+Break: el mundo se guarda y el proceso sale solo.
 *
 * Lo descargado se guarda entre ejecuciones en %LOCALAPPDATA%\qubiq-dev\e2e-steam
 * (no en %TEMP%, que Windows puede vaciar) para no bajar gigas cada vez. `--limpio` lo borra antes y lo prueba todo desde cero.
 *
 * Ejecutar con:  npm run e2e:steam  [-- --limpio]
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { access, mkdir, readdir, rm } from 'node:fs/promises'

import { setDataRoot } from '../../src/main/core/paths'
import {
  appUpdate,
  checkAppUpdate,
  ensureSteamCmd,
  steamCmdPath
} from '../../src/main/core/tools/steamcmd'
import { ServerSupervisor } from '../../src/main/core/runtime/supervisor'
import { isUdpPortInUse } from '../../src/main/core/net/network'
import type { SteamCmdPhase } from '../../src/main/core/tools/steamcmdOutput'

const VALHEIM_APP = 896660
const PORT = 2466

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

async function main(): Promise<void> {
  const root = join(process.env['LOCALAPPDATA'] ?? tmpdir(), 'qubiq-dev', 'e2e-steam')
  if (process.argv.includes('--limpio')) await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
  setDataRoot(root)
  await mkdir(join(root, 'cache'), { recursive: true })
  console.log(`Datos en ${root}\n`)

  // --- 1. SteamCMD -------------------------------------------------------------

  console.log('== SteamCMD')
  const hadSteamCmd = await exists(steamCmdPath())
  const t0 = Date.now()
  await ensureSteamCmd((detail) => console.log(`  ... ${detail}`))
  check(
    hadSteamCmd ? 'ya estaba preparado' : 'descargado, firmado por Valve y actualizado',
    await exists(steamCmdPath()),
    `${((Date.now() - t0) / 1000).toFixed(1)} s`
  )

  // --- 2. Instalación ------------------------------------------------------------

  console.log('\n== Instalación de Valheim')
  const installDir = join(root, 'servers', 'valheim')
  const phases = new Set<SteamCmdPhase>()
  let lastPercent = -1
  let updates = 0
  const t1 = Date.now()
  const first = await appUpdate({
    appId: VALHEIM_APP,
    installDir,
    onProgress: (progress, label) => {
      updates++
      phases.add(progress.phase)
      const percent = Math.floor(progress.fraction * 100)
      if (percent >= lastPercent + 20 || progress.phase !== 'downloading') {
        lastPercent = percent
        console.log(`  ... ${label} ${percent} %`)
      }
    }
  })
  check('instalado', await exists(join(installDir, 'valheim_server.exe')), `${((Date.now() - t1) / 1000).toFixed(0)} s`)
  check('build anotado', first.buildId !== null, first.buildId ?? '')
  if (first.alreadyUpToDate) {
    console.log('  (ya estaba instalado de una ejecución anterior: sin progreso que comprobar)')
  } else {
    check('progreso en vivo durante la descarga', updates > 0 && phases.has('downloading'), `${updates} avisos`)
  }

  // --- 3. Segunda ejecución --------------------------------------------------------

  const t2 = Date.now()
  const second = await appUpdate({ appId: VALHEIM_APP, installDir })
  const secondMs = Date.now() - t2
  check('la segunda vez solo comprueba', second.alreadyUpToDate, `${(secondMs / 1000).toFixed(1)} s`)

  // --- 4. Actualizaciones ------------------------------------------------------------

  const update = await checkAppUpdate(VALHEIM_APP, installDir)
  check(
    'recién instalado no hay actualización pendiente',
    update.installed !== null && update.latest !== null && !update.available,
    `instalado ${update.installed}, publicado ${update.latest}`
  )

  // --- 5. Arranque y Ctrl+Break --------------------------------------------------------

  console.log('\n== Arranque y parada con Ctrl+Break')
  const saves = join(root, `saves-${Date.now()}`)
  const supervisor = new ServerSupervisor('valheim-e2e')
  const lines: string[] = []
  let exitCode: number | null | undefined
  supervisor.on('log', (line: { text: string }) => lines.push(line.text))
  supervisor.on('exit', (code: number | null) => (exitCode = code))

  supervisor.start({
    // El servidor de Valheim lo necesita para iniciar la API de Steam cuando no
    // se lanza desde el cliente (lo pone su propio .bat).
    env: { SteamAppId: '892970' },
    command: join(installDir, 'valheim_server.exe'),
    args: [
      '-nographics', '-batchmode', '-name', 'QubiQ e2e', '-port', String(PORT), '-world', 'E2E',
      '-password', 'qubiq-e2e', '-public', '0', '-savedir', saves
    ],
    cwd: installDir,
    stop: { kind: 'ctrl-break', graceMs: 60_000 },
    parseLine: (raw) => ({ level: 'info', text: raw, ready: /Opened Steam server/.test(raw) }),
    diagnoseExit: (code) => ({ code: 'exit', title: 'Valheim se cerró', detail: `Código ${code}` })
  })

  const ready = await supervisor.waitForLog(/Opened Steam server/, 5 * 60_000)
  check('arranca y abre el servidor', ready)
  check('ocupa su puerto UDP', await isUdpPortInUse(PORT), String(PORT))

  // Margen para que termine de generar el mundo antes de pedir el cierre: un
  // Ctrl+Break durante la generación se ignora (visto en el prototipo).
  await new Promise((r) => setTimeout(r, 20_000))

  const t3 = Date.now()
  await supervisor.stop()
  const stopMs = Date.now() - t3
  check('sale solo, sin matarlo', exitCode === 0 && stopMs < 30_000, `código ${exitCode} en ${(stopMs / 1000).toFixed(1)} s`)
  check('guarda el mundo al cerrar', lines.some((l) => /World save \(5\/5\) done/.test(l)))
  const worldFiles = await readdir(join(saves, 'worlds_local')).catch(() => [])
  check('el mundo está en la carpeta indicada', worldFiles.length > 0, worldFiles.join(', '))
  check('suelta el puerto', !(await isUdpPortInUse(PORT)))

  await rm(saves, { recursive: true, force: true })
  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} fallos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
