import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { check, section } from './harness'
import {
  diagnoseExit,
  launchArgs,
  parseLine,
  valheimAdapter,
  versionFromKeywords
} from '../../src/main/core/games/valheim/adapter'
import { parseInfo, parsePlayers } from '../../src/main/core/net/a2s'
import {
  formatList,
  parseList,
  validPlayerId,
  validWorldName
} from '../../src/main/core/games/valheim/service'
import * as mods from '../../src/main/core/games/valheim/mods'
import { capabilitiesFor, gameInfo, serverPorts } from '../../src/shared/games'
import {
  GLOBAL_KEYS,
  MAX_PLAYERS,
  MIN_PASSWORD_LENGTH,
  MODIFIERS,
  PRESETS,
  VALHEIM_GAME_APP_ID,
  modifierArgs,
  queryPortFor
} from '../../src/shared/games/valheim/types'
import type { ValheimCreateRequest, ValheimManifest } from '../../src/shared/types'

/**
 * Prueba de humo de Valheim (fase 3).
 *
 * Valheim no tiene API ni consola, así que no hay protocolo que grabar: **toda
 * su configuración son argumentos de la línea de órdenes y todo lo que cuenta
 * lo cuenta por el registro**. Eso es justo lo que se comprueba aquí, contra
 * las líneas reales del servidor (`fixtures/valheim/registro.txt`).
 *
 * Lo único que tiene protocolo es su consulta de Steam, y esa sí está grabada
 * contra el servidor real publicado (`fixtures/valheim/a2s.json`).
 *
 * Lo que aún no se ha podido grabar —el código de crossplay— está en
 * `sinteticas.txt`, copiado de las cadenas del binario y marcado como tal, para
 * que nadie lo confunda con una grabación.
 */

const FIXTURES = join(process.cwd(), 'scripts', 'smoke', 'fixtures', 'valheim')

async function lineas(fichero: string): Promise<string[]> {
  const raw = await readFile(join(FIXTURES, fichero), 'utf8')
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !l.startsWith('//'))
}

function manifestoDePrueba(overrides: Partial<ValheimManifest> = {}): ValheimManifest {
  return {
    schemaVersion: 2,
    id: 'prueba',
    name: 'Servidor de prueba',
    game: 'valheim',
    port: 2456,
    autoRestart: false,
    backup: { enabled: false, intervalHours: 6, keep: 3 },
    createdAt: new Date().toISOString(),
    agreements: ['steam-subscriber'],
    data: {
      password: 'qubiq123',
      worldName: 'Prueba',
      preset: 'hard',
      modifiers: { combat: 'veryhard', deathpenalty: 'casual', resources: 'default' },
      globalKeys: ['nomap'],
      listed: false,
      saveIntervalSeconds: 1800,
      backups: 4
    },
    ...overrides
  } as ValheimManifest
}

