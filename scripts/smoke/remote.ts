import { join } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

import { check, section } from './harness'
import { https, newKey, pairBody, signText, signedOrder, type TestDevice } from './remoteClient'
import { dataRoot, DATA_ENTRIES } from '../../src/main/core/paths'
import { findFreePort } from '../../src/main/core/net/network'
import { ConsoleHistory } from '../../src/main/core/runtime/consoleHistory'
import { AddressGuard, LIMITS, NonceCache, RateLimiter } from '../../src/main/core/remote/guard'
import { importPublicKey, randomCode, verifySignature } from '../../src/main/core/remote/crypto'
import { RemoteAccess, INVITE_ATTEMPTS } from '../../src/main/core/remote'
import type { OrderHost } from '../../src/main/core/remote/orders'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  commandAllowed,
  formatCode,
  maskAddresses,
  normalizeCode,
  orderMessage,
  pairMessage,
  type KeyAlgorithm,
  type RemoteArgs,
  type RemoteConsoleResult,
  type RemoteListResult,
  type RemoteOrder,
  type RemotePairResult,
  type RemotePermissions,
  type RemoteResponse
} from '../../src/shared/remote'
import type { InstanceManifest, InstanceState, LogLine, ServerStatus } from '../../src/shared/types'

/**
 * Prueba de humo del control remoto (§19.31).
 *
 * Lo importante es lo que se RECHAZA: firma mala, repetida, caducada, servidor
 * inventado, dispositivo quitado o sin permiso, comando fuera de lista y
 * campos de más. Se prueba contra un anfitrión falso que apunta lo que le
 * piden, y al final una vuelta completa por HTTPS con el certificado de
 * Windows de verdad.
 */

// --- Un anfitrión falso -----------------------------------------------------------

/** Los tres servidores del anfitrión falso. */
const ALL = ['mc', 'sf', 'rust']

function manifest(id: string, game: InstanceManifest['game'], data: Record<string, unknown>): InstanceManifest {
  return {
    schemaVersion: 2,
    id,
    name: `Servidor ${id}`,
    game,
    port: 25565,
    createdAt: '2026-01-01T00:00:00.000Z',
    agreements: [],
    expectedPlayers: 4,
    autoRestart: false,
    backup: { enabled: false, intervalHours: 6, keep: 5 },
    data
  } as unknown as InstanceManifest
}

class FakeHost implements OrderHost {
  calls: string[] = []
  statuses = new Map<string, ServerStatus>([
    ['mc', 'running'],
    ['sf', 'stopped'],
    ['rust', 'running']
  ])
  history = new ConsoleHistory()
  failStart = false

  hostName(): string {
    return 'EQUIPO-PRUEBA'
  }

  async list(): Promise<InstanceState[]> {
    const manifests = [
      // Un secreto en el manifiesto: no puede salir en la lista.
      manifest('mc', 'minecraft', { distribution: 'paper', rconPassword: 'secreto-que-no-sale' }),
      manifest('sf', 'satisfactory', {}),
      manifest('rust', 'rust', { rconPassword: 'otro-secreto' })
    ]
    return manifests.map((m) => ({
      manifest: m,
      status: this.statuses.get(m.id) ?? 'stopped',
      players: m.id === 'mc' ? ['Steve'] : [],
      playerCount: m.id === 'sf' ? 0 : null,
      joinCode: null,
      uptimeSeconds: null,
      lastError: null
    }))
  }

  async start(id: string): Promise<void> {
    this.calls.push(`start:${id}`)
    if (this.failStart) throw new Error('Hay que aceptar el EULA antes de arrancar el servidor.')
    this.statuses.set(id, 'running')
  }

  async stop(id: string): Promise<void> {
    this.calls.push(`stop:${id}`)
    this.statuses.set(id, 'stopped')
  }

  async restart(id: string): Promise<void> {
    this.calls.push(`restart:${id}`)
  }

  async sendCommand(id: string, command: string): Promise<void> {
    this.calls.push(`send:${id}:${command}`)
  }

  consoleSince(id: string, after?: number, max?: number): { lines: (LogLine & { seq: number })[]; next: number } {
    return this.history.since(id, after, max)
  }
}

