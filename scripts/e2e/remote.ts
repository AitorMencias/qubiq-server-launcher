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
import { RemoteLinks } from '../../src/main/core/remote/links'
import * as catalog from '../../src/main/core/games/minecraft/versions/catalog'
import type {
  RemoteArgs,
  RemoteConsoleLine,
  RemoteConsoleResult,
  RemoteJournalResult,
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

    // En el historial del servidor, cada cosa con el dispositivo que la pidió.
    // Lo rechazado no llega al servidor, así que tampoco al historial.
    const historial = (await service.listJournal(id, 100)).reverse()
    const desde = (kind: string): number =>
      historial.filter((e) => e.kind === kind && 'by' in e && e.by === 'Administrador').length
    check(
      'historial: arrancar (2), parar (2) y la orden, desde «Administrador»',
      desde('start') === 2 && desde('stop') === 2 && desde('command') === 1,
      historial.map((e) => `${e.kind}${'by' in e && e.by ? `@${e.by}` : ''}`).join(', ')
    )
    // Paper guarda al preparar el mundo, antes de estar listo: eso no cuenta.
    // Sí cada parada (la del reinicio y la final).
    check(
      'historial: un guardado por parada, ninguno del arranque',
      historial.filter((e) => e.kind === 'save').length === 2 &&
        historial.findIndex((e) => e.kind === 'save') > historial.findIndex((e) => e.kind === 'command')
    )
    // Y lo mismo por la orden `journal`, como lo ve la página: el que solo
    // mira también puede, y llega lo más reciente primero.
    const remoto = await ask<RemoteJournalResult>(viewer, 'journal', { server: id })
    check(
      'historial remoto: el que solo mira lo ve, empezando por la última parada',
      remoto.ok && remoto.data.entries.length === historial.length && remoto.data.entries[0]?.kind === 'stop',
      remoto.ok ? `${remoto.data.entries.length} entradas` : remoto.error
    )
    const ajeno = await ask(outsider, 'journal', { server: id })
    check('historial remoto: el de otros servidores no', !ajeno.ok && ajeno.error === 'unknown-server')
    check(
      'historial: ni «op» ni lo de «Solo mira»',
      !historial.some((e) => e.kind === 'command' && /Atacante/.test(e.command)) &&
        !historial.some((e) => 'by' in e && e.by === 'Solo mira')
    )

    // --- Otro QubiQ como cliente (0.13.0) -------------------------------------
    // El núcleo del cliente de verdad (`RemoteLinks`), con su propia carpeta y
    // un cifrado de prueba en lugar de DPAPI, contra este mismo anfitrión.
    console.log('\n== Otro QubiQ como cliente')
    const links = new RemoteLinks({
      secrets: {
        available: () => true,
        encrypt: (plain) => Buffer.from(plain).reverse().toString('base64'),
        decrypt: (sealed) => Buffer.from(sealed, 'base64').reverse().toString()
      },
      dir: () => join(root, 'cliente'),
      pollMs: 60_000
    })
    await links.init()
    const probe = await links.probe(`127.0.0.1:${port}`)
    check('cliente: ve la huella del anfitrión', probe.ok && probe.data.fingerprint === status.fingerprint)
    const invite = await remote.createInvite({ control: true, console: 2, servers: [id] })
    const paired = await links.pair({
      address: `127.0.0.1:${port}`,
      fingerprint: probe.ok ? probe.data.fingerprint : '',
      code: invite.code,
      name: 'QubiQ cliente'
    })
    check('cliente: emparejado', paired.ok, paired.ok ? undefined : paired.error)
    const linkId = paired.ok ? paired.data.id : ''
    const remoteStatus = async (): Promise<string> => {
      await links.refresh(linkId)
      return links.state().links[0]?.list?.servers.find((s) => s.id === id)?.status ?? '?'
    }
    const clientStart = await links.order(linkId, 'start', { server: id })
    check('cliente: arrancar', clientStart.ok, clientStart.ok ? undefined : clientStart.error)
    let running = false
    for (let i = 0; i < 180 && !running; i++) {
      running = (await remoteStatus()) === 'running'
      if (!running) await sleep(1000)
    }
    check('cliente: lo ve en marcha', running)
    const sentByClient = await links.order(linkId, 'send', { server: id, command: 'list' })
    check('cliente: «list» por la consola', sentByClient.ok)
    let answered = false
    let after = 0
    for (let i = 0; i < 15 && !answered; i++) {
      const lines = await links.order(linkId, 'console', { server: id, after })
      if (lines.ok) {
        const data = lines.data as RemoteConsoleResult
        after = data.next
        answered = data.lines.some((line) => /There are \d+ of a max/.test(line.text))
      }
      if (!answered) await sleep(1000)
    }
    check('cliente: y lee la respuesta', answered)
    const clientStop = await links.order(linkId, 'stop', { server: id })
    check('cliente: parar', clientStop.ok)
    let stopped = false
    for (let i = 0; i < 120 && !stopped; i++) {
      stopped = (await remoteStatus()) === 'stopped'
      if (!stopped) await sleep(1000)
    }
    check('cliente: lo ve parado', stopped)
    const clientJournal = await links.order(linkId, 'journal', { server: id })
    const clientEntries = clientJournal.ok ? (clientJournal.data as RemoteJournalResult).entries : []
    check(
      'cliente: en el historial con su nombre',
      ['start', 'command', 'stop'].every((kind) => clientEntries.some((e) => e.kind === kind && 'by' in e && e.by === 'QubiQ cliente'))
    )
    const removed = await links.remove(linkId)
    check('cliente: quitar avisa y el anfitrión lo olvida', removed.ok && removed.data.notified && !(await remote.status()).devices.some((d) => d.name === 'QubiQ cliente'))
    links.shutdown()
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
