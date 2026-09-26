/**
 * Prueba de extremo a extremo de Enshrouded (fase 6), con el servidor real:
 *
 *  1. Instalación por SteamCMD (reutilizando la copia ya descargada si la hay).
 *  2. El fichero de configuración: que lleve lo que dice el manifiesto y que el
 *     mundo y los registros caigan **dentro de la instancia**.
 *  3. Arranque: se genera el mundo y se detecta «listo» por el registro.
 *  4. Puertos: uno solo, y por UDP. Y que **no** abra el siguiente.
 *  5. La consulta de Steam: nombre, plazas y que sale protegido con contraseña.
 *  6. La trampa del preajuste: se toca un ajuste, se arranca y el propio
 *     servidor dice por consola que está aplicando **Custom**.
 *  7. Los vetados sobreviven a que la app reescriba el fichero.
 *  8. Copia en caliente: se espera a que el servidor guarde y se copia.
 *  9. Parada limpia con Ctrl+Break: guarda el mundo y sale con código 0.
 * 10. Parar mientras arranca: la señal se ignora hasta que el servidor está
 *     listo, así que se comprueba que **no acaba muerto a la fuerza**.
 * 11. Mundos: crear otro, cambiar y borrar, con la copia previa automática.
 * 12. Mods: se instala Shroudtopia y un mod de verdad, se arranca y se
 *     comprueba **en la consola** que el cargador lo encuentra y lo carga, y
 *     que la parada limpia sigue funcionando con él puesto.
 * 13. Restauración de la copia.
 * 14. Que la instalación compartida quede como vino de Steam.
 *
 * ⚠ **Esta prueba publica el servidor.** Enshrouded no tiene forma de no
 * anunciarse: en cuanto arranca se registra en Steam con la dirección pública
 * del equipo. El usuario lo autorizó expresamente para esta fase. Los roles
 * llevan contraseña, así que nadie puede entrar.
 *
 * Ejecutar con:  npm run e2e:enshrouded  [-- --descargar]
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { setDataRoot, serverDir, instanceDir } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import * as instances from '../../src/main/core/instances/manager'
import { gameFor } from '../../src/main/core/games/registry'
import { isUdpPortInUse } from '../../src/main/core/net/network'
import { download } from '../../src/main/core/net/downloader'
import { systemTarPath } from '../../src/main/core/paths'
import * as mods from '../../src/main/core/games/enshrouded/mods'
import { presetSettings } from '../../src/shared/games/enshrouded/types'
import type { EnshroudedManifest } from '../../src/shared/types'

const execFileAsync = promisify(execFile)

const PORT = 15645
const ID = 'e2e-enshrouded'

/**
 * El mod con el que se prueba: uno de los que publica el propio Shroudtopia en
 * su paquete, con su `mod.json` al lado. Sirve porque es **un mod de verdad que
 * el cargador carga de verdad**, y porque se puede descargar sin cuenta, que es
 * justo lo que no se puede hacer con los de Nexus Mods.
 */
const MOD_FOLDER = 'flight_mod'
/** El identificador que declara su `mod.json`, que es con el que lo llama el cargador. */
const MOD_ID = 'Flight Mod'

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

/** Lo que la app ha escrito en el fichero de configuración del servidor. */
async function leerConfig(id: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(join(serverDir(id), 'enshrouded_server.json'), 'utf8')
  ) as Record<string, unknown>
}

