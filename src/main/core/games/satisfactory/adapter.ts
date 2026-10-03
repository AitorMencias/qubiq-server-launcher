import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnosis, SatisfactoryCreateRequest, SatisfactoryManifest } from '@shared/types'
import {
  DEFAULT_MAX_PLAYERS,
  RELIABLE_PORT,
  SATISFACTORY_APP_ID,
  type SatisfactoryData
} from '@shared/games/satisfactory/types'
import type { GameAdapter, LaunchSpec, ParsedEvent } from '../types'
import { serverDir } from '../../paths'
import {
  appUpdate,
  checkAppUpdate,
  DEFAULT_BRANCH,
  ensureSteamCmd,
  installedBuildId
} from '../../tools/steamcmd'
import { requireBranch, steamVersions } from '../steamVersions'
import { isPortFree } from '../../net/network'
import * as api from './api'

/**
 * Satisfactory como juego del núcleo (fase 2 de la hoja de ruta multijuego).
 *
 * Lo que en Minecraft son ficheros y órdenes por la consola, aquí es una API
 * HTTPS del propio servidor (`api.ts`). Lo demás sale de la capa común de la
 * fase 1: SteamCMD instala y actualiza, y el supervisor de siempre lanza y
 * vigila el proceso.
 *
 * Tres cosas se comprobaron contra el servidor real y no son negociables
 * (ANALISIS.md §19.15):
 *
 * 1. Se lanza el ejecutable de dentro de `Engine\Binaries`, no `FactoryServer.exe`:
 *    ese es solo un lanzador que abre otro proceso, así que su PID no es el del
 *    servidor y no reenvía su salida.
 * 2. `-UserDir` mueve la configuración y el registro, pero los guardados se van
 *    igualmente a `%LOCALAPPDATA%\FactoryGame` —la carpeta del juego del
 *    usuario— si no se añade `-SavesUseProjectSavedDir`.
 * 3. El límite de jugadores solo se aplica por variable de consola.
 */

/** Carpeta de datos del servidor dentro de la instancia (relativa a `server/`). */
const USER_DIR = 'datos'

/** Dentro de ella, dónde deja el juego cada cosa. */
const SAVES_DIR = `${USER_DIR}/Saved/SaveGames`
const CONFIG_DIR = `${USER_DIR}/Saved/Config/WindowsServer`

/**
 * Dónde escriben los mods su configuración.
 *
 * ⚠ **No cuelga de `-UserDir`, sino de la carpeta del juego**: SML la crea en
 * `FactoryGame/Configs` la primera vez que arranca (comprobado con el servidor
 * real). Entra en las copias porque son ajustes que el usuario ha tocado y que
 * reinstalar el mod no devuelve.
 */
const MOD_CONFIG_DIR = 'FactoryGame/Configs'

/** Lo que tarda como mucho en levantar la API desde que arranca el proceso. */
const READY_TIMEOUT_MS = 180_000

/** Lo que tarda como mucho en cargar una partida recién creada. */
const GAME_LOAD_TIMEOUT_MS = 300_000

/**
 * Tokens de la API por instancia. Entrar cuesta una llamada y el token vale
 * hasta que el servidor se reinicia, así que se guarda en memoria (nunca en
 * disco: la contraseña ya está en el manifiesto y el token es equivalente).
 */
const tokens = new Map<string, string>()

function userDirFor(id: string): string {
  return join(serverDir(id), USER_DIR)
}

/** El servidor de verdad. `FactoryServer.exe` solo lo lanza (ver cabecera). */
export function executablePath(id: string): string {
  return join(serverDir(id), 'Engine', 'Binaries', 'Win64', 'FactoryServer-Win64-Shipping-Cmd.exe')
}

