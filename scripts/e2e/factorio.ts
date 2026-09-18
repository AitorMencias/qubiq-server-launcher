/**
 * Prueba de extremo a extremo de Factorio (fase 4), con el servidor real:
 *
 * 1. Instalación copiando una instalación del equipo, con el adelgazado.
 * 2. Mapa generado al instalar, con el preset elegido.
 * 3. Arranque y detección de «listo» por el registro.
 * 4. Puertos: uno UDP para el juego, y el RCON **solo en 127.0.0.1**.
 * 5. Moderación por RCON en caliente: administradores y vetados.
 * 6. Copia en caliente, que espera a que el servidor confirme el guardado.
 * 7. Partidas: se listan, con sus autoguardados.
 * 8. Parada limpia con `/quit`: guarda y sale con código 0.
 * 9. Restauración de la copia.
 * 10. **Lo más importante:** que la carpeta del juego del usuario
 *     (`%APPDATA%\Factorio`) no se haya tocado, ni sus partidas ni sus mods.
 *
 * El servidor nunca se publica: `visibility.public` va siempre en false, así
 * que no aparece en ninguna lista.
 *
 * Ejecutar con:  npm run e2e:factorio  [-- --rapido]
 *   --rapido usa la copia ya adelgazada del laboratorio en vez de la
 *   instalación de Steam (evita copiar 5 GB, pero no prueba el adelgazado).
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { access, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'

import { setDataRoot, serverDir } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import * as instances from '../../src/main/core/instances/manager'
import { gameFor } from '../../src/main/core/games/registry'
import { isUdpPortInUse } from '../../src/main/core/net/network'
import { findLocalFactorio } from '../../src/main/core/games/factorio/steamLibrary'
import { dataDirFor, gameDirFor } from '../../src/main/core/games/factorio/adapter'
import {
  credentialsFromGame,
  installMod,
  listMods,
  removeMod,
  searchMods
} from '../../src/main/core/games/factorio/mods'
import type { FactorioManifest } from '../../src/shared/types'

const PORT = 34197
const ID = 'e2e-factorio'

let failed = 0
/**
 * Comprobaciones que no se han podido hacer por no llegar a un servicio de
 * fuera (el portal de mods). No son fallos de la app: la prueba termina con 2,
 * igual que el smoke, para que se distingan de un problema de verdad.
 */
let unreachable = 0

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

/** Factorio guarda los nombres de jugador en minúsculas. */
function tieneNombre(names: string[], name: string): boolean {
  return names.some((n) => n.toLowerCase() === name.toLowerCase())
}

/** Carpeta de datos del Factorio del usuario: la que hay que dejar intacta. */
function userGameDir(): string {
  return join(process.env['APPDATA'] ?? '', 'Factorio')
}

/**
 * Foto de lo que de verdad importa de esa carpeta: sus partidas y sus mods.
 *
 * El registro y los ficheros de estado cambian solo con que el usuario abra el
 * juego, así que compararlos daría falsos avisos.
 */
async function userSnapshot(): Promise<string> {
  const parts: string[] = []
  for (const sub of ['saves', 'mods']) {
    const dir = join(userGameDir(), sub)
    for (const entry of (await readdir(dir).catch(() => [])).sort()) {
      const info = await stat(join(dir, entry)).catch(() => null)
      if (info) parts.push(`${sub}/${entry} ${info.size} ${Math.round(info.mtimeMs)}`)
    }
  }
  return parts.join('\n')
}

/** Cuenta ficheros por extensión, mirando dentro de las subcarpetas. */
async function countExtensions(dir: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) {
      const inner = await countExtensions(join(dir, entry.name))
      for (const [ext, n] of Object.entries(inner)) counts[ext] = (counts[ext] ?? 0) + n
    } else {
      const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
      counts[ext] = (counts[ext] ?? 0) + 1
    }
  }
  return counts
}