export async function valheimSmoke(): Promise<void> {
  // --- Argumentos de arranque -------------------------------------------------

  await section('Valheim: argumentos de arranque', async () => {
    const args = launchArgs(manifestoDePrueba())
    const valor = (flag: string): string | undefined => args[args.indexOf(flag) + 1]

    // ⚠ Sin `-savedir` el servidor escribe los mundos en la carpeta del juego
    // del usuario, junto a sus partidas de un jugador. Es la comprobación más
    // importante de todo este fichero.
    check('lleva -savedir', args.includes('-savedir'))
    check('el savedir apunta dentro de la instancia', valor('-savedir')?.includes('prueba') === true)

    check('arranca sin ventana ni gráficos', args.includes('-nographics') && args.includes('-batchmode'))
    check('pasa el nombre del servidor', valor('-name') === 'Servidor de prueba')
    check('pasa el puerto', valor('-port') === '2456')
    check('pasa el mundo', valor('-world') === 'Prueba')
    check('pasa la contraseña', valor('-password') === 'qubiq123')
    check('sin publicar por defecto', valor('-public') === '0')
    check('pasa la dificultad', valor('-preset') === 'hard')

    // Los modificadores en `default` significan «lo que diga el preset»: si se
    // mandaran, pisarían la dificultad elegida.
    check('manda los modificadores tocados', args.join(' ').includes('-modifier combat veryhard'))
    check(
      'no manda los que están en «lo que diga la dificultad»',
      !args.join(' ').includes('resources')
    )

    // ⚠ Las reglas de sí/no NO son modificadores: el servidor las rechaza.
    check('las reglas de sí o no van por -setkey', args.join(' ').includes('-setkey nomap'))
    check('y no por -modifier', !args.join(' ').includes('-modifier nomap'))

    const sinClave = launchArgs(
      manifestoDePrueba({ data: { ...manifestoDePrueba().data, password: '' } } as Partial<ValheimManifest>)
    )
    check('sin contraseña no manda -password vacío', !sinClave.includes('-password'))

    const publicado = launchArgs(
      manifestoDePrueba({ data: { ...manifestoDePrueba().data, listed: true } } as Partial<ValheimManifest>)
    )
    check('publicado manda -public 1', publicado[publicado.indexOf('-public') + 1] === '1')

    // El crossplay es una forma de exponer el servidor, no un ajuste suyo.
    check('sin crossplay no manda -crossplay', !args.includes('-crossplay'))
    const conCrossplay = launchArgs(manifestoDePrueba({ exposure: { mode: 'crossplay' } }))
    check('con crossplay sí lo manda', conCrossplay.includes('-crossplay'))
    const conRouter = launchArgs(manifestoDePrueba({ exposure: { mode: 'router' } }))
    check('abriendo el router, no', !conRouter.includes('-crossplay'))
  })

  await section('Valheim: modificadores que acepta el servidor', async () => {
    // La lista está medida contra el servidor real: si el juego cambia sus
    // valores, lo que hay que actualizar es el catálogo, no la interfaz.
    check('cinco modificadores', MODIFIERS.length === 5)
    check(
      'todos ofrecen «lo que diga la dificultad»',
      MODIFIERS.every((m) => m.options[0]?.value === 'default')
    )
    check('ocho preajustes de dificultad, contando el del mundo', PRESETS.length + 1 === 8)
    check('cinco reglas de sí o no', GLOBAL_KEYS.length === 5)

    const args = modifierArgs({ combat: 'hard', raids: 'default', portals: 'veryhard' })
    check('un argumento por modificador tocado', args.length === 6)
    check('con la forma que espera el juego', args.slice(0, 3).join(' ') === '-modifier combat hard')
  })

  // --- Registro ---------------------------------------------------------------

  await section('Valheim: lectura del registro (líneas reales)', async () => {
    const reales = await lineas('registro.txt')
    const eventos = reales.map((l) => ({ raw: l, event: parseLine(l) }))

    const listo = eventos.find((e) => e.event.ready)
    check('detecta cuándo el servidor está listo', listo !== undefined)
    check(
      'y es la línea buena («Opened Steam server»)',
      listo?.raw.includes('Opened Steam server') === true
    )
    check('una sola línea marca «listo»', eventos.filter((e) => e.event.ready).length === 1)

    check(
      'quita la fecha y la hora que pone el juego',
      parseLine('09/17/2026 11:06:26: Opened Steam server').text.includes('11:06:26') === false
    )

    // El registro de un arranque es ruido casi entero: más de cuarenta líneas
    // de generación del mundo que parecen fallos («Failed to place all…») y no
    // lo son. Enseñarlas haría la consola inservible.
    const ocultas = eventos.filter((e) => e.event.hidden).length
    check('esconde el ruido del motor y de la generación', ocultas > reales.length / 2)
    check(
      'no esconde lo que el juego avisa que no ha entendido',
      eventos.find((e) => e.raw.includes("Could not parse 'inventado'"))?.event.hidden !== true
    )
    check(
      'no esconde la versión del juego',
      eventos.find((e) => e.raw.includes('Valheim version'))?.event.hidden !== true
    )
    check(
      'no esconde el guardado del mundo',
      eventos.find((e) => e.raw.includes('World save (5/5)'))?.event.hidden !== true
    )
    check(
      'esconde la generación del terreno',
      eventos.find((e) => e.raw.includes('Failed to place all'))?.event.hidden === true
    )

    const preset = parseLine("09/17/2026 11:05:57: Could not parse 'inventado' as a world modifier preset.")
    check('avisa en cristiano de una dificultad que el juego no entiende', preset.level === 'warn')
  })

  await section('Valheim: quién entra (líneas sintéticas, comportamiento confirmado)', async () => {
    // ⚠ Estas dos líneas no están grabadas literalmente: salen de las cadenas de
    // formato del binario. Lo que sí está comprobado es que funcionan, con un
    // jugador entrando de verdad. Ver el aviso del propio fichero.
    const eventos = (await lineas('sinteticas.txt')).map(parseLine)

    const entra = eventos.find((e) => e.playerJoined)
    check('reconoce a quien entra', entra?.playerJoined === '76561198000000001')
    check('y lo dice en cristiano', entra?.text.includes('ha entrado') === true)

    const sale = eventos.find((e) => e.playerLeft)
    check('reconoce a quien se va', sale?.playerLeft === '76561198000000001')
  })

  await section('Valheim: crossplay (grabación real del servidor)', async () => {
    const reales = await lineas('crossplay.txt')
    const eventos = reales.map((l) => ({ raw: l, event: parseLine(l) }))

    // ⚠ LO MÁS IMPORTANTE: con crossplay el servidor NO dice «Opened Steam
    // server». Buscando solo esa, un servidor con crossplay se quedaría
    // «Arrancando» para siempre (se esperaron tres minutos y no llega).
    check(
      'la grabación no trae la línea de Steam',
      !reales.some((l) => /Opened Steam server/i.test(l))
    )
    const listo = eventos.find((e) => e.event.ready)
    check('y aun así se detecta que está listo', listo !== undefined)
    check(
      'por la línea de PlayFab',
      listo?.raw.includes('Opened PlayFab server') === true,
      listo?.raw
    )

    const codigos = eventos.filter((e) => e.event.joinCode).map((e) => e.event.joinCode)
    check('saca el código de las dos líneas que lo traen', codigos.length === 2)
    check('y es el mismo en las dos', codigos[0] === '835901' && codigos[1] === '835901')
    check(
      'el código se enseña en cristiano',
      eventos.find((e) => e.raw.includes('registered with join code'))?.event.text ===
        'Código para entrar con crossplay: 835901'
    )

    // ⚠ El servidor escribe la IP PÚBLICA del usuario en cuatro líneas, porque
    // es la que registra en PlayFab. No puede acabar en una consola que se
    // enseña y se copia y pega.
    const conIp = eventos.filter((e) => /\d{1,3}(\.\d{1,3}){3}:\d+/.test(e.raw))
    check('la grabación trae líneas con la dirección pública', conIp.length >= 2)
    check('ninguna se enseña', conIp.every((e) => e.event.hidden === true))
    check(
      'y la dirección tampoco se guarda en el texto',
      conIp.every((e) => !/\d{1,3}(\.\d{1,3}){3}:\d+/.test(e.event.text))
    )
    check(
      'pero el código se rescata igual de esa línea',
      conIp.find((e) => e.raw.includes('is active'))?.event.joinCode === '835901'
    )

    // Mientras no hay código, el juego escribe el hueco vacío: no dice nada.
    check(
      'la línea sin código todavía no se enseña',
      eventos.find((e) => e.raw.includes('has join code ,'))?.event.hidden === true
    )
  })

  // --- Consulta de Steam (A2S) -------------------------------------------------

  await section('Valheim: consulta de Steam (grabación real del servidor publicado)', async () => {
    const grabacion = JSON.parse(await readFile(join(FIXTURES, 'a2s.json'), 'utf8')) as Record<
      string,
      { info: { log: { dir: string; hex: string }[]; timeout?: boolean }; players: { log: { dir: string; hex: string }[]; timeout?: boolean } }
    >

    // ⚠ Lo más importante de la grabación: en el puerto de JUEGO no contesta
    // nadie, ni con el servidor publicado. Solo responde el de consulta.
    check('en el puerto de juego no contesta', grabacion['2456']?.info.timeout === true)
    check('ni a la consulta de jugadores', grabacion['2456']?.players.timeout === true)
    check('en el de consulta sí', grabacion['2457']?.info.timeout !== true)

    const respuesta = Buffer.from(
      grabacion['2457']!.info.log.find((e) => e.dir === 'in')!.hex,
      'hex'
    )
    const info = parseInfo(respuesta.subarray(4))

    check('lee el nombre del servidor', info.name === 'QubiQ grabacion A2S', info.name)
    check('dice que es Valheim', info.folder === 'valheim', info.folder)
    check('servidor dedicado en Windows', info.serverType === 'dedicado' && info.environment === 'Windows')
    check('sabe que pide contraseña', info.passwordProtected)
    check('el límite de jugadores es el del juego', info.maxPlayers === MAX_PLAYERS, String(info.maxPlayers))
    check('y no había nadie dentro', info.players === 0)
    check('dice cuál es el puerto de juego', info.gamePort === 2456, String(info.gamePort))

    // ⚠ `version` no sirve: el servidor manda siempre «1.0.0.0». La versión de
    // verdad viaja en las palabras clave.
    check('el campo de versión no sirve para nada', info.version === '1.0.0.0', info.version)
    check('la versión buena está en las palabras clave', info.keywords === 'g=1.0.12,n=40', info.keywords)
    check('y se saca de ahí', versionFromKeywords(info.keywords) === '1.0.12')
    check('sin palabras clave no se inventa una', versionFromKeywords(undefined) === undefined)

    // El nombre del mundo NO viaja en la consulta: `map` repite el del servidor.
    check('el mundo no sale en la consulta', info.map === info.name, info.map)

    const jugadores = parsePlayers(
      Buffer.from(grabacion['2457']!.players.log.find((e) => e.dir === 'in')!.hex, 'hex').subarray(4)
    )
    check('la lista de jugadores llega vacía', jugadores.length === 0)
  })

  await section('Valheim: diagnóstico de un cierre inesperado', async () => {
    const puerto = diagnoseExit(1, ['Failed to bind to port 2456'])
    check('reconoce el puerto ocupado', puerto.code === 'port-in-use')
    check('propone cambiar de puerto', puerto.action?.kind === 'change-port')

    const vcredist = diagnoseExit(1, ['You need VC++ Redistributables. https://learn.microsoft.com'])
    check('reconoce que falta Visual C++', vcredist.code === 'missing-vcredist')
    check('y dice que se puede seguir sin crossplay', vcredist.detail.includes('crossplay'))

    const memoria = diagnoseExit(null, ['Failed to allocate memory'])
    check('reconoce quedarse sin memoria', memoria.code === 'out-of-memory')

    const raro = diagnoseExit(9, ['nada que ver'])
    check('lo que no entiende no se lo inventa', raro.code === 'unknown-exit')
  })

  // --- Parada -----------------------------------------------------------------

  await section('Valheim: parada limpia', async () => {
    const strategy = valheimAdapter.stop(manifestoDePrueba())
    // ⚠ Ctrl+C no llega nunca (fase 1): el proceso hereda la orden de ignorarlo.
    check('para con Ctrl+Break', strategy.kind === 'ctrl-break')
    check('con plazo de gracia largo', (strategy.graceMs ?? 0) >= 60_000)
    check(
      'y reintentando, porque la señal se ignora mientras genera el mundo',
      'retryEveryMs' in strategy && (strategy.retryEveryMs ?? 0) > 0
    )
  })

  // --- Creación ---------------------------------------------------------------

  await section('Valheim: lo que el asistente no deja crear', async () => {
    const peticion = (options: Partial<ValheimCreateRequest['options']>): ValheimCreateRequest => ({
      game: 'valheim',
      name: 'Mi Valheim',
      port: 2456,
      agreements: ['steam-subscriber'],
      options: { password: 'qubiq123', worldName: 'Prueba', preset: 'normal', ...options }
    })

    const ok = await valheimAdapter.prepareCreate(peticion({}), 'Mi Valheim')
    check('un servidor normal se crea', ok.worldName === 'Prueba')
    check('sin mundo, se llama como el servidor',
      (await valheimAdapter.prepareCreate(peticion({ worldName: '' }), 'Mi Valheim')).worldName ===
        'Mi Valheim'
    )

    // Un nombre de mundo raro hace que el servidor arranque y NO guarde: es el
    // peor fallo posible, porque no se nota hasta perder la partida.
    let rechazado = false
    try {
      await valheimAdapter.prepareCreate(peticion({ worldName: 'mundo/../otro' }), 'Mi Valheim')
    } catch {
      rechazado = true
    }
    check('rechaza un nombre de mundo con caracteres de ruta', rechazado)

    rechazado = false
    try {
      await valheimAdapter.prepareCreate(peticion({ password: 'Valheim' }), 'Mi Valheim')
    } catch {
      rechazado = true
    }
    check('rechaza la contraseña metida en el nombre del servidor', rechazado)

    check('la longitud mínima de contraseña es la que dice el juego', MIN_PASSWORD_LENGTH === 5)
    check('acepta un nombre de mundo con acentos', validWorldName('Montaña Helada'))
    check('y rechaza uno vacío', !validWorldName(''))
  })

  // --- Moderación -------------------------------------------------------------

  await section('Valheim: listas de moderación', async () => {
    const real = [
      '// List admin players ID  ONE per line',
      '76561198000000001',
      '76561198000000002 // Marta',
      ''
    ].join('\r\n')

    const entries = parseList(real)
    check('lee los identificadores', entries.length === 2)
    check('se salta los comentarios del propio juego', entries[0]?.id === '76561198000000001')
    check('conserva la nota de quién es', entries[1]?.note === 'Marta')

    const escrito = formatList('admin', entries)
    check('vuelve a escribir un identificador por línea', escrito.includes('76561198000000001\r\n'))
    check('conservando la nota', escrito.includes('76561198000000002 // Marta'))
    check('e ida y vuelta da lo mismo', parseList(escrito).length === 2)

    check('acepta un SteamID', validPlayerId('76561198000000001'))
    // Poner el nombre del personaje es el error natural, y el servidor lo
    // ignoraría en silencio: mejor decirlo al escribirlo.
    check('rechaza un nombre de personaje con espacios', !validPlayerId('Marta la Roja'))
  })

  // --- Catálogo compartido ----------------------------------------------------

  await section('Valheim: puertos y capacidades', async () => {
    const manifest = manifestoDePrueba()
    const ports = serverPorts(manifest)

    check('dos puertos, no uno', ports.length === 2)
    check('los dos UDP', ports.every((p) => p.protocol === 'udp'))
    check('el de consulta es el siguiente al de juego', ports[1]?.port === queryPortFor(2456))
    check('y eso es lo que dice el catálogo', queryPortFor(2456) === 2457)

    const capabilities = capabilitiesFor(manifest)
    check('no ofrece consola de órdenes', !capabilities.commands)
    // Dice QUIÉN está dentro, pero con el identificador de Steam: se puede
    // listar y moderar, y lo que hay que explicar es qué es ese número.
    check('sí dice quién está dentro', capabilities.playerIds)
    check('pero no con nombres', !capabilities.playerNames)
    check('y sí deja moderar', capabilities.moderation)
    check('explicando qué es ese identificador', gameInfo('valheim').moderationHint !== undefined)
    check('sí ofrece crossplay', capabilities.crossplay)
    check('sí ofrece ajustes', capabilities.settings)
    check('sí se puede comprobar desde internet', capabilities.externalCheck)

    // Y ningún otro juego lo ofrece: el selector de exposición lo filtra por ahí.
    check(
      'el crossplay es solo de Valheim',
      !capabilitiesFor({ ...manifestoDePrueba(), game: 'minecraft' } as never).crossplay
    )

    const info = gameInfo('valheim')
    check('explica cómo se entra, paso a paso', (info.joinSteps?.length ?? 0) >= 3)
    // Con crossplay no hay dirección que pegar: los pasos son otros, y enseñar
    // los de la dirección mandaría al usuario por donde no es.
    check('y con crossplay, unos pasos distintos', (info.joinStepsCrossplay?.length ?? 0) >= 3)
    check(
      'que hablan del código y no de la dirección',
      info.joinStepsCrossplay?.some((p) => p.includes('código')) === true &&
        info.joinStepsCrossplay?.every((p) => !p.includes('pega la dirección')) === true
    )
    check('dice cómo se modera, ya que no hay nombres', info.moderationHint !== undefined)
    check('habla de mundos, no de partidas', info.save === 'world')
    check('el identificador de Steam del juego es el suyo, no el del servidor',
      VALHEIM_GAME_APP_ID === 892970)
  })

  // --- Mods de Thunderstore -------------------------------------------------------

  await section('Valheim: mods de Thunderstore', async () => {
    // Dónde acaba cada fichero de un paquete. Las tres formas salen de mods
    // reales del catálogo (ANALISIS.md §19.23).
    const puesto = (entry: string): string => mods.placeInPackage('Autor-Mod', entry).dest

    check(
      'un .dll suelto va a la carpeta del mod',
      puesto('Advize_PlantEverything.dll') === 'BepInEx/plugins/Autor-Mod/Advize_PlantEverything.dll'
    )
    check(
      'lo que viene en plugins/ también, sin duplicar la carpeta',
      puesto('plugins/Jotunn.dll') === 'BepInEx/plugins/Autor-Mod/Jotunn.dll'
    )
    check(
      'un BepInEx/ entero se respeta tal cual',
      puesto('BepInEx/patchers/Cosa/x.dll') === 'BepInEx/patchers/Cosa/x.dll'
    )
    // ⚠ La configuración va SUELTA: cada mod la busca por su nombre de fichero,
    // y metida en una subcarpeta arrancaría con los valores de fábrica sin
    // decir nada.
    check(
      'la configuración va suelta en BepInEx/config',
      puesto('config/advize.PlantEverything.cfg') === 'BepInEx/config/advize.PlantEverything.cfg'
    )
    check(
      'y se apunta el fichero, no la carpeta compartida',
      mods.placeInPackage('Autor-Mod', 'config/x.cfg').owns === 'BepInEx/config/x.cfg'
    )
    check(
      'de un .dll suelto, lo suyo es su carpeta',
      mods.placeInPackage('Autor-Mod', 'x.dll').owns === 'BepInEx/plugins/Autor-Mod'
    )

    // Los identificadores de Thunderstore y sus dependencias con versión clavada.
    check('parte «Autor-Mod» por el primer guion', mods.splitId('Advize-PlantEverything').name === 'PlantEverything')
    const dep = mods.splitDependency('denikson-BepInExPack_Valheim-5.4.2350')
    check('separa la versión de la dependencia', dep?.version === '5.4.2350', dep?.version ?? '')
    check('y deja el resto como identificador', dep?.id === 'denikson-BepInExPack_Valheim', dep?.id ?? '')
    // Los nombres llevan guiones: partir por el último rompería el nombre.
    const conGuiones = mods.splitDependency('Azumatt-AzuAntiDrift-1.2.3')
    check('un nombre con guiones no se parte mal', conGuiones?.id === 'Azumatt-AzuAntiDrift', conGuiones?.id ?? '')
    check('lo que no lleva versión no es una dependencia', mods.splitDependency('Autor-Mod') === null)

    check('1.21.2 es posterior a 1.3.0', mods.compareVersions('1.21.2', '1.3.0') > 0)

    // Lo que BepInEx deja en su registro, del servidor real.
    const leido = mods.parseLoaderLog(await readFile(join(FIXTURES, 'bepinex-log.txt'), 'utf8'))
    check(
      'el registro del cargador dice qué mods cargó',
      leido.loaded.length === 1,
      leido.loaded.join(', ')
    )
    check('con su versión', leido.loaded[0] === 'PlantEverything 1.21.2')
    // ⚠ Ese fichero recoge también el registro del juego, y un servidor sin
    // pantalla escribe de serie errores de vídeo y de shaders. Darlos por
    // problemas de mods sería alarmar por lo que siempre ha estado ahí.
    check(
      'y no confunde los errores del juego con problemas de mods',
      leido.problems.length === 0,
      leido.problems.join(' · ')
    )
    const conFallo = mods.parseLoaderLog('[Error  :PlantEverything] no encuentro su configuración')
    check(
      'un fallo de un mod sí se cuenta, y con quién se queja',
      conFallo.problems[0] === 'PlantEverything: no encuentro su configuración',
      conFallo.problems[0]
    )

    // ⚠ Y NO lo dice por la consola: la línea del chainloader no llega por la
    // tubería del proceso (comprobado). Lo que sí llega es su presentación.
    const presentacion = parseLine('[Message:   BepInEx] BepInEx 5.4.23.5 - valheim_server (15/09/2026 17:01:18)')
    check(
      'la consola anuncia el cargador',
      presentacion.text === 'Cargador de mods BepInEx 5.4.23.5 en marcha.',
      presentacion.text
    )

    check('y ahora el juego declara que tiene mods', capabilitiesFor(manifestoDePrueba()).content)
  })

  // Contrato con Thunderstore: si su API cambia, esto lo dice.
  await section('Valheim: la API de Thunderstore sigue contestando lo mismo', async () => {
    const resultados = await mods.searchMods('plant everything', 10)
    check('el buscador devuelve algo', resultados.length > 0, `${resultados.length} resultados`)
    // ⚠ Esta es LA comprobación que importa: el parámetro de búsqueda es `q=`, y
    // con `search=` la API contesta 200 devolviendo el catálogo entero. Si un
    // día dejara de filtrar, el usuario vería siempre los mismos mods.
    check(
      'y filtra de verdad por lo que se busca',
      resultados.some((m) => /plant/i.test(m.name)),
      resultados.slice(0, 3).map((m) => m.id).join(', ')
    )
    check('con autor y descargas', resultados.every((m) => m.author.length > 0 && m.downloads >= 0))

    // El cargador tiene que seguir publicándose: sin BepInEx no hay mods.
    const bepinex = await mods.latestVersion(mods.LOADER_ID)
    check('BepInEx sigue en el catálogo', bepinex.latest.version_number.length > 0, bepinex.latest.version_number)
    check(
      'y con enlace de descarga',
      bepinex.latest.download_url.startsWith('https://thunderstore.io/package/download/')
    )

    // Y las dependencias siguen viniendo con la versión pegada al nombre.
    const mod = await mods.latestVersion('Advize-PlantEverything')
    const dependencias = mod.latest.dependencies.map((d) => mods.splitDependency(d))
    check('las dependencias traen versión clavada', dependencias.every((d) => d !== null))
    check(
      'y una de ellas es el cargador',
      dependencias.some((d) => d?.id.includes('BepInExPack')),
      mod.latest.dependencies.join(', ')
    )
  })
}