export function launchArgs(manifest: SatisfactoryManifest): string[] {
  return [
    // El lanzador se lo pasa por nosotros; lanzando el ejecutable real hay que
    // decirle a qué proyecto pertenece.
    'FactoryGame',
    `-Port=${manifest.port}`,
    '-log',
    '-unattended',
    `-UserDir=${userDirFor(manifest.id)}`,
    '-SavesUseProjectSavedDir',
    `-ini:Engine:[SystemSettings]:net.MaxPlayersOverride=${manifest.data.maxPlayers}`
  ]
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Token de administrador, entrando si hace falta. Un token caducado (el
 * servidor se reinició por su cuenta) se descarta y se vuelve a entrar.
 */
async function tokenFor(manifest: SatisfactoryManifest, force = false): Promise<string> {
  const cached = tokens.get(manifest.id)
  if (cached && !force) return cached
  const token = await api.login(manifest.port, manifest.data.adminPassword)
  tokens.set(manifest.id, token)
  return token
}

/** Llama a la API reintentando una vez si el token ya no vale. */
async function withToken<T>(
  manifest: SatisfactoryManifest,
  action: (target: api.ApiTarget) => Promise<T>
): Promise<T> {
  const target = { port: manifest.port, token: await tokenFor(manifest) }
  try {
    return await action(target)
  } catch (err) {
    if (err instanceof api.SatisfactoryApiError && err.code === 'invalid_token') {
      return action({ port: manifest.port, token: await tokenFor(manifest, true) })
    }
    throw err
  }
}

/**
 * Se niega a arrancar si los puertos no están libres.
 *
 * ⚠ Esto NO es una comodidad: es lo que impide hablar con el servidor
 * equivocado. Toda la gestión de Satisfactory va por su API en `127.0.0.1:<puerto>`
 * y la API no dice de quién es. Si otro servidor ya tiene ese puerto, el nuestro
 * no lo consigue y **las llamadas se las lleva el otro**: reclamarlo, crearle una
 * partida encima o pararlo. Pasó de verdad al ejecutar la `e2e` con un servidor
 * del usuario en marcha (ANALISIS.md §19.15).
 */
async function ensurePortsFree(manifest: SatisfactoryManifest): Promise<void> {
  if (!(await isPortFree(manifest.port, 'tcp+udp'))) {
    throw new Error(
      `El puerto ${manifest.port} ya está ocupado por otro programa. Cámbialo en ` +
        'Configuración → Conexión, o cierra lo que lo esté usando.'
    )
  }
  if (!(await isPortFree(RELIABLE_PORT, 'tcp'))) {
    throw new Error(
      `El puerto ${RELIABLE_PORT}, que Satisfactory usa siempre para su mensajería, está ocupado. ` +
        'Casi seguro que ya tienes otro servidor de Satisfactory en marcha: solo puede haber uno a ' +
        'la vez, porque ese puerto no se puede cambiar. Para el otro y vuelve a intentarlo.'
    )
  }
}

/** Espera a que el servidor conteste, o se rinde con un error explicado. */
async function waitForApi(port: number, timeoutMs: number, child?: ChildProcess): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`El servidor se cerró al arrancar (código ${child.exitCode}).`)
    }
    if (await api.healthCheck(port)) return
    await wait(2_000)
  }
  throw new Error('El servidor no llegó a responder. Revisa el registro de la consola.')
}

/**
 * Arranca el servidor aparte del supervisor, hace algo con él y lo para.
 *
 * Es lo que permite dejar el servidor **ya reclamado y con la partida creada**
 * al terminar el asistente: reclamar exige que esté en marcha, y hacerlo aquí
 * evita que el usuario tenga que abrir el juego para configurar lo suyo.
 */
async function withTemporaryServer<T>(
  manifest: SatisfactoryManifest,
  action: (target: api.ApiTarget) => Promise<T>
): Promise<T> {
  // Antes de nada: si el puerto no es nuestro, las llamadas irían a otro servidor.
  await ensurePortsFree(manifest)

  const child = spawn(executablePath(manifest.id), launchArgs(manifest), {
    cwd: serverDir(manifest.id),
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore']
  })

  try {
    await waitForApi(manifest.port, READY_TIMEOUT_MS, child)
    return await action({ port: manifest.port })
  } finally {
    // Se para como siempre: por la API si se puede, y solo si no, a lo bruto.
    try {
      const token = tokens.get(manifest.id) ?? (await api.login(manifest.port, manifest.data.adminPassword))
      await api.shutdown({ port: manifest.port, token })
      const deadline = Date.now() + 60_000
      while (child.exitCode === null && Date.now() < deadline) await wait(500)
    } catch {
      // Sin API no queda otra; aquí todavía no hay partida que perder.
    }
    if (child.exitCode === null) child.kill()
  }
}