function data<T>(reply: { status: number; body: unknown }): T {
  return (reply.body as { data: T }).data
}

function errorOf(reply: { status: number; body: unknown }): string | null {
  const body = reply.body as RemoteResponse<unknown>
  return body.ok ? null : body.error
}

async function freshRemote(host: OrderHost, clock: { now: number }, staticRoot: string | null = null): Promise<RemoteAccess> {
  await rm(join(dataRoot(), 'remote'), { recursive: true, force: true })
  const remote = new RemoteAccess({ host, staticRoot, listenHost: '127.0.0.1', now: () => clock.now })
  await remote.init()
  return remote
}

async function pairDevice(
  remote: RemoteAccess,
  permissions: RemotePermissions,
  algorithm: KeyAlgorithm = 'Ed25519',
  address = '10.0.0.2'
): Promise<TestDevice> {
  const invite = await remote.createInvite(permissions)
  const key = newKey(algorithm)
  const reply = await remote.handlePair(pairBody(key, invite.code), address)
  return { ...key, client: data<RemotePairResult>(reply).client }
}

export async function remoteSmoke(): Promise<void> {
  await section('Remoto: contrato compartido', async () => {
    check('códigos: «abcd efgh» = «ABCD-EFGH»', normalizeCode('abcd efgh') === normalizeCode('ABCD-EFGH'))
    check('códigos: se enseñan con guion', formatCode('ABCDEFGH') === 'ABCD-EFGH')
    const code = randomCode()
    check(
      'códigos: 8 caracteres sin los que se confunden',
      code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) && !/[01ILOU]/.test(code),
      code
    )

    const base = { client: 'abc12345', ts: 1000, nonce: 'n'.repeat(22), order: 'send' as const }
    const a = orderMessage({ ...base, args: { server: 'mc', command: 'list' } })
    const b = orderMessage({ ...base, args: { command: 'list', server: 'mc' } })
    check('firma: el orden de los argumentos no cambia el texto', a === b)
    check(
      'firma: cambiar un argumento cambia el texto',
      a !== orderMessage({ ...base, args: { server: 'mc', command: 'op Steve' } })
    )

    check('consola nivel 1: nada', !commandAllowed(1, 'minecraft', 'list'))
    check('consola nivel 2: «list» sí', commandAllowed(2, 'minecraft', 'list'))
    check('consola nivel 2: «/say hola» sí', commandAllowed(2, 'minecraft', '/say hola'))
    check('consola nivel 2: «op Steve» no', !commandAllowed(2, 'minecraft', 'op Steve'))
    check('consola nivel 2: encadenar no', !commandAllowed(2, 'rust', 'say hola; ownerid 1'))
    check('consola nivel 2: «/c» de Factorio no', !commandAllowed(2, 'factorio', '/c game.print(1)'))
    check('consola nivel 2: juego sin lista, nada', !commandAllowed(2, 'satisfactory', 'list'))
    check('consola nivel 3: lo que sea', commandAllowed(3, 'minecraft', 'op Steve'))

    const login = '[12:34:56 INFO]: Steve[/192.168.1.37:51234] logged in with entity id 42'
    check('IP: IPv4 de Minecraft', maskAddresses(login) === '[12:34:56 INFO]: Steve[/***.***.***.***:51234] logged in with entity id 42', maskAddresses(login))
    check('IP: IPv6 de Java (completa)', !maskAddresses('Steve[/0:0:0:0:0:0:0:1:5000]').includes('0:0:0:0'))
    check('IP: IPv6 comprimida', !maskAddresses('from [2001:db8::1]:27015').includes('2001'))
    check('IP: IPv4 dentro de IPv6', !/\d+\.\d+\.\d+/.test(maskAddresses('::ffff:203.0.113.9')), maskAddresses('::ffff:203.0.113.9'))
    check('IP: las horas no se tocan', maskAddresses('12:34:56 y 2026-10-02 12:34:56:789') === '12:34:56 y 2026-10-02 12:34:56:789')
    check('IP: las versiones no se tocan', maskAddresses('Paper 1.21.8 build 42') === 'Paper 1.21.8 build 42')
  })

  await section('Remoto: historial de consola', async () => {
    const history = new ConsoleHistory(500)
    for (let i = 1; i <= 600; i++) history.push('s', { ts: i, level: 'info', text: `línea ${i}` })
    const all = history.since('s')
    check('guarda las últimas 500', all.lines.length === 500 && all.lines[0]!.seq === 101 && all.next === 600)
    const tail = history.since('s', 595)
    check('«desde la 595» da 5', tail.lines.length === 5 && tail.lines[0]!.text === 'línea 596')
    check('nada nuevo, nada', history.since('s', 600).lines.length === 0)
    check('un número de otra sesión empieza de cero', history.since('s', 9999).lines.length === 500)
    check('con tope, las más recientes', history.since('s', 0, 10).lines[9]!.seq === 600)
    check('otro servidor, vacío', history.since('otro').lines.length === 0 && history.since('otro').next === 0)
  })

  await section('Remoto: defensas', async () => {
    const nonces = new NonceCache()
    check('número de uso único: la primera vez pasa', nonces.use('a', 0))
    check('número de uso único: la segunda no', !nonces.use('a', 1000))
    check('número de uso único: caducado, se olvida', nonces.use('a', 10 * 60_000))

    const limiter = new RateLimiter()
    let allowed = 0
    for (let i = 0; i < 15; i++) if (limiter.allow('k', 10, 60_000, i)) allowed++
    check('límite: 10 de 15', allowed === 10)
    check('límite: pasada la ventana, vuelve', limiter.allow('k', 10, 60_000, 70_000))

    const many = new RateLimiter()
    for (let i = 0; i < 12_000; i++) many.allow(`10.${i >> 8}.${i & 255}.1`, 10, 60_000, i)
    check('límite: miles de direcciones no llenan la memoria', many.size <= 5_000, `${many.size}`)

    const guard = new AddressGuard()
    let blockedAt = 0
    for (let i = 1; i <= LIMITS.failures.max; i++) if (guard.fail('1.2.3.4', i) && !blockedAt) blockedAt = i
    check('bloqueo: al décimo fallo', blockedAt === LIMITS.failures.max, `${blockedAt}`)
    check('bloqueo: bloqueada', guard.isBlocked('1.2.3.4', 100))
    check('bloqueo: otra dirección, no', !guard.isBlocked('5.6.7.8', 100))
    check('bloqueo: a los 15 minutos, libre', !guard.isBlocked('1.2.3.4', LIMITS.blockMs + 100))
  })

  await section('Remoto: firmas', async () => {
    for (const algorithm of ['Ed25519', 'ECDSA-P256'] as const) {
      const key = newKey(algorithm)
      const imported = importPublicKey(key.publicKey, algorithm)
      check(`${algorithm}: se importa la clave`, imported !== null)
      const sig = signText(key, 'hola')
      check(`${algorithm}: firma buena`, verifySignature(imported!, algorithm, 'hola', sig))
      check(`${algorithm}: texto cambiado`, !verifySignature(imported!, algorithm, 'hola!', sig))
      check(`${algorithm}: firma basura`, !verifySignature(imported!, algorithm, 'hola', 'AAAA'))
    }
    const ed = newKey('Ed25519')
    check('clave de un tipo que no es el que dice', importPublicKey(ed.publicKey, 'ECDSA-P256') === null)
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    check('RSA no se acepta', importPublicKey(rsa, 'ECDSA-P256') === null && importPublicKey(rsa, 'Ed25519') === null)
    check('basura no es una clave', importPublicKey('bm8gZXMgdW5hIGNsYXZl', 'Ed25519') === null)
  })

  await section('Remoto: emparejar', async () => {
    const clock = { now: Date.parse('2026-10-02T12:00:00Z') }
    const remote = await freshRemote(new FakeHost(), clock)

    const key = newKey('Ed25519')
    check('sin invitación, no', errorOf(await remote.handlePair(pairBody(key, 'ABCDEFGH'), '10.0.0.9')) === 'bad-code')

    let invite = await remote.createInvite({ control: true, console: 1, servers: ['mc'] })
    const wrong = invite.code === 'ABCDEFGH' ? 'ABCDEFGJ' : 'ABCDEFGH'
    for (let i = 0; i < INVITE_ATTEMPTS - 1; i++) await remote.handlePair(pairBody(key, wrong), `10.0.1.${i}`)
    check('tras 4 fallos el código sigue', (await remote.status()).invite !== null)
    await remote.handlePair(pairBody(key, wrong), '10.0.1.99')
    check('al quinto fallo el código se anula', (await remote.status()).invite === null)
    check('anulado, ya no vale ni el bueno', errorOf(await remote.handlePair(pairBody(key, invite.code), '10.0.2.1')) === 'bad-code')

    invite = await remote.createInvite({ control: true, console: 1, servers: ['mc'] })
    const other = newKey('Ed25519')
    const forged = { ...pairBody(key, invite.code), sig: signText(other, pairMessage(invite.code, key.publicKey)) }
    check('firma de otra clave, no', errorOf(await remote.handlePair(forged, '10.0.2.2')) === 'bad-signature')

    const good = await remote.handlePair(pairBody(key, formatCode(invite.code).toLowerCase()), '10.0.2.3')
    check('código bueno (en minúsculas y con guion): sí', good.status === 200, JSON.stringify(good.body))
    check('el código se gasta', (await remote.status()).invite === null)
    const again = await remote.handlePair(pairBody(newKey('Ed25519'), invite.code), '10.0.2.4')
    check('el mismo código otra vez, no', errorOf(again) === 'bad-code')

    invite = await remote.createInvite({ control: true, console: 1, servers: ['mc'] })
    clock.now += 11 * 60_000
    check('código caducado, no', errorOf(await remote.handlePair(pairBody(newKey('Ed25519'), invite.code), '10.0.2.5')) === 'bad-code')

    const status = await remote.status()
    check('un dispositivo emparejado', status.devices.length === 1 && status.devices[0]!.name === 'Móvil de prueba')
    check('la clave pública no sale hacia la interfaz', !JSON.stringify(status).includes(key.publicKey))
    const stored = JSON.parse(await readFile(join(dataRoot(), 'remote', 'config.json'), 'utf8')) as { devices: unknown[] }
    check('se guarda en remote/config.json', stored.devices.length === 1)

    const invite2 = await remote.createInvite({ control: true, console: 1, servers: ['mc'] })
    check(
      'nombre vacío o con controles, no',
      errorOf(await remote.handlePair(pairBody(newKey('Ed25519'), invite2.code, '\u0000\u0007  '), '10.0.2.6')) === 'bad-request'
    )
  })

  await section('Remoto: órdenes', async () => {
    const clock = { now: Date.parse('2026-10-02T12:00:00Z') }
    const host = new FakeHost()
    const remote = await freshRemote(host, clock)
    const viewer = await pairDevice(remote, { control: false, console: 1, servers: ALL })
    const admin = await pairDevice(remote, { control: true, console: 2, servers: ALL }, 'ECDSA-P256')
    const root = await pairDevice(remote, { control: true, console: 3, servers: ALL })
    const ask = (device: TestDevice, order: RemoteOrder, args: RemoteArgs = {}, address = '10.0.0.2') =>
      remote.handleOrder(signedOrder(device, order, args, clock.now), address)

    const list = await ask(viewer, 'list')
    const listed = data<RemoteListResult>(list)
    check('list: responde', list.status === 200 && listed.servers.length === 3 && listed.host === 'EQUIPO-PRUEBA')
    check('list: sin secretos del manifiesto', !JSON.stringify(list.body).includes('secreto'))
    check('list: dice qué juegos tienen consola', listed.servers.find((s) => s.id === 'sf')?.commands === false && listed.servers.find((s) => s.id === 'mc')?.commands === true)
    check('list: con ECDSA también', (await ask(admin, 'list')).status === 200)

    check('sin permiso de controlar, no arranca', errorOf(await ask(viewer, 'start', { server: 'sf' })) === 'forbidden')
    check('servidor inventado', errorOf(await ask(admin, 'start', { server: '../../Windows' })) === 'unknown-server')
    check('sin servidor', errorOf(await ask(admin, 'stop')) === 'bad-request')
    check('arrancar uno parado', (await ask(admin, 'start', { server: 'sf' })).status === 200 && host.calls.includes('start:sf'))
    check('arrancar uno en marcha', errorOf(await ask(admin, 'start', { server: 'mc' })) === 'already-running')
    host.statuses.set('sf', 'stopped')
    host.failStart = true
    const failed = await ask(admin, 'start', { server: 'sf' })
    check('un fallo del núcleo llega con su mensaje', errorOf(failed) === 'failed' && JSON.stringify(failed.body).includes('EULA'))
    host.failStart = false
    check('parar uno parado no hace nada', (await ask(admin, 'stop', { server: 'sf' })).status === 200 && !host.calls.includes('stop:sf'))
    host.statuses.set('sf', 'installing')
    check('reiniciar uno instalándose', errorOf(await ask(admin, 'restart', { server: 'sf' })) === 'busy')
    check('reiniciar', (await ask(admin, 'restart', { server: 'mc' })).status === 200 && host.calls.includes('restart:mc'))

    host.history.push('mc', { ts: 1, level: 'info', text: 'Steve[/203.0.113.9:5123] logged in' })
    host.history.push('mc', { ts: 2, level: 'chat', text: '<Steve> hola' })
    const consoleReply = data<RemoteConsoleResult>(await ask(viewer, 'console', { server: 'mc' }))
    check('consola: la ve hasta el de solo lectura', consoleReply.lines.length === 2 && consoleReply.next === 2)
    check('consola: sin IP', !JSON.stringify(consoleReply).includes('203.0.113'), consoleReply.lines[0]?.text)
    check('consola: desde la última', data<RemoteConsoleResult>(await ask(viewer, 'console', { server: 'mc', after: 2 })).lines.length === 0)

    check('enviar: nivel 1, no', errorOf(await ask(viewer, 'send', { server: 'mc', command: 'list' })) === 'forbidden')
    check('enviar: nivel 2, de la lista', (await ask(admin, 'send', { server: 'mc', command: 'say hola' })).status === 200 && host.calls.includes('send:mc:say hola'))
    check('enviar: nivel 2, fuera de la lista', errorOf(await ask(admin, 'send', { server: 'mc', command: 'op Steve' })) === 'command-not-allowed')
    check('enviar: nivel 3, lo que sea', (await ask(root, 'send', { server: 'mc', command: 'op Steve' })).status === 200)
    check('enviar: juego sin consola', errorOf(await ask(root, 'send', { server: 'sf', command: 'x' })) === 'no-console')
    host.statuses.set('rust', 'stopped')
    check('enviar: servidor parado', errorOf(await ask(root, 'send', { server: 'rust', command: 'say hola' })) === 'not-running')
    check('enviar: vacío', errorOf(await ask(root, 'send', { server: 'mc', command: '   ' })) === 'bad-request')
    check('enviar: saltos de línea no cuelan un segundo comando', (await ask(root, 'send', { server: 'mc', command: 'say a\nop Steve' })).status === 200 && host.calls.includes('send:mc:say a op Steve'))

    // --- Lo que no es una orden válida ---
    const body = signedOrder(admin, 'list', {}, clock.now)
    check('firma buena', (await remote.handleOrder(body, '10.0.0.3')).status === 200)
    check('la misma orden otra vez (repetida)', errorOf(await remote.handleOrder(body, '10.0.0.3')) === 'replayed')
    const tampered = { ...signedOrder(admin, 'start', { server: 'sf' }, clock.now), args: { server: 'mc' } }
    check('argumentos cambiados tras firmar', errorOf(await remote.handleOrder(tampered, '10.0.0.4')) === 'bad-signature')
    const otherClient = { ...signedOrder(viewer, 'start', { server: 'sf' }, clock.now), client: admin.client }
    check('firma de un dispositivo haciéndose pasar por otro', errorOf(await remote.handleOrder(otherClient, '10.0.0.4')) === 'bad-signature')
    check('de hace dos minutos (caducada)', errorOf(await remote.handleOrder(signedOrder(admin, 'list', {}, clock.now - 120_000), '10.0.0.5')) === 'expired')
    check('del futuro (caducada)', errorOf(await remote.handleOrder(signedOrder(admin, 'list', {}, clock.now + 120_000), '10.0.0.5')) === 'expired')
    const extra = { ...signedOrder(admin, 'list', {}, clock.now), args: { path: 'C:\\' } }
    check('campos de más en los argumentos', errorOf(await remote.handleOrder(extra, '10.0.0.6')) === 'bad-request')
    check('orden que no existe', errorOf(await remote.handleOrder({ ...signedOrder(admin, 'list', {}, clock.now), order: 'delete' }, '10.0.0.6')) === 'bad-request')
    check('basura', errorOf(await remote.handleOrder('hola', '10.0.0.6')) === 'bad-request')
    check('dispositivo que no existe', errorOf(await remote.handleOrder({ ...signedOrder(admin, 'list', {}, clock.now), client: 'noexiste123' }, '10.0.0.7')) === 'unknown-client')

    await remote.updateDevice(viewer.client, { control: true, console: 1, servers: ALL })
    host.statuses.set('sf', 'stopped')
    check('permiso dado: vale ya, sin reemparejar', (await ask(viewer, 'start', { server: 'sf' })).status === 200)
    await remote.revokeDevice(viewer.client)
    check('dispositivo quitado', errorOf(await ask(viewer, 'list')) === 'unknown-client')

    // Límite de arrancar/parar: 10 cada 10 minutos.
    let limited = 0
    for (let i = 0; i < LIMITS.control.max + 2; i++) {
      host.statuses.set('sf', 'stopped')
      if (errorOf(await ask(root, 'start', { server: 'sf' })) === 'rate-limited') limited++
    }
    check('límite de control: el 11.º y el 12.º no', limited === 2, `${limited}`)

    const activity = await remote.activity(100)
    check('actividad: se apunta lo que cambia algo', activity.some((e) => e.order === 'restart' && e.result === 'ok'))
    check('actividad: y el comando enviado', activity.some((e) => e.order === 'send' && e.command === 'op Steve'))
    check('actividad: y los rechazos', activity.some((e) => e.result === 'bad-signature') && activity.some((e) => e.result === 'replayed'))
    check('actividad: las consultas buenas no', !activity.some((e) => e.order === 'list' && e.result === 'ok'))

    // Diez fallos desde una dirección: bloqueada aunque luego mande algo bueno.
    for (let i = 0; i < LIMITS.failures.max; i++) await remote.handleOrder('basura', '10.9.9.9')
    check('dirección bloqueada', errorOf(await remote.handleOrder(signedOrder(admin, 'list', {}, clock.now), '10.9.9.9')) === 'blocked')
    check('otra dirección sigue', (await remote.handleOrder(signedOrder(admin, 'list', {}, clock.now), '10.9.9.8')).status === 200)
  })

  await section('Remoto: servidores por dispositivo y jugadores', async () => {
    const clock = { now: Date.parse('2026-10-03T12:00:00Z') }
    const host = new FakeHost()
    const remote = await freshRemote(host, clock)
    const ask = (device: TestDevice, order: RemoteOrder, args: RemoteArgs = {}) =>
      remote.handleOrder(signedOrder(device, order, args, clock.now), '10.0.0.2')

    const nothing = await pairDevice(remote, { control: true, console: 3, servers: [] })
    const onlyMc = await pairDevice(remote, { control: true, console: 3, servers: ['mc', 'mc', 'no-existe'] })

    const empty = data<RemoteListResult>(await ask(nothing, 'list'))
    check('sin servidores marcados: no ve ninguno', empty.servers.length === 0)
    check('sin servidores marcados: no puede arrancar', errorOf(await ask(nothing, 'start', { server: 'sf' })) === 'unknown-server')
    check('sin servidores marcados: ni ver la consola', errorOf(await ask(nothing, 'console', { server: 'mc' })) === 'unknown-server')

    const mine = data<RemoteListResult>(await ask(onlyMc, 'list'))
    check('solo ve los suyos', mine.servers.length === 1 && mine.servers[0]!.id === 'mc')
    const stored = (await remote.status()).devices.find((d) => d.id === onlyMc.client)
    check('la lista se guarda sin repetidos', JSON.stringify(stored?.permissions.servers) === '["mc","no-existe"]', JSON.stringify(stored?.permissions.servers))
    const foreign = await ask(onlyMc, 'start', { server: 'sf' })
    check('uno que existe pero no es suyo: el mismo error que uno inventado', errorOf(foreign) === 'unknown-server')
    check('y no se ha arrancado', !host.calls.includes('start:sf'))
    check('enviar a uno que no es suyo, tampoco', errorOf(await ask(onlyMc, 'send', { server: 'rust', command: 'say hola' })) === 'unknown-server')

    // Jugadores: lo que dice cada juego.
    const mc = mine.servers[0]!
    check('jugadores: nombres de Minecraft', mc.players.join() === 'Steve' && mc.playerIds && mc.playerNames)
    await remote.updateDevice(onlyMc.client, { control: true, console: 3, servers: ALL })
    const all = data<RemoteListResult>(await ask(onlyMc, 'list'))
    check('permiso ampliado: ve los tres al momento', all.servers.length === 3)
    const sf = all.servers.find((s) => s.id === 'sf')!
    check('jugadores: Satisfactory parado, ni lista ni número', sf.players.length === 0 && sf.playerCount === null && !sf.playerIds)
    host.statuses.set('sf', 'running')
    const sfRunning = data<RemoteListResult>(await ask(onlyMc, 'list')).servers.find((s) => s.id === 'sf')!
    check('jugadores: Satisfactory en marcha, solo el número', sfRunning.playerCount === 0 && !sfRunning.playerIds)

    // Borrar un servidor lo quita de todos: uno nuevo con el mismo nombre no hereda el permiso.
    await remote.forgetServer('mc')
    const after = await remote.status()
    check('borrado: sale de todos los dispositivos', after.devices.every((d) => !d.permissions.servers.includes('mc')))
    const saved = JSON.parse(await readFile(join(dataRoot(), 'remote', 'config.json'), 'utf8')) as { devices: { permissions: { servers: string[] } }[] }
    check('borrado: y se guarda', saved.devices.every((d) => !d.permissions.servers.includes('mc')))
    check('borrado: aunque vuelva a existir, no lo ve', !data<RemoteListResult>(await ask(onlyMc, 'list')).servers.some((s) => s.id === 'mc'))

    // Al abrir: los que ya no existen se quitan, y uno de antes de esta versión no ve nada.
    const config = JSON.parse(await readFile(join(dataRoot(), 'remote', 'config.json'), 'utf8')) as {
      devices: { permissions: Record<string, unknown> }[]
    }
    config.devices[0]!.permissions = { control: true, console: 1 }
    config.devices[1]!.permissions = { control: true, console: 1, servers: ['sf', 'borrado-con-la-app-cerrada'] }
    await writeFile(join(dataRoot(), 'remote', 'config.json'), JSON.stringify(config))
    const reopened = new RemoteAccess({ host, staticRoot: null, now: () => clock.now })
    await reopened.init()
    const devices = (await reopened.status()).devices
    check('de una versión anterior (sin lista): ninguno', devices[0]!.permissions.servers.length === 0)
    check('al abrir se quitan los que ya no existen', JSON.stringify(devices[1]!.permissions.servers) === '["sf"]')

    const invite = await remote.createInvite({ control: false, console: 1, servers: ['rust'] })
    const key = newKey('Ed25519')
    const paired = data<RemotePairResult>(await remote.handlePair(pairBody(key, invite.code, 'Invitado'), '10.0.5.1'))
    check('el código lleva sus servidores', JSON.stringify(paired.permissions.servers) === '["rust"]')
  })

  await section('Remoto: servidor HTTPS', async () => {
    const staticRoot = join(dataRoot(), 'remote-static')
    await mkdir(join(staticRoot, 'assets'), { recursive: true })
    await writeFile(join(staticRoot, 'remote.html'), '<!doctype html><title>remota</title>' + 'x'.repeat(2000))
    await writeFile(join(staticRoot, 'assets', 'app-123.js'), 'console.log(1)')
    await writeFile(join(dataRoot(), 'secreto.txt'), 'no debería salir')

    // Con el reloj de verdad: aquí las órdenes llevan `Date.now()`.
    const realClock = {
      get now(): number {
        return Date.now()
      }
    }
    const remote = await freshRemote(new FakeHost(), realClock, staticRoot)
    const port = await findFreePort(18443)
    await remote.setPort(port)
    const started = Date.now()
    let status = await remote.setEnabled(true)
    check('arranca y escucha', status.state === 'listening', `${status.state} ${status.errorDetail ?? ''} (${Date.now() - started} ms)`)
    check('con huella SHA-256', /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(status.fingerprint ?? ''), status.fingerprint ?? '')
    const days = (Date.parse(status.certExpires ?? '') - Date.now()) / 86_400_000
    check('certificado de menos de 825 días (iOS)', days > 790 && days < 825, `${Math.round(days)} días`)

    const get = (path: string, headers: Record<string, string> = {}) => https('GET', port, path, undefined, headers)
    const page = await get('/', { 'Accept-Encoding': 'gzip' })
    check('GET /: la página', page.status === 200 && gunzipSync(page.body).toString().includes('remota'))
    check('GET /: comprimida', page.headers['content-encoding'] === 'gzip' && page.body.length < 2000)
    check('GET /: política de contenido', String(page.headers['content-security-policy']).includes("frame-ancestors 'none'"))
    check('GET /: sin caché', page.headers['cache-control'] === 'no-store')
    check('GET /: nosniff', page.headers['x-content-type-options'] === 'nosniff')
    check('GET /assets: sí', (await get('/assets/app-123.js')).status === 200)
    for (const path of [
      '/assets/../remote.html',
      '/assets/..%2F..%2Fsecreto.txt',
      '/assets/%2e%2e%5csecreto.txt',
      '/secreto.txt',
      '/remote/config.json',
      '/assets/.hidden'
    ]) {
      const response = await get(path)
      check(`no sale ${path}`, response.status === 404 && !response.body.toString().includes('no debería'))
    }
    check('POST sin JSON: 415', (await https('POST', port, '/api/order', 'x', { 'Content-Type': 'text/plain' })).status === 415)
    check('POST enorme: 413', (await https('POST', port, '/api/order', JSON.stringify({ a: 'x'.repeat(20_000) }), { 'Content-Type': 'application/json' })).status === 413)

    const invite = await remote.createInvite({ control: true, console: 2, servers: ALL })
    const key = newKey('Ed25519')
    const paired = await https('POST', port, '/api/pair', JSON.stringify(pairBody(key, invite.code)), { 'Content-Type': 'application/json' })
    const pairReply = JSON.parse(paired.body.toString()) as RemoteResponse<RemotePairResult>
    check('emparejar por HTTPS', paired.status === 200 && pairReply.ok)
    const device: TestDevice = { ...key, client: pairReply.ok ? pairReply.data.client : '' }
    const listed = await https('POST', port, '/api/order', JSON.stringify(signedOrder(device, 'list', {}, Date.now())), { 'Content-Type': 'application/json' })
    const listReply = JSON.parse(listed.body.toString()) as RemoteResponse<RemoteListResult>
    check('orden firmada por HTTPS', listed.status === 200 && listReply.ok && listReply.data.servers.length === 3)
    check('con la hora del anfitrión', typeof listReply.time === 'number' && Math.abs(listReply.time - Date.now()) < 5000)

    status = await remote.setEnabled(false)
    check('se apaga', status.state === 'off')
    const closed = await https('GET', port, '/').then(() => false, () => true)
    check('apagado, no responde', closed)

    // Reabrir reutiliza el certificado: la huella no cambia (los dispositivos la recuerdan).
    const first = (await remote.setEnabled(true)).fingerprint
    await remote.setEnabled(false)
    const reopened = new RemoteAccess({ host: new FakeHost(), staticRoot, listenHost: '127.0.0.1' })
    await reopened.init()
    const second = (await reopened.setEnabled(true)).fingerprint
    await reopened.setEnabled(false)
    check('el certificado se reutiliza', first !== null && first === second)
    check('remote/ se mueve con la carpeta de datos', (DATA_ENTRIES as readonly string[]).includes('remote'))
  })
}

