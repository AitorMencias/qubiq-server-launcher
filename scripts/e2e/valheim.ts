/**
 * Prueba de extremo a extremo de Valheim (fase 3), con el servidor real:
 *
 * 1. Instalación por SteamCMD (reutilizando la copia ya descargada si la hay).
 * 2. Arranque: se genera el mundo y se detecta «listo» por el registro.
 * 3. Puertos: el de juego y el siguiente, los dos UDP.
 * 4. Copia en caliente: se espera a que el servidor guarde y se copia.
 * 5. Moderación: las tres listas de texto, leídas y escritas.
 * 6. Parada limpia con Ctrl+Break: guarda el mundo y sale con código 0.
 * 7. Parar mientras arranca: la señal se ignora y hay que reintentarla, así que
 *    se comprueba que el servidor **no acaba muerto a la fuerza**.
 * 8. Mundos: crear otro, cambiar y borrar, con la copia previa automática.
 * 9. Mods de Thunderstore: se instala uno de verdad con BepInEx, se arranca y
 *    se comprueba que **el cargador dice en su registro que lo ha cargado** y
 *    que el servidor sigue parando limpio con Ctrl+Break, que es lo que no se
 *    puede perder. Después se apaga, se enciende y se quita.
 * 10. Restauración de la copia.
 * 10. **Lo más importante:** que la carpeta del juego del usuario
 *     (`%USERPROFILE%\AppData\LocalLow\IronGate\Valheim`) no se haya tocado.
 *
 * Nada de esto publica el servidor: se arranca con `-public 0` y sin crossplay,
 * así que no aparece en ninguna lista ni sale nada hacia fuera.
 *
 * Ejecutar con:  npm run e2e:valheim  [-- --descargar]
 */

import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { setDataRoot, serverDir, instanceDir } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import * as instances from '../../src/main/core/instances/manager'
import { gameFor } from '../../src/main/core/games/registry'
import { isUdpPortInUse } from '../../src/main/core/net/network'
import { queryPortFor } from '../../src/shared/games/valheim/types'
import type { ValheimManifest } from '../../src/shared/types'

const execFileAsync = promisify(execFile)

const PORT = 2456
const ID = 'e2e-valheim'
/** Guardado cada minuto: la copia en caliente espera a que le toque guardar. */
const SAVE_INTERVAL_SECONDS = 60

/**
 * El mod con el que se prueba: pequeño (290 KB), de servidor, con el `.dll`
 * suelto en la raíz del paquete —la forma más común— y sin más dependencia que
 * el propio BepInEx.
 */
const MOD = 'Advize-PlantEverything'

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

/**
 * Carpeta donde Valheim guarda las partidas del usuario si no se le dice otra
 * cosa. Es la que esta prueba tiene que dejar intacta.
 */
function userGameDir(): string {
  return join(homedir(), 'AppData', 'LocalLow', 'IronGate', 'Valheim')
}

