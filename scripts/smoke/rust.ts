import { createHash } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
import type { Socket } from 'node:net'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { check, section } from './harness'
import {
  diagnoseExit,
  launchArgs,
  parseLine,
  rustAdapter
} from '../../src/main/core/games/rust/adapter'
import {
  MANAGED_MARK,
  identityDir,
  parseBans,
  parseUsersCfg,
  serializeBansCfg,
  serializeUsersCfg,
  serverCfgPath,
  writeServerCfg
} from '../../src/main/core/games/rust/config'
import {
  parseKeywords,
  parsePlayerList,
  parseServerInfo
} from '../../src/main/core/games/rust/rcon'
import { currentMap, mapsOnDisk, wipeFiles, wipeTargets } from '../../src/main/core/games/rust/wipe'
import {
  oxideFits,
  parsePluginHeader,
  parseRequires,
  compareVersions
} from '../../src/main/core/games/rust/mods'
import { EchoFilter } from '../../src/main/core/runtime/echoes'
import { WebRconSilenceError, webRconCommand } from '../../src/main/core/net/webrcon'
import { WebRconSession } from '../../src/main/core/net/webrconSession'
import { parseInfo } from '../../src/main/core/net/a2s'
import {
  capabilitiesFor,
  defaultPortFor,
  gameInfo,
  serverPorts,
  versionLabel
} from '../../src/shared/games'
import {
  DEFAULT_WIPE_PLAN,
  RUST_GAME_APP_ID,
  RUST_SETTINGS,
  changedSettings,
  consoleQuote,
  forcedWipeOf,
  monthKey,
  nextForcedWipe,
  queryPortFor,
  rconPortFor,
  validSteamId,
  wipeMoment
} from '../../src/shared/games/rust/types'
import type { RustCreateRequest, RustManifest } from '../../src/shared/types'

/**
 * Prueba de humo de Rust (fase 7).
 *
 * Casi todo va contra grabaciones **reales** del servidor (protocolo 2633):
 * su registro, su consola remota, su consulta de Steam y la ayuda que da él
 * mismo de cada variable. Lo sintético está marcado como tal.
 *
 * Lo que de verdad protege esta prueba, y por lo que existe:
 *
 * 1. **Que no se cuele en la consola ni la IP pública del usuario ni la
 *    contraseña de la consola remota.** El servidor escribe las dos.
 * 2. **Que la consola remota recoja la respuesta entera** (una orden devuelve
 *    varios mensajes) y **distinga el silencio** de una orden que no existe.
 * 3. **Que la línea de órdenes no lleve nada negativo** (Rust se come el guion)
 *    y ate la consola remota a 127.0.0.1.
 * 4. **Que los valores de serie de los ajustes sean los del servidor**, contra
 *    lo que contesta `find` (`variables.txt`).
 * 5. **Que el borrado borre lo mismo que el parche del mes**, y no los planos
 *    salvo que se pida.
 */

const FIXTURES = join(process.cwd(), 'scripts', 'smoke', 'fixtures', 'rust')

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function lineas(fichero: string): Promise<string[]> {
  const raw = await readFile(join(FIXTURES, fichero), 'utf8')
  return raw.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.startsWith('//'))
}

/** Una IPv4 que no es la del propio equipo, igual que la busca el adaptador. */
const IP_DE_FUERA = /(?<![\w.])(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)\d{1,3}(?:\.\d{1,3}){3}\b/

function manifestoDePrueba(overrides: Partial<RustManifest['data']> = {}): RustManifest {
  return {
    schemaVersion: 2,
    id: 'prueba-rust',
    name: 'Servidor "de" prueba',
    game: 'rust',
    port: 28015,
    expectedPlayers: 8,
    autoRestart: false,
    backup: { enabled: false, intervalHours: 6, keep: 3 },
    createdAt: new Date().toISOString(),
    agreements: ['steam-subscriber'],
    data: {
      description: 'Una descripción',
      worldSize: 3000,
      seed: 12345,
      maxPlayers: 8,
      rconPassword: 'contrasena-de-prueba',
      rustPlus: false,
      settings: {},
      wipe: { ...DEFAULT_WIPE_PLAN },
      plugins: [],
      ...overrides
    }
  }
}

