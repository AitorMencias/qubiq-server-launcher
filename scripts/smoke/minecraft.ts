/**
 * Prueba de humo de Minecraft: su lógica y el contrato con sus APIs (§16).
 * La lanza `index.ts` (npm run smoke).
 */

import { createServer } from 'node:net'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

import { check, fileExists, section } from './harness'
import * as mcPing from '../../src/main/core/games/minecraft/ping'
import * as mojang from '../../src/main/core/games/minecraft/versions/mojang'
import * as paper from '../../src/main/core/games/minecraft/versions/paper'
import * as fabric from '../../src/main/core/games/minecraft/versions/fabric'
import * as forge from '../../src/main/core/games/minecraft/versions/forge'
import * as catalog from '../../src/main/core/games/minecraft/versions/catalog'
import { compareVersions } from '../../src/shared/games/minecraft/types'
import type { MinecraftManifest } from '../../src/shared/types'
import { minecraftAdapter } from '../../src/main/core/games/minecraft/adapter'
import {
  suggestedMemoryMb,
  defaultJvmArgs,
  recommendedMemoryMb,
  totalMemoryMb
} from '../../src/main/core/games/minecraft/install/jvmArgs'
import {
  PropertiesFile,
  PROPERTY_CATALOG,
  defaultProperties,
  initialProperties
} from '../../src/main/core/games/minecraft/config/properties'
import { parseLine, diagnose } from '../../src/main/core/games/minecraft/logParser'
import { validateWorldName } from '../../src/main/core/games/minecraft/worlds/manager'
import { PluginConfigFile } from '../../src/main/core/games/minecraft/content/pluginConfig'
import { minecraftConfigSmoke } from './minecraftConfig'
import { minecraftCustomSmoke } from './minecraftCustom'
import {
  OFFICIAL_PLUGINS,
  officialPluginsFor,
  serverPropertiesFor,
  type BundledOfficialPlugin
} from '../../src/shared/games/minecraft/officialPlugins'
import { OFFICIAL_PLUGIN_SOURCES } from '../official-plugins.mjs'

