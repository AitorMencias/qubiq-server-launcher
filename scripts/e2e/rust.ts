/**
 * Prueba de extremo a extremo de Rust (fase 7), con el servidor real:
 *
 *  1. Instalación por SteamCMD (reutilizando la copia ya descargada si la hay).
 *  2. `server.cfg`: el bloque de la app apaga Rust+ sin tocar lo del usuario.
 *  3. Arranque: genera el mapa y se detecta «listo» por el registro, sin IP ni
 *     contraseña en la consola y sin líneas dobladas.
 *  4. Puertos: juego y consulta por UDP; la consola remota solo en 127.0.0.1;
 *     Rust+ apagado.
 *  5. La consulta de Steam y la consola de la app (por WebRCON).
 *  6. Los ajustes llegan al servidor (se le preguntan por su consola).
 *  7. Moderación en caliente (vetar, levantar, administradores) y en frío
 *     (escribiendo sus ficheros, que el servidor lee al arrancar).
 *  8. Copia en caliente con `server.save`.
 *  9. Parada limpia con `quit`: guarda y suelta los puertos.
 * 10. Parar mientras genera el mapa: espera a que termine, sin matarlo.
 * 11. Oxide y plugins de uMod: poner Oxide, un plugin, arrancar, **otro plugin
 *     en caliente**, apagar uno en caliente, y quitar Oxide dejando los DLL
 *     idénticos a los de Steam.
 * 12. Borrado del mapa con el servidor en marcha: copia, semilla nueva, vuelve
 *     a arrancar solo con el mapa nuevo.
 * 13. Restaurar la copia de antes del borrado: vuelve el mapa y la semilla.
 * 14. Que la instalación compartida quede como vino de Steam.
 *
 * ⚠ **Esta prueba publica el servidor.** Rust no tiene forma de no anunciarse:
 * en cuanto arranca se registra en Steam con la dirección pública del equipo.
 * El usuario lo autorizó expresamente para esta fase (2026-09-26). Se para
 * siempre al terminar.
 *
 * Ejecutar con:  npm run e2e:rust  [-- --descargar]
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { setDataRoot, serverDir, instanceDir } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import * as instances from '../../src/main/core/instances/manager'
import { gameFor } from '../../src/main/core/games/registry'
import { isPortInUse, isUdpPortInUse } from '../../src/main/core/net/network'
import { queryInfo } from '../../src/main/core/net/a2s'
import { rustAdapter } from '../../src/main/core/games/rust/adapter'
import { bansCfgPath, identityDir, serverCfgPath, usersCfgPath } from '../../src/main/core/games/rust/config'
import { parseKeywords } from '../../src/main/core/games/rust/rcon'
import { queryPortFor, rconPortFor, rustPlusPortFor } from '../../src/shared/games/rust/types'
import type { RustManifest } from '../../src/shared/types'

const execFileAsync = promisify(execFile)

const PORT = 28215
const WORLD = 1000
const SEED = 4711
/** Un SteamID64 bien formado que no es de nadie que vaya a entrar. */
const ALGUIEN = '76561197960287930'
/** Dos plugins pequeños de uMod sin dependencias, para no alargar la prueba. */
const PLUGIN_A = 'GatherManager'
const PLUGIN_B = 'NoGiveNotices'

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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function waitForStatus(id: string, status: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await service.get(id)
    if (state.status === status) return true
    if (state.status === 'crashed') return false
    await sleep(2_000)
  }
  return false
}

async function waitForLine(lineas: string[], pattern: RegExp, timeoutMs: number): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = lineas.find((l) => pattern.test(l))
    if (found) return found
    await sleep(1_000)
  }
  return undefined
}

async function sha1(path: string): Promise<string> {
  return createHash('sha1').update(await readFile(path)).digest('hex')
}

/**
 * Las direcciones en las que escucha un puerto TCP, según `netstat`.
 *
 * ⚠ No con una conexión de prueba: en Rust, cada conexión a su consola remota
 * ocupa uno de sus cuatro sitios por dirección y no lo suelta (medido).
 */
