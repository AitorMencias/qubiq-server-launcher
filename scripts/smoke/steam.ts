import { createHash } from 'node:crypto'
import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { createServer as createHttpServer } from 'node:http'
import { createServer, type Socket } from 'node:net'
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { check, section } from './harness'
import {
  buildIdFromAppInfo,
  buildIdFromManifest,
  interpretRun,
  parseProgressLine
} from '../../src/main/core/tools/steamcmdOutput'
import { isValveSigner } from '../../src/main/core/tools/steamcmd'
import { parseVdf, vdfGet } from '../../src/main/core/formats/vdf'
import { RconClient, RconError, decodePackets, encodePacket } from '../../src/main/core/net/rcon'
import { webRconCommand } from '../../src/main/core/net/webrcon'
import { SplitAssembler, parseInfo, queryInfo, queryPlayers } from '../../src/main/core/net/a2s'
import { parseServersAtAddress, serversAtAddress } from '../../src/main/core/net/steamServers'
import { findFreePortBlock, isPortFree, isUdpPortInUse, parseNetstatUdp } from '../../src/main/core/net/network'
import { requestStop } from '../../src/main/core/runtime/stop'
import { ServerSupervisor } from '../../src/main/core/runtime/supervisor'
import { authenticodeSigner, parseVcRedistQuery, vcRedistX64 } from '../../src/main/core/system/windows'
import { powershellPath } from '../../src/main/core/system/powershell'
import { serverPorts } from '../../src/shared/games'
import type { InstanceManifest } from '../../src/shared/types'

/**
 * Prueba de humo de los cimientos de Steam (fase 1): lo que necesitan los
 * juegos que no son Minecraft.
 *
 * Casi todo se prueba contra respuestas REALES grabadas en el prototipo
 * (scripts/smoke/fixtures/steam): así, si un juego cambia su protocolo, basta
 * con volver a grabar y la prueba dice qué se ha roto. Lo que se construye a
 * mano, sin grabación, se indica en su comprobación.
 */

const FIXTURES = join(process.cwd(), 'scripts', 'smoke', 'fixtures', 'steam')
const fixture = (name: string): Promise<string> => readFile(join(FIXTURES, name), 'utf8')

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Recorded {
  dir: 'in' | 'out'
  conn?: number
  label?: string
  hex: string
}