export async function minecraftSmoke(): Promise<void> {
  // --- Lógica pura (sin red) ------------------------------------------------

  await section('Lógica pura', async () => {
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

    // Lo elegido en el recorrido del modo básico se aplica encima, validado.
    const elegidos = initialProperties(25565, 'Mi servidor', 8, {
      gamemode: 'creative',
      difficulty: 'peaceful',
      'level-type': 'minecraft:flat',
      pvp: 'false'
    })
    check(
      'aplica lo elegido en el asistente',
      elegidos['gamemode'] === 'creative' &&
        elegidos['difficulty'] === 'peaceful' &&
        elegidos['level-type'] === 'minecraft:flat' &&
        elegidos['pvp'] === 'false'
    )
    check('y conserva el resto por defecto', elegidos['online-mode'] === 'true' && elegidos['max-players'] === '8')
    check(
      'el modo extremo fuerza Difícil aunque se pida otra',
      initialProperties(25565, 'x', 8, { hardcore: 'true', difficulty: 'easy' })['difficulty'] === 'hard'
    )
    const lanza = (overrides: Record<string, string>): boolean => {
      try {
        initialProperties(25565, 'x', 8, overrides)
        return false
      } catch {
        return true
      }
    }
    check('rechaza una clave fuera del catálogo', lanza({ 'clave-inventada': 'x' }))
    check('no deja cambiar el puerto por esta vía', lanza({ 'server-port': '1' }))
    check('rechaza un valor que no está en la lista', lanza({ gamemode: 'hardcore' }))
    check('rechaza un booleano mal escrito', lanza({ pvp: 'si' }))

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

  // --- Plugins oficiales ----------------------------------------------------

  await section('Plugins oficiales', async () => {
    // Se prueba contra la plantilla REAL que se empaqueta, no contra un YAML
    // inventado: así, si el plugin cambia su esquema, esto se entera.
    const templatePath = join(process.cwd(), 'resources/minecraft/plugins/hardcore-utility/config.yml')
    const template = await readFile(templatePath, 'utf8')
    const config = PluginConfigFile.parse(template)

    check('lee una clave de primer nivel', config.get('mode') === 'game', config.get('mode') ?? '')
    check('lee una clave anidada', config.get('game.api-port') === '25580', config.get('game.api-port') ?? '')
    check('lee una clave de tres niveles', config.get('game.pregeneration.radius') === '1000')
    check('quita las comillas al leer', config.get('game.lobby-host') === 'localhost')

    // La misma palabra aparece en las dos secciones; hay que no confundirlas.
    check('no confunde secciones', config.get('game.lobby-port') === '25565', config.get('game.lobby-port') ?? '')
    check('ni en la otra dirección', config.get('lobby.game-port') === '25566', config.get('lobby.game-port') ?? '')

    check('una ruta inexistente da null', config.get('game.no-existe') === null)
    check('no inventa claves al escribir', config.set('game.no-existe', 1) === false)

    config.set('mode', 'lobby')
    config.set('api-token', 'clave-compartida')
    config.set('game.api-port', 25590)
    config.set('game.pregeneration.enabled', false)
    const out = config.serialize()

    check('escribe cadenas entrecomilladas', /^mode: "lobby"$/m.test(out))
    check('escribe números desnudos', /^ {2}api-port: 25590$/m.test(out))
    check('escribe booleanos desnudos', /^ {4}enabled: false$/m.test(out))
    check('no toca las demás claves', /^ {2}api-bind: "127\.0\.0\.1"$/m.test(out))

    // Lo que de verdad importa: el fichero sigue siendo legible para quien lo
    // abra a mano. Un serializador de YAML se habría comido los comentarios.
    check('conserva los comentarios', out.includes('# "lobby" = sala de espera'))
    check(
      'conserva la cabecera',
      out.includes('#  Instala el MISMO .jar en los dos servidores')
    )

    // --- Config antigua + plantilla nueva ---
    // El caso de quien ya tenía el plugin instalado cuando sale una opción
    // nueva: sin esto, el campo aparecería en el formulario y al guardarlo no
    // pasaría nada, porque `set` no crea claves.
    const antigua = PluginConfigFile.parse(
      [
        'mode: game',
        'api-token: "mi-clave"',
        '',
        'game:',
        '  api-bind: "127.0.0.1"',
        '  api-port: 25580',
        '',
        '  # Dirección con la que los JUGADORES entran al lobby.',
        '  lobby-host: "mi-servidor.com"',
        '  lobby-port: 25565',
        '',
        '  require-transfer: true',
        ''
      ].join('\r\n')
    )

    const añadidas = antigua.addMissingFrom(PluginConfigFile.parse(template))
    check('detecta las opciones que faltan', añadidas.includes('game.lobby-local-host'), añadidas.length + ' rutas')
    check('y ahora se pueden leer', antigua.get('game.lobby-local-host') === '')
    check('y escribir', antigua.set('game.lobby-local-host', '192.168.1.50') === true)
    check('sin tocar lo que el usuario ya tenía', antigua.get('game.lobby-host') === 'mi-servidor.com')

    const fusionada = antigua.serialize()
    check(
      'la opción nueva cae en su sección, no al final',
      fusionada.indexOf('lobby-local-host') > fusionada.indexOf('lobby-port') &&
        fusionada.indexOf('lobby-local-host') < fusionada.indexOf('require-transfer')
    )
    check('se trae el comentario que la explica', fusionada.includes('casi ningun router'))
    check('conserva los comentarios del usuario', fusionada.includes('# Dirección con la que los JUGADORES'))
    check(
      'no duplica lo que ya estaba',
      fusionada.split('lobby-host:').length - 1 === 1,
      `${fusionada.split('lobby-host:').length - 1} veces`
    )

    // Una sección entera que falta se reconstruye completa y en orden.
    check('añade la sección que falta', antigua.has('lobby.game-host') && antigua.has('lobby.game-local-port'))
    check(
      'y en el orden de la plantilla',
      fusionada.indexOf('game-host:') < fusionada.indexOf('game-local-host:')
    )

    // Repetirlo no debe volver a añadir nada: es idempotente.
    check('no añade nada la segunda vez', antigua.addMissingFrom(PluginConfigFile.parse(template)).length === 0)

    // Caso límite: un fichero vacío se reconstruye entero desde la plantilla.
    const vacia = PluginConfigFile.parse('')
    vacia.addMissingFrom(PluginConfigFile.parse(template))
    check(
      'reconstruye una configuración vacía',
      vacia.get('mode') === 'game' && vacia.get('lobby.game-local-port') === '0'
    )

    // El catálogo tiene que apuntar a ficheros que existen de verdad.
    // Los trae `npm run plugins` (presmoke) de la release de su repositorio.
    for (const plugin of OFFICIAL_PLUGINS) {
      const dir = join(process.cwd(), 'resources/minecraft/plugins', plugin.id)
      const info = JSON.parse(await readFile(join(dir, 'plugin.json'), 'utf8')) as BundledOfficialPlugin
      const jar = join(dir, info.jarFileName)
      const cfg = join(dir, plugin.configFileName)
      check(`${plugin.name}: el jar viaja con la app`, await fileExists(jar), info.jarFileName)
      check(
        `${plugin.name}: su nombre encaja con el del catálogo`,
        info.jarFileName.toLowerCase().startsWith(plugin.jarPrefix.toLowerCase()),
        `${info.jarFileName} / ${plugin.jarPrefix}`
      )
      const fuente = OFFICIAL_PLUGIN_SOURCES.find((s) => s.id === plugin.id)
      check(
        `${plugin.name}: el catálogo y npm run plugins apuntan al mismo repositorio`,
        fuente !== undefined &&
          `https://github.com/${fuente.repo}` === plugin.repository &&
          info.repository === plugin.repository,
        `${plugin.repository} / ${fuente?.repo} / ${info.repository}`
      )
      check(`${plugin.name}: con su licencia`, info.license !== null, info.license ?? '')
      check(`${plugin.name}: la plantilla de configuración también`, await fileExists(cfg))

      // Cada campo del formulario tiene que existir en la plantilla, o el
      // usuario vería un control que no guarda nada.
      const real = PluginConfigFile.parse(await readFile(cfg, 'utf8'))
      const huerfanos = plugin.fields.filter((f) => !real.has(f.path)).map((f) => f.path)
      check(`${plugin.name}: todos sus campos existen en el config.yml`, huerfanos.length === 0, huerfanos.join(', '))
      if (plugin.roleKey) {
        check(`${plugin.name}: la clave de papel existe`, real.has(plugin.roleKey), plugin.roleKey)
      }

      // Un ajuste que imponemos y que luego no aparece en ninguna pantalla es
      // un ajuste embrujado: el usuario no puede ni verlo ni deshacerlo.
      for (const papel of plugin.roles ?? [{ value: undefined }]) {
        const props = serverPropertiesFor(plugin, papel.value)
        const desconocidas = Object.keys(props).filter(
          (key) => !PROPERTY_CATALOG.some((def) => def.key === key)
        )
        check(
          `${plugin.name}${papel.value ? ` (${papel.value})` : ''}: sus ajustes salen en Ajustes`,
          desconocidas.length === 0,
          desconocidas.join(', ')
        )
      }
    }

    // Las dos puntas de la red se transfieren jugadores: si una no acepta
    // transferencias, el jugador rebota y se queda fuera.
    const hardcore = OFFICIAL_PLUGINS.find((p) => p.id === 'hardcore-utility')!
    check(
      'la partida acepta transferencias',
      serverPropertiesFor(hardcore, 'game')['accepts-transfers'] === 'true'
    )
    check(
      'y el lobby también',
      serverPropertiesFor(hardcore, 'lobby')['accepts-transfers'] === 'true'
    )
    check(
      'solo la partida activa el modo extremo',
      serverPropertiesFor(hardcore, 'game')['hardcore'] === 'true' &&
        serverPropertiesFor(hardcore, 'lobby')['hardcore'] === undefined
    )
    check(
      'un papel desconocido no activa el modo extremo',
      serverPropertiesFor(hardcore, 'no-existe')['hardcore'] === undefined
    )

    check('vanilla no ofrece plugins oficiales', officialPluginsFor('vanilla').length === 0)
    check('paper sí', officialPluginsFor('paper').length > 0)
  })

  // --- Configuración de plugins y mods (§19.20) ------------------------------

  await minecraftConfigSmoke()
  await minecraftCustomSmoke()

  // --- Red de Minecraft (§10) ------------------------------------------------

  await section('Red de Minecraft', async () => {
    // Contra algo que no habla el protocolo de Minecraft, el ping debe fallar
    // limpiamente en vez de colgarse: es la diferencia entre "el puerto está
    // abierto" y "se puede entrar" (§10).
    const ping = await mcPing.serverListPing('127.0.0.1', 59999, 1500)
    check('el ping falla limpiamente si no hay servidor', ping.ok === false, ping.error)

    // Un servidor que acepta y corta sin responder, como hace Minecraft justo
    // al terminar de arrancar. Antes esto dejaba el ping colgado para siempre.
    const cutter = createServer((socket) => socket.end())
    await new Promise<void>((resolve) => cutter.listen(0, '127.0.0.1', resolve))
    const cutterPort = (cutter.address() as { port: number }).port
    const cut = await Promise.race([
      mcPing.serverListPing('127.0.0.1', cutterPort, 1500),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000))
    ])
    cutter.close()
    check('el ping no se cuelga si el servidor corta', cut !== null && cut.ok === false, cut?.error ?? 'colgado')

    // Contrato con el servicio de comprobación externa: debe decir "accesible"
    // de un servidor público real y "no accesible" de algo que no existe.
    const real = await mcPing.checkFromInternet('play.cubecraft.net', 25565)
    check('reconoce un servidor accesible', real.reachable === true, real.error)

    const fake = await mcPing.checkFromInternet('no-existe-qubiq-test.invalid', 25565)
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

    // La versión que ofrecería la app, no la primera de la lista: Paper publica
    // las release candidate (26.3-rc-3) antes de tener un build estable, y
    // entonces la primera solo tiene builds experimentales.
    const build = await paper.latestBuild(await catalog.defaultVersionFor('paper'))
    check('build con SHA-256', build.sha256.length === 64, `build ${build.build}`)
    check('canal estable', build.channel === 'STABLE' || build.channel === 'RECOMMENDED', build.channel)
    check('URL de descarga', build.url.startsWith('https://'), build.fileName)

    // Una versión recién salida solo con builds experimentales SÍ se ofrece,
    // pero marcada, y nunca es la recomendada: el asistente avisa antes de
    // instalarla y el instalador la acepta solo si el usuario dijo que sí.
    const offered = await catalog.versionsFor('paper')
    const recommended = offered.find((v) => v.recommended)!
    check(
      'la versión recomendada tiene build estable',
      await paper.hasStableLatestBuild(recommended.minecraftVersion),
      recommended.minecraftVersion
    )
    check(
      'la recomendada no está marcada en pruebas',
      recommended.experimental !== true,
      recommended.minecraftVersion
    )

    const testing = offered.filter((v) => v.experimental)
    check(
      'las versiones sin build estable van marcadas y antes de la recomendada',
      testing.every((v) => offered.indexOf(v) < offered.indexOf(recommended)),
      testing.length > 0 ? testing.map((v) => v.minecraftVersion).join(', ') : 'ninguna ahora mismo'
    )

    // El instalador solo debe aceptar el build alpha si se le pide.
    if (testing[0]) {
      const version = testing[0].minecraftVersion
      const experimental = await paper.latestBuild(version, true)
      check('se puede resolver el build en pruebas', experimental.url.startsWith('https://'), `${version}: ${experimental.channel}`)
      let rejected = false
      try {
        await paper.latestBuild(version)
      } catch {
        rejected = true
      }
      check('sin permiso explícito, el build en pruebas se rechaza', rejected, version)
    }
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

  // Cambiar de versión un servidor que ya existe (§19.18). Solo hace falta la
  // distribución y la versión que tiene puesta, así que el manifiesto va a mano.
  await section('Cambiar de versión (Minecraft)', async () => {
    const manifestEn = (minecraftVersion: string): MinecraftManifest =>
      ({
        schemaVersion: 2,
        id: 'falso',
        name: 'Falso',
        game: 'minecraft',
        port: 25565,
        autoRestart: false,
        backup: { enabled: false, intervalHours: 24, keep: 3 },
        createdAt: new Date().toISOString(),
        agreements: ['minecraft-eula'],
        data: {
          distribution: 'paper',
          minecraftVersion,
          javaMajor: 21,
          memoryMb: 2048,
          jvmArgs: []
        }
      }) as MinecraftManifest

    const offered = await catalog.versionsFor('paper')
    const estable = offered.find((v) => v.recommended)!.minecraftVersion
    const antigua = offered.find((v) => !v.recommended && !v.experimental)!.minecraftVersion
    const pruebas = offered.find((v) => v.experimental)?.minecraftVersion

    const lista = await minecraftAdapter.listVersions!(manifestEn(estable))
    check('ofrece todas las versiones de la distribución', lista.length === offered.length)
    check('marca la instalada', lista.filter((v) => v.installed).length === 1, estable)
    check(
      'la instalada es «same» y las de después «older»',
      lista.find((v) => v.id === estable)?.relation === 'same' &&
        lista.find((v) => v.id === antigua)?.relation === 'older'
    )

    // Estando en la estable, si hay una en pruebas sale como posterior, pero
    // NO como actualización pendiente: ir a ella es una decisión, no ponerse al día.
    if (pruebas) {
      check('la versión en pruebas sale como posterior', lista.find((v) => v.id === pruebas)?.relation === 'newer')
      check('y marcada como en pruebas', lista.find((v) => v.id === pruebas)?.experimental === true)
      const desdePruebas = await minecraftAdapter.checkUpdate!(manifestEn(pruebas))
      check(
        'quien va en una en pruebas no tiene nada que actualizar',
        desdePruebas.available === false,
        `${pruebas} -> ${desdePruebas.latest}`
      )
    }

    const alDia = await minecraftAdapter.checkUpdate!(manifestEn(estable))
    check('en la recomendada, no hay actualización', alDia.available === false, estable)

    const atrasado = await minecraftAdapter.checkUpdate!(manifestEn(antigua))
    check('en una anterior, sí la hay', atrasado.available === true, `${antigua} -> ${atrasado.latest}`)

    // Cambiar de versión recalcula el Java: es el error que dejaría el servidor
    // sin arrancar después de un salto grande.
    const cambio = await minecraftAdapter.prepareVersionChange!(manifestEn(estable), antigua)
    check('al cambiar, apunta la versión pedida', cambio.minecraftVersion === antigua)
    check('recalcula el Java que pide esa versión', cambio.javaMajor === (await catalog.javaMajorFor(antigua)), `Java ${cambio.javaMajor}`)
    check('y olvida el build de la anterior', cambio.build === undefined)

    if (pruebas) {
      const aPruebas = await minecraftAdapter.prepareVersionChange!(manifestEn(estable), pruebas)
      check('cambiar a una en pruebas deja el permiso puesto', aPruebas.allowExperimental === true)
      const aEstable = await minecraftAdapter.prepareVersionChange!(manifestEn(pruebas), estable)
      check('y volver a la estable lo quita', aEstable.allowExperimental === false)
    }

    let rechazo = ''
    try {
      await minecraftAdapter.prepareVersionChange!(manifestEn(estable), '0.0.1-inventada')
    } catch (err) {
      rechazo = err instanceof Error ? err.message : String(err)
    }
    check('una versión inventada se rechaza antes de tocar nada', rechazo.includes('0.0.1-inventada'), rechazo)
  })

  await section('Catálogo unificado', async () => {
    for (const dist of ['vanilla', 'paper', 'fabric', 'forge'] as const) {
      const list = await catalog.versionsFor(dist)
      check(`${dist}: ofrece versiones estables`, list.length > 0, `${list.length}, la más nueva ${list[0]?.minecraftVersion}`)
      // Ya no tiene por qué ser la primera: delante puede haber versiones que
      // la distribución solo publica en pruebas.
      const marked = list.filter((v) => v.recommended)
      check(
        `${dist}: marca una sola recomendada`,
        marked.length === 1,
        marked[0]?.minecraftVersion
      )
    }
  })
}