async function tcpEscuchando(port: number): Promise<string[]> {
  const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true })
  return stdout
    .split(/\r?\n/)
    .map((l) => new RegExp(`^\\s*TCP\\s+(\\S+):${port}\\s+\\S+\\s+LISTENING`).exec(l)?.[1])
    .filter((a): a is string => a !== undefined)
}

async function main(): Promise<void> {
  const dev = join(process.env['LOCALAPPDATA'] ?? tmpdir(), 'qubiq-dev')
  const root = join(dev, 'e2e-rust')
  const compartido = join(dev, 'steam', 'rust')
  const reusar = !process.argv.includes('--descargar') && (await exists(compartido))

  await rm(root, { recursive: true, force: true })
  await mkdir(join(root, 'cache'), { recursive: true })
  setDataRoot(root)
  await service.initialize()
  // La prueba no debe hacer borrados programados por su cuenta.
  service.rust.stopWatcher()
  console.log(`Datos en ${root}`)
  console.log(
    reusar
      ? `Reutilizando la instalación de ${compartido} (enlace, sin descargar)\n`
      : 'Instalando desde Steam: son unos 5,5 GB\n'
  )
  console.log(
    '⚠ Rust no se puede arrancar sin anunciarse: mientras dure la prueba, el servidor\n' +
      '  saldrá en la lista del juego. Se para siempre al terminar.\n'
  )

  for (const [puerto, udp] of [
    [PORT, true],
    [queryPortFor(PORT), true],
    [rconPortFor(PORT), false]
  ] as const) {
    if (udp ? await isUdpPortInUse(puerto) : await isPortInUse(puerto)) {
      console.error(`El puerto ${puerto} está ocupado. Páralo antes de ejecutar la prueba.`)
      process.exit(1)
    }
  }

  // Los DLL originales de Steam, para comprobar que quitar Oxide los devuelve.
  const assembly = join(compartido, 'RustDedicated_Data', 'Managed', 'Assembly-CSharp.dll')
  const assemblyOriginal = reusar ? await sha1(assembly) : ''

  // --- 1. Crear e instalar -----------------------------------------------------

  console.log('== Creación e instalación')
  const manifest = (await instances.createInstance(
    {
      game: 'rust',
      name: 'Rust e2e "QubiQ"',
      port: PORT,
      expectedPlayers: 4,
      agreements: ['steam-subscriber'],
      exposure: { mode: 'local' },
      options: {
        description: 'Prueba automática, se apaga enseguida',
        worldSize: WORLD,
        seed: SEED,
        maxPlayers: 4,
        settings: { 'server.pve': true, 'decay.scale': 0 },
        wipe: { auto: false, newSeed: true, blueprints: false }
      }
    },
    gameFor('rust')
  )) as RustManifest

  check('crea la instancia', manifest.data.worldSize === WORLD && manifest.data.seed === SEED)
  check('con su contraseña de consola remota', manifest.data.rconPassword.length >= 20)

  if (reusar) {
    await rm(serverDir(manifest.id), { recursive: true, force: true })
    await execFileAsync('cmd', ['/c', 'mklink', '/J', serverDir(manifest.id), compartido], {
      windowsHide: true
    })
  }

  const t0 = Date.now()
  let ultimaFase = ''
  service.on('progress', (update: { phase: string; detail?: string }) => {
    if (update.phase !== ultimaFase) {
      ultimaFase = update.phase
      console.log(`  ... ${update.detail ?? update.phase}`)
    }
  })

  await service.install(manifest.id)
  const instalado = (await service.get(manifest.id)).manifest as RustManifest
  check(
    'servidor instalado',
    await exists(join(serverDir(manifest.id), 'RustDedicated.exe')),
    `${((Date.now() - t0) / 1000).toFixed(0)} s`
  )
  check('anota la build de Steam', instalado.data.buildId !== undefined, instalado.data.buildId)

  // --- 2. server.cfg ------------------------------------------------------------

  console.log('\n== server.cfg')
  const cfg = await readFile(serverCfgPath(manifest.id), 'utf8')
  check('apaga Rust+ desde el bloque de la app', cfg.includes('app.port -1'))
  await writeFile(serverCfgPath(manifest.id), `server.tickrate 10\r\n${cfg}`, 'utf8')

  // --- 3. Arranque ---------------------------------------------------------------

  console.log('\n== Arranque (genera el mapa)')
  const lineas: string[] = []
  const anotar = (_id: string, line: { text: string }): void => {
    lineas.push(line.text)
  }
  service.on('log', anotar)

  const t1 = Date.now()
  await service.start(manifest.id)
  const arrancado = await waitForStatus(manifest.id, 'running', 10 * 60_000)
  check('arranca y el registro dice que ya acepta jugadores', arrancado, `${((Date.now() - t1) / 1000).toFixed(0)} s`)
  check('el mapa se genera con su tamaño y su semilla', lineas.some((l) => l.includes(`(${WORLD} m, semilla ${SEED})`)))
  check('dentro de la instancia', (await readdir(identityDir(manifest.id))).some((f) => f.startsWith(`proceduralmap.${WORLD}.${SEED}.`)))

  const conIp = lineas.filter((l) => /(?<![\w.])(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)\d{1,3}(\.\d{1,3}){3}\b/.test(l))
  check('ninguna línea de la consola enseña una IP', conIp.length === 0, conIp[0])
  check(
    'ni la contraseña de la consola remota',
    lineas.every((l) => !l.includes(manifest.data.rconPassword))
  )
  const dobles = lineas.filter((l, i) => i > 0 && l === lineas[i - 1])
  check('sin líneas dobladas en la consola', dobles.length === 0, dobles[0])

  // Se da un momento para que termine de darse de alta en Steam.
  await sleep(8_000)

  // --- 4. Puertos ------------------------------------------------------------------

  console.log('\n== Puertos')
  check('juego por UDP', await isUdpPortInUse(PORT))
  check('consulta de Steam por UDP, dos más allá', await isUdpPortInUse(queryPortFor(PORT)))
  const consola = await tcpEscuchando(rconPortFor(PORT))
  check('consola remota en el siguiente, por TCP', consola.length > 0, consola.join(', '))
  check('pero solo en 127.0.0.1, no a toda la red', consola.every((a) => a === '127.0.0.1'))
  check('Rust+ apagado: no abre su puerto', (await tcpEscuchando(rustPlusPortFor(PORT))).length === 0)

  // --- 5. Consulta de Steam y consola -----------------------------------------------

  console.log('\n== Consulta de Steam y consola')
  const info = await service.connectionInfo(manifest.id)
  check('el servidor contesta al protocolo del juego', info.ping.state === 'ok', info.ping.state)
  check("con su nombre (las comillas cambiadas por ')", info.ping.motd === "Rust e2e 'QubiQ'", info.ping.motd)
  check('y sus plazas', info.ping.playersMax === 4, String(info.ping.playersMax))
  const a2s = await queryInfo('127.0.0.1', queryPortFor(PORT), { timeoutMs: 4_000 })
  const keywords = parseKeywords(a2s.keywords)
  check('versión de red en su consulta', /^\d+$/.test(keywords.version ?? ''), keywords.version)
  check('sin Oxide no sale como modificado', !keywords.modded)

  const estado = await service.get(manifest.id)
  check('la app ve que no hay nadie', estado.players.length === 0 && estado.playerCount === 0, String(estado.playerCount))

  // Con el sondeo de cada 5 s ya en marcha, la consola remota tiene que seguir
  // contestando: con una conexión por orden, Rust la bloqueaba en medio minuto.
  await sleep(30_000)
  const sesiones = (await execFileAsync('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true })).stdout
    .split(/\r?\n/)
    .filter((l) => new RegExp(`127\\.0\\.0\\.1:\\d+\\s+127\\.0\\.0\\.1:${rconPortFor(PORT)}\\s+ESTABLISHED`).test(l))
  check('medio minuto después, una sola conexión a la consola remota', sesiones.length === 1, `${sesiones.length}`)

  lineas.length = 0
  await service.sendCommand(manifest.id, 'status')
  check(
    'la consola de la app manda órdenes por WebRCON y enseña la respuesta',
    lineas.some((l) => l.startsWith('> status')) && lineas.some((l) => /hostname: Rust e2e/.test(l)),
    lineas.slice(0, 3).join(' | ')
  )
  let silencio = ''
  try {
    await service.sendCommand(manifest.id, 'orden-que-no-existe')
  } catch (err) {
    silencio = (err as Error).message
  }
  check('una orden que no existe se explica', /no avisa cuando no conoce una orden/.test(silencio), silencio)

  // --- 6. Ajustes ----------------------------------------------------------------------

  console.log('\n== Ajustes (preguntados al servidor)')
  const actual = (await service.get(manifest.id)).manifest as RustManifest
  const pve = await rustAdapter.sendCommand!(actual, 'server.pve')
  check('PvE encendido', /"True"/.test(pve), pve)
  const decay = await rustAdapter.sendCommand!(actual, 'decay.scale')
  check('sin deterioro', /"0"/.test(decay), decay)
  const tickrate = await rustAdapter.sendCommand!(actual, 'server.tickrate')
  check('y lo que el usuario puso en server.cfg se respeta', /"10"/.test(tickrate), tickrate)

  // --- 7. Moderación en caliente -----------------------------------------------------

  console.log('\n== Moderación en caliente')
  const conVeto = await service.rust.ban(manifest.id, ALGUIEN, 'prueba automática')
  check('vetar por SteamID', conVeto.some((b) => b.steamId === ALGUIEN && b.reason === 'prueba automática'))
  check('y queda escrito en bans.cfg', (await readFile(bansCfgPath(manifest.id), 'utf8')).includes(ALGUIEN))
  const sinVeto = await service.rust.unban(manifest.id, ALGUIEN)
  check('levantar el veto', !sinVeto.some((b) => b.steamId === ALGUIEN))
  const conAdmin = await service.rust.setAdmin(manifest.id, ALGUIEN, 'Admin de prueba', 'owner')
  check('dar administrador', conAdmin.some((a) => a.steamId === ALGUIEN && a.level === 'owner'))
  const sinAdmin = await service.rust.removeAdmin(manifest.id, ALGUIEN)
  check('y quitarlo', !sinAdmin.some((a) => a.steamId === ALGUIEN))

  // --- 8. Copia en caliente ------------------------------------------------------------

  console.log('\n== Copia de seguridad en caliente')
  const t2 = Date.now()
  const backup = await service.createBackup(manifest.id, 'e2e')
  check(
    'hace la copia después de server.save',
    backup.sizeBytes > 0,
    `${(backup.sizeBytes / 1024).toFixed(0)} KB en ${((Date.now() - t2) / 1000).toFixed(0)} s`
  )
  check('anota mapa y semilla', backup.variant === `mapa ${WORLD} · semilla ${SEED}`, backup.variant)

  // --- 9. Parada limpia ----------------------------------------------------------------

  console.log('\n== Parada limpia (quit por WebRCON)')
  lineas.length = 0
  const t3 = Date.now()
  await service.stop(manifest.id)
  const stopMs = Date.now() - t3
  check('para y sale solo', (await service.get(manifest.id)).status === 'stopped', `${(stopMs / 1000).toFixed(1)} s`)
  check('sin tener que matarlo', stopMs < 60_000)
  check('guarda antes de cerrar', lineas.includes('Mapa guardado.'))
  check('suelta los puertos', !(await isUdpPortInUse(PORT)) && (await tcpEscuchando(rconPortFor(PORT))).length === 0)

  // --- Moderación en frío -----------------------------------------------------------

  console.log('\n== Moderación con el servidor parado (sus ficheros)')
  await service.rust.ban(manifest.id, ALGUIEN, 'vetado en frío')
  await service.rust.setAdmin(manifest.id, '76561197960287931', 'Admin en frío', 'moderator')
  check('se escribe bans.cfg', (await readFile(bansCfgPath(manifest.id), 'utf8')).includes('vetado en frío'))
  check('y users.cfg', (await readFile(usersCfgPath(manifest.id), 'utf8')).includes('moderatorid 76561197960287931'))

  lineas.length = 0
  const t5 = Date.now()
  await service.start(manifest.id)
  check('el segundo arranque, con el mapa hecho', await waitForStatus(manifest.id, 'running', 5 * 60_000), `${((Date.now() - t5) / 1000).toFixed(0)} s`)
  check('recupera lo construido', lineas.some((l) => l.startsWith('Recuperando lo construido')))
  const leidos = await service.rust.listBans(manifest.id)
  check(
    'el servidor ha leído el veto escrito en frío (se le pregunta por su consola)',
    leidos.some((b) => b.steamId === ALGUIEN && b.reason === 'vetado en frío')
  )
  await service.rust.unban(manifest.id, ALGUIEN)
  await service.rust.removeAdmin(manifest.id, '76561197960287931')
  await service.stop(manifest.id)

  // --- 10. Parar mientras genera el mapa ------------------------------------------

  console.log('\n== Parar mientras genera un mapa')
  const conOtraSemilla = await service.rust.wipe(manifest.id, { seed: 2468, newSeed: false })
  check('borrado en frío con semilla nueva', conOtraSemilla.seed === 2468 && conOtraSemilla.maps.length === 0)
  lineas.length = 0
  await service.start(manifest.id)
  await waitForLine(lineas, /Preparando el mapa/, 120_000)
  await sleep(3_000)
  const t6 = Date.now()
  await service.stop(manifest.id)
  const stopGenerando = Date.now() - t6
  check(
    'para, esperando a que termine el mapa, sin matarlo',
    (await service.get(manifest.id)).status === 'stopped' && !lineas.some((l) => /Se fuerza el cierre/.test(l)),
    `${(stopGenerando / 1000).toFixed(1)} s`
  )
  check('y avisa de por qué tarda', lineas.some((l) => /no atiende la orden de parar mientras genera/.test(l)))
  check('guardando el mapa nuevo', (await readdir(identityDir(manifest.id))).some((f) => f.startsWith(`proceduralmap.${WORLD}.2468.`)))

  // --- 11. Oxide y plugins ------------------------------------------------------------

  console.log('\n== Oxide y plugins de uMod')
  const conOxide = await service.rust.installOxide(manifest.id, (d) => console.log(`  ... ${d}`))
  check('pone Oxide', conOxide.loader.installed, conOxide.loader.version ?? '')
  const conA = await service.rust.addPlugin(manifest.id, PLUGIN_A)
  check('instala un plugin de uMod', conA.view.mods.some((m) => m.id === PLUGIN_A))
  check('en oxide/plugins', await exists(join(serverDir(manifest.id), 'oxide', 'plugins', `${PLUGIN_A}.cs`)))

  lineas.length = 0
  await service.start(manifest.id)
  check('arranca con Oxide', await waitForStatus(manifest.id, 'running', 5 * 60_000))
  const cargado = await waitForLine(lineas, new RegExp(`Plugin en marcha: Gather Manager`), 120_000)
  check('Oxide compila y carga el plugin', cargado !== undefined, cargado)
  await sleep(5_000)
  const a2sOxide = await queryInfo('127.0.0.1', queryPortFor(PORT), { timeoutMs: 4_000 }).catch(() => null)
  check('y sale marcado como modificado en su consulta', parseKeywords(a2sOxide?.keywords).modded, a2sOxide?.keywords)

  lineas.length = 0
  const conB = await service.rust.addPlugin(manifest.id, PLUGIN_B)
  check('instala otro con el servidor en marcha', conB.view.mods.some((m) => m.id === PLUGIN_B))
  const enCaliente = await waitForLine(lineas, /Plugin en marcha: No Give Notices/, 90_000)
  check('y Oxide lo carga en caliente, sin reiniciar', enCaliente !== undefined, enCaliente)

  lineas.length = 0
  await service.rust.setPluginEnabled(manifest.id, PLUGIN_A, false)
  const detenido = await waitForLine(lineas, /Plugin detenido: Gather Manager/, 60_000)
  check('apagar uno en caliente lo descarga al momento', detenido !== undefined, detenido)

  await service.stop(manifest.id)
  await service.rust.removePlugin(manifest.id, PLUGIN_A)
  const sinPlugins = await service.rust.removePlugin(manifest.id, PLUGIN_B)
  check('quita los plugins', sinPlugins.mods.length === 0)
  const sinOxide = await service.rust.removeOxide(manifest.id, (d) => console.log(`  ... ${d}`))
  check('quita Oxide', !sinOxide.loader.installed)
  if (reusar) {
    check('y los DLL vuelven a ser los de Steam', (await sha1(assembly)) === assemblyOriginal)
  }
  check(
    'sin restos de Oxide',
    !(await exists(join(serverDir(manifest.id), 'RustDedicated_Data', 'Managed', 'Oxide.Rust.dll'))) &&
      !(await exists(join(serverDir(manifest.id), 'oxide')))
  )

  // --- 12. Borrado con el servidor en marcha ----------------------------------------

  console.log('\n== Borrado del mapa con el servidor en marcha')
  await service.start(manifest.id)
  await waitForStatus(manifest.id, 'running', 5 * 60_000)
  const copiasAntes = (await service.listBackups(manifest.id)).length
  lineas.length = 0
  const mapaNuevo = await service.rust.wipe(manifest.id, { newSeed: true })
  check('cambia la semilla', mapaNuevo.seed !== 2468, String(mapaNuevo.seed))
  check('guarda una copia antes', (await service.listBackups(manifest.id)).length > copiasAntes)
  check('vuelve a arrancar solo', await waitForStatus(manifest.id, 'running', 10 * 60_000))
  check('con el mapa nuevo', lineas.some((l) => l.includes(`semilla ${mapaNuevo.seed})`)))
  const vista = await service.rust.getMap(manifest.id)
  check('y anota cuándo', vista.lastWipeAt !== null)
  await service.stop(manifest.id)

  service.off('log', anotar)

  // --- 13. Restaurar la copia de antes del borrado ------------------------------------

  console.log('\n== Restaurar una copia de antes del borrado')
  await service.restoreBackup(manifest.id, backup.fileName)
  const restaurado = (await service.get(manifest.id)).manifest as RustManifest
  check('vuelve el mapa de entonces', (await readdir(identityDir(manifest.id))).some((f) => f.startsWith(`proceduralmap.${WORLD}.${SEED}.`)))
  check('y la semilla vuelve con él', restaurado.data.seed === SEED, String(restaurado.data.seed))

  // --- Limpieza ------------------------------------------------------------------------

  await service.remove(manifest.id)
  check('borra el servidor', !(await exists(instanceDir(manifest.id))))

  if (reusar) {
    // Lo que la prueba dejó DENTRO de la instalación compartida (el enlace solo
    // se lleva el enlace) se limpia a mano: tiene que quedar como vino.
    for (const resto of ['server/qubiq', 'oxide', 'Oxide.Compiler.exe']) {
      await rm(join(compartido, ...resto.split('/')), { recursive: true, force: true })
    }
    const sigue = await stat(join(compartido, 'RustDedicated.exe')).catch(() => null)
    check('la instalación compartida sigue en su sitio', sigue !== null)
    check('con los DLL de Steam', (await sha1(assembly)) === assemblyOriginal)
  }

  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} fallos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  // Nunca se deja un servidor publicado colgando.
  await service.stopAll().catch(() => undefined)
  process.exit(1)
})
