import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { check, section } from './harness'
import {
  clampMemory,
  diagnoseExit,
  launchArgs,
  managedSettings,
  parseLine,
  parsePlayers,
  applyPreset,
  sandboxPathFor,
  presetPathFor,
  versionFromKeywords,
  zomboidPaths
} from '../../src/main/core/games/zomboid/adapter'
import { normalizeRole, oneWord, plainName } from '../../src/main/core/games/zomboid/service'
import { bestVersion, parseModInfo, problemWith } from '../../src/main/core/games/zomboid/mods'
import { interpretWorkshop } from '../../src/main/core/tools/steamcmdOutput'
import { parseEditable } from '../../src/main/core/formats/editable'
import { luaInternals } from '../../src/main/core/formats/editable/lua'
import { capabilitiesFor, gameInfo, serverPorts, summaryLabel, versionLabel } from '../../src/shared/games'
import {
  BASE_MAP,
  BASIC_SANDBOX,
  DEFAULT_GAME_PORT,
  DEFAULT_RCON_PORT,
  MAX_PLAYERS,
  PRESETS,
  SERVER_NAME,
  ZOMBOID_WORKSHOP_APP_ID,
  mapSetting,
  modsSetting,
  presetInfo,
  udpPortFor,
  workshopIdFrom,
  type ZomboidMod,
  type ZomboidModEntry
} from '../../src/shared/games/zomboid/types'
import type { ZomboidManifest } from '../../src/shared/types'

/**
 * Prueba de humo de Project Zomboid (fase 5).
 *
 * Todo lo que se comprueba aquí va contra ficheros **reales del servidor**
 * (Build 42.20): su `servertest.ini`, su `servertest_SandboxVars.lua` y su
 * registro, grabados con el prototipo `pz-fase5.mjs`. El protocolo (RCON y A2S)
 * ya se prueba en `steam.ts` con las grabaciones de la fase 1.
 *
 * Lo único sintético son las líneas de entrada y salida de jugadores, que van
 * marcadas como tales en `sinteticas.txt` y no deciden nada: quién está dentro
 * se le pregunta al servidor por RCON.
 */

const FIXTURES = join(process.cwd(), 'scripts', 'smoke', 'fixtures', 'zomboid')

async function fixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), 'utf8')
}

async function lineas(name: string): Promise<string[]> {
  return (await fixture(name))
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !l.startsWith('//'))
}

function manifestoDePrueba(overrides: Partial<ZomboidManifest> = {}): ZomboidManifest {
  return {
    schemaVersion: 2,
    id: 'prueba',
    name: 'Servidor de prueba',
    game: 'zomboid',
    port: DEFAULT_GAME_PORT,
    autoRestart: false,
    backup: { enabled: false, intervalHours: 6, keep: 3 },
    createdAt: new Date().toISOString(),
    agreements: ['steam-subscriber'],
    data: {
      adminPassword: 'qubiq123',
      password: 'entrada',
      description: 'Un servidor de prueba',
      maxPlayers: 8,
      pvp: false,
      openToNewPlayers: true,
      preset: 'apocalypse',
      sandbox: {},
      memoryMb: 4096,
      useSteam: false,
      rconPort: DEFAULT_RCON_PORT,
      rconPassword: 'secreta'
    },
    ...overrides
  } as ZomboidManifest
}