export async function rustSmoke(): Promise<void> {
  // --- El registro ---------------------------------------------------------------

  await section('Rust: registro real (arranque, guardado y parada)', async () => {
    const registro = await lineas('registro.txt')
    const eventos = registro.map((l) => parseLine(l))

    check('lee las 384 líneas grabadas sin fallar', eventos.length > 300, `${eventos.length}`)
    check(
      '«listo» sale de «Server startup complete»',
      eventos.some((e) => e.ready) && registro.filter((l, i) => eventos[i]!.ready).every((l) => /Server startup complete/.test(l))
    )
    check(
      'el mapa que se prepara se dice con su tamaño y su semilla',
      eventos.some((e) => /Preparando el mapa \(3000 m, semilla 12345\)/.test(e.text))
    )
    check('«Saving complete» se traduce', eventos.some((e) => e.text === 'Mapa guardado.'))
    check(
      'el cierre por quit se cuenta',
      eventos.some((e) => e.text === 'Cerrando el servidor…' && !e.hidden)
    )

    const visibles = eventos.filter((e) => !e.hidden)
    check(
      'la consola enseña lo que importa, no el ruido del motor',
      visibles.length < 40,
      `${visibles.length} de ${eventos.length} líneas`
    )

    const lineaDeOrdenes = registro.findIndex((l) => l.startsWith('Command Line:'))
    const ev = eventos[lineaDeOrdenes]!
    check('la línea de órdenes no sale en la consola', ev.hidden === true)
    check(
      'y se guarda sin la contraseña de la consola remota',
      !ev.text.includes('contrasena-de-prueba') && ev.text.includes('<contraseña>'),
      ev.text.slice(0, 60)
    )
    check(
      'ninguna línea, ni oculta, lleva la contraseña de la consola remota',
      eventos.every((e) => !e.text.includes('contrasena-de-prueba'))
    )
  })

  await section('Rust: la IP pública no se enseña nunca', async () => {
    const todas = [
      ...(await lineas('registro.txt')),
      ...(await lineas('oxide.txt')),
      ...(await lineas('segundo-arranque.txt'))
    ]
    const conIp = todas.filter((l) => IP_DE_FUERA.test(l))
    check('las grabaciones traen la IP pública (saneada)', conIp.some((l) => l.includes('203.0.113.7')))
    const eventos = todas.map((l) => parseLine(l))
    check(
      'ninguna línea visible lleva una IP de fuera',
      eventos.every((e) => e.hidden || !IP_DE_FUERA.test(e.text))
    )
    check(
      'y se borra hasta del texto que se guarda',
      eventos.every((e) => !e.text.includes('203.0.113.7'))
    )
    const compilador = parseLine('[CSharp] Started Oxide.Compiler v1.0.32.0 successfully')
    check(
      'una versión de cuatro números no se toma por una dirección',
      compilador.text.includes('1.0.32.0'),
      compilador.text
    )

    // Sintéticas: la forma de siempre del registro de Rust al entrar y salir.
    // No se han podido grabar sin clientes del juego.
    const entra = parseLine('203.0.113.9:61234/76561198000000001/Fulano joined [windows/76561198000000001]')
    check('quien entra se nombra sin su IP (sintético)', entra.text === 'Fulano ha entrado.' && !entra.hidden, entra.text)
    const sale = parseLine('203.0.113.9:61234/76561198000000001/Fulano disconnecting: closing')
    check('quien sale, igual (sintético)', sale.text === 'Fulano ha salido.', sale.text)
    const chat = parseLine('[CHAT] Fulano[76561198000000001] : hola a todos')
    check(
      'el chat se reconoce (sintético)',
      chat.level === 'chat' && chat.chat?.player === 'Fulano' && chat.chat.message === 'hola a todos'
    )
  })

  await section('Rust: las líneas repetidas del propio servidor', async () => {
    const registro = await lineas('registro.txt')
    const filtro = new EchoFilter()
    // Las del registro llegaron casi seguidas: un milisegundo entre cada una.
    const pasan = registro.filter((l, i) => filtro.accept(l, 1_000_000 + i))
    check(
      'se tira el eco: queda bastante menos',
      pasan.length < registro.length - 40,
      `${registro.length} → ${pasan.length}`
    )
    // Lo que sigue repetido tiene que ser repetición de verdad, no eco: Rust
    // escribe «AsyncResourceUpload failed.» tres veces al cargar la escena (y
    // cada una con su eco, seis en total).
    const pares = (ls: string[]): string[] =>
      ls.filter((l, i) => i > 0 && l.replace(/^﻿+/, '') === ls[i - 1]!.replace(/^﻿+/, ''))
    const antes = pares(registro)
    const despues = pares(pasan)
    check(
      'de las líneas iguales seguidas, solo quedan las repeticiones de verdad',
      despues.every((l) => /AsyncResourceUpload failed/.test(l)),
      `${antes.length} pares antes, ${despues.length} después: ${[...new Set(despues)].join(' | ')}`
    )

    const dos = new EchoFilter()
    const a = dos.accept('Saving complete', 0)
    const b = dos.accept('Saving complete', 10)
    const c = dos.accept('Saving complete', 20)
    check('cada línea absorbe un solo eco: dos guardados seguidos salen los dos', a && !b && c)
    const lejos = new EchoFilter()
    lejos.accept('Saving complete', 0)
    check('lo repetido pasado un segundo no es eco', lejos.accept('Saving complete', 5_000))
  })

  await section('Rust: segundo arranque y Oxide (grabados)', async () => {
    const segundo = (await lineas('segundo-arranque.txt')).map((l) => parseLine(l))
    check(
      'al cargar un mapa hecho se dice que recupera lo construido',
      segundo.some((e) => /^Recuperando lo construido \(\d+ objetos del mapa\)/.test(e.text) && !e.hidden)
    )

    const oxide = (await lineas('oxide.txt')).map((l) => parseLine(l))
    check('Oxide se anuncia al cargar', oxide.some((e) => e.text === 'Cargando Oxide, el cargador de plugins…'))
    check(
      'los plugins cargados se dicen con su versión',
      oxide.some((e) => e.text === 'Plugin en marcha: Gather Manager (versión 2.2.78).') &&
        oxide.some((e) => e.text === 'Plugin en marcha: Kits (versión 4.4.9).')
    )
    check(
      'los dos de serie de Oxide (Unity y Rust) no cuentan como plugins',
      !oxide.some((e) => !e.hidden && /Plugin en marcha: (Unity|Rust) /.test(e.text))
    )
    check(
      'las extensiones y el compilador son detalle interno',
      oxide.every((e) => e.hidden || !/Loaded extension|compiler/i.test(e.text))
    )
    check('descargar un plugin se dice', oxide.some((e) => e.text === 'Plugin detenido: Gather Manager.'))
  })

  await section('Rust: diagnóstico al cerrarse', async () => {
    const registro = await lineas('registro.txt')
    const quit = diagnoseExit(4294967295, registro.slice(-20))
    check('«quit» escrito en la consola es un cierre normal, no un fallo', quit.code === 'clean-exit', quit.code)
    const puerto = diagnoseExit(1, ["Couldn't Start Server."])
    check('puerto ocupado', puerto.code === 'port-in-use' && puerto.action?.kind === 'change-port')
    const oxide = diagnoseExit(1, ['Loading Oxide Core v2.0.4143...', 'MissingMethodException: Method not found'])
    check('Oxide de otra versión del juego', oxide.code === 'oxide-mismatch')
  })

  // --- La consola remota ---------------------------------------------------------

  await section('Rust: WebRCON contra la grabación real', async () => {
    const grabacion = JSON.parse(await readFile(join(FIXTURES, 'webrcon.json'), 'utf8')) as Record<
      string,
      ({ enviado?: { Identifier: number; Message: string }; recibido?: { Identifier: number; Message: string } })[]
    >
    const respuestas = respuestasPorOrden([...grabacion['vanilla']!, ...grabacion['oxide']!])
    check(
      'la grabación tiene órdenes con varias respuestas',
      [...respuestas.values()].some((r) => r.length >= 4)
    )
    check('y una orden sin ninguna', respuestas.get('orden-que-no-existe')?.length === 0)

    const servidor = await webRconDeMentira('contrasena-de-prueba', respuestas)
    const opciones = { host: '127.0.0.1', port: servidor.port, password: 'contrasena-de-prueba', timeoutMs: 1_500 }
    try {
      const guardar = await webRconCommand(opciones, 'server.save')
      check(
        'server.save: se recogen los cuatro mensajes, hasta «Saving complete»',
        /Saving navmesh/.test(guardar) && /Saving complete/.test(guardar),
        guardar.replace(/\n/g, ' | ').slice(0, 120)
      )
      check('y se ignoran los mensajes de consola intercalados', !guardar.includes('mensaje de consola'))

      const jugadores = parsePlayerList(await webRconCommand(opciones, 'playerlist'))
      check('playerlist vacío se lee como nadie', Array.isArray(jugadores) && jugadores.length === 0)

      const info = parseServerInfo(await webRconCommand(opciones, 'serverinfo'))
      check(
        'serverinfo: nombre, plazas y versión',
        info.maxPlayers === 4 && info.version === '2633' && typeof info.memoryMb === 'number',
        JSON.stringify(info)
      )

      const vetados = parseBans(await webRconCommand(opciones, 'banlistex'))
      check('banlistex con un vetado', vetados.length <= 1)

      let silencio: unknown = null
      try {
        await webRconCommand(opciones, 'orden-que-no-existe')
      } catch (err) {
        silencio = err
      }
      check(
        'una orden que no existe: silencio, y se explica distinto de «no conecta»',
        silencio instanceof WebRconSilenceError,
        silencio instanceof Error ? silencio.message : String(silencio)
      )

      const version = await webRconCommand(opciones, 'oxide.version')
      check('oxide.version (grabado con Oxide)', /Oxide\.Rust Version: 2\.0\.7726/.test(version))

      const salir = await webRconCommand(opciones, 'quit')
      check('quit contesta y cierra: lo que llegó vale', salir.length > 0)

      let rechazada = ''
      try {
        await webRconCommand({ ...opciones, password: 'mala' }, 'status')
      } catch (err) {
        rechazada = (err as Error).message
      }
      check('contraseña mala: el servidor cierra y se explica', /rechazó|contraseña/.test(rechazada), rechazada)
    } finally {
      servidor.close()
    }

    // La sesión única: lo que evita que Rust deje sin consola a la app. Medido
    // contra el servidor real: admite cuatro conexiones por dirección y no
    // suelta las cerradas.
    const otro = await webRconDeMentira('contrasena-de-prueba', respuestas)
    const sesion = new WebRconSession({ host: '127.0.0.1', port: otro.port, password: 'contrasena-de-prueba', timeoutMs: 1_500 })
    try {
      const juntas = await Promise.all([
        sesion.command('playerlist', { timeoutMs: 1_500 }),
        sesion.command('serverinfo', { timeoutMs: 1_500 }),
        sesion.command('server.save', { timeoutMs: 1_500 })
      ])
      for (let i = 0; i < 10; i++) await sesion.command('playerlist', { timeoutMs: 1_500 })
      check(
        'sesión: trece órdenes, varias a la vez, por UNA sola conexión',
        otro.conexiones() === 1,
        `${otro.conexiones()} conexiones`
      )
      check(
        'y cada respuesta llega a quien la pidió',
        juntas[0] === '[]' && /"MaxPlayers": 4/.test(juntas[1]!) && /Saving complete/.test(juntas[2]!)
      )
      let calla: unknown = null
      try {
        await sesion.command('orden-que-no-existe', { timeoutMs: 800 })
      } catch (err) {
        calla = err
      }
      check('una orden sin respuesta no tumba la sesión', calla instanceof WebRconSilenceError && sesion.connected)
      await sesion.command('quit', { timeoutMs: 1_500 })
      await sleep(200)
      check('quit cierra la conexión', !sesion.connected)
      await sesion.command('playerlist', { timeoutMs: 1_500 })
      check('y la siguiente orden abre otra (un servidor nuevo tiene sitio)', otro.conexiones() === 2)
    } finally {
      sesion.close()
      otro.close()
    }

    const vetado = parseBans('1 76561197960287930 "Prueba" "motivo de prueba" -1\n')
    check(
      'banlistex se lee (grabado)',
      vetado.length === 1 && vetado[0]!.steamId === '76561197960287930' && vetado[0]!.reason === 'motivo de prueba'
    )

    const alguien = parsePlayerList(
      JSON.stringify([
        { SteamID: '76561198000000001', DisplayName: 'Fulano', Ping: 30, ConnectedSeconds: 120 },
        { SteamID: 12 },
        { DisplayName: 'sin id' }
      ])
    )
    check(
      'playerlist con alguien dentro (sintético): lo que no encaja se descarta',
      alguien.length === 1 && alguien[0]!.name === 'Fulano' && alguien[0]!.steamId === '76561198000000001'
    )
  })

  // --- La consulta de Steam ------------------------------------------------------

  await section('Rust: consulta de Steam (grabada)', async () => {
    const a2s = JSON.parse(await readFile(join(FIXTURES, 'a2s.json'), 'utf8')) as Record<string, string[]>
    // Grabadas tal cual llegan, con la cabecera FFFFFFFF de paquete suelto.
    const vanilla = parseInfo(Buffer.from(a2s['vanilla']![0]!, 'hex').subarray(4))
    const oxide = parseInfo(Buffer.from(a2s['oxide']![0]!, 'hex').subarray(4))
    check('se lee el nombre y las plazas', vanilla.maxPlayers === 4 && vanilla.players === 0)
    check('se registra como el juego (252490)', vanilla.gameId === String(RUST_GAME_APP_ID), vanilla.gameId)
    const kv = parseKeywords(vanilla.keywords)
    const ko = parseKeywords(oxide.keywords)
    check('la versión de red sale de las palabras clave', kv.version === '2633', kv.version)
    check('y cuándo nació el mapa', typeof kv.bornAt === 'string' && kv.bornAt.startsWith('2026-'), kv.bornAt)
    check('sin Oxide no sale como modificado', kv.modded === false)
    check('con Oxide, sí (^o, medido)', ko.modded === true, oxide.keywords)
  })

  // --- Ficheros y línea de órdenes -------------------------------------------------

  await section('Rust: línea de órdenes', async () => {
    const m = manifestoDePrueba({ settings: { 'server.pve': true, 'decay.scale': 1, 'server.url': '' } })
    const args = launchArgs(m)
    const valor = (clave: string): string | undefined => args[args.indexOf(clave) + 1]
    check('la consola remota se ata a 127.0.0.1', valor('+rcon.ip') === '127.0.0.1')
    check('en el puerto siguiente al de juego', valor('+rcon.port') === String(rconPortFor(m.port)))
    check('la consulta, en el de después', valor('+server.queryport') === String(queryPortFor(m.port)))
    check('WebRCON encendido', valor('+rcon.web') === '1')
    check('las comillas del nombre no parten la orden', valor('+server.hostname') === "Servidor 'de' prueba")
    check('solo lo que se aparta de lo de serie', args.includes('+server.pve') && !args.includes('+decay.scale'))
    check('un texto vacío no se pasa', !args.includes('+server.url'))
    check('sin Rust+ no se pasa su puerto', !args.includes('+app.port'))
    check('nada negativo (Rust se come el guion)', args.every((a) => !/^-\d/.test(a)))
    const conRustPlus = launchArgs(manifestoDePrueba({ rustPlus: true }))
    check('con Rust+, su puerto', conRustPlus[conRustPlus.indexOf('+app.port') + 1] === '28082')
  })

  await section('Rust: server.cfg, users.cfg y bans.cfg', async () => {
    const m = manifestoDePrueba()
    await mkdir(join(identityDir(m.id), 'cfg'), { recursive: true })
    await writeFile(serverCfgPath(m.id), 'server.tickrate 30\r\n// algo del usuario\r\n', 'utf8')
    await writeServerCfg(m)
    let cfg = await readFile(serverCfgPath(m.id), 'utf8')
    check('lo del usuario se conserva', cfg.includes('server.tickrate 30') && cfg.includes('// algo del usuario'))
    check('sin Rust+ se apaga desde aquí (app.port -1)', cfg.includes(MANAGED_MARK) && cfg.includes('app.port -1'))
    await writeServerCfg(manifestoDePrueba({ rustPlus: true }))
    cfg = await readFile(serverCfgPath(m.id), 'utf8')
    check(
      'reescribir no duplica el bloque y, con Rust+, lo deja vacío',
      cfg.split(MANAGED_MARK).length === 2 && !cfg.includes('app.port -1') && cfg.includes('server.tickrate 30')
    )

    const admins = parseUsersCfg(
      serializeUsersCfg([
        { steamId: '76561197960287930', name: 'Yo "mismo"', level: 'owner' },
        { steamId: '76561197960287931', name: 'Moderadora', level: 'moderator' }
      ])
    )
    check(
      'users.cfg de ida y vuelta, sin comillas que lo rompan',
      admins.length === 2 && admins[0]!.level === 'owner' && admins[0]!.name === "Yo 'mismo'" && admins[1]!.level === 'moderator'
    )
    const bans = parseBans(serializeBansCfg([{ steamId: '76561197960287930', name: 'Pesado', reason: 'molestar' }]))
    check('bans.cfg de ida y vuelta', bans.length === 1 && bans[0]!.reason === 'molestar')
    check('consoleQuote cambia las comillas dobles', consoleQuote('di "hola"') === `"di 'hola'"`)
    check('SteamID64', validSteamId('76561197960287930') && !validSteamId('1234') && !validSteamId('86561197960287930'))
  })

  // --- Ajustes contra el propio servidor ------------------------------------------

  await section('Rust: los ajustes son variables reales, con su valor de serie', async () => {
    const ayuda = await readFile(join(FIXTURES, 'variables.txt'), 'utf8')
    for (const info of RUST_SETTINGS) {
      const linea = new RegExp(`^\\s*${info.key.replace('.', '\\.')}\\s+.*\\(([^()]*)\\)\\s*$`, 'm').exec(ayuda)
      if (!linea) {
        check(`${info.key} existe en el servidor`, false)
        continue
      }
      const deSerie = linea[1]!
      const esperado =
        typeof info.default === 'boolean' ? (info.default ? 'True' : 'False') : String(info.default)
      check(`${info.key}: de serie ${esperado}`, deSerie === esperado, `el servidor dice (${deSerie})`)
    }
    check('changedSettings quita lo de serie', Object.keys(changedSettings({ 'server.pve': false, 'decay.scale': 0 })).join() === 'decay.scale')
  })

  // --- El borrado --------------------------------------------------------------------

  await section('Rust: la fecha del borrado mensual', async () => {
    const octubre = forcedWipeOf(2026, 9)
    check('octubre de 2026: jueves 1 a las 18:00 UTC (19:00 en Londres, verano)', octubre.toISOString() === '2026-10-01T18:00:00.000Z', octubre.toISOString())
    const noviembre = forcedWipeOf(2026, 10)
    check('noviembre: jueves 5 a las 19:00 UTC (invierno)', noviembre.toISOString() === '2026-11-05T19:00:00.000Z', noviembre.toISOString())
    const marzo = forcedWipeOf(2027, 2)
    check('marzo de 2027: jueves 4, antes del cambio de hora', marzo.toISOString() === '2027-03-04T19:00:00.000Z', marzo.toISOString())
    const abril = forcedWipeOf(2027, 3)
    check('abril de 2027: jueves 1, ya en verano', abril.toISOString() === '2027-04-01T18:00:00.000Z', abril.toISOString())
    check(
      'el de este mes sigue siendo «el próximo» tres días después',
      nextForcedWipe(new Date('2026-10-03T12:00:00Z')).toISOString() === octubre.toISOString()
    )
    check(
      'y pasados, toca el del mes siguiente',
      nextForcedWipe(new Date('2026-10-06T12:00:00Z')).toISOString() === noviembre.toISOString()
    )
    check('momento: lejos, cerca y hoy', [
      wipeMoment(new Date('2026-09-20T12:00:00Z'), octubre),
      wipeMoment(new Date('2026-09-30T12:00:00Z'), octubre),
      wipeMoment(new Date('2026-10-01T20:00:00Z'), octubre)
    ].join() === 'lejos,cerca,hoy')
    check('clave del mes', monthKey(octubre) === '2026-10')
  })

  await section('Rust: qué borra un borrado', async () => {
    const m = manifestoDePrueba()
    const dir = identityDir(m.id)
    await mkdir(join(dir, 'cfg'), { recursive: true })
    // Los nombres son los que dejó el servidor real en su carpeta.
    const ficheros = [
      'proceduralmap.3000.12345.288.map',
      'proceduralmap.3000.12345.288.sav',
      'proceduralmap.3000.12345.288.sav.1',
      'proceduralmap.3000.12345.288.navmesh',
      'proceduralmap.3000.12345.288_occlusion_3.dat',
      'proceduralmap.3000.12345.287.map',
      'proceduralmap.3000.12345.287.sav',
      'player.states.288.db',
      'player.states.288.db-wal',
      'sv.files.288.db',
      'relationship.288.db',
      'clans.288.db',
      'player.blueprints.17.db',
      'player.blueprints.17.db-wal',
      'player.identities.17.db',
      'player.deaths.17.db',
      'player.tokens.db',
      'companion.id'
    ]
    for (const f of ficheros) await writeFile(join(dir, f), 'x'.repeat(100))

    const mapas = await mapsOnDisk(m.id)
    check('dos mapas en disco: el de este mes y el del pasado', mapas.length === 2, mapas.map((x) => x.saveVersion).join())
    check('el actual es el de versión de guardado más alta', currentMap(mapas, 3000, 12345)?.saveVersion === 288)

    const sinPlanos = await wipeTargets(m.id, false)
    check('sin planos: los planos se quedan', !sinPlanos.some((f) => f.startsWith('player.blueprints')))
    check('se va lo que va con el mapa', ['player.states.288.db', 'sv.files.288.db', 'relationship.288.db', 'clans.288.db'].every((f) => sinPlanos.includes(f)))
    check('y los mapas de meses pasados', sinPlanos.includes('proceduralmap.3000.12345.287.sav'))
    check(
      'se quedan identidades, muertes, Rust+ y la configuración',
      !sinPlanos.some((f) => /identities|deaths|tokens|companion|cfg/.test(f))
    )

    await wipeFiles(m.id, true)
    const quedan = await readdir(dir)
    check('con planos, se van también', !quedan.some((f) => f.startsWith('player.blueprints')))
    check('lo demás sigue ahí', ['player.identities.17.db', 'player.tokens.db', 'companion.id', 'cfg'].every((f) => quedan.includes(f)), quedan.join(', '))
  })

  // --- Oxide y uMod ----------------------------------------------------------------

  await section('Rust: Oxide y los plugins', async () => {
    const release = { version: '2.0.7726', url: '', releasedAt: '2026-09-22T10:55:45+00:00' }
    // La rama pública medida: build subida a las 08:29 y rama retocada a las
    // 10:51. La Oxide salió a las 10:55.
    const publica = { buildId: '25454815', timeBuildUpdated: 1790065793, timeUpdated: 1790074315 }
    check('Oxide publicada después de la build: vale', oxideFits(release, '25454815', publica).ok)
    const nueva = { buildId: '25500000', timeBuildUpdated: 1790500000, timeUpdated: 1790500000 }
    const pendiente = oxideFits(release, '25500000', nueva)
    check('build nueva sin Oxide todavía: no vale, y se dice por qué', !pendiente.ok && /todavía no ha salido/i.test((pendiente as { reason: string }).reason))
    check('servidor sin actualizar: no vale', !oxideFits(release, '25400000', publica).ok)
    check(
      'se mira la hora de la build y no la de la rama (retocada después)',
      oxideFits({ ...release, releasedAt: '2026-09-22T10:00:00Z' }, '25454815', publica).ok
    )

    const gather = parsePluginHeader('    [Info("Gather Manager", "Mughisi", "2.2.78")]')
    check('cabecera de un plugin (grabada)', gather.title === 'Gather Manager' && gather.version === '2.2.78')
    const kits = parsePluginHeader('    [Info("Kits", "k1lly0u", "4.4.9"), Description("Create kits")]')
    check('con descripción detrás, también', kits.version === '4.4.9')
    check(
      '// Requires: se lee (sintético)',
      parseRequires('// Requires: ImageLibrary\n//Requires: ZoneManager.cs\nusing System;').join() === 'ImageLibrary,ZoneManager'
    )
    check('versiones como números', compareVersions('2.2.78', '2.2.8') > 0 && compareVersions('4.4.9', '4.4.9') === 0)
  })

  // --- El juego en el catálogo compartido ------------------------------------------

  await section('Rust: catálogo, puertos y contrato', async () => {
    const m = manifestoDePrueba()
    const puertos = serverPorts(m)
    check('dos puertos, los dos UDP', puertos.length === 2 && puertos.every((p) => p.protocol === 'udp'))
    check('la consola remota no se lista nunca', !puertos.some((p) => p.port === rconPortFor(m.port)))
    const conRustPlus = serverPorts(manifestoDePrueba({ rustPlus: true }))
    check('con Rust+, uno TCP más', conRustPlus.length === 3 && conRustPlus[2]!.protocol === 'tcp')
    const caps = capabilitiesFor(m)
    check('consola, nombres y moderación', caps.commands && caps.playerNames && caps.moderation && caps.content)
    check('puerto de serie 28015', defaultPortFor('rust') === 28015)
    check(
      'la tarjeta avisa de que sale siempre en la lista',
      gameInfo('rust').card.highlights.some((h) => h.tone === 'warn' && /lista pública/.test(h.text))
    )
    check('versión con la de red', versionLabel(manifestoDePrueba({ gameVersion: '2633' })) === 'Rust 2633')

    const peticion = (options: Partial<RustCreateRequest['options']>): RustCreateRequest => ({
      game: 'rust',
      name: 'Prueba',
      port: 28015,
      agreements: ['steam-subscriber'],
      options: { worldSize: 3000, ...options }
    })
    const data = await rustAdapter.prepareCreate(peticion({ settings: { 'server.pve': true }, wipe: { auto: true } }), 'Prueba')
    check('la contraseña de la consola remota la pone la app', data.rconPassword.length >= 20)
    check('semilla al azar si no se da', data.seed >= 1)
    check('el plan de borrado sale del asistente', data.wipe.auto === true && data.wipe.newSeed === true)
    const falla = async (options: Partial<RustCreateRequest['options']>): Promise<boolean> =>
      rustAdapter.prepareCreate(peticion(options), 'Prueba').then(() => false, () => true)
    check('tamaño fuera de rango: no', await falla({ worldSize: 500 }))
    check('semilla fuera de rango: no', await falla({ seed: 0 }))
    check('un ajuste que no existe: no', await falla({ settings: { 'server.inventado': 1 } }))
  })
}