export async function steamSmoke(): Promise<void> {
  // --- SteamCMD ---------------------------------------------------------------

  await section('SteamCMD (salidas grabadas)', async () => {
    const installed = interpretRun(await fixture('steamcmd-instalado.txt'), 0)
    check('instalación correcta', installed.ok && !installed.alreadyUpToDate)

    const upToDate = interpretRun(await fixture('steamcmd-al-dia.txt'), 0)
    check('segunda ejecución: ya al día', upToDate.ok && upToDate.alreadyUpToDate)

    const missing = interpretRun(await fixture('steamcmd-missing-configuration.txt'), 8)
    check(
      '"Missing configuration" (código 8) se reintenta',
      !missing.ok && missing.error?.retryable === true,
      missing.error?.reason
    )

    const noSub = interpretRun(await fixture('steamcmd-no-subscription.txt'), 8)
    check(
      '"No subscription" (también código 8) NO se reintenta',
      !noSub.ok && noSub.error?.retryable === false && /cuenta/.test(noSub.error.message),
      noSub.error?.message
    )

    const self = interpretRun(await fixture('steamcmd-autoactualizacion.txt'), 7)
    check('autoactualización (código 7) no es un fallo', self.selfUpdated && !self.error)

    check(
      'las líneas traducidas no confunden: sin "Success" ni "ERROR" y código 5 es fallo',
      !interpretRun('[  0%] Buscando actualizaciones disponibles...', 5).ok
    )

    const lines = (await fixture('console_log-progreso.txt')).split(/\r?\n/)
    const progress = lines.map(parseProgressLine).filter((p) => p !== null)
    check('lee el progreso del console_log', progress.length >= 20, `${progress.length} líneas`)
    const downloads = progress.filter((p) => p.phase === 'downloading')
    check(
      'la descarga avanza sin retroceder',
      downloads.every((p, i) => i === 0 || p.fraction >= downloads[i - 1].fraction),
      `${(downloads[0]?.fraction * 100).toFixed(0)} % -> ${(downloads.at(-1)!.fraction * 100).toFixed(0)} %`
    )
    check(
      'reconoce verificación y aplicación',
      progress.some((p) => p.phase === 'verifying') && progress.some((p) => p.phase === 'committing')
    )
    check('el total son bytes reales', downloads[0]?.total === 15513364630)

    const acf = await fixture('appmanifest_896660.acf')
    check('build instalado desde el .acf', buildIdFromManifest(acf) === '25253791')
    check(
      'VDF: respeta las barras escapadas',
      vdfGet(parseVdf(acf), 'AppState', 'LauncherPath') === 'C:\\QubiQ\\data\\tools\\steamcmd\\steamcmd.exe'
    )
    const appInfo = await fixture('steamcmd-app-info-896660.txt')
    check(
      'build publicado desde app_info_print (rodeado de texto de SteamCMD)',
      buildIdFromAppInfo(appInfo, 896660) === '25253791'
    )
    check('rama inexistente: null', buildIdFromAppInfo(appInfo, 896660, 'no-existe') === null)

    // Sujetos reales: el del zip (certificado antiguo) y el de la autoactualización.
    check(
      'reconoce las dos firmas de Valve',
      isValveSigner('CN=Valve, OU=Digital ID Class 3 - Microsoft Software Validation v2, O=Valve, S=Washington, C=US') &&
        isValveSigner('CN=Valve Corp., O=Valve Corp., L=Bellevue, S=Washington, C=US')
    )
    check('y no se deja engañar por un parecido', !isValveSigner('CN=x, O=Valve Corp. Fake Ltd, C=US'))
  })

  // --- RCON -------------------------------------------------------------------

  await section('RCON (Project Zomboid grabado)', async () => {
    const recording = JSON.parse(await fixture('zomboid-rcon.json')) as Recorded[]
    const server = await replayRconServer(recording)
    const port = server.port
    try {
      let authError: unknown = null
      try {
        await RconClient.connect({ host: '127.0.0.1', port, password: 'incorrecta' })
      } catch (err) {
        authError = err
      }
      check(
        'contraseña mala: error de autenticación (id -1)',
        authError instanceof RconError && authError.kind === 'auth'
      )

      const client = await RconClient.connect({ host: '127.0.0.1', port, password: 'qubiq123' })
      try {
        const players = await client.exec('players')
        check('respuesta corta', players === 'Players connected (0): \n', JSON.stringify(players))

        const help = await client.exec('help')
        check(
          'respuesta partida en dos paquetes, entera',
          Buffer.byteLength(help, 'utf8') === 4086 + 2481,
          `${Buffer.byteLength(help, 'utf8')} bytes`
        )
        check(
          'el corte a mitad de carácter no rompe los acentos',
          !help.includes('\uFFFD') && help.includes('símbolos')
        )
        check('el doble eco del terminador no se cuela en la siguiente', (await client.exec('save')) === 'World saved')
      } finally {
        client.close()
      }
    } finally {
      server.close()
    }

    const { packets, rest } = decodePackets(
      Buffer.concat([encodePacket(1, 0, 'ab'), encodePacket(2, 0, '').subarray(0, 6)])
    )
    check('decodifica paquetes completos y guarda el resto', packets.length === 1 && rest.length === 6)
  })

  // --- A2S --------------------------------------------------------------------

  await section('A2S (Project Zomboid grabado)', async () => {
    const recording = JSON.parse(await fixture('zomboid-a2s.json'))['16261'] as {
      info: { log: Recorded[] }
      players: { log: Recorded[] }
    }
    const infoReply = Buffer.from(recording.info.log.find((e) => e.dir === 'in')!.hex, 'hex')
    const playersReply = Buffer.from(recording.players.log.find((e) => e.dir === 'in')!.hex, 'hex')

    const info = parseInfo(infoReply.subarray(4))
    check('nombre y mapa', info.name === 'My PZ Server' && info.map === 'Muldraugh, KY', `${info.name} · ${info.map}`)
    check('juego y jugadores', info.game === 'Project Zomboid' && info.players === 0, `${info.players}/${info.maxPlayers}`)
    check('servidor dedicado en Windows', info.serverType === 'dedicado' && info.environment === 'Windows')
    check('campos extra: versión en keywords', info.keywords?.includes('VERSION:42.20') === true, info.keywords)
    check('campos extra: puerto de juego', info.gamePort === 16261, String(info.gamePort))

    // Servidor UDP falso: responde lo grabado; con reto, primero pide el reto
    // (este flujo no lo usa Zomboid: construido según la documentación de Valve).
    const challenge = Buffer.from([0x0a, 0x0b, 0x0c, 0x0d])
    const udp = await fakeA2s((msg) => {
      const type = msg[4]
      const hasChallenge = type === 0x54 ? msg.length > 25 : msg.subarray(5, 9).equals(challenge)
      if (!hasChallenge) return Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41]), challenge])
      return type === 0x54 ? infoReply : playersReply
    })
    try {
      const viaChallenge = await queryInfo('127.0.0.1', udp.port)
      check('resuelve el reto y repite la petición (sintético)', viaChallenge.name === 'My PZ Server')
      check('jugadores: lista vacía', (await queryPlayers('127.0.0.1', udp.port)).length === 0)
    } finally {
      udp.socket.close()
    }

    let timedOut = ''
    const silent = createSocket('udp4')
    await new Promise<void>((r) => silent.bind(0, '127.0.0.1', () => r()))
    try {
      await queryInfo('127.0.0.1', silent.address().port, { timeoutMs: 500 })
    } catch (err) {
      timedOut = (err as Error).message
    } finally {
      silent.close()
    }
    check('un servidor mudo da error a tiempo, sin colgarse', /a tiempo/.test(timedOut))

    // Respuesta partida en 3 datagramas que llegan desordenados (sintético).
    const whole = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), infoReply.subarray(4)])
    const size = Math.ceil(whole.length / 3)
    const pieces = [0, 1, 2].map((n) => {
      const header = Buffer.alloc(12)
      header.writeUInt32LE(0xfffffffe, 0)
      header.writeInt32LE(1234, 4)
      header.writeUInt8(3, 8)
      header.writeUInt8(n, 9)
      header.writeUInt16LE(1248, 10)
      return Buffer.concat([header, whole.subarray(n * size, (n + 1) * size)])
    })
    const assembler = new SplitAssembler()
    const results = [pieces[2], pieces[0], pieces[1]].map((p) => assembler.push(p))
    check(
      'recompone una respuesta partida y desordenada (sintético)',
      results[0] === null && results[1] === null && parseInfo(results[2]!).name === 'My PZ Server'
    )
  })

  // --- WebRCON ----------------------------------------------------------------

  await section('WebRCON (formato de Rust, sin grabación)', async () => {
    const ws = await fakeWebRcon('secreto')
    try {
      const reply = await webRconCommand({ host: '127.0.0.1', port: ws.port, password: 'secreto' }, 'serverinfo')
      check('manda la orden y espera su Identifier', reply === 'respuesta a serverinfo', reply)
      check('ignora los mensajes de consola intercalados', ws.consoleMessagesSent > 0)

      let rejected = ''
      try {
        await webRconCommand({ host: '127.0.0.1', port: ws.port, password: 'mala', timeoutMs: 3000 }, 'x')
      } catch (err) {
        rejected = (err as Error).message
      }
      check('contraseña mala: el servidor cierra y se explica', /rechazó|contraseña|cerró|conectar/.test(rejected), rejected)
    } finally {
      ws.close()
    }
  })

  // --- Parada genérica ----------------------------------------------------------

  await section('Parada genérica', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qubiq-stop-'))
    try {
      // Un proceso de consola que solo sale limpio con Ctrl+Break, como Valheim.
      const breakScript = [
        "const fs = require('fs')",
        "process.on('SIGBREAK', () => { fs.writeFileSync('guardado.txt', 'ok'); process.exit(0) })",
        "process.on('SIGINT', () => {})",
        "console.log('LISTO')",
        'setInterval(() => {}, 1000)'
      ].join('\n')

      const sup = new ServerSupervisor('parada-ctrl-break')
      const exits: Array<number | null> = []
      sup.on('exit', (code: number | null) => exits.push(code))
      sup.start({
        command: process.execPath,
        args: ['-e', breakScript],
        cwd: dir,
        stop: { kind: 'ctrl-break', graceMs: 20_000 },
        parseLine: (raw) => ({ level: 'info', text: raw, ready: raw === 'LISTO' }),
        diagnoseExit: () => ({ code: 'x', title: 'x', detail: 'x' })
      })
      await sup.waitForLog(/LISTO/, 10_000)
      const t0 = Date.now()
      await sup.stop()
      const ms = Date.now() - t0
      check('Ctrl+Break: el servidor guarda y sale solo', await exists(join(dir, 'guardado.txt')), `${ms} ms`)
      check('sin llegar a matarlo', exits[0] === 0 && ms < 15_000, `código ${exits[0]}`)

      // Un proceso que ignora la orden: se mata al agotar SU plazo de gracia.
      const deaf = new ServerSupervisor('parada-sorda')
      const warnings: string[] = []
      deaf.on('log', (line: { level: string; text: string }) => {
        if (line.level === 'warn') warnings.push(line.text)
      })
      deaf.start({
        command: process.execPath,
        args: ['-e', "console.log('LISTO'); setInterval(() => {}, 1000)"],
        cwd: dir,
        stop: { kind: 'stdin', command: 'stop', graceMs: 1500 },
        parseLine: (raw) => ({ level: 'info', text: raw, ready: raw === 'LISTO' }),
        diagnoseExit: () => ({ code: 'x', title: 'x', detail: 'x' })
      })
      await deaf.waitForLog(/LISTO/, 10_000)
      const t1 = Date.now()
      await deaf.stop()
      const waited = Date.now() - t1
      check('respeta el plazo de gracia del juego', waited >= 1400 && waited < 6000, `${waited} ms`)
      check('y avisa de que ha tenido que forzar', warnings.some((w) => /1 segundos|2 segundos|forzar|fuerza/.test(w)), warnings[0])

      // Estrategia que falla (RCON sin servidor): se avisa y se sigue esperando.
      let failed = ''
      await requestStop(
        { kind: 'rcon', port: 1, password: 'x', command: 'quit' },
        { pid: undefined, writeStdin: () => undefined }
      ).catch((err: Error) => (failed = err.message))
      check('RCON caído: la petición falla con un error explicado', /RCON/.test(failed), failed)

      let apiCalled = false
      await requestStop({ kind: 'api', request: async () => void (apiCalled = true) }, { pid: 1, writeStdin: () => undefined })
      check('API: llama a la función del juego', apiCalled)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // --- Puertos ----------------------------------------------------------------

  await section('Puertos TCP y UDP', async () => {
    const taken = createSocket('udp4')
    await new Promise<void>((r) => taken.bind({ port: 0, address: '0.0.0.0', exclusive: true }, () => r()))
    const takenPort = taken.address().port
    try {
      check('detecta un puerto UDP ocupado', await isUdpPortInUse(takenPort), String(takenPort))
      check('un puerto ocupado solo en UDP sí está libre en TCP', await isPortFree(takenPort, 'tcp'))
      check('y no lo está para "TCP y UDP"', !(await isPortFree(takenPort, 'tcp+udp')))
      const block = await findFreePortBlock(takenPort - 1, 'udp', 2)
      check(
        'busca un bloque de puertos seguidos que no toque el ocupado',
        block !== takenPort - 1 && (block > takenPort || block + 1 < takenPort - 1),
        `${block}-${block + 1}`
      )
    } finally {
      taken.close()
    }
    await sleep(50)
    check('libre al soltarlo', !(await isUdpPortInUse(takenPort)))

    // Un socket que permite compartir el puerto (como el de Valheim) deja
    // reservarlo encima sin error: tiene que detectarse igualmente.
    const shared = createSocket({ type: 'udp4', reuseAddr: true })
    await new Promise<void>((r) => shared.bind({ port: 0, address: '0.0.0.0' }, () => r()))
    try {
      check('detecta un puerto UDP compartido (como Valheim)', await isUdpPortInUse(shared.address().port))
    } finally {
      shared.close()
    }
    const rows = parseNetstatUdp('  UDP    0.0.0.0:2456           *:*\r\n  UDP    [::]:2457              *:*\r\n  TCP    0.0.0.0:80   0.0.0.0:0   LISTENING')
    check('lee la tabla de netstat (IPv4, IPv6, sin TCP)', rows.has(2456) && rows.has(2457) && !rows.has(80))

    const mc = serverPorts({ game: 'minecraft', port: 25565 } as InstanceManifest)
    check(
      'Minecraft sigue siendo un puerto TCP con túnel Minecraft Java',
      mc.length === 1 && mc[0].protocol === 'tcp' && mc[0].tunnelType === 'Minecraft Java'
    )
  })

  // --- Sistema ----------------------------------------------------------------

  await section('Sistema: Visual C++ y firmas', async () => {
    const regOutput = [
      '',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64',
      '    Version    REG_SZ    v14.52.36328.00',
      '    Installed    REG_DWORD    0x1',
      '    Major    REG_DWORD    0xe',
      ''
    ].join('\r\n')
    const parsed = parseVcRedistQuery(regOutput)
    check('lee la salida real de reg query', parsed.installed && parsed.version === 'v14.52.36328.00')
    check('sin la clave: no instalado', !parseVcRedistQuery('').installed)
    const live = await vcRedistX64()
    check('consulta el registro de este equipo', typeof live.installed === 'boolean', live.version ?? 'no instalado')

    const signer = await authenticodeSigner(powershellPath())
    check('valida la firma de un binario de Windows', signer !== null && /Microsoft/.test(signer), signer ?? 'sin firma')
    const dir = await mkdtemp(join(tmpdir(), 'qubiq-firma-'))
    try {
      const fake = join(dir, 'falso.exe')
      await writeFile(fake, 'MZ no firmado')
      check('rechaza un ejecutable sin firma', (await authenticodeSigner(fake)) === null)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // --- Comprobación desde internet --------------------------------------------

  await section('Steam: servidores registrados por IP', async () => {
    const empty = parseServersAtAddress({
      response: { success: true, servers: [], message: 'No servers found at that address' }
    })
    check('respuesta real sin servidores', empty.length === 0)
    const one = parseServersAtAddress({
      response: {
        success: true,
        servers: [
          { addr: '203.0.113.7:2457', appid: 892970, gamedir: 'valheim', gameport: 2456, lan: false, secure: true }
        ]
      }
    })
    check('interpreta un servidor registrado (sintético)', one[0]?.appId === 892970 && one[0].gamePort === 2456)

    // Contrato con el servicio: una IP pública cualquiera, sin datos del usuario.
    const live = await serversAtAddress('1.1.1.1')
    check('el servicio de Steam responde', Array.isArray(live), `${live.length} servidores en 1.1.1.1`)
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Servidor RCON que reproduce una grabación. Recorre lo grabado en orden: cada
 * paquete que manda el cliente debe coincidir (tipo y cuerpo) con el siguiente
 * "out" grabado, y se responde con los "in" que lo siguieron, cambiando los ids
 * grabados por los del cliente y respetando los cortes originales.
 */
async function replayRconServer(recording: Recorded[]): Promise<{ port: number; close: () => void }> {
  let cursor = 0
  const ids = new Map<number, number>([[-1, -1]])

  const server = createServer((socket: Socket) => {
    let buffer: Buffer = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      const { packets, rest } = decodePackets(buffer)
      buffer = rest
      for (const packet of packets) {
        const expected = recording[cursor]
        const recorded = expected ? decodePackets(Buffer.from(expected.hex, 'hex')).packets[0] : null
        if (!expected || expected.dir !== 'out' || recorded?.type !== packet.type || !recorded.body.equals(packet.body)) {
          // Terminador que no está en la grabación: se contesta como un servidor normal.
          if (packet.type === 0 && packet.body.length === 0) socket.write(encodePacket(packet.id, 0, ''))
          continue
        }
        ids.set(recorded.id, packet.id)
        cursor++
        while (recording[cursor]?.dir === 'in') {
          const raw = Buffer.from(recording[cursor].hex, 'hex')
          let offset = 0
          while (offset + 8 <= raw.length) {
            const size = raw.readInt32LE(offset)
            const id = raw.readInt32LE(offset + 4)
            raw.writeInt32LE(ids.get(id) ?? id, offset + 4)
            offset += 4 + size
          }
          socket.write(raw)
          cursor++
        }
      }
    })
    socket.on('error', () => undefined)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  return { port: (server.address() as { port: number }).port, close: () => server.close() }
}

async function fakeA2s(reply: (msg: Buffer) => Buffer): Promise<{ port: number; socket: UdpSocket }> {
  const socket = createSocket('udp4')
  socket.on('message', (msg, rinfo) => socket.send(reply(msg), rinfo.port, rinfo.address))
  await new Promise<void>((r) => socket.bind(0, '127.0.0.1', () => r()))
  return { port: socket.address().port, socket }
}

/**
 * WebSocket mínimo (RFC 6455): apretón de manos y tramas de texto cortas. Solo
 * lo justo para hacer de servidor WebRCON de Rust en la prueba.
 */
async function fakeWebRcon(
  password: string
): Promise<{ port: number; close: () => void; consoleMessagesSent: number }> {
  const state = { consoleMessagesSent: 0 }
  const sockets = new Set<Socket>()

  const frame = (text: string): Buffer => {
    const payload = Buffer.from(text, 'utf8')
    const header =
      payload.length < 126
        ? Buffer.from([0x81, payload.length])
        : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff])
    return Buffer.concat([header, payload])
  }

  const server = createHttpServer()
  server.on('upgrade', (req, socket: Socket) => {
    sockets.add(socket)
    if (req.url !== `/${password}`) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n')
      return
    }
    const accept = createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    socket.on('data', (data: Buffer) => {
      const opcode = data[0] & 0x0f
      if (opcode === 0x8) {
        socket.end()
        return
      }
      let length = data[1] & 0x7f
      let offset = 2
      if (length === 126) {
        length = data.readUInt16BE(2)
        offset = 4
      }
      const mask = data.subarray(offset, offset + 4)
      const payload = Buffer.from(data.subarray(offset + 4, offset + 4 + length).map((b, i) => b ^ mask[i % 4]))
      const message = JSON.parse(payload.toString('utf8')) as { Identifier: number; Message: string }
      // Como Rust: antes de la respuesta puede colarse la consola del servidor.
      socket.write(frame(JSON.stringify({ Identifier: 0, Message: 'Saving 1234 entities', Type: 'Generic' })))
      state.consoleMessagesSent++
      socket.write(
        frame(
          JSON.stringify({
            Identifier: message.Identifier,
            Message: `respuesta a ${message.Message}`,
            Type: 'Generic',
            Stacktrace: ''
          })
        )
      )
    })
    socket.on('error', () => undefined)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  return {
    port: (server.address() as { port: number }).port,
    close: () => {
      for (const s of sockets) s.destroy()
      server.close()
    },
    get consoleMessagesSent() {
      return state.consoleMessagesSent
    }
  }
}