export const satisfactoryAdapter: GameAdapter<SatisfactoryManifest, SatisfactoryCreateRequest> = {
  id: 'satisfactory',

  async prepareCreate(request, name) {
    const options = request.options
    if (options.adminPassword.trim().length < 4) {
      throw new Error('La contraseña de administrador tiene que tener al menos 4 caracteres.')
    }

    const sessionName = options.sessionName.trim() || name

    const data: SatisfactoryData = {
      adminPassword: options.adminPassword,
      clientPassword: options.clientPassword,
      sessionName,
      // Los jugadores esperados son el límite del servidor: por defecto son 4,
      // y subirlo es cosa de una variable de consola al arrancar.
      maxPlayers: Math.max(request.expectedPlayers ?? DEFAULT_MAX_PLAYERS, 1),
      claimed: false
    }
    return data
  },

  async writeInitialFiles(manifest) {
    // El servidor se crea sus ficheros solo al arrancar; lo único que hace
    // falta es que exista su carpeta de datos, para que `-UserDir` no apunte a
    // algo que no está.
    await mkdir(join(userDirFor(manifest.id), 'Saved'), { recursive: true })
  },

  /**
   * Descarga el servidor y lo deja listo para jugar.
   *
   * Reinstalar o actualizar solo repite la parte de SteamCMD: la partida y el
   * hecho de estar reclamado siguen ahí, y volver a reclamarlo fallaría.
   */
  async install(manifest, onProgress) {
    onProgress('steamcmd', null, 'Preparando SteamCMD')
    await ensureSteamCmd((detail) => onProgress('steamcmd', null, detail))

    onProgress('download', null, 'Descargando Satisfactory de Steam (unos 15 GB la primera vez)')
    const result = await appUpdate({
      appId: SATISFACTORY_APP_ID,
      installDir: serverDir(manifest.id),
      branch: manifest.data.branch ?? DEFAULT_BRANCH,
      onProgress: (progress, label) => {
        const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)
        const detail =
          progress.total > 0 ? `${label} · ${gb(progress.done)} de ${gb(progress.total)} GB` : label
        onProgress('download', progress.fraction, detail)
      }
    })

    if (manifest.data.claimed) {
      return { buildId: result.buildId ?? undefined, branch: result.branch }
    }

    // Primer arranque: reclamar el servidor y dejar la partida creada.
    onProgress('claim', null, 'Arrancando el servidor por primera vez')
    const changes = await withTemporaryServer(manifest, async (target) => {
      onProgress('claim', null, 'Poniéndole nombre y contraseña al servidor')
      const token = await claimOrLogin(manifest)
      tokens.set(manifest.id, token)
      const admin = { port: manifest.port, token }

      await api.setClientPassword(admin, manifest.data.clientPassword)

      if (manifest.data.sessionName) {
        onProgress('claim', null, `Creando la partida «${manifest.data.sessionName}»`)
        await api.createNewGame(admin, { sessionName: manifest.data.sessionName })
        await waitForGame(admin)
      }

      const version = await api.serverVersion(target.port)
      return { gameVersion: version ?? undefined }
    })

    onProgress('claim', 1, 'Servidor listo')
    return { ...changes, claimed: true, buildId: result.buildId ?? undefined, branch: result.branch }
  },

  applyChanges(current, next, changes) {
    // Cambiar de jugadores esperados es cambiar el límite del servidor: se
    // aplica en el siguiente arranque, porque va en la línea de órdenes.
    const players = changes.expectedPlayers
    if (players && players !== current.expectedPlayers) {
      next.data = { ...next.data, maxPlayers: Math.max(players, 1) }
    }
    return next
  },

  async checkUpdate(manifest) {
    await ensureSteamCmd()
    const check = await checkAppUpdate(
      SATISFACTORY_APP_ID,
      serverDir(manifest.id),
      manifest.data.branch ?? DEFAULT_BRANCH
    )
    return { available: check.available, installed: check.installed, latest: check.latest }
  },

  listVersions(manifest) {
    return steamVersions(SATISFACTORY_APP_ID, serverDir(manifest.id), manifest.data.buildId)
  },

  async prepareVersionChange(manifest, versionId) {
    return {
      branch: await requireBranch(SATISFACTORY_APP_ID, versionId),
      // La versión del juego se sabe preguntándosela al servidor, y la que hay
      // guardada es la de antes: se borra para no enseñar una que ya no es.
      gameVersion: undefined
    }
  },

  async launch(manifest) {
    // Va lo primero: arrancar con el puerto ocupado dejaría a la app hablando
    // con el servidor de otro (ver `ensurePortsFree`).
    await ensurePortsFree(manifest)

    const spec: LaunchSpec = {
      command: executablePath(manifest.id),
      args: launchArgs(manifest),
      cwd: serverDir(manifest.id)
    }
    if (!(await exists(spec.command))) {
      throw new Error(
        'Falta el ejecutable del servidor. Reinstálalo desde Configuración → Servidor.'
      )
    }
    // Un token de un arranque anterior ya no vale.
    tokens.delete(manifest.id)
    return spec
  },

  /**
   * Parada limpia: una llamada a `Shutdown`. El servidor guarda la partida y
   * sale solo en unos segundos (medido: unos 2,5 s).
   */
  stop(manifest) {
    return {
      kind: 'api',
      graceMs: 60_000,
      request: async () => {
        const token = await tokenFor(manifest)
        await api.shutdown({ port: manifest.port, token })
      }
    }
  },

  parseLine,
  diagnoseExit,

  /**
   * Lo que el servidor no cuenta por el registro: si ya se puede entrar y
   * cuánta gente hay dentro. Los dos salen de la API.
   */
  async poll(manifest) {
    if (!(await api.healthCheck(manifest.port))) return { ready: false }
    try {
      const state = await withToken(manifest, (target) => api.queryState(target))
      // «Listo» no es que el proceso esté vivo, sino que hay partida cargada:
      // hasta entonces el juego rechaza a quien intente entrar.
      return { ready: state.gameRunning, playerCount: state.playersConnected }
    } catch {
      return { ready: false }
    }
  },

  pollIntervalMs: 5_000,

  async backupEntries(manifest) {
    // Sin partidas no hay copia que valga: guardar solo la configuración de un
    // servidor recién creado llenaría el historial de ruido.
    if (!(await exists(join(serverDir(manifest.id), SAVES_DIR)))) return []
    const entries = [SAVES_DIR]
    if (await exists(join(serverDir(manifest.id), CONFIG_DIR))) entries.push(CONFIG_DIR)
    if (await exists(join(serverDir(manifest.id), MOD_CONFIG_DIR))) entries.push(MOD_CONFIG_DIR)
    return entries
  },

  async restoreTargets(manifest) {
    // Se sustituyen las partidas; la configuración del servidor se respeta,
    // porque restaurar una partida no debería cambiar puertos ni contraseñas.
    return (await exists(join(serverDir(manifest.id), SAVES_DIR))) ? [SAVES_DIR] : []
  },

  backupMeta(manifest) {
    return {
      version: manifest.data.gameVersion ?? 'desconocida',
      variant: manifest.data.sessionName
    }
  },

  /**
   * Copia en caliente: se le pide al servidor que guarde y no se sigue hasta
   * que contesta que ha terminado.
   *
   * No hay forma de suspender el guardado automático como en Minecraft, pero el
   * juego escribe cada partida de un tirón y el autoguardado va cada varios
   * minutos, así que copiar justo después de guardar es seguro.
   */
  async holdSaves(manifest) {
    try {
      await withToken(manifest, (target) => api.saveGame(target, manifest.data.sessionName))
      return true
    } catch {
      return false
    }
  },

  async ping(manifest) {
    const start = Date.now()
    if (!(await api.healthCheck(manifest.port))) {
      return { ok: false, error: 'El servidor no responde.' }
    }
    const latencyMs = Date.now() - start

    try {
      const state = await withToken(manifest, (target) => api.queryState(target))
      return {
        ok: state.gameRunning,
        motd: state.sessionName,
        versionName: manifest.data.gameVersion,
        playersOnline: state.playersConnected,
        playersMax: state.playerLimit,
        latencyMs,
        error: state.gameRunning ? undefined : 'El servidor está arrancado pero sin partida cargada.'
      }
    } catch {
      // Responde, pero no deja mirar dentro: para el jugador está arriba igual.
      return { ok: true, latencyMs }
    }
  }

  // `checkFromInternet` no existe a propósito: Satisfactory no aparece en
  // ninguna lista pública y no hay servicio al que preguntar si se llega desde
  // fuera. La capacidad `externalCheck` lo declara y la pantalla de conexión lo
  // explica en vez de ofrecer un botón que no probaría nada.
}