async function main(): Promise<void> {
  const dev = join(process.env['LOCALAPPDATA'] ?? tmpdir(), 'qubiq-dev')
  const root = join(dev, 'e2e-enshrouded')
  const compartido = join(dev, 'steam', 'enshrouded')
  const reusar = !process.argv.includes('--descargar') && (await exists(compartido))

  await rm(root, { recursive: true, force: true })
  await mkdir(join(root, 'cache'), { recursive: true })
  setDataRoot(root)
  await service.initialize()
  console.log(`Datos en ${root}`)
  console.log(
    reusar
      ? `Reutilizando la instalación de ${compartido} (enlace, sin descargar)\n`
      : 'Instalando desde Steam: son unos 8,8 GB\n'
  )
  console.log(
    '⚠ Enshrouded no se puede arrancar sin anunciarse: mientras dure la prueba, el\n' +
      '  servidor saldrá en la lista del juego. Los roles llevan contraseña.\n'
  )

  if (await isUdpPortInUse(PORT)) {
    console.error(`El puerto ${PORT} está ocupado. Páralo antes de ejecutar la prueba.`)
    process.exit(1)
  }

  // --- 1. Crear e instalar -----------------------------------------------------

  console.log('== Creación e instalación')
  const roles = [
    {
      name: 'Admin',
      password: 'qubiq-e2e-admin',
      canKickBan: true,
      canAccessInventories: true,
      canEditWorld: true,
      canEditBase: true,
      canExtendBase: true,
      reservedSlots: 0
    },
    {
      name: 'Friend',
      password: 'qubiq-e2e-amigo',
      canKickBan: false,
      canAccessInventories: true,
      canEditWorld: true,
      canEditBase: true,
      canExtendBase: false,
      reservedSlots: 0
    }
  ]

  const manifest = (await instances.createInstance(
    {
      game: 'enshrouded',
      name: 'Enshrouded e2e',
      port: PORT,
      expectedPlayers: 4,
      agreements: ['steam-subscriber'],
      exposure: { mode: 'local' },
      options: { worldName: 'MundoE2E', preset: 'Hard', roles, tags: ['Spanish'] }
    },
    gameFor('enshrouded')
  )) as EnshroudedManifest

  check('crea la instancia', manifest.data.worldName === 'MundoE2E')
  check('guarda la dificultad elegida', manifest.data.preset === 'Hard')
  check('y parte de los ajustes de ese preajuste', manifest.data.settings['enemyDamageFactor'] === 1.5)
  check('con los roles y sus contraseñas', manifest.data.roles.length === 2)

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
  const instalado = (await service.get(manifest.id)).manifest as EnshroudedManifest

  check(
    'servidor instalado',
    await exists(join(serverDir(manifest.id), 'enshrouded_server.exe')),
    `${((Date.now() - t0) / 1000).toFixed(0)} s`
  )
  check('anota la build de Steam', instalado.data.buildId !== undefined, instalado.data.buildId)

  // --- 2. El fichero de configuración -------------------------------------------

  console.log('\n== Configuración escrita para el servidor')
  const config = await leerConfig(manifest.id)
  check('el puerto es el nuestro', config['queryPort'] === PORT)
  check('el nombre también', config['name'] === 'Enshrouded e2e')
  check('el mundo cae dentro de la instancia', config['saveDirectory'] === './mundos/MundoE2E')
  check('y los registros del juego también', config['logDirectory'] === './registros')
  check('las plazas salen de los jugadores esperados', config['slotCount'] === 4)
  // El preajuste va tal cual porque no se ha tocado ningún ajuste.
  check('el preajuste es el elegido', config['gameSettingsPreset'] === 'Hard')
  check('la lista de vetados existe y está vacía', Array.isArray(config['bannedAccounts']))

  // --- 3. Arranque ---------------------------------------------------------------

  console.log('\n== Arranque (genera el mundo)')
  const lineas: string[] = []
  const anotar = (_id: string, line: { text: string }): void => {
    lineas.push(line.text)
  }
  service.on('log', anotar)

  const t1 = Date.now()
  await service.start(manifest.id)
  const arrancado = await waitForStatus(manifest.id, 'running', 5 * 60_000)
  check(
    'arranca y el registro dice que ya acepta jugadores',
    arrancado,
    `${((Date.now() - t1) / 1000).toFixed(0)} s`
  )

  const mundoDir = join(serverDir(manifest.id), 'mundos', 'MundoE2E')
  check('el mundo se ha creado DENTRO de la instancia', await exists(mundoDir))
  check(
    'y los registros del juego también',
    await exists(join(serverDir(manifest.id), 'registros'))
  )

  // ⚠ La IP pública del equipo sale en el registro del servidor. Que no llegue
  // a la consola es la comprobación que no se puede perder.
  const conIp = lineas.filter((l) => /\b\d{1,3}(\.\d{1,3}){3}\b/.test(l))
  check('ninguna línea de la consola enseña una IP', conIp.length === 0, conIp[0])

  // El puerto se abre al arrancar, pero el servidor tarda unos segundos en
  // terminar de darse de alta en Steam y empezar a contestar consultas.
  await sleep(8_000)

  check('ocupa su puerto (UDP)', await isUdpPortInUse(PORT))
  // Enshrouded usa uno solo: el de consulta ES el de juego desde el Update #2.
  check('y NO abre el siguiente', !(await isUdpPortInUse(PORT + 1)), String(PORT + 1))

  // --- 4. La consulta de Steam ----------------------------------------------------

  console.log('\n== Consulta de Steam')
  const info = await service.connectionInfo(manifest.id)
  check('el servidor contesta al protocolo del juego', info.ping.state === 'ok', info.ping.state)
  check('con su nombre', info.ping.motd === 'Enshrouded e2e', info.ping.motd)
  check('y sus plazas', info.ping.playersMax === 4, String(info.ping.playersMax))
  check('no hay nadie dentro', info.ping.playersOnline === 0)

  const estado = await service.get(manifest.id)
  check('y la app cuenta los jugadores por ahí', estado.playerCount === 0, String(estado.playerCount))

  // --- 5. La trampa del preajuste ---------------------------------------------------

  console.log('\n== La trampa del preajuste (lo que el servidor aplica de verdad)')
  const dificultadAntes = lineas.find((l) => l.startsWith('Dificultad en uso'))
  check('la consola dice qué dificultad aplica', dificultadAntes === 'Dificultad en uso: Hard.', dificultadAntes)

  await service.stop(manifest.id)

  // Se toca un ajuste con el preajuste puesto: la app tiene que pasar a Custom
  // sola, porque si no el servidor lo ignoraría sin decir nada.
  const guardado = await service.enshrouded.setConfig(manifest.id, {
    settings: { ...presetSettings('Hard'), playerHealthFactor: 2 }
  })
  check('tocar un ajuste pasa el preajuste a Custom', guardado.effectivePreset === 'Custom')
  check('y el guardado también', guardado.preset === 'Custom')

  lineas.length = 0
  await service.start(manifest.id)
  await waitForStatus(manifest.id, 'running', 5 * 60_000)
  const dificultadDespues = lineas.find((l) => l.startsWith('Dificultad en uso'))
  check(
    'y el servidor lo confirma en su consola',
    dificultadDespues === 'Dificultad en uso: Custom.',
    dificultadDespues
  )

  // Y el fichero que se le escribió lleva el preajuste y el valor tocado.
  //
  // El volcado de los 37 ajustes que hace el servidor no se mira aquí: son
  // líneas escondidas a propósito (serían 37 en la consola del usuario cada vez
  // que arranca), y de que coincidan con lo que aplica cada preajuste se
  // encarga el smoke, contra la grabación.
  const configCustom = await leerConfig(manifest.id)
  check('el fichero dice Custom', configCustom['gameSettingsPreset'] === 'Custom')
  check(
    'y lleva el valor que se tocó',
    (configCustom['gameSettings'] as Record<string, unknown>)['playerHealthFactor'] === 2
  )

  // --- 6. Los vetados ---------------------------------------------------------------

  console.log('\n== Vetados (que la app no los borre al reescribir)')
  await service.stop(manifest.id)

  // Se simula lo que hace el servidor cuando vetas a alguien dentro del juego.
  const actual = await leerConfig(manifest.id)
  await writeFile(
    join(serverDir(manifest.id), 'enshrouded_server.json'),
    JSON.stringify(
      {
        ...actual,
        bannedAccounts: [
          {
            accountId: 123456789,
            displayName: 'alguien',
            characterName: 'Alguien',
            banDate: { value: 1758000000 }
          }
        ]
      },
      null,
      '\t'
    ),
    'utf8'
  )

  const vetados = await service.enshrouded.listBans(manifest.id)
  check('la app lee el veto', vetados.length === 1 && vetados[0]!.displayName === 'alguien')

  // Y ahora lo que mata: la app reescribe el fichero al arrancar.
  await service.start(manifest.id)
  await waitForStatus(manifest.id, 'running', 5 * 60_000)
  const siguenVetados = await service.enshrouded.listBans(manifest.id)
  check(
    'sigue ahí después de arrancar, que es cuando la app reescribe el fichero',
    siguenVetados.length === 1,
    `${siguenVetados.length}`
  )

  // --- 7. Copia en caliente ----------------------------------------------------------

  console.log('\n== Copia de seguridad (esperando a que el servidor guarde)')
  const t2 = Date.now()
  const backup = await service.createBackup(manifest.id, 'e2e')
  check(
    'hace la copia después de un guardado del servidor',
    backup.sizeBytes > 0,
    `${(backup.sizeBytes / 1024).toFixed(0)} KB en ${((Date.now() - t2) / 1000).toFixed(0)} s`
  )
  check('anota el mundo en la copia', backup.variant === 'MundoE2E', backup.variant)

  // --- 8. Parada limpia ---------------------------------------------------------------

  console.log('\n== Parada limpia (Ctrl+Break)')
  const t3 = Date.now()
  await service.stop(manifest.id)
  const stopMs = Date.now() - t3
  check(
    'para y sale solo',
    (await service.get(manifest.id)).status === 'stopped',
    `${(stopMs / 1000).toFixed(1)} s`
  )
  check('sin tener que matarlo', stopMs < 60_000)
  check('suelta el puerto', !(await isUdpPortInUse(PORT)))
  check(
    'y la consola dice que guardó antes de cerrar',
    lineas.some((l) => l === 'Mundo guardado.')
  )

  // Y el veto sigue ahí después de que el servidor reescriba su fichero.
  const trasParar = await service.enshrouded.listBans(manifest.id)
  check('el veto sobrevive también al cierre del servidor', trasParar.length === 1)

  // --- 9. Parar mientras arranca -------------------------------------------------------

  console.log('\n== Parar mientras todavía está arrancando')
  await service.start(manifest.id)
  // A los 1,5 s el servidor está cargando: ahí la señal no tiene manejador y
  // mataría el proceso. Con el reintento acaba parando como debe.
  await sleep(1_500)
  const t4 = Date.now()
  await service.stop(manifest.id)
  const stopArrancando = Date.now() - t4
  check(
    'acaba parando solo, reintentando la señal',
    (await service.get(manifest.id)).status === 'stopped',
    `${(stopArrancando / 1000).toFixed(1)} s`
  )
  check('y sin agotar el plazo de gracia', stopArrancando < 80_000)

  // --- 10. Mundos -----------------------------------------------------------------------

  console.log('\n== Mundos')
  const mundos = await service.enshrouded.listWorlds(manifest.id)
  check('ve el mundo empezado', mundos.some((w) => w.name === 'MundoE2E' && w.savedAt !== null))
  check('y lo marca como el que se está jugando', mundos.find((w) => w.active)?.name === 'MundoE2E')

  const conSegundo = await service.enshrouded.createWorld(manifest.id, 'SegundoE2E')
  check('crea otro mundo y lo deja activo', conSegundo.find((w) => w.active)?.name === 'SegundoE2E')
  check('sin perder el anterior', conSegundo.some((w) => w.name === 'MundoE2E'))
  const configSegundo = await leerConfig(manifest.id)
  check(
    'y el fichero ya apunta al nuevo',
    configSegundo['saveDirectory'] === './mundos/SegundoE2E',
    String(configSegundo['saveDirectory'])
  )

  const vuelta = await service.enshrouded.activateWorld(manifest.id, 'MundoE2E')
  check('se puede volver al primero', vuelta.find((w) => w.active)?.name === 'MundoE2E')

  let bloqueado = false
  try {
    await service.enshrouded.deleteWorld(manifest.id, 'MundoE2E')
  } catch {
    bloqueado = true
  }
  check('no deja borrar el mundo en uso', bloqueado)

  const sinSegundo = await service.enshrouded.deleteWorld(manifest.id, 'SegundoE2E')
  check('y sí borrar otro', !sinSegundo.some((w) => w.name === 'SegundoE2E'))

  // --- 11. Mods ---------------------------------------------------------------------------

  console.log('\n== Mods (Shroudtopia)')
  const release = await mods.latestLoader()
  check('encuentra la última versión del cargador', release.version.length > 0, release.version)

  // Se baja el paquete del cargador y se saca de él un mod de verdad, que es lo
  // que el usuario traería de Nexus Mods.
  const trabajo = join(root, 'mod-de-prueba')
  await mkdir(trabajo, { recursive: true })
  const zip = join(trabajo, 'shroudtopia.zip')
  await download({ url: release.url, destination: zip })
  await execFileAsync(systemTarPath(), ['-xf', zip, '-C', trabajo], { windowsHide: true })
  // Se empaqueta la carpeta del mod en un .zip, que es la forma en la que se
  // bajan de Nexus Mods: así se prueba además que la app lee su `mod.json`.
  const modSrc = join(trabajo, 'mods', MOD_FOLDER)
  check('el paquete del cargador trae mods de ejemplo', await exists(modSrc))
  const modFile = join(trabajo, 'mod.zip')
  await execFileAsync(systemTarPath(), ['-a', '-c', '-f', modFile, '-C', modSrc, '.'], {
    windowsHide: true
  })

  const instalacion = await service.enshrouded.addModFile(manifest.id, modFile, (detalle) =>
    console.log(`  ... ${detalle}`)
  )
  check('instala el mod', instalacion.mods.length === 1, instalacion.mods.map((m) => m.id).join(', '))
  // El `mod.json` del paquete es de donde salen el nombre y la versión.
  check(
    'leyendo su mod.json',
    instalacion.mods[0]?.name === 'Shroudtopia Glider Flight' &&
      instalacion.mods[0]?.version === '1.0.0',
    `${instalacion.mods[0]?.name} ${instalacion.mods[0]?.version}`
  )
  check('y pone Shroudtopia, que es el cargador', instalacion.loader.installed)
  // El `winmm.dll` de al lado del ejecutable es lo que engancha el cargador.
  check(
    'con el winmm.dll junto al ejecutable',
    await exists(join(serverDir(manifest.id), 'winmm.dll'))
  )
  const modDir = join(serverDir(manifest.id), 'mods', instalacion.mods[0]!.id)
  check('y el mod en su carpeta dentro de mods/', await exists(modDir))
  // ⚠ Lo que NO puede pasar: que el cargador se traiga sus mods de ejemplo, que
  // incluyen uno que quita el coste de construir.
  const enMods = await readdir(join(serverDir(manifest.id), 'mods')).catch(() => [])
  check('sin colar los mods de ejemplo del paquete', enMods.length === 1, enMods.join(', '))

  lineas.length = 0
  console.log('  ... arrancando con el mod puesto')
  const tMods = Date.now()
  await service.start(manifest.id)
  const conMods = await waitForStatus(manifest.id, 'running', 5 * 60_000)
  check('arranca con el mod puesto', conMods, `${((Date.now() - tMods) / 1000).toFixed(0)} s`)
  // El cargador espera su `bootDelay` (3 s de serie) antes de mirar la carpeta,
  // así que sus líneas llegan después de que el servidor ya esté listo.
  await sleep(10_000)
  check(
    'el cargador se anuncia en la consola',
    lineas.some((l) => l.includes('Shroudtopia en marcha')),
    lineas.find((l) => l.includes('Shroudtopia'))
  )
  check(
    'y dice que ha encontrado el mod',
    lineas.some((l) => l === `Mod encontrado: ${MOD_ID}`),
    lineas.filter((l) => l.startsWith('Mod')).join(' · ') || 'el cargador no dijo nada de mods'
  )
  check(
    'y que lo ha cargado',
    lineas.some(
      (l) => l.includes(`Mod ${MOD_ID} en marcha`) || l.includes(`Cargando el mod ${MOD_ID}`)
    ),
    lineas.filter((l) => l.startsWith('Mods:') || l.startsWith('Mod ')).join(' · ')
  )

  // Lo que más importa: que meter un cargador no rompa la parada limpia, que es
  // lo único que guarda el mundo.
  const tParada = Date.now()
  await service.stop(manifest.id)
  check(
    'sigue parando limpio con Ctrl+Break, con el cargador puesto',
    (await service.get(manifest.id)).status === 'stopped',
    `${((Date.now() - tParada) / 1000).toFixed(1)} s`
  )
  check(
    'y sigue guardando el mundo',
    lineas.some((l) => l === 'Mundo guardado.')
  )

  const modId = instalacion.mods[0]!.id
  const apagado = await service.enshrouded.setModEnabled(manifest.id, modId, false)
  check('apagar un mod lo deja apuntado', apagado.mods.find((m) => m.id === modId)?.enabled === false)
  // ⚠ Apagarlo tiene que SACARLO de mods/: poner "active": false en
  // shroudtopia.json no basta, el cargador lo carga igual (medido).
  check('y lo saca de mods/, que es donde el cargador mira', !(await exists(modDir)))

  const encendido = await service.enshrouded.setModEnabled(manifest.id, modId, true)
  check('encenderlo lo devuelve a su sitio', encendido.mods.find((m) => m.id === modId)?.enabled === true)
  check('con sus ficheros', await exists(modDir))

  const sinMod = await service.enshrouded.removeMod(manifest.id, modId)
  check('quitarlo lo borra de la lista', sinMod.mods.length === 0)
  check('y del disco', !(await exists(modDir)))

  const sinCargador = await service.enshrouded.removeLoader(manifest.id)
  check('sin mods, se puede quitar también el cargador', !sinCargador.loader.installed)
  check(
    'y el servidor queda como vino de Steam',
    !(await exists(join(serverDir(manifest.id), 'winmm.dll'))) &&
      !(await exists(join(serverDir(manifest.id), 'shroudtopia.dll')))
  )

  service.off('log', anotar)

  // --- 12. Restauración -------------------------------------------------------------------

  console.log('\n== Restauración')
  await service.restoreBackup(manifest.id, backup.fileName)
  check('restaura el mundo', await exists(mundoDir))
  const ficheros = await readdir(mundoDir).catch(() => [])
  check('con sus ficheros', ficheros.length > 0, ficheros.join(', '))

  // --- Limpieza ------------------------------------------------------------------------

  await service.remove(manifest.id)
  check('borra el servidor', !(await exists(instanceDir(manifest.id))))

  if (reusar) {
    // Todo lo que la prueba dejó DENTRO de la instalación compartida (el enlace
    // solo se lleva el enlace) se limpia a mano: tiene que quedar como vino de
    // Steam para la próxima.
    for (const resto of [
      'mundos',
      'registros',
      'logs',
      'savegame',
      'mods',
      'enshrouded_server.json',
      'winmm.dll',
      'shroudtopia.dll',
      'shroudtopia.json',
      'shroudtopia.log',
      'appcache',
      'config'
    ]) {
      await rm(join(compartido, resto), { recursive: true, force: true })
    }
    const sigue = await stat(join(compartido, 'enshrouded_server.exe')).catch(() => null)
    check('la instalación compartida sigue en su sitio', sigue !== null)
    const sobra = (await readdir(compartido).catch(() => [])).filter((e) =>
      /^(mundos|registros|logs|savegame|mods|shroudtopia|winmm|enshrouded_server\.json)/i.test(e)
    )
    check('y limpia, como vino de Steam', sobra.length === 0, sobra.join(', '))
  }

  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} fallos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
