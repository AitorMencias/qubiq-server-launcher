import { join } from 'node:path'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:https'

import { check, section } from './harness'
import { ALL, FakeHost, freshRemote } from './remote'
import { newKey, pairBody, signedOrder, type TestDevice } from './remoteClient'
import { dataRoot } from '../../src/main/core/paths'
import { findFreePort } from '../../src/main/core/net/network'
import { RemoteLinks, type SecretBox } from '../../src/main/core/remote/links'
import { cleanConsole, cleanJournal, cleanList } from '../../src/main/core/remote/sanitize'
import {
  REMOTE_ORDERS,
  formatRemoteAddress,
  parseRemoteAddress,
  sameFingerprint,
  type RemoteConsoleResult,
  type RemoteJournalResult,
  type RemoteLink,
  type RemoteLinksState,
  type RemotePairResult,
  type RemoteResponse
} from '../../src/shared/remote'

/**
 * QubiQ como cliente de otro QubiQ (0.13.0): `RemoteLinks` contra un
 * `RemoteAccess` de verdad, los dos en este proceso y con el certificado real
 * de Windows, por HTTPS en 127.0.0.1.
 *
 * Lo importante, otra vez, es lo que NO pasa: con una huella que no es la
 * fijada no sale ni el código ni una orden; la clave no queda en claro; desde
 * la interfaz no se puede mandar `forget`; un anfitrión que contesta cosas
 * raras no llega roto a la pantalla.
 */

/** Un `SecretBox` de prueba: reversible, pero el texto guardado no es la clave. */
function fakeSecrets(available = true): SecretBox & { broken: boolean } {
  return {
    broken: false,
    available: () => available,
    encrypt: (plain) => `sellado:${Buffer.from(plain, 'utf8').reverse().toString('base64')}`,
    decrypt(sealed) {
      if (this.broken || !sealed.startsWith('sellado:')) throw new Error('DPAPI: otro usuario')
      return Buffer.from(sealed.slice(8), 'base64').reverse().toString('utf8')
    }
  }
}

function linkOf(state: RemoteLinksState, id: string): RemoteLink | undefined {
  return state.links.find((link) => link.id === id)
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
}

