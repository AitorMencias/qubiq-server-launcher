import { createServer as createTcpServer } from 'node:net'
import { createServer, type Server } from 'node:https'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { check, section } from './harness'
import * as api from '../../src/main/core/games/satisfactory/api'
import {
  diagnoseExit,
  launchArgs,
  parseLine,
  satisfactoryAdapter
} from '../../src/main/core/games/satisfactory/adapter'
import * as mods from '../../src/main/core/games/satisfactory/mods'
import { capabilitiesFor, gameInfo, serverPorts } from '../../src/shared/games'
import { RELIABLE_PORT } from '../../src/shared/games/satisfactory/types'
import type { SatisfactoryManifest } from '../../src/shared/types'
import { dataRoot, setDataRoot } from '../../src/main/core/paths'

/**
 * Prueba de humo de Satisfactory (fase 2).
 *
 * Su API se prueba contra un servidor HTTPS de mentira que devuelve las
 * respuestas REALES grabadas contra el servidor de verdad
 * (`fixtures/satisfactory/api-grabada.json`) y que usa un certificado
 * autofirmado, igual que el auténtico. Si el juego cambia su API, se vuelve a
 * grabar y esta prueba dice qué se ha roto.
 *
 * Lo demás —los argumentos de arranque y la lectura del registro— se comprueba
 * contra lo observado en el servidor real (ANALISIS.md §19.15).
 */

const FIXTURES = join(process.cwd(), 'scripts', 'smoke', 'fixtures', 'satisfactory')

interface Grabada {
  status: number
  body: unknown
}

type Grabaciones = Record<string, Grabada>

/** Servidor de mentira que habla como el de Satisfactory. */
interface FakeServer {
  port: number
  close: () => Promise<void>
  /** Qué función se pidió en cada llamada, para comprobar lo que manda la app. */
  calls: { fn: string; data: unknown; token: string | null }[]
  /** Respuesta a devolver para la siguiente llamada a una función. */
  answers: Map<string, Grabada>
}

