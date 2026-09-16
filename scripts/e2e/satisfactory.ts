/**
 * Prueba de extremo a extremo de Satisfactory (fase 2), con el servidor real:
 *
 * 1. Instalación por SteamCMD (reutilizando la copia ya descargada si la hay).
 * 2. Primer arranque: la app **reclama el servidor sola** y le crea la partida.
 * 3. Arranque normal: se detecta «listo» por la API y se leen los jugadores.
 * 4. Puertos: 7777 en TCP y UDP, y el 8888 de la mensajería.
 * 5. Copia en caliente (el servidor guarda antes) y restauración.
 * 6. Partidas: listar, guardar, crear otra y volver a la primera.
 * 7. Parada limpia por la API: sale solo y con código 0.
 * 8. **Lo más importante:** que la carpeta del juego del usuario
 *    (`%LOCALAPPDATA%\FactoryGame`) no se haya tocado.
 *
 * El servidor ocupa 15,5 GB, así que por defecto se enlaza la instalación de
 * `%LOCALAPPDATA%\qubiq-dev\steam\satisfactory` en vez de volver a bajarla.
 * Con `--descargar` se instala de cero en la caché de la prueba.
 *
 * Ejecutar con:  npm run e2e:satisfactory  [-- --descargar]
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { setDataRoot, serverDir, instanceDir } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import * as instances from '../../src/main/core/instances/manager'
import { gameFor } from '../../src/main/core/games/registry'
import { isPortInUse, isUdpPortInUse } from '../../src/main/core/net/network'
import { RELIABLE_PORT } from '../../src/shared/games/satisfactory/types'
import type { SatisfactoryManifest } from '../../src/shared/types'

const execFileAsync = promisify(execFile)

const PORT = 7777
const ID = 'e2e-satisfactory'
const ADMIN_PASSWORD = 'qubiq-e2e'

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

/** Carpeta del juego del usuario: la que esta prueba tiene que dejar intacta. */
function userGameDir(): string {
  return join(process.env['LOCALAPPDATA'] ?? tmpdir(), 'FactoryGame', 'Saved', 'SaveGames')
}

async function listUserSaves(): Promise<string[]> {
  return (await readdir(userGameDir()).catch(() => [])).sort()
}

/** Espera a que el servidor llegue a un estado, o se rinde. */
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