/**
 * Reclama el servidor o, si ya lo estaba, entra con la contraseña.
 *
 * Pasa de verdad: si una instalación anterior llegó a reclamarlo y la creación
 * se quedó a medias, el servidor ya tiene dueño. Mientras la contraseña sea la
 * misma, se sigue adelante en vez de obligar a borrarlo todo.
 */
async function claimOrLogin(manifest: SatisfactoryManifest): Promise<string> {
  try {
    return await api.claimServer(manifest.port, manifest.name, manifest.data.adminPassword)
  } catch (err) {
    if (err instanceof api.SatisfactoryApiError && err.code === 'passwordless_login_not_possible') {
      return api.login(manifest.port, manifest.data.adminPassword)
    }
    throw err
  }
}

/**
 * Espera a que la partida termine de cargar.
 *
 * `CreateNewGame` y `LoadGame` contestan 202 y siguen a lo suyo: si se pregunta
 * enseguida por las partidas, la nueva todavía no está en la lista y parece que
 * no se ha creado. Con `sessionName` se espera además a que la cargada sea esa.
 */
export async function waitForGame(target: api.ApiTarget, sessionName?: string): Promise<void> {
  const deadline = Date.now() + GAME_LOAD_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const state = await api.queryState(target)
      if (state.gameRunning && (!sessionName || state.sessionName === sessionName)) return
    } catch {
      // El servidor está cargando y no contesta: se reintenta.
    }
    await wait(3_000)
  }
  throw new Error('La partida no terminó de cargarse.')
}