export async function zomboidSmoke(): Promise<void> {
  // --- Arranque ----------------------------------------------------------------

  await section('Zomboid: línea de órdenes', async () => {
    const args = launchArgs(manifestoDePrueba())
    const texto = args.join(' ')
    const valor = (flag: string): string | undefined => args[args.indexOf(flag) + 1]

    // ⚠ Las dos comprobaciones más importantes del fichero: sin ellas el
    // servidor escribe en %USERPROFILE%\Zomboid, que es donde el usuario tiene
    // sus partidas de un jugador.
    check(
      'aísla la carpeta del usuario con -Duser.home',
      args.some((a) => a.startsWith('-Duser.home=') && a.includes('prueba'))
    )
    check(
      'y la caché con -cachedir',
      args.some((a) => a.startsWith('-cachedir=') && a.includes('prueba'))
    )

    check('arranca sin Steam por defecto', texto.includes('-Dzomboid.steam=0'))
    check(
      'con Steam solo si se pide',
      launchArgs(
        manifestoDePrueba({
          data: { ...manifestoDePrueba().data, useSteam: true }
        } as Partial<ZomboidManifest>)
      )
        .join(' ')
        .includes('-Dzomboid.steam=1')
    )

    // Sin esto el primer arranque se queda esperando en la consola a que
    // alguien escriba la contraseña del administrador.
    check('pasa la contraseña de administrador', valor('-adminpassword') === 'qubiq123')
    check('usa el nombre de partida de siempre', valor('-servername') === SERVER_NAME)
    check('sin ventana', texto.includes('-Djava.awt.headless=true'))
    check('memoria elegida en -Xmx', args.includes('-Xmx4096m'))
    check('el montón inicial es la mitad, no todo', args.includes('-Xms2048m'))
    check('clase del servidor', args.includes('zombie.network.GameServer'))

    check('memoria por debajo del mínimo: se sube', clampMemory(100) === 2048, String(clampMemory(100)))
    check('memoria disparatada: se corta', clampMemory(999999) === 16384)
    check('memoria rota: la de por defecto', clampMemory(Number.NaN) === 4096)
  })

  // --- Claves del .ini que lleva la app ----------------------------------------

  await section('Zomboid: ajustes que gestiona la app', async () => {
    const settings = managedSettings(manifestoDePrueba())

    check('puerto de juego', settings.DefaultPort === String(DEFAULT_GAME_PORT))
    check('el segundo puerto es el siguiente', settings.UDPPort === String(udpPortFor(DEFAULT_GAME_PORT)))
    check('nombre del servidor', settings.PublicName === 'Servidor de prueba')

    // La app no publica el servidor por su cuenta: eso saca la dirección del
    // usuario hacia fuera y se pregunta antes.
    check('no lo publica en el navegador del juego', settings.Public === 'false')

    // El propio servidor avisa: «If the server hangs here, set UPnP=false».
    check('UPnP apagado, que puede colgar el arranque', settings.UPnP === 'false')

    // Sin contraseña de RCON el servidor NI ABRE el puerto (comprobado).
    check('pone contraseña de RCON', settings.RCONPassword === 'secreta')
    check('y su puerto', settings.RCONPort === String(DEFAULT_RCON_PORT))

    check('pasa la contraseña de entrada', settings.Password === 'entrada')
    check('pasa el límite de jugadores', settings.MaxPlayers === '8')
    check('PvP tal como se eligió', settings.PVP === 'false')

    const tope = managedSettings(
      manifestoDePrueba({
        data: { ...manifestoDePrueba().data, maxPlayers: 900 }
      } as Partial<ZomboidManifest>)
    )
    check('un límite imposible se corta', tope.MaxPlayers === String(MAX_PLAYERS), tope.MaxPlayers)
  })

  // --- Registro ------------------------------------------------------------------

  await section('Zomboid: registro real del servidor', async () => {
    const registro = await lineas('registro.txt')
    const eventos = registro.map(parseLine)

    check('hay registro que leer', registro.length > 20, `${registro.length} líneas`)

    const listos = eventos.filter((e) => e.ready)
    check('reconoce «listo» una sola vez', listos.length === 1, `${listos.length}`)
    check(
      'y lo dice en cristiano',
      listos[0]?.text === 'Mundo cargado. El servidor ya acepta jugadores.'
    )

    // La marca de nivel y los contadores internos no le dicen nada a nadie.
    check(
      'quita el prefijo del servidor',
      eventos.every((e) => !/^LOG\s*:|^WARN\s*:|f:0 st:/.test(e.text))
    )

    const ruido = registro.filter((l) => /Could not find icon|duplicate texture/.test(l))
    check(
      'esconde el ruido del motor',
      ruido.length > 0 && ruido.map(parseLine).every((e) => e.hidden === true),
      `${ruido.length} líneas de ruido`
    )

    const visibles = eventos.filter((e) => !e.hidden)
    check('deja una consola legible', visibles.length < registro.length / 2, `${visibles.length} de ${registro.length}`)

    const version = eventos.find((e) => /Project Zomboid 42/.test(e.text))
    check('saca la versión del juego', version !== undefined, version?.text)

    const guardado = eventos.filter((e) => e.text === zomboidPaths.savedText)
    check('sabe cuándo ha terminado de guardar', guardado.length > 0)

    // Un mod que no carga deja SOLO esta línea y el servidor sigue arrancando
    // como si nada: si se esconde, nadie se entera de que falta medio juego.
    const perdido = parseLine(
      'WARN : Mod          f:0 st:6.267.714 at ZomboidFileSystem.loadModAndRequired> required mod "UnMod" not found'
    )
    check('un mod que no carga se ve en la consola', perdido.hidden !== true)
    check('y se dice qué mod es', perdido.text.includes('UnMod'), perdido.text)
    check('como aviso, no como error', perdido.level === 'warn')

    const cargado = parseLine('LOG  : Mod          f:0 st:6.518.486> loading GetInTheDamnCar')
    check('y el que sí carga también', cargado.hidden !== true && cargado.text.includes('GetInTheDamnCar'), cargado.text)
    check(
      'lo de quién pisa a quién se guarda, pero no se enseña',
      parseLine('LOG  : Mod  f:0 st:1> mod "A" overrides media/lua/x.lua').hidden === true
    )
    // ⚠ El servidor escribe «LOADING ASSETS: START», que no es ningún mod: sin
    // afinar el patrón, la consola decía «Mod cargado: ASSETS: START».
    const assets = parseLine('LOG  : General      f:0 st:1> LOADING ASSETS: START')
    check('«LOADING ASSETS» no se confunde con un mod', !assets.text.startsWith('Mod cargado'), assets.text)
  })

  await section('Zomboid: entradas y salidas (líneas sintéticas)', async () => {
    const [intento, conectado, dentro, salida] = (await lineas('sinteticas.txt')).map(parseLine)

    // ⚠ Lo más importante: la línea del intento de conexión trae la IP de quien
    // entra. Una consola que se enseña y se copia no es sitio para eso.
    check('el intento de conexión no enseña la dirección de nadie', intento?.hidden === true)
    check('y la dirección no está ni en el texto', !/88\.12\.34\.56/.test(intento?.text ?? ''))

    check('quién entra', conectado?.playerJoined === 'Fulano', conectado?.playerJoined)
    check('y cuando termina de entrar', dentro?.playerJoined === 'Fulano', dentro?.playerJoined)
    check('quién sale', salida?.playerLeft === 'Fulano', salida?.playerLeft)
  })

  await section('Zomboid: quién está dentro, por RCON', async () => {
    // Esta respuesta es la grabada contra el servidor real.
    const vacio = parsePlayers('Players connected (0): \n')
    check('sin nadie dentro', vacio.playerCount === 0 && vacio.players?.length === 0)

    const dos = parsePlayers('Players connected (2): \n-Fulano\n-Mengano\n')
    check('cuenta bien', dos.playerCount === 2, String(dos.playerCount))
    check('y da los nombres sin el guion', dos.players?.join(',') === 'Fulano,Mengano', dos.players?.join(','))
  })

  await section('Zomboid: diagnóstico de cierres', async () => {
    const puerto = diagnoseExit(1, ['java.net.BindException: Address already in use'])
    check('puerto ocupado', puerto.code === 'port-in-use' && puerto.action?.kind === 'change-port')

    const memoria = diagnoseExit(1, ['java.lang.OutOfMemoryError: Java heap space'])
    check('sin memoria', memoria.code === 'out-of-memory' && memoria.action?.kind === 'set-memory')

    check('cierre normal', diagnoseExit(0, ['Shutdown handling finished']).code === 'clean-exit')
    check('lo que no se sabe, se dice', diagnoseExit(3, ['nada']).code === 'unknown-exit')
  })

  // --- servertest.ini ------------------------------------------------------------

  await section('Zomboid: editor del servertest.ini real', async () => {
    const raw = await fixture('servertest.ini')
    const doc = parseEditable('properties', raw)
    const opciones = doc.config.options

    check('lee todas sus claves', opciones.length > 120, `${opciones.length} claves`)
    check(
      'con la explicación que escribe el servidor',
      (opciones.find((o) => o.path[0] === 'PVP')?.description ?? '').includes('herir')
    )
    check(
      'y con el tipo bueno',
      opciones.find((o) => o.path[0] === 'MaxPlayers')?.type === 'integer' &&
        opciones.find((o) => o.path[0] === 'PVP')?.type === 'boolean'
    )

    check('leer y escribir sin tocar nada deja el mismo fichero', doc.serialize() === raw)

    const otro = parseEditable('properties', raw)
    otro.apply([{ path: ['MaxPlayers'], value: 7 }])
    const despues = otro.serialize()
    const antes = raw.split(/\r?\n/)
    const ahora = despues.split(/\r?\n/)
    const cambiadas = antes.filter((l, i) => l !== ahora[i])
    check('cambiar una clave cambia una sola línea', cambiadas.length === 1, cambiadas.join(' | '))
    check('y el comentario de al lado sigue ahí', despues.includes('Número máximo de jugadores'))
  })

  // --- SandboxVars.lua -----------------------------------------------------------

  await section('Zomboid: editor del SandboxVars.lua real', async () => {
    const raw = await fixture('SandboxVars.lua')
    const doc = parseEditable('lua', raw)
    const opciones = doc.config.options

    check('lee las reglas de la partida', opciones.length > 250, `${opciones.length} opciones`)
    check(
      'todas se pueden editar',
      opciones.every((o) => o.editable),
      `${opciones.filter((o) => !o.editable).length} sin editar`
    )
    check(
      'entiende las tablas de dentro',
      doc.config.sections.some((s) => s.path.join('.') === 'ZombieLore'),
      doc.config.sections.map((s) => s.path.join('.')).join(', ')
    )

    const zombies = opciones.find((o) => o.path.join('.') === 'Zombies')
    check('saca los valores con su nombre', zombies?.allowedLabels?.['4'] === 'Normal', JSON.stringify(zombies?.allowedLabels))
    check('y cuál es el de por defecto, como número', zombies?.defaultValue === '4', zombies?.defaultValue)

    // El servidor escribe los números en el idioma del juego: «Mínimo=0,00».
    const xp = opciones.find((o) => o.path.join('.') === 'MultiplierConfig.Global')
    check('lee los límites con coma decimal', xp?.min === 0 && xp?.max === 1000, `${xp?.min}–${xp?.max}`)
    check('y el valor por defecto decimal', xp?.defaultValue === '1.0', xp?.defaultValue)

    check('leer y escribir sin tocar nada deja el mismo fichero', doc.serialize() === raw)

    const otro = parseEditable('lua', raw)
    otro.apply([
      { path: ['Zombies'], value: 2 },
      { path: ['ZombieLore', 'Speed'], value: 1 }
    ])
    const despues = otro.serialize()
    const antes = raw.split(/\r?\n/)
    const ahora = despues.split(/\r?\n/)
    const cambiadas = antes.map((l, i) => (l === ahora[i] ? null : i)).filter((i) => i !== null)
    check('dos cambios, dos líneas', cambiadas.length === 2, cambiadas.join(', '))
    check(
      'no se pierde un solo comentario',
      (raw.match(/^\s*--/gm) ?? []).length === (despues.match(/^\s*--/gm) ?? []).length,
      `${(despues.match(/^\s*--/gm) ?? []).length}`
    )
    check('la sangría se respeta', /^        Speed = 1,$/m.test(despues) || /^\s+Speed = 1,$/m.test(despues))

    // Escribir el mismo valor no debe reescribir nada: cambiaría cómo estaba
    // escrito sin que nadie lo haya pedido.
    const igual = parseEditable('lua', raw)
    igual.apply([{ path: ['Zombies'], value: Number(zombies!.value) }])
    check('escribir lo mismo no toca el fichero', igual.serialize() === raw)

    // El juego escribe comillas con barras invertidas en su traducción: tal cual
    // parecen un fallo de la app.
    const conBarras = opciones.find((o) => (o.description ?? '').includes('Multiplicador de Población'))
    check(
      'las barras del juego se enseñan como comillas',
      conBarras !== undefined && !conBarras.description!.includes(String.fromCharCode(92)),
      conBarras?.description
    )

    const meta = luaInternals.extractZomboidMeta('Lo que sea. Mínimo=1 Máximo=10 Por defecto=5')
    check(
      'la explicación se queda sin los metadatos',
      meta.description === 'Lo que sea.' && meta.min === 1 && meta.max === 10 && meta.defaultValue === '5',
      JSON.stringify(meta)
    )
  })

  // --- Preajustes de dificultad --------------------------------------------------

  await section('Zomboid: aplicar un preajuste de dificultad', async () => {
    // Se monta una instancia de mentira con el SandboxVars real y un preset
    // recortado, para comprobar lo que de verdad importa: que los valores del
    // preset se escriban SOBRE el fichero comentado, no encima de él.
    const id = 'preset-de-prueba'
    await mkdir(join(zomboidPaths.serverFilesDir(id)), { recursive: true })
    await mkdir(join(zomboidPaths.gameDir(id), 'media', 'lua', 'shared', 'Sandbox'), {
      recursive: true
    })
    const raw = await fixture('SandboxVars.lua')
    await writeFile(sandboxPathFor(id), raw, 'utf8')
    await writeFile(
      presetPathFor(id, 'Prueba.lua'),
      'return {\n    VERSION = 6,\n    Zombies = 1,\n    DayLength = 6,\n    ZombieLore = {\n        Speed = 1,\n    },\n}\n',
      'utf8'
    )

    const cambios = await applyPreset(id, 'Prueba.lua')
    check('aplica lo que trae el preset', cambios === 3, `${cambios} opciones`)

    const despues = await readFile(sandboxPathFor(id), 'utf8')
    const doc = parseEditable('lua', despues)
    const valor = (path: string): string | undefined =>
      doc.config.options.find((o) => o.path.join('.') === path)?.value
    check('cambia los valores del preset', valor('Zombies') === '1' && valor('DayLength') === '6')
    check('también dentro de las tablas', valor('ZombieLore.Speed') === '1', valor('ZombieLore.Speed'))
    check(
      'lo que el preset no dice se queda como estaba',
      valor('StartMonth') === parseEditable('lua', raw).config.options.find((o) => o.path.join('.') === 'StartMonth')?.value
    )
    check(
      'y los comentarios siguen enteros',
      (despues.match(/^\s*--/gm) ?? []).length === (raw.match(/^\s*--/gm) ?? []).length
    )

    // Los ajustes sueltos del asistente se aplican encima del preset.
    const conExtra = await applyPreset(id, 'Prueba.lua', { Zombies: 5 })
    check('los ajustes del asistente ganan al preset', conExtra > 0)
    check(
      'y se ve en el fichero',
      parseEditable('lua', await readFile(sandboxPathFor(id), 'utf8')).config.options.find(
        (o) => o.path.join('.') === 'Zombies'
      )?.value === '5'
    )
  })

  // --- Catálogo -------------------------------------------------------------------

  await section('Zomboid: lo que la app promete de este juego', async () => {
    const info = gameInfo('zomboid')
    check('tiene su ficha', info.name === 'Project Zomboid')
    check('avisa de que no es oficial', /no oficial/i.test(info.disclaimer))
    check('acepta el acuerdo de Steam', info.agreements[0]?.id === 'steam-subscriber')
    check('explica cómo se entra', (info.joinSteps?.length ?? 0) >= 3)
    check(
      'y avisa del fallo típico: la cuenta se la inventan ellos',
      /usuario y tu contraseña/i.test(info.joinWarning ?? '')
    )

    const manifest = manifestoDePrueba()
    const caps = capabilitiesFor(manifest)
    check('tiene consola, nombres y moderación', caps.commands && caps.playerNames && caps.moderation)
    check('y memoria configurable', caps.memory)
    // No hay nadie fuera que sepa hablar su protocolo sin publicar la IP.
    check('no promete comprobar desde internet', !caps.externalCheck)

    const puertos = serverPorts(manifest)
    check('sin Steam, un solo puerto UDP', puertos.length === 1 && puertos[0]!.protocol === 'udp')
    check('y es el del juego', puertos[0]!.port === DEFAULT_GAME_PORT)
    check(
      'la consola remota no se lista: es de la app',
      !puertos.some((p) => p.port === DEFAULT_RCON_PORT)
    )

    const conSteam = serverPorts(
      manifestoDePrueba({
        data: { ...manifestoDePrueba().data, useSteam: true }
      } as Partial<ZomboidManifest>)
    )
    check('con Steam, los dos que usa', conSteam.length === 2 && conSteam[1]!.port === udpPortFor(DEFAULT_GAME_PORT))

    check('la lista de servidores dice la dificultad', summaryLabel(manifest).includes('Apocalipsis'))
    check(
      'y la versión sale cuando se sabe',
      versionLabel(
        manifestoDePrueba({
          data: { ...manifestoDePrueba().data, gameVersion: '42.20.4' }
        } as Partial<ZomboidManifest>)
      ) === 'Project Zomboid 42.20.4'
    )

    // Los preajustes son los del juego: los cinco ficheros que trae más el de
    // serie. Si una actualización quitara uno, esto avisa.
    check('seis preajustes de dificultad', PRESETS.length === 6, `${PRESETS.length}`)
    check('el de serie no tiene fichero', presetInfo('survivor').file === null)
    check(
      'los demás apuntan a un fichero del juego',
      PRESETS.filter((p) => p.id !== 'survivor').every((p) => p.file?.endsWith('.lua'))
    )

    // Las pocas reglas del modo básico tienen que existir de verdad en el
    // fichero del juego: si el juego les cambia el nombre, aquí se ve.
    const sandbox = parseEditable('lua', await fixture('SandboxVars.lua')).config.options
    const perdidas = BASIC_SANDBOX.filter((b) => !sandbox.some((o) => o.path.join('.') === b.key))
    check('las reglas del modo básico existen en el juego', perdidas.length === 0, perdidas.map((p) => p.key).join(', '))

    // Y sus valores también: ofrecer un «3» que el juego no admite dejaría una
    // partida configurada a medias sin decir nada.
    const malos = BASIC_SANDBOX.flatMap((b) => {
      const option = sandbox.find((o) => o.path.join('.') === b.key)
      if (!option?.allowed) return []
      return b.options.filter((v) => !option.allowed!.includes(String(v.value))).map((v) => `${b.key}=${v.value}`)
    })
    check('y sus valores son de los que acepta', malos.length === 0, malos.join(', '))
  })

  // --- Protocolos sin Steam --------------------------------------------------------

  await section('Zomboid: sin Steam no contesta a las consultas', async () => {
    const grabacion = JSON.parse(
      await readFile(join(process.cwd(), 'scripts', 'smoke', 'fixtures', 'steam', 'zomboid-sinsteam.json'), 'utf8')
    ) as {
      rcon: { dir?: string; label?: string; hex?: string; error?: string }[]
      a2s: Record<string, { info: { timeout?: boolean }; players: { timeout?: boolean } }>
    }

    // Esto es lo que justifica que el «¿responde?» de este juego vaya por RCON
    // y no por A2S como en Valheim.
    const puertos = Object.entries(grabacion.a2s)
    check('se probaron varios puertos', puertos.length >= 2, puertos.map(([p]) => p).join(', '))
    check(
      'y ninguno contestó al A2S',
      puertos.every(([, v]) => v.info.timeout === true && v.players.timeout === true)
    )

    const respuestas = grabacion.rcon.filter((e) => e.dir === 'in').map((e) => decodeRcon(e.hex!))
    check('RCON sí contesta', respuestas.some((r) => /Players connected/.test(r)))
    check('y acepta órdenes en caliente', respuestas.some((r) => /is now/.test(r)), respuestas.find((r) => /is now/.test(r)))
    check('y sabe guardar', respuestas.some((r) => /World saved/.test(r)))

    check(
      'la versión sale de las palabras clave, no del campo version',
      versionFromKeywords('hidden;vanilla;pvp;VERSION:42.20') === '42.20'
    )
  })


  // --- Mods del taller ---------------------------------------------------------------

  await section('Zomboid: mods del taller de Steam', async () => {
    // El taller cuelga del JUEGO, no del servidor dedicado: pedirle los objetos
    // del 380870 no devuelve nada.
    check('el taller es el del juego, no el del servidor', ZOMBOID_WORKSHOP_APP_ID === 108600)

    // La gente copia el enlace de la barra del navegador, no el número.
    check(
      'saca el id de un enlace del taller',
      workshopIdFrom('https://steamcommunity.com/sharedfiles/filedetails/?id=3802614552') ===
        '3802614552'
    )
    check('y de uno con más parámetros', workshopIdFrom('https://x/?foo=1&id=123456&bar=2') === '123456')
    check('acepta el número suelto', workshopIdFrom('  3802614552  ') === '3802614552')
    check('y rechaza lo que no lo es', workshopIdFrom('el mod de los coches') === null)

    // --- mod.info real -----------------------------------------------------------
    const info = parseModInfo(await fixture('mod.info'))
    check('lee el id de carga, que es lo que va en Mods=', info.id === 'GetInTheDamnCar', info.id)
    check('y el nombre que se enseña', info.name === 'Get In The Damn Car!', info.name)
    check('y el autor', info.author === 'Diakøe', info.author)
    check('sin dependencias, ninguna', info.requires.length === 0)

    const conDependencias = parseModInfo('id=A\nrequire=B,C\nrequire=D\n')
    check(
      'junta los require repetidos y los separados por coma',
      conDependencias.requires.join(',') === 'B,C,D',
      conDependencias.requires.join(',')
    )

    // --- Carpeta de versión: el hallazgo de la fase ------------------------------
    // ⚠ La Build 42 EXIGE la carpeta de versión: un mod con todo en la raíz no
    // lo encuentra y solo dice «required mod not found» (comprobado).
    // Todo esto es lo que hizo el servidor 42.20.4 de verdad, no lo que parece
    // razonable: manda la serie mayor, y entre dos que valen cogió la más baja.
    check('un mod solo de la 41 NO sirve en la 42', bestVersion(['41'], '42.20.4') === null)
    check('y uno de la 43 tampoco', bestVersion(['43'], '42.20.4') === null)
    check('la 42 sirve', bestVersion(['42'], '42.20.4') === '42')
    check('la 42.20 también', bestVersion(['42.20'], '42.20.4') === '42.20')
    check('con 41 y 42, usa la 42', bestVersion(['41', '42'], '42.20.4') === '42')
    check('con 42 y 42.20, usa la 42', bestVersion(['42', '42.20'], '42.20.4') === '42')
    check('«common» vale siempre', bestVersion(['common'], '42.20.4') === 'common')
    check('sin carpetas de versión, ninguna vale', bestVersion([], '42.20.4') === null)
    check(
      'antes del primer arranque no se juzga',
      bestVersion(['41', '42.20'], undefined) !== null
    )

    // --- Lo que se le dice al servidor -------------------------------------------
    const mod = (id: string, extra: Partial<ZomboidMod> = {}): ZomboidMod => ({
      workshopId: 'w',
      id,
      name: id,
      folder: id,
      versions: ['42.20'],
      version: '42.20',
      maps: [],
      requires: [],
      sizeBytes: 0,
      ...extra
    })
    const entrada = (
      workshopId: string,
      enabled: boolean,
      mods: ZomboidMod[]
    ): ZomboidModEntry => ({
      ref: { workshopId, title: workshopId, folders: [], enabled, addedAt: '' },
      mods
    })

    const entries = [
      entrada('1', true, [mod('Primero')]),
      entrada('2', false, [mod('Apagado')]),
      entrada('3', true, [mod('Segundo'), mod('Tercero')])
    ]
    check('Mods= lleva los activos, en orden', modsSetting(entries) === 'Primero;Segundo;Tercero', modsSetting(entries))
    check('y no lleva los apagados', !modsSetting(entries).includes('Apagado'))
    check(
      'ni los que no sirven para esta versión',
      !modsSetting([entrada('4', true, [mod('Viejo', { version: null })])]).includes('Viejo')
    )

    // El orden de `Map=` no es cosmético: el último pone el terreno de base.
    const conMapas = [
      entrada('1', true, [mod('Bedford', { maps: ['Bedford Falls'] })]),
      entrada('2', true, [mod('Otro', { maps: ['Otro Mapa'] })])
    ]
    check(
      'Map= pone los mapas de los mods y el del juego AL FINAL',
      mapSetting(conMapas) === `Bedford Falls;Otro Mapa;${BASE_MAP}`,
      mapSetting(conMapas)
    )
    check('sin mods, solo el mapa del juego', mapSetting([]) === BASE_MAP)

    // --- Lo que se le dice al usuario --------------------------------------------
    check(
      'un mod sin descargar se dice',
      problemWith([], new Set())?.includes('descargado') === true
    )
    const soloB41 = problemWith([mod('Viejo', { version: null, versions: ['41'] })], new Set())
    check('un mod de la Build 41 se explica', soloB41?.includes('41') === true, soloB41)
    check('sin culpar al usuario de nada', soloB41?.includes('No sirve para esta versión') === true)
    const sinCarpeta = problemWith([mod('Raro', { version: null, versions: [] })], new Set())
    check('y uno sin carpeta de versión también', sinCarpeta?.includes('carpeta de versión') === true, sinCarpeta)
    const faltaOtro = problemWith([mod('A', { requires: ['B'] })], new Set(['A']))
    check('las dependencias que faltan se nombran', faltaOtro?.includes('B') === true, faltaOtro)
    check('y si está todo, no se dice nada', problemWith([mod('A')], new Set(['A'])) === undefined)
  })

  await section('Zomboid: descargas del taller (salidas reales)', async () => {
    const salidas = new Map<string, string>()
    for (const trozo of (
      await readFile(join(process.cwd(), 'scripts', 'smoke', 'fixtures', 'steam', 'zomboid-workshop.txt'), 'utf8')
    )
      .split(/^=== /m)
      .slice(1)) {
      const salto = trozo.indexOf('\n')
      salidas.set(trozo.slice(0, salto).trim(), trozo.slice(salto))
    }
    check('hay cuatro casos grabados', salidas.size === 4, [...salidas.keys()].join(', '))

    const bien = interpretWorkshop(salidas.get('bien')!, 0)
    check('reconoce la descarga buena', bien.ok)
    check('y de dónde sacarla', bien.path?.endsWith('108600\\3802614552') === true, bien.path)
    check('y cuánto ocupaba', bien.bytes === 70857, String(bien.bytes))

    // ⚠ Lo que hace falta comprobar: los dos fallos de abajo salieron con
    // código 0. Fiarse del código sería darlos por buenos.
    const noExiste = interpretWorkshop(salidas.get('no existe')!, 0)
    check('un id que no existe NO se da por bueno', !noExiste.ok)
    check('y se explica en cristiano', noExiste.error?.message.includes('enlace') === true, noExiste.error?.message)
    check('sin reintentar, que no va a cambiar', noExiste.error?.retryable === false)

    const otroJuego = interpretWorkshop(salidas.get('de otro juego')!, 0)
    check('un mod de otro juego tampoco', !otroJuego.ok)
    check('y se dice que es de otro juego', otroJuego.error?.message.includes('otro juego') === true)

    const conLetras = interpretWorkshop(salidas.get('id con letras')!, 10)
    check('un id con letras tampoco', !conLetras.ok)
    check('y se dice que no es un identificador', conLetras.error?.message.includes('identificador') === true)
  })

  // --- Moderación --------------------------------------------------------------------

  await section('Zomboid: cuentas y niveles de acceso', async () => {
    // Los niveles son los que el servidor define en su base de datos.
    check('el administrador', normalizeRole('admin') === 'admin')
    check('el vetado', normalizeRole('banned') === 'banned')
    // Un nivel que no conocemos no se inventa: se trata como jugador normal.
    check('uno desconocido no se inventa', normalizeRole('superjefe') === 'user')
    check('y sin nivel, jugador', normalizeRole(null) === 'user')

    // ⚠ Comprobado contra el servidor real: por RCON, las comillas rompen los
    // comandos («banuser "invitado"» contesta «This user can't be banned» y no
    // veta a nadie), y una razón de más de una palabra hace que conteste con la
    // ayuda del comando sin hacer nada.
    check('los nombres van sin comillas', plainName('"Fulano"') === 'Fulano')
    check('y sin espacios', plainName(' Fulano ') === 'Fulano')
    check('una razón de varias palabras se junta en una', oneWord('por trolear') === 'por-trolear')
    check('sin razón, nada', oneWord(undefined) === '' && oneWord('  ') === '')
  })
}

/** El cuerpo de los paquetes de una respuesta de RCON grabada. */
function decodeRcon(hex: string): string {
  const buffer = Buffer.from(hex, 'hex')
  let out = ''
  let off = 0
  while (off + 4 <= buffer.length) {
    const len = buffer.readInt32LE(off)
    out += buffer.subarray(off + 12, off + 4 + len - 2).toString('latin1')
    off += 4 + len
  }
  return out
}
