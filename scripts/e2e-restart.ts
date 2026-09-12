/**
 * Prueba de extremo a extremo del reinicio bajo petición del servidor.
 *
 * Un plugin puede dejar `hardcore-restart.request` en el directorio de trabajo
 * y apagarse; el launcher debe volver a arrancarlo. Lo que se comprueba aquí no
 * es solo que reinicie, sino que **no** reinicie cuando no debe: la parada
 * manual siempre gana.
 *
 * Descarga de verdad y arranca el servidor varias veces, así que tarda unos
 * minutos. Ejecutar con:  npm run e2e:restart
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm, access, writeFile, copyFile, readFile } from 'node:fs/promises'

import { setDataRoot, serverDir } from '../src/main/core/paths'
import { service } from '../src/main/core/service'
import * as catalog from '../src/main/core/versions/catalog'
import type { ServerStatus } from '../src/shared/types'

const PORT = 25598
const REQUEST_FILE = 'hardcore-restart.request'

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'qubiq-restart-'))
  setDataRoot(root)
  await service.initialize()
  console.log(`Datos temporales en ${root}\n`)

  // --- Estado observado a través de los eventos del servicio ----------------

  let status: ServerStatus = 'stopped'
  let startCount = 0
  const systemLines: string[] = []
  const errors: string[] = []
  let lastPhase = ''

  service.on('status', (_id: string, next: ServerStatus) => {
    if (next === 'starting') startCount++
    status = next
  })

  service.on('log', (_id: string, line: { level: string; text: string }) => {
    if (line.level === 'system') systemLines.push(line.text)
    if (line.level === 'error') errors.push(line.text)
  })

  service.on('diagnosis', (_id: string, d: { title: string; detail: string }) => {
    errors.push(`${d.title}: ${d.detail}`)
  })

  service.on('progress', (update: { phase: string; detail?: string }) => {
    if (update.detail && update.phase !== lastPhase) {
      lastPhase = update.phase
      console.log(`  ... ${update.detail}`)
    }
  })

  function waitForStatus(target: ServerStatus, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now()
      const timer = setInterval(() => {
        if (status === target) {
          clearInterval(timer)
          resolve()
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(timer)
          reject(new Error(`Tiempo agotado esperando estado "${target}" (actual: ${status})`))
        }
      }, 250)
    })
  }

  // --- Instalación ----------------------------------------------------------

  const version = await catalog.defaultVersionFor('paper')
  console.log(`== Instalando paper ${version} (esto tarda unos minutos)`)

  const manifest = await service.create({
    name: 'Prueba reinicio',
    distribution: 'paper',
    minecraftVersion: version,
    memoryMb: 2048,
    expectedPlayers: 4,
    port: PORT,
    eulaAccepted: true
  })

  const dir = serverDir(manifest.id)
  const requestPath = join(dir, REQUEST_FILE)

  /** Deja la petición que normalmente escribiría el plugin. */
  async function writeRequest(run: number): Promise<void> {
    await writeFile(
      requestPath,
      JSON.stringify({
        plugin: 'HardcoreUtility',
        reason: 'run-ended',
        run,
        requestedAt: new Date().toISOString()
      }),
      'utf8'
    )
  }

  // --- Opcional: plugin real ------------------------------------------------
  // Solo si se indica el jar; si no, toda la prueba usa el fichero a mano.
  const pluginJar = process.env['HARDCORE_PLUGIN_JAR']
  if (pluginJar && (await exists(pluginJar))) {
    const folder = await service.contentFolder(manifest.id)
    if (folder) {
      await copyFile(pluginJar, join(folder, 'HardcoreUtility.jar'))
      console.log(`  ... plugin real copiado desde ${pluginJar}`)
    }
  }

  console.log('\n== Primer arranque')
  await service.start(manifest.id)
  await waitForStatus('running', 5 * 60_000)
  check('el servidor arranca', status === 'running')

  // --- Caso 1: el plugin pide reiniciar -------------------------------------
  //
  // Se usa sendCommand('stop') y NO service.stop(): este último marca la parada
  // como pedida por el usuario, que es justo lo que anula el reinicio.

  console.log('\n== Caso 1: el servidor pide reiniciarse')
  const startsBefore = startCount
  await writeRequest(12)
  service.sendCommand(manifest.id, 'stop')

  await waitForStatus('stopped', 2 * 60_000)
  check('se apaga al recibir stop', status === 'stopped')

  await waitForStatus('running', 3 * 60_000)
  check('vuelve a arrancar solo', status === 'running')
  check('ha arrancado una vez más', startCount === startsBefore + 1, `${startCount - startsBefore}`)
  check('la petición se ha consumido', !(await exists(requestPath)))
  check(
    'deja constancia en la consola',
    systemLines.some((l) => l.includes('ha pedido reiniciar')),
    systemLines.filter((l) => l.includes('reinicia')).slice(-1)[0]
  )
  check(
    'el mensaje incluye el número de run',
    systemLines.some((l) => l.includes('run #12'))
  )

  // --- Caso 2: sin petición no se reinicia ----------------------------------

  console.log('\n== Caso 2: se apaga sin pedir nada')
  service.sendCommand(manifest.id, 'stop')
  await waitForStatus('stopped', 2 * 60_000)

  const startsAfterStop = startCount
  await sleep(10_000)
  check('sigue parado pasados 10 s', status === 'stopped', status)
  check('no ha vuelto a arrancar', startCount === startsAfterStop)

  // --- Caso 3: la parada manual gana ----------------------------------------

  console.log('\n== Caso 3: parada manual con petición pendiente')
  await service.start(manifest.id)
  await waitForStatus('running', 5 * 60_000)

  await writeRequest(13)
  const startsBeforeManual = startCount
  await service.stop(manifest.id)
  await waitForStatus('stopped', 2 * 60_000)

  await sleep(10_000)
  check('la parada manual impide el reinicio', status === 'stopped', status)
  check('no ha vuelto a arrancar', startCount === startsBeforeManual)
  check('la petición se ha borrado igualmente', !(await exists(requestPath)))
  check(
    'lo explica en la consola',
    systemLines.some((l) => l.includes('se ha parado a mano'))
  )

  // --- Caso 4: arranque manual durante la espera ----------------------------

  console.log('\n== Caso 4: el usuario arranca durante la espera de 3 s')
  await service.start(manifest.id)
  await waitForStatus('running', 5 * 60_000)

  await writeRequest(14)
  const errorsBefore = errors.length
  const startsBeforeRace = startCount
  service.sendCommand(manifest.id, 'stop')
  await waitForStatus('stopped', 2 * 60_000)

  // Arranque manual inmediato: debe cancelar el reinicio programado.
  await service.start(manifest.id)
  await waitForStatus('running', 5 * 60_000)

  await sleep(6_000) // Más que el retardo de reinicio, por si intentara arrancar otra vez.
  check('arranca una sola vez', startCount === startsBeforeRace + 1, `${startCount - startsBeforeRace}`)
  check('sigue en marcha', status === 'running', status)
  check(
    'sin errores de "ya está arrancado"',
    errors.length === errorsBefore,
    errors.slice(errorsBefore).join(' | ')
  )

  // --- Comprobación con el plugin real, si se pidió -------------------------

  if (pluginJar && (await exists(pluginJar))) {
    console.log('\n== Con el plugin real (HARDCORE_PLUGIN_JAR)')
    const startsBeforePlugin = startCount
    service.sendCommand(manifest.id, 'hc endrun')

    await waitForStatus('stopped', 3 * 60_000)
    await waitForStatus('running', 5 * 60_000)
    check('el plugin provoca el reinicio', startCount === startsBeforePlugin + 1)

    const props = await readFile(join(dir, 'server.properties'), 'utf8')
    check(
      'el plugin ha cambiado level-name',
      /level-name=hardcore-run-\d+/.test(props),
      /level-name=.*/.exec(props)?.[0]
    )
    check('la carpeta world ya no existe', !(await exists(join(dir, 'world'))))
  }

  // --- Limpieza -------------------------------------------------------------

  await service.stop(manifest.id)
  await waitForStatus('stopped', 2 * 60_000)
  await service.remove(manifest.id)
  await rm(root, { recursive: true, force: true })

  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} comprobaciones fallidas.`)
  process.exit(failed === 0 ? 0 : 1)
}

void main().catch((err: Error) => {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
})