/**
 * Categorías del registro que sí le dicen algo al usuario.
 *
 * El servidor escribe cientos de líneas de motor por arranque —tablas de
 * cadenas, mallas, audio, esquemas de red— y la mayoría son *avisos*, no
 * información. Enseñarlas todas haría la consola inservible y, peor, daría la
 * impresión de que algo va mal cuando el servidor va perfectamente. Se enseña
 * esto; el resto se guarda igual para diagnosticar un cierre inesperado.
 */
const USEFUL_CATEGORIES =
  /^Log(Server|GameMode|GameState|Game|Save|World|Exit|Init|Load|GlobalStatus|Core)\b|^LogNet:/

/** Líneas que, aun siendo de una categoría útil, no aportan nada. */
const NOISE =
  /(string table|Bringing World|Discovered \d+ Remote Call|schema|Voice interface|LoadSubsystemModule|PrimaryAssetType|staticmesh)/i

/**
 * Lo que no se esconde nunca, venga de donde venga: es justo lo que explica que
 * un servidor no arranque.
 */
const ALWAYS_SHOW = /(Fatal|Failed to bind|Failed to allocate|out of memory|Assertion failed)/i

export function parseLine(raw: string): ParsedEvent {
  // Del fichero de registro llegan con marca de tiempo y número de fotograma;
  // por la tubería, sin ellas. Se quitan para no repetir la hora en la consola.
  const clean = raw.replace(/^\[[\d.:-]+\]\[\s*\d+\]/, '').trim()

  const level: ParsedEvent['level'] = /:\s*Error:/.test(clean)
    ? 'error'
    : /:\s*Warning:/.test(clean)
      ? 'warn'
      : 'info'

  // Quien entra sí se ve: es lo único que el registro cuenta de los jugadores
  // (cuántos hay dentro lo dice la API, que es la que manda).
  const joined = /Join succeeded:\s*(.+)$/.exec(clean)
  if (joined) {
    return { level: 'info', text: `${joined[1]!.trim()} ha entrado en la partida`, playerJoined: joined[1]!.trim() }
  }

  // Alguien ha intentado entrar por IP a pelo. El juego lo rechaza porque el
  // cliente no trae el permiso que se consigue al añadir el servidor desde su
  // menú, y el error que ve quien lo intenta («Encryption token missing») no
  // explica nada. Aquí se dice lo que hay que hacer.
  if (/No EncryptionToken specified|Encryption token missing/i.test(clean)) {
    return {
      level: 'warn',
      text:
        'Alguien ha intentado entrar con una conexión directa por IP y el juego lo ha rechazado. ' +
        'Hay que añadir el servidor desde Satisfactory: Servidores → Añadir servidor, con la ' +
        'dirección que da la app.'
    }
  }

  if (/Remote Server Shutdown initiated/.test(clean)) {
    return { level: 'system', text: 'Cerrando el servidor a petición de la app…' }
  }

  if (/Server API listening on/.test(clean)) {
    return { level: 'info', text: 'Panel del servidor listo. Cargando la partida…' }
  }

  if (/Server startup time elapsed/.test(clean)) {
    return { level: 'info', text: 'Partida cargada.' }
  }

  // SML escribe la lista de lo que ha cargado, un mod por línea
  // («LogSatisfactoryModLoader: Display: SML: 3.12.0», comprobado con el
  // servidor real). Es lo único del registro que dice de verdad si los mods
  // están puestos, así que se enseña traducido en vez de esconderse con el
  // resto del ruido del motor.
  //
  // ⚠ En esa lista, SML se cuenta a sí mismo y cuenta **también el juego base**
  // («FactoryGame: 502094.0.0»). Enseñarlo como un mod más confundiría: el
  // juego no es un mod que el usuario haya puesto.
  const mod = /^LogSatisfactoryModLoader:\s*Display:\s*([\w.+-]+):\s*(\d[\w.+-]*)$/.exec(clean)
  if (mod) {
    if (mod[1] === 'FactoryGame') return { level: 'info', text: clean, hidden: true }
    return mod[1] === 'SML'
      ? { level: 'info', text: `Cargador de mods SML ${mod[2]} en marcha.` }
      : { level: 'info', text: `Mod cargado: ${mod[1]} ${mod[2]}` }
  }

  // Lo que deja cada guardado, automático o pedido (medido en su registro:
  // «LogGame: World Serialization (save): 0.264 seconds»). Al cargar dice
  // «(load)», que no cuenta.
  if (/World Serialization \(save\)/.test(clean)) return { level, text: clean, saved: true }

  const useful = ALWAYS_SHOW.test(clean) || (USEFUL_CATEGORIES.test(clean) && !NOISE.test(clean))
  return { level, text: clean, hidden: !useful }
}