async function startFakeServer(grabadas: Grabaciones): Promise<FakeServer> {
  const pfx = await readFile(join(FIXTURES, 'api-autofirmado.pfx'))
  const calls: FakeServer['calls'] = []
  const answers = new Map<string, Grabada>()

  const server: Server = createServer({ pfx, passphrase: 'qubiq-smoke' }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        function: string
        data?: unknown
      }
      const auth = req.headers.authorization
      calls.push({
        fn: body.function,
        data: body.data,
        token: auth ? auth.replace(/^Bearer /, '') : null
      })

      const answer = answers.get(body.function) ?? grabadas[body.function]
      if (!answer) {
        res.writeHead(404).end()
        return
      }
      if (answer.body === null) {
        res.writeHead(answer.status).end()
        return
      }
      res.writeHead(answer.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(answer.body))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    port,
    calls,
    answers,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function manifestoDePrueba(port: number): SatisfactoryManifest {
  return {
    schemaVersion: 2,
    id: 'fabrica',
    name: 'Mi fábrica',
    game: 'satisfactory',
    expectedPlayers: 8,
    port,
    autoRestart: false,
    backup: { enabled: true, intervalHours: 6, keep: 10 },
    createdAt: new Date(0).toISOString(),
    agreements: ['steam-subscriber'],
    data: {
      adminPassword: 'qubiq123',
      clientPassword: 'amigos',
      sessionName: 'Aislada',
      maxPlayers: 8,
      claimed: true
    }
  }
}

export async function satisfactorySmoke(): Promise<void> {
  const grabadas = JSON.parse(await readFile(join(FIXTURES, 'api-grabada.json'), 'utf8')) as Grabaciones

  // --- La API contra las respuestas reales ------------------------------------

  await section('Satisfactory: API (respuestas reales grabadas)', async () => {
    const fake = await startFakeServer(grabadas)
    try {
      // El certificado es autofirmado: si la app no lo aceptara a propósito,
      // ninguna de estas llamadas llegaría a contestar.
      check('acepta el certificado autofirmado del servidor', await api.healthCheck(fake.port))

      const token = await api.login(fake.port, 'qubiq123')
      check('entra con la contraseña de administrador', token.length > 50)
      check(
        'manda la contraseña y el nivel de privilegio',
        JSON.stringify(fake.calls.at(-1)?.data).includes('Administrator')
      )

      const state = await api.queryState({ port: fake.port, token })
      check('lee el estado de la partida', state.sessionName === 'Aislada' && state.gameRunning)
      check('lee jugadores y límite', state.playersConnected === 0 && state.playerLimit === 8)
      check('manda el token en la cabecera', fake.calls.at(-1)?.token === token)

      const options = await api.getServerOptions({ port: fake.port, token })
      check(
        'lee los ajustes del servidor',
        options.options['FG.AutosaveInterval'] === '120.0' && Object.keys(options.pending).length === 0
      )

      const sessions = await api.enumerateSessions({ port: fake.port, token })
      check('agrupa los guardados por partida', sessions.sessions.length === 1)
      check('sabe cuál está cargada', sessions.currentSessionName === 'Aislada')
      check(
        'ordena los guardados, el más nuevo primero',
        sessions.sessions[0]?.saves[0]?.saveName === 'prueba-aislada'
      )
      check(
        'traduce la fecha del juego a ISO',
        sessions.sessions[0]?.saves[0]?.savedAt === '2026-09-16T12:41:49.000Z'
      )

      // 204 sin cuerpo: la app no debe intentar interpretarlo como JSON.
      await api.shutdown({ port: fake.port, token })
      check('el apagado sin cuerpo no rompe', fake.calls.at(-1)?.fn === 'Shutdown')

      // Sesiones vacías: un servidor recién reclamado todavía no tiene partida.
      fake.answers.set('EnumerateSessions', grabadas['EnumerateSessionsVacio']!)
      const vacias = await api.enumerateSessions({ port: fake.port, token })
      check(
        'servidor sin partidas: ninguna cargada',
        vacias.sessions.length === 0 && vacias.currentSessionName === null
      )
    } finally {
      await fake.close()
    }
  })

  await section('Satisfactory: errores de la API', async () => {
    const fake = await startFakeServer(grabadas)
    try {
      // ⚠ El servidor devuelve errores con código 200: lo que manda es
      // `errorCode`, no el estado HTTP.
      fake.answers.set('PasswordlessLogin', grabadas['PasswordlessLoginReclamado']!)
      let error: unknown = null
      try {
        await api.claimServer(fake.port, 'Mi fábrica', 'qubiq123')
      } catch (err) {
        error = err
      }
      check(
        'un error con HTTP 200 se detecta igual',
        error instanceof api.SatisfactoryApiError &&
          error.code === 'passwordless_login_not_possible'
      )
      check(
        'el error se traduce a algo que se entiende',
        error instanceof api.SatisfactoryApiError && error.message.includes('ya está reclamado')
      )

      fake.answers.set('QueryServerState', grabadas['QueryServerStateSinToken']!)
      let sinPermisos: unknown = null
      try {
        await api.queryState({ port: fake.port, token: 'no-vale' })
      } catch (err) {
        sinPermisos = err
      }
      check(
        'sin permisos se explica en castellano',
        sinPermisos instanceof api.SatisfactoryApiError &&
          sinPermisos.message.includes('permisos suficientes')
      )

      // Mensaje sin traducir: vale más el original que un «error desconocido».
      fake.answers.set('CreateNewGame', grabadas['CreateNewGameSinMapa']!)
      let sinMapa: unknown = null
      try {
        await api.createNewGame({ port: fake.port, token: 'x' }, { sessionName: 'Prueba' })
      } catch (err) {
        sinMapa = err
      }
      check(
        'un error sin traducción conserva el mensaje del juego',
        sinMapa instanceof api.SatisfactoryApiError && sinMapa.message.includes('MapName')
      )
    } finally {
      await fake.close()
    }

    // Servidor parado: HealthCheck dice que no, sin lanzar.
    check('servidor apagado: no está sano', (await api.healthCheck(1, 300)) === false)
  })

  await section('Satisfactory: crear partida manda lo que el juego exige', async () => {
    const fake = await startFakeServer(grabadas)
    try {
      await api.createNewGame({ port: fake.port, token: 'x' }, { sessionName: 'Nueva' })
      const data = JSON.stringify(fake.calls.at(-1)?.data)
      // Sin MapName el servidor real responde `missing_params` (grabado).
      check('incluye el mapa obligatorio', data.includes('GrassFields'))
      check('incluye el nombre de la partida', data.includes('Nueva'))
    } finally {
      await fake.close()
    }
  })

  // --- Arranque: lo que protege los datos del usuario -------------------------

  await section('Satisfactory: argumentos de arranque', async () => {
    // Una raíz fija para comprobar las rutas de los argumentos, que se devuelve
    // al terminar: antes se quedaba puesta y las secciones de después escribían
    // de verdad en C:\datos en vez de en el temporal de la prueba.
    const previousRoot = dataRoot()
    setDataRoot('C:\\datos')
    try {
      satisfactoryLaunchChecks()
    } finally {
      setDataRoot(previousRoot)
    }
  })

  function satisfactoryLaunchChecks(): void {
    const manifest = manifestoDePrueba(7777)
    const args = launchArgs(manifest)

    check('le dice qué proyecto es', args[0] === 'FactoryGame')
    check('pasa el puerto elegido', args.includes('-Port=7777'))

    // ⚠ Estos dos van juntos o el servidor escribe las partidas en
    // %LOCALAPPDATA%\FactoryGame, que es la carpeta del JUEGO DEL USUARIO.
    // Comprobado en la fase 2: con `-UserDir` solo, los guardados se van igual.
    check(
      'lleva su carpeta de datos dentro de la instancia',
      args.some((a) => a.startsWith('-UserDir=') && a.includes('fabrica'))
    )
    check(
      'y también los guardados (si no, escribiría en la carpeta del juego del usuario)',
      args.includes('-SavesUseProjectSavedDir')
    )

    check(
      'sube el límite de jugadores por variable de consola',
      args.includes('-ini:Engine:[SystemSettings]:net.MaxPlayersOverride=8')
    )

    const stop = satisfactoryAdapter.stop(manifest)
    check('se para por la API, no matando el proceso', stop.kind === 'api')
  }

  await section('Satisfactory: no arranca si el puerto es de otro', async () => {
    // Toda la gestión va por `127.0.0.1:<puerto>` y la API no dice de quién es:
    // arrancar con el puerto pillado dejaría a la app mandando órdenes al
    // servidor de otro (reclamarlo, crearle una partida, pararlo). Pasó de
    // verdad con un servidor del usuario en marcha.
    const ocupado = createTcpServer(() => undefined)
    await new Promise<void>((resolve) => ocupado.listen(0, '127.0.0.1', resolve))
    const address = ocupado.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      let error = ''
      await satisfactoryAdapter
        .launch(manifestoDePrueba(port))
        .catch((err: Error) => (error = err.message))
      check('se niega a arrancar', error.length > 0)
      check('y dice qué puerto y qué hacer', error.includes(String(port)), error.slice(0, 80))
    } finally {
      await new Promise<void>((resolve) => ocupado.close(() => resolve()))
    }
  })

  // --- Registro ---------------------------------------------------------------

  await section('Satisfactory: lectura del registro (líneas reales)', async () => {
    const lineas = (await readFile(join(FIXTURES, 'registro-real.txt'), 'utf8'))
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)

    const eventos = lineas.map((l) => parseLine(l))

    const entrada = eventos.find((e) => e.playerJoined)
    check('detecta a quien entra', entrada?.playerJoined === 'Pionera')

    // Ruido real del arranque: tablas de cadenas, esquemas de red, mallas.
    const ruido = lineas.filter((l) =>
      /LogStringTable|LogOnlineSchema|LogStreaming|staticmesh/i.test(l)
    )
    check(
      'esconde el ruido del motor',
      ruido.length > 0 && ruido.every((l) => parseLine(l).hidden),
      `${ruido.length} líneas de ruido`
    )

    // Y lo que sí cuenta algo se sigue viendo.
    const utiles = lineas.filter((l) => /LogServer|LogGameMode|LogSave|LogExit|LogCore/.test(l))
    check(
      'deja pasar lo que cuenta algo',
      utiles.every((l) => !parseLine(l).hidden),
      `${utiles.length} líneas útiles`
    )

    check(
      'nunca esconde lo que explica un servidor que no arranca',
      [
        'LogServer: Error: Failed to bind ServerAPI to any bind address.',
        'LowLevelFatalError [File:algo]',
        'LogMemory: Error: Failed to allocate memory'
      ].every((linea) => !parseLine(linea).hidden)
    )

    check(
      'quita la marca de tiempo del juego',
      parseLine('[2026.09.16-12.33.25:580][  0]LogNet: algo').text.startsWith('LogNet:')
    )

    // Caso real: se intentó entrar por IP directa y el juego lo rechazó con un
    // «Encryption token missing» que no dice qué hacer.
    const rechazo = parseLine(
      'LogNet: Warning: IpConnection_2147473743: No EncryptionToken specified, disconnecting.'
    )
    check(
      'explica el rechazo de una conexión directa',
      !rechazo.hidden && rechazo.text.includes('Añadir servidor'),
      rechazo.text.slice(0, 60)
    )

    check(
      'traduce el apagado a algo legible',
      parseLine(
        'LogCore: Engine exit requested (reason: Remote Server Shutdown initiated by Administrator.)'
      ).text.includes('Cerrando el servidor')
    )
  })

  await section('Satisfactory: diagnóstico de un cierre inesperado', async () => {
    const puerto = diagnoseExit(1, ['LogServer: Error: Failed to bind ServerAPI to any bind address.'])
    check('reconoce el puerto ocupado', puerto.code === 'port-in-use')
    check('propone cambiar de puerto', puerto.action?.kind === 'change-port')
    check('avisa de que solo puede haber uno', puerto.detail.includes('8888'))

    const crash = diagnoseExit(3, ['LowLevelFatalError [File:algo] algo'])
    check('reconoce un fallo del juego', crash.code === 'game-crash')

    const memoria = diagnoseExit(null, ['Failed to allocate memory'])
    check('reconoce quedarse sin memoria', memoria.code === 'out-of-memory')

    const raro = diagnoseExit(9, ['nada que ver'])
    check('lo que no entiende no se lo inventa', raro.code === 'unknown-exit')
  })

  // --- Catálogo compartido ----------------------------------------------------

  await section('Satisfactory: puertos y capacidades', async () => {
    const manifest = manifestoDePrueba(7777)
    const ports = serverPorts(manifest)

    check('dos puertos, no uno', ports.length === 2)
    check(
      'el del juego va en TCP y UDP a la vez',
      ports[0]?.port === 7777 && ports[0]?.protocol === 'tcp+udp'
    )
    check(
      'el de mensajería es fijo y TCP',
      ports[1]?.port === RELIABLE_PORT && ports[1]?.protocol === 'tcp'
    )

    const capabilities = capabilitiesFor(manifest)
    check('no ofrece consola de órdenes', !capabilities.commands)
    check('no dice quién está dentro, solo cuántos', !capabilities.playerIds)
    check('no promete nombres de jugadores', !capabilities.playerNames)
    check('no promete moderación', !capabilities.moderation)
    check('no promete comprobación desde internet', !capabilities.externalCheck)
    check('sí ofrece ajustes', capabilities.settings)

    check(
      'la versión sale del certificado del servidor',
      api.readableVersion('++FactoryGame+rel-main-anniversary-2026-CL-502094') ===
        'anniversary-2026 (build 502094)'
    )
    check(
      'una descripción rara no se inventa una versión',
      api.readableVersion('otra cosa') === 'otra cosa'
    )
    check('sin certificado, sin versión', api.readableVersion(undefined) === null)

    // Sin estos pasos, el usuario se queda con el «Encryption token missing».
    const info = gameInfo('satisfactory')
    check('explica cómo se entra, paso a paso', (info.joinSteps?.length ?? 0) >= 3)
    check(
      'avisa de que la conexión directa no vale',
      info.joinWarning?.includes('Encryption token missing') === true
    )
  })

  // --- Mods de ficsit.app -------------------------------------------------------

  await section('Satisfactory: mods de ficsit.app', async () => {
    // Comparar versiones por texto pondría la 1.2.10 por debajo de la 1.2.2, y
    // la app instalaría una versión vieja creyendo que es la última.
    check('1.2.10 es posterior a 1.2.2', mods.compareVersions('1.2.10', '1.2.2') > 0)
    check('2026.3.28 es posterior a 2026.3.26', mods.compareVersions('2026.3.28', '2026.3.26') > 0)
    check('la misma versión empata', mods.compareVersions('3.12.0', '3.12.0') === 0)

    // La versión del juego se guarda como la escribe su certificado.
    check(
      'saca el número de build de la versión del juego',
      mods.buildNumber('anniversary-2026 (build 502094)') === 502094
    )
    check('sin versión, no hay build', mods.buildNumber(undefined) === null)

    check('un mod que pide una build anterior vale', mods.fitsGame('>=491125', 502094))
    check('uno que pide una posterior, no', !mods.fitsGame('>=600000', 502094))
    // Sin saber la build —el servidor no ha arrancado nunca— no se inventa un
    // aviso: vale más no decir nada que decir algo falso.
    check('sin build del juego, no se juzga', mods.fitsGame('>=600000', null))
    check('una condición rara no se juzga', mods.fitsGame('cualquier cosa', 502094))

    // Elegir versión: la más nueva que tenga servidor Y le valga a la build.
    const version = (
      v: string,
      game: string,
      servidor = true
    ): Parameters<typeof mods.pickBest>[0][number] => ({
      version: v,
      game_version: game,
      required_on_remote: true,
      targets: servidor
        ? [
            { targetName: 'Windows', link: '/w', size: 1, hash: 'a' },
            { targetName: 'WindowsServer', link: '/s', size: 1, hash: 'b' }
          ]
        : [{ targetName: 'Windows', link: '/w', size: 1, hash: 'a' }]
    })

    const lista = [version('1.2.2', '>=383729'), version('1.3.1', '>=502094')]
    check('elige la más nueva que le vale al juego', mods.pickBest(lista, 502094)?.version === '1.3.1')
    check(
      'con un juego más viejo, se queda con la que puede',
      mods.pickBest(lista, 400000)?.version === '1.2.2'
    )
    check(
      'un mod solo de cliente no tiene nada que instalar',
      mods.pickBest([version('1.0.0', '>=1', false)], 502094) === null
    )
    // El catálogo va por delante del servidor cada vez que sale una versión del
    // juego: negarse ahí dejaría sin mods a quien va al día.
    check(
      'si ninguna le vale, propone la más nueva en vez de negarse',
      mods.pickBest([version('9.0.0', '>=900000')], 502094)?.version === '9.0.0'
    )

    // El `.uplugin` es lo que dice qué hay puesto de verdad en el disco.
    const uplugin = await mods.readUplugin(FIXTURES)
    check('lee la versión del .uplugin instalado', uplugin?.version === '3.12.0', uplugin?.version)
    check('y su nombre legible', uplugin?.name === 'Satisfactory Mod Loader', uplugin?.name ?? '')

    // Lo que SML escribe en el registro del servidor real: es lo único que
    // confirma en la consola que los mods están cargados.
    const registro = (await readFile(join(FIXTURES, 'registro-mods.txt'), 'utf8')).split(/\r?\n/)
    const lineas = registro.filter((l) => l.length > 0).map((l) => parseLine(l))
    check(
      'anuncia el cargador con su versión',
      lineas.some((l) => l.text === 'Cargador de mods SML 3.12.0 en marcha.' && l.hidden !== true)
    )
    check(
      'y cada mod cargado',
      lineas.some((l) => l.text === 'Mod cargado: DirectToSplitter 1.3.1' && l.hidden !== true)
    )
    check(
      'sus líneas internas no se cuelan como mods',
      !lineas.some((l) => l.text.startsWith('Mod cargado: SML configuration'))
    )
    // SML se cuenta a sí mismo y cuenta el juego base en esa lista; ninguno de
    // los dos es un mod que el usuario haya puesto.
    check(
      'y el juego base tampoco se enseña como un mod',
      !lineas.some((l) => l.text.startsWith('Mod cargado: FactoryGame'))
    )
    check(
      'de la lista solo sale un mod de verdad',
      lineas.filter((l) => l.text.startsWith('Mod cargado:')).length === 1,
      lineas.filter((l) => l.text.startsWith('Mod cargado:')).map((l) => l.text).join(', ')
    )

    check('los mods van donde el servidor los busca', mods.MODS_DIR === 'FactoryGame/Mods')
    check('y ahora el juego declara que tiene mods', capabilitiesFor(manifestoDePrueba(7777)).content)
  })

  // Contrato con ficsit.app: si su API cambia, esto lo dice.
  await section('Satisfactory: la API de ficsit.app sigue contestando lo mismo', async () => {
    const resultados = await mods.searchMods('snapon', 5)
    check('el buscador filtra de verdad', resultados.length > 0 && resultados.length <= 5,
      `${resultados.length} resultados`)
    // ⚠ Ordenado por relevancia, no por popularidad: lo que se busca por su
    // nombre tiene que salir EL PRIMERO. Con `popularity` salía el quinto.
    check(
      'y lo que se busca por su nombre sale el primero',
      resultados[0]?.id === 'DirectToSplitter',
      resultados.map((m) => m.id).join(', ')
    )
    check('cada resultado trae autor y descargas', resultados.every((m) => m.author.length > 0))

    // El cargador tiene que seguir publicando versión de servidor: sin ella no
    // hay mods posibles en Satisfactory.
    const sml = await mods.resolveVersions([{ id: mods.LOADER_ID, range: '>=3.0.0' }])
    const versiones = sml.get(mods.LOADER_ID) ?? []
    check('SML sigue en el catálogo', versiones.length > 0, `${versiones.length} versiones`)
    check(
      'y publica versión para servidor de Windows',
      versiones.some((v) => mods.targetFor(v) !== null)
    )
    const elegida = mods.pickBest(versiones, null)
    check('con hash para comprobar la descarga', (elegida && mods.targetFor(elegida)?.hash.length === 64) === true)

    // ⚠ Con un rango ancho devuelve TODAS las que valen, no la mejor. Si esto
    // cambiara, la app instalaría una al azar.
    check('un rango ancho devuelve varias versiones sin ordenar', versiones.length > 1)

    // Y las dependencias hay que recorrerlas a mano: la API no las resuelve.
    const conDependencias = versiones.some((v) => Array.isArray(v.dependencies))
    check('las versiones dicen de qué dependen', conDependencias)
  })
}