async function userWorlds(): Promise<string[]> {
  return (await readdir(join(userGameDir(), 'worlds_local')).catch(() => [])).sort()
}

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
  const root = join(dev, 'e2e-valheim')
  const compartido = join(dev, 'steam', 'valheim')
  const reusar = !process.argv.includes('--descargar') && (await exists(compartido))

  await rm(root, { recursive: true, force: true })
  await mkdir(join(root, 'cache'), { recursive: true })
  setDataRoot(root)
  await service.initialize()
  console.log(`Datos en ${root}`)
  console.log(
    reusar
      ? `Reutilizando la instalación de ${compartido} (enlace, sin descargar)\n`
      : 'Instalando desde Steam: son unos 2 GB\n'
  )

  if (await isUdpPortInUse(PORT)) {
    console.error(
      `El puerto ${PORT} está ocupado: ya hay un servidor de Valheim en marcha. Páralo antes.`
    )
    process.exit(1)
  }

  // Foto de la carpeta del usuario ANTES de tocar nada.
  const antes = await userWorlds()

  // --- 1. Crear e instalar -----------------------------------------------------

  console.log('== Creación e instalación')
  const manifest = (await instances.createInstance(
    {
      game: 'valheim',
      name: 'Valheim e2e',
      port: PORT,
      agreements: ['steam-subscriber'],
      // Sin crossplay y sin publicar: esta prueba no saca nada hacia fuera.
      exposure: { mode: 'local' },
      options: {
        password: 'qubiq-e2e',
        worldName: 'MundoE2E',
        preset: 'hard',
        modifiers: { combat: 'veryhard' },
        globalKeys: ['nomap'],
        listed: false
      }
    },
    gameFor('valheim')
  )) as ValheimManifest

  check('crea la instancia', manifest.data.worldName === 'MundoE2E')
  check('guarda la dificultad elegida', manifest.data.preset === 'hard')
  check('y el modificador suelto', manifest.data.modifiers.combat === 'veryhard')

  // Guardar cada minuto, para que la copia en caliente no tarde media hora.
  await instances.updateInstance(
    manifest.id,
    { data: { ...manifest.data, saveIntervalSeconds: SAVE_INTERVAL_SECONDS } },
    gameFor('valheim')
  )

  if (reusar) {
    await rm(serverDir(manifest.id), { recursive: true, force: true })
    await execFileAsync('cmd', ['/c', 'mklink', '/J', serverDir(manifest.id), compartido], {
      windowsHide: true
    })
    await mkdir(join(serverDir(manifest.id), 'datos'), { recursive: true })
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
  const instalado = (await service.get(manifest.id)).manifest as ValheimManifest

  check(
    'servidor instalado',
    await exists(join(serverDir(manifest.id), 'valheim_server.exe')),
    `${((Date.now() - t0) / 1000).toFixed(0)} s`
  )
  check('anota la build de Steam', instalado.data.buildId !== undefined, instalado.data.buildId)

  // --- 2. Arranque -------------------------------------------------------------

  console.log('\n== Arranque (genera el mundo)')
  const t1 = Date.now()
  await service.start(manifest.id)
  const arrancado = await waitForStatus(manifest.id, 'running', 5 * 60_000)
  check(
    'arranca y el registro dice que ya acepta jugadores',
    arrancado,
    `${((Date.now() - t1) / 1000).toFixed(0)} s`
  )

  const mundoDir = join(serverDir(manifest.id), 'datos', 'worlds_local', 'MundoE2E')
  check('el mundo se ha creado DENTRO de la instancia', await exists(mundoDir))

  check('ocupa el puerto de juego (UDP)', await isUdpPortInUse(PORT))
  check(
    'y el de consulta, que es el siguiente',
    await isUdpPortInUse(queryPortFor(PORT)),
    String(queryPortFor(PORT))
  )

  const info = await service.connectionInfo(manifest.id)
  // Con `-public 0` el servidor no contesta a las consultas de Steam, así que
  // lo que se comprueba es que tiene el puerto abierto (ver el adaptador).
  check('la app lo da por accesible', info.ping.state === 'ok', info.ping.state)

  // --- 3. Moderación -------------------------------------------------------------

  console.log('\n== Moderación')
  const listas = await service.valheim.getList(manifest.id, 'admin')
  check('el servidor ha creado sus listas al arrancar', Array.isArray(listas))

  const conAdmin = await service.valheim.addToList(manifest.id, 'admin', '76561198000000001', 'e2e')
  check('añade un administrador', conAdmin.some((e) => e.id === '76561198000000001'))
  check('con su nota', conAdmin[0]?.note === 'e2e')

  const releido = await service.valheim.getList(manifest.id, 'admin')
  check('y se relee igual del fichero', releido[0]?.id === '76561198000000001')

  const sinAdmin = await service.valheim.removeFromList(manifest.id, 'admin', '76561198000000001')
  check('y se puede quitar', sinAdmin.length === 0)

  let rechazado = false
  try {
    await service.valheim.addToList(manifest.id, 'banned', 'Marta la Roja')
  } catch {
    rechazado = true
  }
  check('rechaza un nombre de personaje en vez de un identificador', rechazado)

  // --- 4. Copia en caliente ------------------------------------------------------

  console.log('\n== Copia de seguridad (esperando a que el servidor guarde)')
  const t2 = Date.now()
  const backup = await service.createBackup(manifest.id, 'e2e')
  check(
    'hace la copia después de un guardado del servidor',
    backup.sizeBytes > 0,
    `${(backup.sizeBytes / 1024).toFixed(0)} KB en ${((Date.now() - t2) / 1000).toFixed(0)} s`
  )
  check('anota el mundo en la copia', backup.variant === 'MundoE2E', backup.variant)

  // --- 5. Parada limpia -----------------------------------------------------------

  console.log('\n== Parada limpia (Ctrl+Break)')
  const t3 = Date.now()
  await service.stop(manifest.id)
  const parado = (await service.get(manifest.id)).status
  const stopMs = Date.now() - t3
  check('para y sale solo', parado === 'stopped', `${(stopMs / 1000).toFixed(1)} s`)
  // Si hubiera hecho falta matarlo, habrían pasado los 120 s del plazo.
  check('sin tener que matarlo', stopMs < 90_000)
  check('suelta el puerto de juego', !(await isUdpPortInUse(PORT)))
  check('y el de consulta', !(await isUdpPortInUse(queryPortFor(PORT))))

  // --- 6. Parar mientras arranca ---------------------------------------------------

  console.log('\n== Parar mientras todavía está arrancando')
  await service.start(manifest.id)
  // A los 3 s el servidor está cargando el mundo: ahí la señal se ignora, y sin
  // el reintento acabaría muerto a la fuerza pasado el plazo de gracia.
  await sleep(3_000)
  const t4 = Date.now()
  await service.stop(manifest.id)
  const stopArrancando = Date.now() - t4
  check(
    'acaba parando solo, reintentando la señal',
    (await service.get(manifest.id)).status === 'stopped',
    `${(stopArrancando / 1000).toFixed(1)} s`
  )
  check('y sin agotar el plazo de gracia', stopArrancando < 110_000)

  // --- 7. Mundos --------------------------------------------------------------------

  console.log('\n== Mundos')
  const mundos = await service.valheim.listWorlds(manifest.id)
  check('ve el mundo generado', mundos.some((w) => w.name === 'MundoE2E' && w.savedAt !== null))
  check('y lo marca como el que se está jugando', mundos.find((w) => w.active)?.name === 'MundoE2E')

  const conSegundo = await service.valheim.createWorld(manifest.id, 'SegundoE2E')
  check('crea otro mundo y lo deja activo', conSegundo.find((w) => w.active)?.name === 'SegundoE2E')
  check('sin perder el anterior', conSegundo.some((w) => w.name === 'MundoE2E'))

  const vuelta = await service.valheim.activateWorld(manifest.id, 'MundoE2E')
  check('se puede volver al primero', vuelta.find((w) => w.active)?.name === 'MundoE2E')

  let bloqueado = false
  try {
    await service.valheim.deleteWorld(manifest.id, 'MundoE2E')
  } catch {
    bloqueado = true
  }
  check('no deja borrar el mundo en uso', bloqueado)

  // --- 7b. Mods de Thunderstore ---------------------------------------------------------

  console.log('\n== Mods (Thunderstore)')
  const encontrados = await service.valheim.searchMods('plant everything')
  check(
    'el buscador de Thunderstore encuentra mods',
    encontrados.some((m) => m.id === MOD),
    encontrados
      .slice(0, 3)
      .map((m) => m.id)
      .join(', ')
  )

  const instalacion = await service.valheim.addMod(manifest.id, MOD, (detalle) =>
    console.log(`  ... ${detalle}`)
  )
  check(
    'instala el mod',
    instalacion.view.mods.some((m) => m.id === MOD),
    instalacion.view.mods.map((m) => `${m.id} ${m.version}`).join(', ')
  )
  check('y pone BepInEx, que es el cargador', instalacion.view.loader.installed)
  // El `winhttp.dll` de al lado del ejecutable es lo que engancha el cargador.
  check(
    'con el winhttp.dll junto al ejecutable',
    await exists(join(serverDir(manifest.id), 'winhttp.dll'))
  )
  check(
    'y el mod en BepInEx/plugins',
    await exists(join(serverDir(manifest.id), 'BepInEx', 'plugins', MOD))
  )

  const lineas: string[] = []
  const anotar = (_id: string, line: { text: string }): void => {
    lineas.push(line.text)
  }
  service.on('log', anotar)

  console.log('  ... arrancando con el mod puesto')
  const tMods = Date.now()
  await service.start(manifest.id)
  const conMods = await waitForStatus(manifest.id, 'running', 5 * 60_000)
  check('arranca con el mod puesto', conMods, `${((Date.now() - tMods) / 1000).toFixed(0)} s`)
  check(
    'BepInEx se anuncia en la consola',
    lineas.some((l) => l.startsWith('Cargador de mods BepInEx')),
    lineas.find((l) => l.startsWith('Cargador de mods BepInEx'))
  )
  service.off('log', anotar)

  // Lo que más importa: que meter un cargador no rompa la parada limpia, que en
  // Valheim es lo único que guarda el mundo.
  const tParada = Date.now()
  await service.stop(manifest.id)
  check(
    'sigue parando limpio con Ctrl+Break, con el cargador puesto',
    (await service.get(manifest.id)).status === 'stopped',
    `${((Date.now() - tParada) / 1000).toFixed(1)} s`
  )

  // ⚠ La lista de mods cargados NO sale por la consola: la escribe el
  // chainloader solo en su registro, y de ahí la lee la app.
  const conMod = await service.valheim.listMods(manifest.id)
  check(
    'el registro del cargador dice que cargó el mod',
    conMod.loader.lastRun?.loaded.some((l) => l.startsWith('PlantEverything')) === true,
    conMod.loader.lastRun?.loaded.join(', ')
  )
  check('y no se queja de nada', (conMod.loader.lastRun?.problems.length ?? 0) === 0,
    conMod.loader.lastRun?.problems.join(' · '))

  const apagado = await service.valheim.setModEnabled(manifest.id, MOD, false)
  check('apagar un mod lo deja apuntado', apagado.mods.find((m) => m.id === MOD)?.enabled === false)
  check(
    'y lo saca de BepInEx/plugins, que es donde el cargador mira',
    !(await exists(join(serverDir(manifest.id), 'BepInEx', 'plugins', MOD)))
  )
  const encendido = await service.valheim.setModEnabled(manifest.id, MOD, true)
  check('encenderlo lo devuelve a su sitio', encendido.mods.find((m) => m.id === MOD)?.enabled === true)
  check(
    'con sus ficheros',
    await exists(join(serverDir(manifest.id), 'BepInEx', 'plugins', MOD))
  )

  const sinMod = await service.valheim.removeMod(manifest.id, MOD)
  check('quitarlo lo borra de la lista', !sinMod.mods.some((m) => m.id === MOD))
  check(
    'y del disco',
    !(await exists(join(serverDir(manifest.id), 'BepInEx', 'plugins', MOD)))
  )

  const sinCargador = await service.valheim.removeLoader(manifest.id)
  check('sin mods, se puede quitar también el cargador', !sinCargador.loader.installed)
  check(
    'y el servidor queda como vino de Steam',
    !(await exists(join(serverDir(manifest.id), 'winhttp.dll'))) &&
      !(await exists(join(serverDir(manifest.id), 'BepInEx')))
  )

  // --- 8. Restauración ----------------------------------------------------------------

  console.log('\n== Restauración')
  await service.restoreBackup(manifest.id, backup.fileName)
  check('restaura el mundo', await exists(mundoDir))
  const ficheros = await readdir(mundoDir).catch(() => [])
  check('con sus ficheros', ficheros.length > 0, ficheros.join(', '))

  // --- 9. La comprobación que más importa ------------------------------------------------

  console.log('\n== Aislamiento de los datos del juego del usuario')
  const despues = await userWorlds()
  check(
    'no ha escrito nada en la carpeta de Valheim del usuario',
    antes.length === despues.length && antes.every((f, i) => f === despues[i]),
    despues.filter((f) => !antes.includes(f)).join(', ') || 'sin cambios'
  )

  // --- Limpieza ------------------------------------------------------------------------

  await service.remove(manifest.id)
  check('borra el servidor', !(await exists(instanceDir(manifest.id))))

  if (reusar) {
    // La carpeta `datos` que creó la prueba está DENTRO de la instalación
    // compartida (el enlace solo se lleva el enlace): se limpia a mano.
    await rm(join(compartido, 'datos'), { recursive: true, force: true })
    // Y lo que deja BepInEx, por si la prueba se cortó antes de quitarlo: la
    // instalación compartida tiene que quedar como vino de Steam.
    for (const resto of ['BepInEx', 'winhttp.dll', 'doorstop_config.ini', 'doorstop_libs',
      '.doorstop_version', 'start_game_bepinex.sh', 'start_server_bepinex.sh', 'changelog.txt']) {
      await rm(join(compartido, resto), { recursive: true, force: true })
    }
    for (const entrada of await readdir(compartido).catch(() => [])) {
      if (/^preloader_.*\.log$/i.test(entrada)) {
        await rm(join(compartido, entrada), { force: true })
      }
    }
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