export function diagnoseExit(code: number | null, recentLines: string[]): Diagnosis {
  const recent = recentLines.join('\n')

  if (/Failed to bind|bind address|Address already in use/i.test(recent)) {
    return {
      code: 'port-in-use',
      title: 'El puerto ya está ocupado',
      detail:
        'Otro programa está usando ese puerto, o hay otro servidor de Satisfactory en marcha ' +
        '(solo puede haber uno: el puerto 8888 de la mensajería del juego es siempre el mismo). ' +
        'Cambia el puerto en Configuración → Conexión o para el otro servidor.',
      action: { kind: 'change-port' }
    }
  }

  if (/Fatal error|LowLevelFatalError|Assertion failed/i.test(recent)) {
    return {
      code: 'game-crash',
      title: 'El servidor ha fallado',
      detail:
        'El juego se ha cerrado por un error interno. Si se repite, prueba a reinstalarlo desde ' +
        'Configuración → Servidor: comprueba los ficheros sin volver a descargarlo todo.'
    }
  }

  if (/out of memory|OOM|Failed to allocate/i.test(recent)) {
    return {
      code: 'out-of-memory',
      title: 'El equipo se ha quedado sin memoria',
      detail:
        'Satisfactory pide 8 GB libres, y 16 con partidas grandes o más de cuatro jugadores. ' +
        'Cierra otros programas (o el juego, si lo tienes abierto en este mismo equipo) y vuelve a arrancarlo.'
    }
  }

  return {
    code: 'unknown-exit',
    title: 'El servidor se cerró inesperadamente',
    detail: `Código de salida ${code}. Mira las últimas líneas de la consola para ver qué pasó.`
  }
}

/** Para el servicio: lo que el núcleo necesita saber de dónde está cada cosa. */
export const satisfactoryPaths = {
  userDir: userDirFor,
  savesDir: (id: string): string => join(serverDir(id), SAVES_DIR, 'server'),
  installedBuildId: (id: string): Promise<string | null> =>
    installedBuildId(serverDir(id), SATISFACTORY_APP_ID)
}

export { tokenFor, withToken }