async function main(): Promise<void> {
  const dev = join(process.env['LOCALAPPDATA'] ?? tmpdir(), 'qubiq-dev')
  const root = join(dev, 'e2e-satisfactory')
  const compartido = join(dev, 'steam', 'satisfactory')
  const reusar = !process.argv.includes('--descargar') && (await exists(compartido))

  await rm(root, { recursive: true, force: true })
  await mkdir(join(root, 'cache'), { recursive: true })
  setDataRoot(root)
  await service.initialize()
  console.log(`Datos en ${root}`)
  console.log(
    reusar
      ? `Reutilizando la instalación de ${compartido} (enlace, sin descargar)\n`
      : 'Instalando desde Steam: son 15,5 GB\n'
  )

  // ⚠ Con un servidor de Satisfactory en marcha esta prueba NO puede correr: el
  // puerto 8888 es fijo, el servidor de la prueba no lo conseguiría y sus
  // llamadas a la API se las llevaría el otro servidor (pasó con uno del
  // usuario). Se para aquí antes de tocar nada.
  if (await isPortInUse(RELIABLE_PORT)) {
    console.error(
      `El puerto ${RELIABLE_PORT} está ocupado: ya hay un servidor de Satisfactory en marcha. ` +
        'Páralo antes de ejecutar esta prueba (solo puede haber uno a la vez).'
    )
    process.exit(1)
  }

  // Foto de la carpeta del usuario ANTES de tocar nada.
  const antes = await listUserSaves()

  // --- 1. Crear e instalar -----------------------------------------------------

  console.log('== Creación e instalación')
  const manifest = (await instances.createInstance(
    {
      game: 'satisfactory',
      name: 'Fábrica e2e',
      expectedPlayers: 6,
      port: PORT,
      agreements: ['steam-subscriber'],
      exposure: { mode: 'local' },
      options: {
        adminPassword: ADMIN_PASSWORD,
        clientPassword: 'amigos-e2e',
        sessionName: 'PartidaE2E'
      }
    },
    gameFor('satisfactory')
  )) as SatisfactoryManifest

  check('crea la instancia sin instalar nada todavía', manifest.data.claimed === false)
  check('el límite de jugadores sale de los jugadores esperados', manifest.data.maxPlayers === 6)

  if (reusar) {
    // Se enlaza la instalación ya descargada en el sitio donde la app espera
    // encontrar el servidor. SteamCMD la dará por buena y solo comprobará que
    // está al día, que es justo lo que hace en un equipo ya instalado.
    await rm(serverDir(manifest.id), { recursive: true, force: true })
    await execFileAsync('cmd', ['/c', 'mklink', '/J', serverDir(manifest.id), compartido], {
      windowsHide: true
    })
    await mkdir(join(serverDir(manifest.id), 'datos', 'Saved'), { recursive: true })
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
  const instalado = (await service.get(manifest.id)).manifest as SatisfactoryManifest

  check(
    'servidor instalado',
    await exists(
      join(serverDir(manifest.id), 'Engine', 'Binaries', 'Win64', 'FactoryServer-Win64-Shipping-Cmd.exe')
    ),
    `${((Date.now() - t0) / 1000).toFixed(0)} s`
  )
  check('queda reclamado por la app, sin abrir el juego', instalado.data.claimed)
  check('anota la build de Steam', instalado.data.buildId !== undefined, instalado.data.buildId)
  check('anota la versión del juego', instalado.data.gameVersion !== undefined, instalado.data.gameVersion)

  const savesDir = join(serverDir(manifest.id), 'datos', 'Saved', 'SaveGames', 'server')
  const guardados = await readdir(savesDir).catch(() => [])
  check('la partida se ha creado y guardado dentro de la instancia', guardados.length > 0, guardados.join(', '))

  // --- 2. Arranque -------------------------------------------------------------

  console.log('\n== Arranque')
  const t1 = Date.now()
  await service.start(manifest.id)
  const arrancado = await waitForStatus(manifest.id, 'running', 5 * 60_000)
  check('arranca y la API dice que la partida está lista', arrancado, `${((Date.now() - t1) / 1000).toFixed(0)} s`)

  const info = await service.connectionInfo(manifest.id)
  check('responde a la consulta de estado', info.ping.state === 'ok')
  check('dice el límite de jugadores', info.ping.playersMax === 6, String(info.ping.playersMax))
  check('no hay nadie dentro', info.ping.playersOnline === 0)

  check('ocupa el puerto del juego en TCP', await isPortInUse(PORT))
  check('y también en UDP', await isUdpPortInUse(PORT))
  check('abre el puerto de mensajería', await isPortInUse(RELIABLE_PORT), String(RELIABLE_PORT))

  // --- 3. Partidas -------------------------------------------------------------

  console.log('\n== Partidas')
  const sesiones = await service.satisfactory.listSessions(manifest.id)
  check('ve la partida creada al instalar', sesiones.currentSessionName === 'PartidaE2E')

  const guardada = await service.satisfactory.saveNow(manifest.id, 'e2e-guardado')
  check(
    'guarda cuando se le pide',
    guardada.sessions.some((s) => s.saves.some((save) => save.saveName === 'e2e-guardado'))
  )

  const segunda = await service.satisfactory.createGame(manifest.id, 'SegundaE2E')
  check('crea una partida nueva sin borrar la anterior', segunda.sessions.length >= 2)
  check(
    'la anterior sigue ahí',
    segunda.sessions.some((s) => s.sessionName === 'PartidaE2E')
  )

  const vuelta = await service.satisfactory.loadSave(manifest.id, 'e2e-guardado', 'PartidaE2E')
  check('se puede volver a la primera', vuelta.currentSessionName === 'PartidaE2E')

  // --- 4. Ajustes --------------------------------------------------------------

  console.log('\n== Ajustes')
  const opciones = await service.satisfactory.setOptions(manifest.id, {
    'FG.AutosaveInterval': '600.0'
  })
  check(
    'cambia un ajuste en caliente',
    opciones.options['FG.AutosaveInterval'] === '600.0',
    opciones.options['FG.AutosaveInterval']
  )

  // --- 5. Copia en caliente ------------------------------------------------------

  console.log('\n== Copia de seguridad')
  const backup = await service.createBackup(manifest.id, 'e2e')
  check('hace la copia con el servidor en marcha', backup.sizeBytes > 0, `${(backup.sizeBytes / 1024).toFixed(0)} KB`)
  check('anota la versión del juego en la copia', backup.version !== 'desconocida', backup.version)

  // --- 6. Parada ---------------------------------------------------------------

  console.log('\n== Parada limpia')
  const t2 = Date.now()
  await service.stop(manifest.id)
  const parado = (await service.get(manifest.id)).status
  const stopMs = Date.now() - t2
  check('para por la API y sale solo', parado === 'stopped', `${(stopMs / 1000).toFixed(1)} s`)
  check('suelta el puerto del juego', !(await isPortInUse(PORT)))
  check('suelta el de mensajería', !(await isPortInUse(RELIABLE_PORT)))

  // --- 7. Restaurar ------------------------------------------------------------

  console.log('\n== Restauración')
  await service.restoreBackup(manifest.id, backup.fileName)
  const restaurados = await readdir(savesDir).catch(() => [])
  check('restaura las partidas', restaurados.length > 0, `${restaurados.length} guardados`)

  // --- 8. La comprobación que más importa ----------------------------------------

  console.log('\n== Aislamiento de los datos del juego del usuario')
  const despues = await listUserSaves()
  check(
    'no ha escrito nada en %LOCALAPPDATA%\\FactoryGame',
    antes.length === despues.length && antes.every((f, i) => f === despues[i]),
    despues.filter((f) => !antes.includes(f)).join(', ') || 'sin cambios'
  )

  // --- Limpieza ------------------------------------------------------------------

  await service.remove(manifest.id)
  check('borra el servidor', !(await exists(instanceDir(manifest.id))))

  if (reusar) {
    // El enlace se lleva por delante solo el enlace, pero la carpeta `datos`
    // que creó la prueba está DENTRO de la instalación compartida: se limpia.
    await rm(join(compartido, 'datos'), { recursive: true, force: true })
    const sigue = await stat(compartido).catch(() => null)
    check('la instalación compartida sigue en su sitio', sigue !== null)
  }

  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} fallos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