async function folderSize(dir: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += await folderSize(path)
    else total += (await stat(path).catch(() => ({ size: 0 }))).size
  }
  return total
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
  const root = join(dev, 'e2e-factorio')
  const rapido = process.argv.includes('--rapido')
  const laboratorio = join(dev, 'steam', 'factorio-proto', 'juego')

  let origen: string
  if (rapido && (await exists(laboratorio))) {
    origen = laboratorio
  } else {
    const locales = await findLocalFactorio()
    if (locales.length === 0) {
      console.error(
        'No se ha encontrado Factorio en el equipo. Esta prueba necesita el juego instalado ' +
          '(o --rapido con la copia del laboratorio).'
      )
      process.exit(1)
    }
    origen = locales[0]!.path
  }

  await rm(root, { recursive: true, force: true })
  await mkdir(join(root, 'cache'), { recursive: true })
  setDataRoot(root)
  await service.initialize()
  console.log(`Datos en ${root}`)
  console.log(`Copiando Factorio de ${origen}\n`)

  if (await isUdpPortInUse(PORT)) {
    console.error(`El puerto ${PORT} está ocupado: ya hay un Factorio en marcha. Páralo antes.`)
    process.exit(1)
  }

  const antes = await userSnapshot()

  // --- 1. Crear e instalar -----------------------------------------------------

  console.log('== Creación e instalación')
  const manifest = (await instances.createInstance(
    {
      game: 'factorio',
      name: 'Factorio e2e',
      port: PORT,
      agreements: ['steam-subscriber'],
      exposure: { mode: 'local' },
      options: {
        source: 'local',
        sourcePath: origen,
        password: 'qubiq-e2e',
        preset: 'rich-resources',
        seed: '1234',
        // Sin Space Age: así la prueba vale igual si la cuenta no tiene el DLC.
        spaceAge: false,
        // La prueba no habla con factorio.com: no hace falta y así no sale nada
        // hacia fuera durante el arranque.
        verifyAccounts: false
      }
    },
    gameFor('factorio')
  )) as FactorioManifest

  check('crea la instancia', manifest.data.preset === 'rich-resources')
  check('genera contraseña de RCON', manifest.data.rconPassword.length > 10)
  check('el RCON va pegado al puerto del juego', manifest.data.rconPort === PORT + 1)
  check('la verificación de cuentas se respeta', manifest.data.verifyAccounts === false)

  const t0 = Date.now()
  let ultimaFase = ''
  service.on('progress', (update: { phase: string; detail?: string }) => {
    if (update.phase !== ultimaFase) {
      ultimaFase = update.phase
      console.log(`  ... ${update.detail ?? update.phase}`)
    }
  })

  await service.install(manifest.id)
  const instalado = (await service.get(manifest.id)).manifest as FactorioManifest

  check(
    'servidor instalado',
    await exists(join(gameDirFor(manifest.id), 'bin', 'x64', 'factorio.exe')),
    `${((Date.now() - t0) / 1000).toFixed(0)} s`
  )

  const tamaño = await folderSize(gameDirFor(manifest.id))
  check(
    'la copia va adelgazada',
    tamaño < 1024 ** 3,
    `${Math.round(tamaño / 1024 ** 2)} MB (sin imágenes ni sonidos)`
  )

  // `graphics/` tiene subcarpetas: hay que mirar dentro, no solo el primer nivel.
  const graficos = await countExtensions(join(gameDirFor(manifest.id), 'data', 'base', 'graphics'))
  check(
    'quedan los .lua de graphics, que sí hacen falta',
    (graficos['.lua'] ?? 0) > 0 && (graficos['.png'] ?? 0) === 0,
    `${graficos['.lua'] ?? 0} .lua y ${graficos['.png'] ?? 0} .png`
  )

  check('el mapa está generado', await exists(join(dataDirFor(manifest.id), 'saves', 'partida.zip')))

  const ajustes = JSON.parse(
    await readFile(join(dataDirFor(manifest.id), 'server-settings.json'), 'utf8')
  ) as { visibility: { public: boolean }; game_password: string }
  check('el servidor NO se publica', ajustes.visibility.public === false)
  check('la contraseña llega al servidor', ajustes.game_password === 'qubiq-e2e')

  const mods = JSON.parse(
    await readFile(join(dataDirFor(manifest.id), 'mods', 'mod-list.json'), 'utf8')
  ) as { mods: { name: string; enabled: boolean }[] }
  check(
    'Space Age queda apagado como se pidió',
    mods.mods.find((m) => m.name === 'space-age')?.enabled === false
  )

  // --- 2. Arranque -------------------------------------------------------------

  console.log('\n== Arranque')
  const t1 = Date.now()
  await service.start(manifest.id)
  const arrancado = await waitForStatus(manifest.id, 'running', 180_000)
  check('arranca y queda listo', arrancado, `${((Date.now() - t1) / 1000).toFixed(1)} s`)
  if (!arrancado) {
    await service.stop(manifest.id).catch(() => undefined)
    process.exit(1)
  }

  check('el puerto del juego está abierto (UDP)', await isUdpPortInUse(PORT))

  // --- 3. Moderación en caliente, por RCON -------------------------------------

  console.log('\n== Moderación con el servidor en marcha')
  // Nombrar administrador a quien no está conectado: el servidor NO lo acepta
  // por su consola (contesta con un silencio), así que lo que tiene que pasar
  // es que quede apuntado en el fichero para el siguiente arranque.
  await service.factorio.addToList(manifest.id, 'admin', 'JugadorDePrueba')
  const admins = await service.factorio.getList(manifest.id, 'admin')
  // El servidor guarda los nombres en minúsculas, así que se compara así.
  check(
    'apunta al administrador aunque no esté conectado',
    tieneNombre(admins, 'JugadorDePrueba'),
    admins.join(', ')
  )
  check('y sin repetirlo por las mayúsculas', admins.length === 1, `${admins.length} entradas`)

  const adminFile = JSON.parse(
    await readFile(join(dataDirFor(manifest.id), 'server-adminlist.json'), 'utf8')
  ) as string[]
  check('y queda en el fichero que lee al arrancar', tieneNombre(adminFile, 'JugadorDePrueba'))

  await service.factorio.addToList(manifest.id, 'banned', 'Indeseable')
  const vetados = await service.factorio.getList(manifest.id, 'banned')
  check('veta a alguien', tieneNombre(vetados, 'Indeseable'), vetados.join(', '))

  await service.factorio.removeFromList(manifest.id, 'banned', 'Indeseable')
  check(
    'y lo desveta',
    !tieneNombre(await service.factorio.getList(manifest.id, 'banned'), 'Indeseable')
  )

  const online = await service.factorio.onlinePlayers(manifest.id)
  check('pregunta quién está dentro', Array.isArray(online), `${online.length} conectados`)

  // La consola de la app: en Factorio no puede ir por la entrada estándar (el
  // ejecutable no la tiene), así que el adaptador la manda por RCON y lo que
  // conteste tiene que acabar en la consola del usuario.
  const consolaApp: string[] = []
  const anotarLog = (_id: string, line: { text: string }): void => {
    consolaApp.push(line.text)
  }
  service.on('log', anotarLog)
  await service.sendCommand(manifest.id, '/version')
  await sleep(500)
  service.off('log', anotarLog)
  check(
    'la consola manda comandos y enseña la respuesta',
    consolaApp.some((l) => l.includes('/version')) &&
      consolaApp.some((l) => /^\d+\.\d+\.\d+$/.test(l.trim())),
    consolaApp.join(' · ')
  )

  // --- 4. Copia en caliente ----------------------------------------------------

  console.log('\n== Copia de seguridad con el servidor en marcha')
  const backup = await service.createBackup(manifest.id, 'e2e', false)
  check('hace la copia sin parar el servidor', backup.sizeBytes > 0, `${backup.fileName}`)
  check('anota la variante', backup.variant === undefined || backup.variant === 'Space Age')

  const saves = await service.factorio.listSaves(manifest.id)
  check('lista la partida del servidor', saves.some((s) => s.active && s.name === 'partida'))

  // --- 4b. Mods del portal (solo con --mods) -----------------------------------
  //
  // Va aparte porque descargar del portal exige identificarse en factorio.com, y
  // eso depende de que haya una sesión del juego en este equipo. Buscar sí se
  // comprueba siempre: esa parte es abierta.

  console.log('\n== Mods del portal')
  let portalVivo = true
  try {
    const encontrados = await searchMods('flib')
    check(
      'busca en el portal sin credenciales',
      encontrados.some((m) => m.name === 'flib'),
      `${encontrados.length} resultados`
    )
  } catch (err) {
    // El portal se cae de vez en cuando (visto dando 503 durante la fase 4). No
    // es un fallo de la app: se avisa y la prueba termina con 2, como el smoke.
    portalVivo = false
    unreachable++
    console.log(`  ...  el portal de mods no responde: ${err instanceof Error ? err.message : err}`)
  }

  if (portalVivo && process.argv.includes('--mods')) {
    const credenciales = await credentialsFromGame()
    if (!credenciales) {
      check('hay una sesión de Factorio en el equipo', false, 'sin player-data.json utilizable')
    } else {
      const instalado2 = await installMod(manifest.id, 'flib', credenciales)
      check('instala un mod del portal', instalado2.version !== null, `flib ${instalado2.version}`)

      const lista = await listMods(manifest.id)
      check('el mod aparece instalado y activado', lista.some((m) => m.name === 'flib' && m.enabled))

      // El mismo fichero enciende Space Age: instalar un mod no puede apagarlo.
      const modList2 = JSON.parse(
        await readFile(join(dataDirFor(manifest.id), 'mods', 'mod-list.json'), 'utf8')
      ) as { mods: { name: string; enabled: boolean }[] }
      check(
        'y no se lleva por delante lo que ya había',
        modList2.mods.some((m) => m.name === 'base' && m.enabled)
      )

      await removeMod(manifest.id, 'flib')
      check(
        'y se puede quitar',
        !(await listMods(manifest.id)).some((m) => m.name === 'flib')
      )
    }
  } else if (portalVivo) {
    console.log('  ... instalar mods no se prueba sin --mods (necesita tu sesión de factorio.com)')
  }

  // --- 5. Parada limpia --------------------------------------------------------

  console.log('\n== Parada')
  const t2 = Date.now()
  await service.stop(manifest.id)
  const parado = await waitForStatus(manifest.id, 'stopped', 180_000)
  check('para limpio', parado, `${((Date.now() - t2) / 1000).toFixed(1)} s`)
  check('el puerto queda libre', !(await isUdpPortInUse(PORT)))

  const consola = await readFile(join(dataDirFor(manifest.id), 'console.log'), 'utf8').catch(
    () => ''
  )
  check('el servidor dejó su registro de consola', consola.includes('Log opened'))

  // Lo que se apuntó con el servidor en marcha tiene que seguir ahí: el
  // servidor vuelca sus listas al salir y podría haberlo machacado.
  const adminTrasParar = JSON.parse(
    await readFile(join(dataDirFor(manifest.id), 'server-adminlist.json'), 'utf8')
  ) as string[]
  check(
    'el administrador sobrevive a la parada',
    tieneNombre(adminTrasParar, 'JugadorDePrueba'),
    adminTrasParar.join(', ')
  )

  // --- 6. Restaurar ------------------------------------------------------------

  console.log('\n== Restauración')
  await service.restoreBackup(manifest.id, backup.fileName)
  check(
    'la partida vuelve a estar tras restaurar',
    await exists(join(dataDirFor(manifest.id), 'saves', 'partida.zip'))
  )

  // --- 7. Lo que no se puede tocar ---------------------------------------------

  console.log('\n== Datos del juego del usuario')
  check(
    'las partidas y los mods del usuario siguen igual',
    (await userSnapshot()) === antes,
    userGameDir()
  )

  if (failed > 0) {
    console.log(`\n${failed} fallos`)
    process.exit(1)
  }
  if (unreachable > 0) {
    console.log(`\nTodo bien, menos ${unreachable} comprobación que depende de un servicio caído`)
    process.exit(2)
  }
  console.log('\nTodo bien')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