export async function remoteLinksSmoke(): Promise<void> {
  await section('Remoto (cliente): direcciones y huellas', async () => {
    const cases: [string, string | null][] = [
      ['192.168.1.5', '192.168.1.5:8443'],
      ['192.168.1.5:9000', '192.168.1.5:9000'],
      [' https://Casa.Example.org:443/ ', 'casa.example.org:443'],
      ['[fe80::1]:8443', '[fe80::1]:8443'],
      ['fe80::1', '[fe80::1]:8443'],
      ['salon-pc', 'salon-pc:8443'],
      ['http://1.2.3.4', null],
      ['1.2.3.4:0', null],
      ['1.2.3.4:70000', null],
      ['user@1.2.3.4', null],
      ['1.2.3.4/api/order', null],
      ['C:\\Windows', null],
      ['..', null],
      ['', null]
    ]
    for (const [input, expected] of cases) {
      const parsed = parseRemoteAddress(input)
      const got = parsed ? formatRemoteAddress(parsed) : null
      check(`dirección ${JSON.stringify(input)}`, got === expected, String(got))
    }
    const fp = Array.from({ length: 32 }, (_, i) => (i * 7).toString(16).padStart(2, '0').toUpperCase()).join(':')
    check('huella: igual con o sin «:» y en minúsculas', sameFingerprint(fp, fp.replace(/:/g, '').toLowerCase()))
    check('huella: distinta', !sameFingerprint(fp, fp.replace(/^../, 'FF')))
    check('huella: corta no vale', !sameFingerprint('AB:CD', 'AB:CD'))
    check('la orden forget existe', (REMOTE_ORDERS as readonly string[]).includes('forget'))
  })

  await section('Remoto (cliente): respuestas raras', async () => {
    const list = cleanList({
      host: 'PC',
      device: 'yo',
      permissions: { control: 'sí', console: 7, servers: ['a', 5] },
      allowedCommands: { minecraft: ['list', 3], inventado: ['x'] },
      servers: [
        { id: 'a', name: 'Bueno', game: 'minecraft', status: 'running', players: ['Steve', {}], playerCount: -1 },
        { id: 'b', name: 'Juego nuevo', game: 'juego-del-futuro', status: 'running' },
        { id: 'c', name: 'Estado raro', game: 'rust', status: 'explotando' },
        { name: 'Sin id', game: 'rust', status: 'stopped' },
        'basura'
      ]
    })
    check('lista: solo el servidor bueno', list?.servers.length === 1 && list.servers[0]?.id === 'a')
    check('lista: jugadores solo texto', JSON.stringify(list?.servers[0]?.players) === '["Steve"]')
    check('lista: número negativo descartado', list?.servers[0]?.playerCount === null)
    check('lista: permisos raros a lo seguro', list?.permissions.control === false && list.permissions.console === 1)
    check('lista: comandos de juegos conocidos', JSON.stringify(list?.allowedCommands) === '{"minecraft":["list"]}')
    check('lista: sin servidores no es lista', cleanList({ host: 'x' }) === null && cleanList(null) === null)

    const console = cleanConsole({
      next: 3,
      lines: [
        { seq: 1, ts: 1, level: 'warn', text: 'hola' },
        { seq: 2, ts: 2, level: 'raro', text: 'x'.repeat(5000) },
        { seq: 'tres', ts: 3, text: 'mal' }
      ]
    })
    check('consola: líneas válidas', console?.lines.length === 2 && console.next === 3)
    check('consola: nivel desconocido a info', console?.lines[1]?.level === 'info')
    check('consola: texto recortado', (console?.lines[1]?.text.length ?? 0) === 2000)

    const journal = cleanJournal({
      entries: [
        { ts: 1, kind: 'join', player: 'Steve', online: 1 },
        { ts: 2, kind: 'moderation', action: 'ban', player: 'Alex', reason: { html: '<b>' } },
        { ts: 3, kind: 'moderation', action: 'borrar-disco', player: 'Alex' },
        { ts: 4, kind: 'clase-del-futuro' },
        { ts: 5, kind: 'command', command: 42 },
        { ts: 6, kind: 'crash', code: 'x' }
      ]
    })
    check('historial: se queda con lo que sabe pintar', journal?.entries.map((e) => e.ts).join(',') === '1,2,6')
    const ban = journal?.entries[1]
    check('historial: motivo que no es texto, fuera', ban?.kind === 'moderation' && ban.reason === undefined)
  })

  await section('Remoto (cliente): emparejar y órdenes por HTTPS', async () => {
    const realClock = {
      get now(): number {
        return Date.now()
      }
    }
    const fake = new FakeHost()
    fake.journals.set('mc', [
      { ts: 3, kind: 'command', command: 'ban-ip 192.168.1.40' },
      { ts: 2, kind: 'join', player: 'Steve', online: 1 }
    ])
    fake.history.push('mc', { ts: Date.now(), level: 'info', text: 'Steve joined from /10.0.0.9:5555' })
    const remote = await freshRemote(fake, realClock)
    const port = await findFreePort(18520)
    await remote.setPort(port)
    const hostStatus = await remote.setEnabled(true)
    check('anfitrión escuchando', hostStatus.state === 'listening', hostStatus.errorDetail ?? '')
    const address = `127.0.0.1:${port}`

    const dir = join(dataRoot(), 'cliente')
    await rm(dir, { recursive: true, force: true })
    const secrets = fakeSecrets()
    const links = new RemoteLinks({ secrets, dir: () => dir, pollMs: 60_000 })
    await links.init()
    let changes = 0
    links.on('changed', () => changes++)

    // --- Antes de emparejar ---
    check('dirección mala', (await links.probe('no es/una dirección')).ok === false)
    const closedPort = await findFreePort(port + 1)
    const closed = await links.probe(`127.0.0.1:${closedPort}`)
    check('puerto cerrado: sin conexión', !closed.ok && closed.error === 'offline')

    // Algo que habla HTTPS pero no es QubiQ, con el mismo certificado.
    const config = JSON.parse(await readFile(join(dataRoot(), 'remote', 'config.json'), 'utf8')) as { certPassword: string }
    const impostor = createServer(
      { pfx: await readFile(join(dataRoot(), 'remote', 'cert.pfx')), passphrase: config.certPassword },
      (_req, res) => res.end('<html>router</html>')
    )
    const impostorPort = await findFreePort(closedPort + 1)
    await listen(impostor, impostorPort)
    const notQubiq = await links.probe(`127.0.0.1:${impostorPort}`)
    check('lo que no es QubiQ se dice', !notQubiq.ok && notQubiq.error === 'not-qubiq', JSON.stringify(notQubiq))
    impostor.close()

    const probe = await links.probe(address)
    check('probe: la huella del anfitrión', probe.ok && probe.data.fingerprint === hostStatus.fingerprint, probe.ok ? probe.data.fingerprint : probe.error)
    const fingerprint = probe.ok ? probe.data.fingerprint : ''

    // --- Emparejar ---
    let invite = await remote.createInvite({ control: true, console: 2, servers: ['mc', 'sf'] })
    const wrong = fingerprint.replace(/^../, fingerprint.startsWith('00') ? '11' : '00')
    const mitm = await links.pair({ address, fingerprint: wrong, code: invite.code, name: 'QubiQ del salón' })
    check('huella que no es: no se empareja', !mitm.ok && mitm.error === 'cert-changed')
    const afterMitm = await remote.status()
    check('…y el código no ha llegado (sigue vivo y sin fallos)', afterMitm.invite?.code === invite.code && afterMitm.devices.length === 0)
    const noVault = new RemoteLinks({ secrets: fakeSecrets(false), dir: () => join(dir, 'sin-dpapi') })
    const refused = await noVault.pair({ address, fingerprint, code: invite.code, name: 'x' })
    check('sin cifrado de Windows no se empareja', !refused.ok && refused.error === 'no-secure-storage')
    const badCode = await links.pair({ address, fingerprint, code: 'ABCDEFGH', name: 'QubiQ del salón' })
    check('código malo', !badCode.ok && badCode.error === 'bad-code')
    invite = await remote.createInvite({ control: true, console: 2, servers: ['mc', 'sf'] })
    const paired = await links.pair({ address, fingerprint, code: invite.code.toLowerCase(), name: 'QubiQ del salón' })
    check('emparejado', paired.ok, paired.ok ? '' : paired.error)
    const id = paired.ok ? paired.data.id : ''
    let link = linkOf(links.state(), id)
    check('en línea y con sus dos servidores', link?.state === 'online' && link.list?.servers.map((s) => s.id).join(',') === 'mc,sf', `${link?.state} ${link?.list?.servers.length}`)
    check('con el nombre del anfitrión', link?.host === 'EQUIPO-PRUEBA')
    check('aviso de cambios a la interfaz', changes > 0)
    const hostSide = await remote.status()
    check('el anfitrión lo ve como dispositivo Ed25519', hostSide.devices.some((d) => d.name === 'QubiQ del salón' && d.algorithm === 'Ed25519'))

    const stored = await readFile(join(dir, 'links.json'), 'utf8')
    check('la clave no se guarda en claro', stored.includes('sellado:') && !stored.includes('MC4CAQAw'))
    check('ni la huella se pierde', stored.includes(fingerprint))

    // --- Órdenes ---
    const started = await links.order(id, 'start', { server: 'sf' })
    check('arrancar', started.ok && fake.calls.includes('start:sf'))
    const notMine = await links.order(id, 'start', { server: 'rust' })
    check('servidor que no es suyo', !notMine.ok && notMine.error === 'unknown-server')
    const consoleReply = await links.order(id, 'console', { server: 'mc', after: 0 })
    const lines = consoleReply.ok ? (consoleReply.data as RemoteConsoleResult).lines : []
    check('consola, con la IP tapada', lines.length === 1 && !lines[0]!.text.includes('10.0.0.9'))
    const journalReply = await links.order(id, 'journal', { server: 'mc' })
    const entries = journalReply.ok ? (journalReply.data as RemoteJournalResult).entries : []
    check('historial, sin IP', entries.length === 2 && !JSON.stringify(entries).includes('192.168.1.40'))
    const sent = await links.order(id, 'send', { server: 'mc', command: 'op Steve' })
    check('nivel 2: op no', !sent.ok && sent.error === 'command-not-allowed')
    const forget = await links.order(id, 'forget', {})
    check('forget no se puede pedir desde la interfaz', !forget.ok && forget.error === 'bad-request')
    check('…y el anfitrión sigue teniéndolo', (await remote.status()).devices.length === 1)
    const unknown = await links.order('no-existe', 'list')
    check('conexión inventada', !unknown.ok && unknown.error === 'unknown-link')

    // Reloj desfasado 5 minutos: la primera firma caduca y se corrige sola.
    const skewed = new RemoteLinks({ secrets, dir: () => dir, pollMs: 60_000, now: () => Date.now() + 5 * 60_000 })
    await skewed.init()
    const skewedList = await skewed.order(id, 'list')
    check('reloj desfasado: se corrige con la hora del anfitrión', skewedList.ok, skewedList.ok ? '' : skewedList.error)
    skewed.shutdown()

    // --- Al reabrir la app ---
    const reopened = new RemoteLinks({ secrets, dir: () => dir, pollMs: 60_000 })
    await reopened.init()
    await reopened.refresh(id)
    check('al reabrir: en línea con la clave descifrada', linkOf(reopened.state(), id)?.state === 'online')
    reopened.shutdown()

    const otherUser = fakeSecrets()
    otherUser.broken = true
    const copied = new RemoteLinks({ secrets: otherUser, dir: () => dir, pollMs: 60_000 })
    await copied.init()
    await copied.refresh(id)
    check('datos copiados a otro usuario: clave inservible', linkOf(copied.state(), id)?.state === 'key-lost')
    copied.shutdown()

    // --- La huella cambia ---
    const file = join(dir, 'links.json')
    await writeFile(file, (await readFile(file, 'utf8')).replace(fingerprint, wrong))
    const changed = new RemoteLinks({ secrets, dir: () => dir, pollMs: 60_000 })
    await changed.init()
    await changed.refresh(id)
    link = linkOf(changed.state(), id)
    check('huella distinta: cert-changed y no se le habla', link?.state === 'cert-changed' && link.newFingerprint === fingerprint)
    const blind = await changed.order(id, 'start', { server: 'mc' })
    check('…ni para arrancar', !blind.ok && blind.error === 'cert-changed' && !fake.calls.includes('start:mc'))
    const badTrust = await changed.trust(id, wrong)
    check('confiar en una huella que no enseña: no', !badTrust.ok && badTrust.error === 'cert-changed')
    const goodTrust = await changed.trust(id, fingerprint)
    check('confiar en la que enseña: vuelve', goodTrust.ok && linkOf(changed.state(), id)?.state === 'online')
    changed.shutdown()

    // --- Quitado en el anfitrión ---
    const deviceId = (await remote.status()).devices[0]!.id
    await remote.revokeDevice(deviceId)
    await links.refresh(id)
    check('quitado allí: revoked', linkOf(links.state(), id)?.state === 'revoked')

    // Volver a emparejar con el mismo equipo sustituye la conexión y conserva el id.
    invite = await remote.createInvite({ control: false, console: 1, servers: ['mc'] })
    const again = await links.pair({ address, fingerprint, code: invite.code, name: 'QubiQ del salón' })
    check('reemparejar conserva el id', again.ok && again.data.id === id && links.state().links.length === 1)
    link = linkOf(links.state(), id)
    check('…con los permisos nuevos', link?.state === 'online' && link.list?.permissions.control === false)
    const forbidden = await links.order(id, 'stop', { server: 'mc' })
    check('solo mirar: parar no', !forbidden.ok && forbidden.error === 'forbidden')

    // --- Quitar la conexión: forget en el anfitrión ---
    const removed = await links.remove(id)
    check('quitar avisa al anfitrión', removed.ok && removed.data.notified)
    check('…que ya no lo tiene', (await remote.status()).devices.length === 0)
    const activity = await remote.activity(5)
    check('…y lo apunta en la actividad', activity[0]?.order === 'forget' && activity[0].result === 'ok')
    check('…y aquí no queda nada', links.state().links.length === 0 && !(await readFile(file, 'utf8')).includes('sellado:'))

    // forget con argumentos: no (la firma es buena, la forma no).
    invite = await remote.createInvite({ control: true, console: 1, servers: ALL })
    const key = newKey('Ed25519')
    const pairReply = await remote.handlePair(pairBody(key, invite.code), '10.0.0.7')
    const device: TestDevice = { ...key, client: ((pairReply.body as RemoteResponse<RemotePairResult>) as { data: RemotePairResult }).data.client }
    const withArgs = await remote.handleOrder(signedOrder(device, 'forget', { server: 'mc' }, Date.now()), '10.0.0.7')
    check('forget con argumentos: bad-request', (withArgs.body as RemoteResponse<null>).ok === false && (await remote.status()).devices.length === 1)

    // Quitar sin conexión: se quita aquí y se dice que allí sigue.
    invite = await remote.createInvite({ control: true, console: 1, servers: ALL })
    const third = await links.pair({ address, fingerprint, code: invite.code, name: 'Otro' })
    await remote.setEnabled(false)
    const offlineRemove = third.ok ? await links.remove(third.data.id) : null
    check('quitar sin conexión: notified false', offlineRemove?.ok === true && offlineRemove.data.notified === false)
    links.shutdown()
  })
}
