/**
 * Prueba de humo del núcleo contra las APIs reales (§16).
 *
 * Es el "test de contrato" que avisa cuando una fuente externa cambia: la v2 de
 * Paper murió de un día para otro, y sin esto la app se rompe en silencio.
 *
 * Ejecutar con:  npm run smoke
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'

import { setDataRoot, ensureBaseDirs } from '../src/main/core/paths'
import * as mojang from '../src/main/core/versions/mojang'
import * as paper from '../src/main/core/versions/paper'
import * as fabric from '../src/main/core/versions/fabric'
import * as forge from '../src/main/core/versions/forge'
import * as catalog from '../src/main/core/versions/catalog'
import { compareVersions } from '../src/shared/types'
import {
  suggestedMemoryMb,
  defaultJvmArgs,
  recommendedMemoryMb,
  totalMemoryMb
} from '../src/main/core/install/jvmArgs'
import {
  PropertiesFile,
  PROPERTY_CATALOG,
  defaultProperties
} from '../src/main/core/config/properties'
import { parseLine, diagnose } from '../src/main/core/runtime/logParser'
import { slugify } from '../src/main/core/paths'
import * as network from '../src/main/core/net/network'
import { validateWorldName } from '../src/main/core/worlds/manager'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function section(title: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n== ${title}`)
  try {
    await fn()
  } catch (err) {
    failed++
    console.error(`  FAIL ${title} lanzó una excepción: ${(err as Error).message}`)
  }
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'qubiq-smoke-'))
  setDataRoot(root)
  await ensureBaseDirs()
  console.log(`Datos temporales en ${root}`)

  // --- Lógica pura (sin red) ------------------------------------------------

  await section('Lógica pura', async () => {
    check('slugify quita tildes', slugify('Añoranza Ñoña') === 'anoranza-nona', slugify('Añoranza Ñoña'))
    check('slugify evita nombres reservados de Windows', slugify('CON') === 'con-1')
    check('slugify no deja cadena vacía', slugify('***') === 'servidor')

    const mem = suggestedMemoryMb()
    check('memoria sugerida entre 2 y 8 GB', mem >= 2048 && mem <= 8192, `${mem} MB`)

    const args = defaultJvmArgs(4096)
    check('Xms = Xmx', args.includes('-Xms4096M') && args.includes('-Xmx4096M'))
    check('usa G1GC', args.includes('-XX:+UseG1GC'))

    // Recomendación de RAM por jugadores esperados.
    const few = recommendedMemoryMb(4, 'paper')
    const many = recommendedMemoryMb(40, 'paper')
    check('más jugadores piden más memoria', many > few, `${few} -> ${many} MB`)
    check('nunca baja de 2 GB', recommendedMemoryMb(1, 'paper') >= 2048)
    check(
      'los mods piden más que los plugins',
      recommendedMemoryMb(10, 'forge') > recommendedMemoryMb(10, 'paper'),
      `forge ${recommendedMemoryMb(10, 'forge')} vs paper ${recommendedMemoryMb(10, 'paper')} MB`
    )
    // El redondeo no debe poder saltarse el techo de memoria del equipo.
    const ceiling = Math.max(2048, totalMemoryMb() - 4096)
    check(
      'no recomienda más de lo que tiene el equipo',
      recommendedMemoryMb(200, 'forge') <= ceiling,
      `${recommendedMemoryMb(200, 'forge')} MB de un techo de ${ceiling} MB`
    )
    check('redondea a múltiplos de 512', recommendedMemoryMb(13, 'fabric') % 512 === 0)
    check('el tope también es múltiplo de 512', recommendedMemoryMb(200, 'forge') % 512 === 0)

    // Hardcore: comprobado contra un servidor real, es un booleano aparte y
    // NO un valor de `gamemode`. Si alguien lo añade a la lista de modos, el
    // servidor rechazará el valor.
    const gamemode = PROPERTY_CATALOG.find((d) => d.key === 'gamemode')
    check(
      'hardcore NO está entre los valores de gamemode',
      !gamemode?.options?.some((o) => o.value === 'hardcore'),
      gamemode?.options?.map((o) => o.value).join('/')
    )
    const hardcoreDef = PROPERTY_CATALOG.find((d) => d.key === 'hardcore')
    check('hardcore existe como propiedad booleana', hardcoreDef?.type === 'boolean')
    check('hardcore viene desactivado por defecto', hardcoreDef?.default === 'false')

    // Validación de nombres de mundo: son nombres de carpeta en Windows.
    check('rechaza nombre vacío', validateWorldName('   ') !== null)
    check('rechaza barras y dos puntos', validateWorldName('mi/mundo') !== null)
    check('rechaza nombres reservados de Windows', validateWorldName('CON') !== null)
    check('rechaza el sufijo _nether', validateWorldName('aventura_nether') !== null)
    check('rechaza acabar en punto', validateWorldName('mundo.') !== null)
    check('acepta un nombre normal', validateWorldName('aventura-2') === null)
    check('acepta acentos', validateWorldName('El Páramo') === null)

    // El asistente debe fijar max-players con los jugadores esperados.
    const props12 = defaultProperties(25565, 'Mi servidor', 12)
    check('los jugadores esperados fijan max-players', props12['max-players'] === '12')
    check('sin ese dato, queda el valor por defecto', defaultProperties(25565, 'x')['max-players'] === '10')

    // La regla de oro de §8: no perder claves desconocidas al guardar.
    const original = [
      '#Minecraft server properties',
      'motd=Hola',
      'clave-de-un-plugin=valor',
      '',
      'pvp=true'
    ].join('\n')
    const props = PropertiesFile.parse(original)
    props.set('pvp', 'false')
    const saved = props.serialize()
    check('conserva comentarios', saved.includes('#Minecraft server properties'))
    check('conserva claves desconocidas', saved.includes('clave-de-un-plugin=valor'))
    check('aplica el cambio', saved.includes('pvp=false'))

    // Parseo del log (§7). Cada distribución usa un formato de cabecera propio:
    // vanilla "[hora] [hilo/NIVEL]:" y Paper "[hora NIVEL]:". Hay que cubrir ambos
    // o en Paper no se detecta ni el arranque ni los jugadores.
    const vanillaReady = parseLine(
      '[12:34:56] [Server thread/INFO]: Done (12.345s)! For help, type "help"'
    )
    check('vanilla: detecta servidor listo', vanillaReady.ready === true)

    const paperReady = parseLine('[12:34:56 INFO]: Done (6.789s)! For help, type "help"')
    check('paper: detecta servidor listo', paperReady.ready === true)

    const joined = parseLine('[12:34:56] [Server thread/INFO]: Aitor joined the game')
    check('vanilla: detecta entrada de jugador', joined.playerJoined === 'Aitor')

    const paperJoined = parseLine('[12:34:56 INFO]: Aitor joined the game')
    check('paper: detecta entrada de jugador', paperJoined.playerJoined === 'Aitor')

    const paperLeft = parseLine('[12:34:56 INFO]: Aitor left the game')
    check('paper: detecta salida de jugador', paperLeft.playerLeft === 'Aitor')

    const chat = parseLine('[12:34:56] [Server thread/INFO]: <Aitor> hola a todos')
    check('vanilla: detecta chat', chat.chat?.player === 'Aitor' && chat.chat.message === 'hola a todos')

    const paperChat = parseLine('[12:34:56 INFO]: <Aitor> hola a todos')
    check('paper: detecta chat', paperChat.chat?.player === 'Aitor')

    const paperWarn = parseLine('[12:34:56 WARN]: Algo va regular')
    check('paper: detecta nivel WARN', paperWarn.level === 'warn')

    const paperComponent = parseLine('[12:39:44 INFO]: [bootstrap] Running Java 25')
    check('paper: no confunde componentes con eventos', paperComponent.ready !== true)

    // Forge mete un tercer bloque de corchetes con la clase que emite el log.
    const forgeReady = parseLine(
      '[12:41:40] [Server thread/INFO] [minecraft/DedicatedServer]: Done (14.5s)! For help, type "help"'
    )
    check('forge: detecta servidor listo', forgeReady.ready === true)

    const forgeJoined = parseLine(
      '[12:41:50] [Server thread/INFO] [minecraft/MinecraftServer]: Aitor joined the game'
    )
    check('forge: detecta entrada de jugador', forgeJoined.playerJoined === 'Aitor')

    const forgeWarn = parseLine('[12:41:26] [main/WARN] [ne.mi.fm.lo.FMLConfig/CORE]: Ojo')
    check('forge: detecta nivel WARN', forgeWarn.level === 'warn')

    // El nivel sale del primer bloque: una clase que contenga "WARN" no debe
    // convertir en aviso una línea informativa.
    const forgeInfo = parseLine('[12:41:26] [main/INFO] [com.ejemplo.WARNINGS/CORE]: Todo bien')
    check('forge: la clase no falsea el nivel', forgeInfo.level === 'info')

    check(
      'diagnostica puerto ocupado',
      diagnose('[12:00:00] [main/ERROR]: FAILED TO BIND TO PORT!')?.code === 'port-in-use'
    )
    check(
      'diagnostica falta de memoria',
      diagnose('java.lang.OutOfMemoryError: Java heap space')?.code === 'out-of-memory'
    )

    // Acuse de guardado: varía entre versiones y distribuciones, y de él
    // depende que una copia en caliente no salga corrupta (§12).
    const savePattern = /Saved the (game|world|chunks)/i
    check('reconoce "Saved the game"', savePattern.test('[12:00:00 INFO]: Saved the game'))
    check('reconoce "Saved the world"', savePattern.test('[12:00:00] [Server thread/INFO]: Saved the world'))
  })

  // --- Red (§10) ------------------------------------------------------------

  await section('Red', async () => {
    const addresses = network.localAddresses()
    check(
      'detecta alguna IP local',
      addresses.length > 0,
      addresses.map((a) => `${a.address} (${a.label})`).join(', ')
    )
    check(
      'descarta loopback y adaptadores virtuales',
      addresses.every((a) => !a.address.startsWith('127.')),
      'ninguna 127.x'
    )

    // Un puerto altísimo y sin uso no debe dar falso positivo.
    const free = await network.isPortInUse(59999)
    check('puerto libre se reporta como libre', free === false)

    const suggestion = await network.findFreePort(59990)
    check('sugiere un puerto libre', suggestion >= 59990, String(suggestion))

    // Contra algo que no habla el protocolo de Minecraft, el ping debe fallar
    // limpiamente en vez de colgarse: es la diferencia entre "el puerto está
    // abierto" y "se puede entrar" (§10).
    const ping = await network.serverListPing('127.0.0.1', 59999, 1500)
    check('el ping falla limpiamente si no hay servidor', ping.ok === false, ping.error)

    // Puerta de enlace: se saca de `route print`, cuya salida está traducida.
    // El patrón es numérico para no depender del idioma de Windows.
    const gateway = await network.defaultGateway()
    check(
      'detecta la puerta de enlace',
      gateway !== null && /^\d+\.\d+\.\d+\.\d+$/.test(gateway),
      gateway ?? 'no detectada'
    )
  })

  // --- Acceso desde internet (§10) ------------------------------------------

  await section('Acceso desde internet', async () => {
    const ip = await network.publicIp()
    check(
      'consulta la IP pública',
      ip !== null && /^\d+\.\d+\.\d+\.\d+$/.test(ip),
      ip ? 'obtenida' : 'no disponible' // no se imprime: es un dato personal
    )

    // Contrato con el servicio de comprobación externa: debe decir "accesible"
    // de un servidor público real y "no accesible" de algo que no existe.
    const real = await network.checkFromInternet('play.cubecraft.net', 25565)
    check('reconoce un servidor accesible', real.reachable === true, real.error)

    const fake = await network.checkFromInternet('no-existe-qubiq-test.invalid', 25565)
    check('reconoce uno inaccesible', fake.reachable === false)
  })

  // --- Contrato con las APIs externas --------------------------------------

  await section('Mojang', async () => {
    const versions = await mojang.listVersions()
    check('devuelve versiones', versions.length > 100, `${versions.length} versiones`)

    const latest = await mojang.latestRelease()
    check('hay release más reciente', latest.length > 0, latest)

    // ⚠ La trampa de §4.6: el orden NO es el del string.
    const sorted = [...versions].sort(compareVersions)
    check('la primera del orden es la más reciente', sorted[0]!.orderIndex === 0, sorted[0]!.id)

    const java = await mojang.requiredJavaMajor(latest)
    check('declara Java requerido', java >= 8, `Java ${java} para ${latest}`)

    const dl = await mojang.serverDownload(latest)
    check('publica server.jar con SHA-1', dl.sha1.length === 40, `${(dl.size / 1e6).toFixed(1)} MB`)
  })

  await section('Paper (API v3)', async () => {
    const versions = await paper.listVersions()
    check('devuelve versiones', versions.length > 0, `${versions.length} versiones`)

    const build = await paper.latestBuild(versions[0]!)
    check('build con SHA-256', build.sha256.length === 64, `build ${build.build}`)
    check('canal estable', build.channel === 'STABLE' || build.channel === 'RECOMMENDED', build.channel)
    check('URL de descarga', build.url.startsWith('https://'), build.fileName)
  })

  await section('Fabric', async () => {
    const versions = await fabric.listVersions()
    check('devuelve versiones', versions.length > 0, `${versions.length} versiones`)

    const stable = await fabric.stableVersions()
    const jar = await fabric.serverJar(stable[0]!)
    check('compone URL del launcher', jar.url.includes('/server/jar'), `loader ${jar.loader}`)
  })

  await section('Forge', async () => {
    const versions = await forge.listVersions()
    check('devuelve versiones', versions.length > 0, `${versions.length} versiones`)

    // 1.20.1 es la versión modded de referencia y siempre está publicada.
    const build = await forge.resolveBuild('1.20.1')
    check('resuelve build para 1.20.1', build.forgeVersion.length > 0, build.fullVersion)
    check(
      'URL del instalador bien formada',
      build.installerUrl.endsWith('-installer.jar'),
      build.installerFileName
    )
  })

  await section('Catálogo unificado', async () => {
    for (const dist of ['vanilla', 'paper', 'fabric', 'forge'] as const) {
      const list = await catalog.versionsFor(dist)
      check(`${dist}: ofrece versiones estables`, list.length > 0, `${list.length}, la más nueva ${list[0]?.minecraftVersion}`)
      check(`${dist}: marca una recomendada`, list[0]?.recommended === true)
    }
  })

  await rm(root, { recursive: true, force: true })

  console.log(`\n${passed} correctas, ${failed} fallidas`)
  if (failed > 0) process.exitCode = 1
}

void main()
