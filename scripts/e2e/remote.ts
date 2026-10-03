/**
 * Prueba de extremo a extremo del control remoto (§19.31) contra un Paper de
 * verdad: emparejar, arrancar, leer la consola, mandar un comando, reiniciar y
 * parar, todo por HTTPS y con órdenes firmadas, como lo hace la página remota.
 *
 * El acceso remoto escucha solo en 127.0.0.1: la prueba no se abre a la red.
 * Descarga y arranca el servidor un par de veces, así que tarda unos minutos.
 * Ejecutar con:  npm run e2e:remote
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'

import { setDataRoot } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import { findFreePort } from '../../src/main/core/net/network'
import { RemoteAccess } from '../../src/main/core/remote'
import { serviceOrderHost } from '../../src/main/core/remote/serviceHost'
import * as catalog from '../../src/main/core/games/minecraft/versions/catalog'
import type {
  RemoteArgs,
  RemoteConsoleLine,
  RemoteConsoleResult,
  RemoteListResult,
  RemoteOrder,
  RemotePairResult,
  RemotePermissions,
  RemoteResponse
} from '../../src/shared/remote'
import { newKey, pairBody, postJson, signedOrder, type TestDevice } from '../smoke/remoteClient'

const GAME_PORT = 25597

let failed = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'qubiq-remote-'))
  setDataRoot(root)
  await service.initialize()
  console.log(`Datos temporales en ${root}\n`)

  let lastPhase = ''
  service.on('progress', (update: { phase: string; detail?: string }) => {
    if (update.detail && update.phase !== lastPhase) {
      lastPhase = update.phase
      console.log(`  ... ${update.detail}`)
    }
  })

  const version = await catalog.defaultVersionFor('paper')
  console.log(`== Instalando paper ${version}`)
  const manifest = await service.create({
    game: 'minecraft',
    name: 'Prueba remota',
    expectedPlayers: 4,
    port: GAME_PORT,
    agreements: ['minecraft-eula'],
    options: { distribution: 'paper', minecraftVersion: version, memoryMb: 2048 }
  })
  const id = manifest.id

  const remote = new RemoteAccess({ host: serviceOrderHost(), staticRoot: null, listenHost: '127.0.0.1' })
  await remote.init()
  const port = await findFreePort(18600)
  await remote.setPort(port)
  const status = await remote.setEnabled(true)
  check('acceso remoto escuchando', status.state === 'listening', `puerto ${port}`)

  async function pairAs(permissions: RemotePermissions, name: string): Promise<TestDevice> {
    const invite = await remote.createInvite(permissions)
    const key = newKey('Ed25519')
    const { reply } = await postJson<RemoteResponse<RemotePairResult>>(port, '/api/pair', pairBody(key, invite.code, name))
    if (!reply.ok) throw new Error(`No se pudo emparejar: ${reply.error}`)
    return { ...key, client: reply.data.client }
  }

  async function ask<T>(device: TestDevice, order: RemoteOrder, args: RemoteArgs = {}): Promise<RemoteResponse<T>> {
    const { reply } = await postJson<RemoteResponse<T>>(port, '/api/order', signedOrder(device, order, args, Date.now()))
    return reply
  }

  async function statusOf(device: TestDevice): Promise<string> {
    const reply = await ask<RemoteListResult>(device, 'list')
    return reply.ok ? (reply.data.servers.find((s) => s.id === id)?.status ?? '?') : `error ${reply.error}`
  }

  async function waitStatus(device: TestDevice, target: string, timeoutMs: number): Promise<boolean> {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      if ((await statusOf(device)) === target) return true
      await sleep(1000)
    }
    return false
  }

  /** Lee la consola como la página: pidiendo siempre desde la última línea vista. */
  let next = 0
  const seen: RemoteConsoleLine[] = []
  async function readConsole(device: TestDevice): Promise<void> {
    const reply = await ask<RemoteConsoleResult>(device, 'console', { server: id, after: next })
    if (!reply.ok) return
    next = reply.data.next
    seen.push(...reply.data.lines)
  }
  async function waitConsole(device: TestDevice, pattern: RegExp, timeoutMs: number, from = 0): Promise<boolean> {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      await readConsole(device)
      if (seen.slice(from).some((line) => pattern.test(line.text))) return true
      await sleep(1000)
    }
    return false
  }

  try {
    console.log('\n== Emparejar')
    const admin = await pairAs({ control: true, console: 2, servers: [id] }, 'Administrador')
    const viewer = await pairAs({ control: false, console: 1, servers: [id] }, 'Solo mira')
    const outsider = await pairAs({ control: true, console: 3, servers: [] }, 'Sin servidores')
    check('tres dispositivos emparejados', (await remote.status()).devices.length === 3)
    check('el servidor sale parado', (await statusOf(admin)) === 'stopped')
    const outsiderList = await ask<RemoteListResult>(outsider, 'list')
    check('sin servidores marcados no ve ninguno', outsiderList.ok && outsiderList.data.servers.length === 0)
    const outsiderStart = await ask(outsider, 'start', { server: id })
    check('ni lo puede arrancar', !outsiderStart.ok && outsiderStart.error === 'unknown-server')

    console.log('\n== Arrancar')
    const denied = await ask(viewer, 'start', { server: id })
    check('el que solo mira no puede arrancar', !denied.ok && denied.error === 'forbidden')
    const started = Date.now()
    const start = await ask(admin, 'start', { server: id })
    check('orden de arrancar aceptada', start.ok, start.ok ? undefined : start.error)
    check('llega a «en marcha»', await waitStatus(admin, 'running', 180_000), `${Math.round((Date.now() - started) / 1000)} s`)
    check('la consola remota enseña el arranque', await waitConsole(viewer, /Done \(/, 30_000))
    const again = await ask(admin, 'start', { server: id })
    check('arrancar otra vez: ya está', !again.ok && again.error === 'already-running')
    const listed = await ask<RemoteListResult>(viewer, 'list')
    const summary = listed.ok ? listed.data.servers.find((s) => s.id === id) : undefined
    check(
      'jugadores: lista vacía, con nombres (Minecraft)',
      !!summary && summary.players.length === 0 && summary.playerIds && summary.playerNames,
      JSON.stringify(summary?.players)
    )

    console.log('\n== Consola')
    const mark = seen.length
    const viewerSend = await ask(viewer, 'send', { server: id, command: 'list' })
    check('solo lectura: no puede escribir', !viewerSend.ok && viewerSend.error === 'forbidden')
    const sent = await ask(admin, 'send', { server: id, command: 'list' })
    check('nivel 2: «list» se envía', sent.ok)
    check('y su respuesta sale en la consola remota', await waitConsole(admin, /There are \d+ of a max/, 15_000, mark))
    const op = await ask(admin, 'send', { server: id, command: 'op Atacante' })
    check('nivel 2: «op» no', !op.ok && op.error === 'command-not-allowed')
    await sleep(2000)
    await readConsole(admin)
    check('«op» no llegó al servidor', !seen.some((line) => /Atacante/.test(line.text)))
    check('ninguna IP en la consola remota', !seen.some((line) => /\b\d{1,3}(\.\d{1,3}){3}\b/.test(line.text)))

    console.log('\n== Reiniciar')
    const doneBefore = seen.filter((line) => /Done \(/.test(line.text)).length
    const restartAt = seen.length
    const restart = await ask(admin, 'restart', { server: id })
    check('orden de reiniciar aceptada', restart.ok, restart.ok ? undefined : `${restart.error} ${restart.detail ?? ''}`)
    check('vuelve a arrancar', await waitConsole(admin, /Done \(/, 180_000, restartAt))
    check('arranca una segunda vez', seen.filter((line) => /Done \(/.test(line.text)).length === doneBefore + 1)
    check('y queda en marcha', await waitStatus(admin, 'running', 30_000))
    check('antes se paró limpio', seen.slice(restartAt).some((line) => /Saving|Stopping (the )?server/i.test(line.text)))

    console.log('\n== Parar')
    const stop = await ask(admin, 'stop', { server: id })
    check('orden de parar aceptada', stop.ok)
    check('llega a «parado»', await waitStatus(admin, 'stopped', 120_000))
    const sendStopped = await ask(admin, 'send', { server: id, command: 'list' })
    check('con el servidor parado no se envía nada', !sendStopped.ok && sendStopped.error === 'not-running')

    const activity = await remote.activity(50)
    check('actividad: arrancar, reiniciar, parar y comandos', ['start', 'restart', 'stop', 'send'].every((order) => activity.some((e) => e.order === order && e.result === 'ok')))
    check('actividad: y lo rechazado', activity.some((e) => e.result === 'command-not-allowed') && activity.some((e) => e.result === 'forbidden'))
  } finally {
    await remote.shutdown()
    await service.stopAll()
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }

  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} comprobaciones fallidas.`)
  process.exitCode = failed === 0 ? 0 : 1
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