// --- Un servidor WebRCON que repite lo grabado --------------------------------------

type Evento = { enviado?: { Identifier: number; Message: string }; recibido?: { Identifier: number; Message: string } }

/** Qué contestó el servidor real a cada orden: todos los mensajes con su Identifier. */
function respuestasPorOrden(eventos: Evento[]): Map<string, string[]> {
  const porId = new Map<number, string>()
  const respuestas = new Map<string, string[]>()
  for (const e of eventos) {
    if (e.enviado) {
      porId.set(e.enviado.Identifier, e.enviado.Message)
      respuestas.set(e.enviado.Message, [])
    } else if (e.recibido) {
      const orden = porId.get(e.recibido.Identifier)
      if (orden !== undefined) respuestas.get(orden)!.push(e.recibido.Message)
    }
  }
  return respuestas
}

/**
 * WebSocket mínimo (RFC 6455) que contesta a cada orden con los mensajes que
 * dio el servidor real, uno a uno y con un mensaje de consola en medio, como
 * hace Rust. A lo que no contestó, no contesta; tras `quit`, cierra.
 */
async function webRconDeMentira(
  password: string,
  respuestas: Map<string, string[]>
): Promise<{ port: number; close: () => void; conexiones: () => number }> {
  const sockets = new Set<Socket>()
  let conexiones = 0
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
    socket.on('error', () => undefined)
    if (req.url !== `/${password}`) {
      socket.destroy()
      return
    }
    conexiones++
    const accept = createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    // Varias órdenes seguidas pueden llegar en el mismo paquete TCP: se leen
    // todas las tramas que haya, no solo la primera.
    let pendiente = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      pendiente = Buffer.concat([pendiente, chunk])
      for (;;) {
        if (pendiente.length < 2) return
        if ((pendiente[0]! & 0x0f) === 0x8) {
          socket.end()
          return
        }
        let length = pendiente[1]! & 0x7f
        let offset = 2
        if (length === 126) {
          if (pendiente.length < 4) return
          length = pendiente.readUInt16BE(2)
          offset = 4
        }
        if (pendiente.length < offset + 4 + length) return
        const mask = pendiente.subarray(offset, offset + 4)
        const payload = Buffer.from(pendiente.subarray(offset + 4, offset + 4 + length).map((b, i) => b ^ mask[i % 4]!))
        pendiente = pendiente.subarray(offset + 4 + length)
        contestar(JSON.parse(payload.toString('utf8')) as { Identifier: number; Message: string })
      }
    })
    const contestar = (orden: { Identifier: number; Message: string }): void => {
      const mensajes = respuestas.get(orden.Message) ?? []
      mensajes.forEach((texto, i) => {
        setTimeout(() => {
          socket.write(frame(JSON.stringify({ Identifier: 0, Message: 'mensaje de consola', Type: 'Generic' })))
          socket.write(frame(JSON.stringify({ Identifier: orden.Identifier, Message: texto, Type: 'Generic', Stacktrace: '' })))
          if (orden.Message === 'quit' && i === mensajes.length - 1) setTimeout(() => socket.destroy(), 20)
        }, 20 * (i + 1))
      })
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  return {
    port: (server.address() as { port: number }).port,
    close: () => {
      for (const s of sockets) s.destroy()
      server.close()
    },
    conexiones: () => conexiones
  }
}
