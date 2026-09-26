import { randomBytes } from 'node:crypto'
import { access, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnosis, RustCreateRequest, RustManifest } from '@shared/types'
import {
  DEFAULT_MAX_PLAYERS,
  DEFAULT_WIPE_PLAN,
  IDENTITY,
  MAX_PLAYERS,
  MAX_SEED,
  MAX_WORLD_SIZE,
  MIN_WORLD_SIZE,
  RUST_APP_ID,
  RUST_GAME_APP_ID,
  STOP_GRACE_MS,
  changedSettings,
  queryPortFor,
  randomSeed,
  rconPortFor,
  rustPlusPortFor,
  settingInfo,
  type RustData
} from '@shared/games/rust/types'
import type { GameAdapter, LaunchSpec, LiveStatus, ParsedEvent } from '../types'
import { serverDir } from '../../paths'
import {
  appUpdate,
  checkAppUpdate,
  DEFAULT_BRANCH,
  ensureSteamCmd,
  installedBuildId
} from '../../tools/steamcmd'
import { requireBranch, steamVersions } from '../steamVersions'
import { isPortInUse, isUdpPortInUse } from '../../net/network'
import { queryInfo } from '../../net/a2s'
import { steamRegistration } from '../../net/steamServers'
import { identityDir, writeServerCfg } from './config'
import { parseKeywords, parsePlayerList, parseServerInfo, rustRcon } from './rcon'
import { WebRconSilenceError } from '../../net/webrcon'
import { currentMap, mapsOnDisk } from './wipe'
import { installOxide, latestOxide, oxideFits, publicBranch, PLUGINS_DIR } from './mods'

/**
 * Rust como juego del núcleo (fase 7 de la hoja de ruta multijuego).
 *
 * Por fuera se parece a Project Zomboid —consola, nombres de quien entra y
 * moderación en caliente— pero no lee su entrada estándar: todo va por su
 * consola remota por WebSocket (WebRCON), como Factorio con su RCON.
 *
 * Lo medido contra el servidor real (protocolo 2633, `rust-fase7.mjs` del
 * material de desarrollo) que no es negociable (ANALISIS.md §19.27):
 *
 * 1. **«Listo» es «Server startup complete».** Antes genera el mapa: 109 s con
 *    2000, 171 s con 3000 y 306 s con 4000 la primera vez; 13 s después.
 * 2. **`quit` por WebRCON guarda y sale en menos de un segundo**, con código
 *    -1 (4294967295). La entrada estándar no la lee: `quit` por ahí no hace
 *    nada en dos minutos.
 * 3. **Escribe la IP pública del equipo** («IP address from external API») y
 *    **la línea de órdenes entera con la contraseña de RCON**. Ninguna de las
 *    dos se enseña, y se borran hasta del texto que se guarda.
 * 4. **Escribe cada línea dos veces** (también en su fichero de registro, así
 *    que es suyo y no de la tubería). El supervisor tira el eco
 *    (`LaunchSpec.dropEchoes`).
 * 5. **La consola remota se abre en `0.0.0.0`** si no se le dice otra cosa:
 *    se ata a 127.0.0.1 con `+rcon.ip`.
 * 6. **Se anuncia siempre** en la lista de Steam: no hay forma de evitarlo.
 */

/** Lo que tarda como mucho en quedar listo: un mapa de 6000 la primera vez. */
const READY_TIMEOUT_MS = 20 * 60_000

/**
 * Lo que sale en la consola cuando el servidor termina de guardar. La copia en
 * caliente espera a ESTE texto, que es el que ya viene traducido.
 */
const SAVED_TEXT = 'Mapa guardado.'
const SAVED_PATTERN = /Mapa guardado/

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function executablePath(id: string): string {
  return join(serverDir(id), 'RustDedicated.exe')
}

/** Contraseña de WebRCON: no la escribe nadie a mano, así que se genera. */
function randomRconPassword(): string {
  return randomBytes(18).toString('base64url')
}

/**
 * Un texto para la línea de órdenes. Las comillas dobles se cambian por
 * simples: la línea de órdenes de Rust no tiene forma de escaparlas, y una
 * comilla suelta partiría el nombre del servidor en dos órdenes.
 */
function cmdText(value: string): string {
  return value.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim()
}

/**
 * La línea de órdenes del servidor.
 *
 * Manda sobre `server.cfg` (medido), así que es donde va todo lo que decide la
 * app. Solo lleva los ajustes que se apartan de lo de serie: así se lee corta
 * en el registro y un valor de serie nuevo del juego no se pisa sin motivo.
 *
 * ⚠ Nada puede ser negativo: la línea de órdenes de Rust se come el guion
 * (`+app.port -1` lo lee como `1`, medido). Lo negativo va en `server.cfg`.
 */
export function launchArgs(manifest: RustManifest): string[] {
  const { data } = manifest
  const port = manifest.port
  const args = [
    '-batchmode',
    '-nographics',
    '+server.identity',
    IDENTITY,
    '+server.port',
    String(port),
    '+server.queryport',
    String(queryPortFor(port)),
    // La consola remota solo para la app: sin esto Rust la abre a toda la red.
    '+rcon.ip',
    '127.0.0.1',
    '+rcon.port',
    String(rconPortFor(port)),
    '+rcon.password',
    data.rconPassword,
    '+rcon.web',
    '1',
    '+server.hostname',
    cmdText(manifest.name),
    '+server.description',
    cmdText(data.description),
    '+server.maxplayers',
    String(clampPlayers(data.maxPlayers)),
    '+server.worldsize',
    String(clampWorldSize(data.worldSize)),
    '+server.seed',
    String(data.seed)
  ]
  if (data.rustPlus) args.push('+app.port', String(rustPlusPortFor(port)))

  for (const [key, value] of Object.entries(changedSettings(data.settings))) {
    const info = settingInfo(key)
    if (!info) continue
    const text = typeof value === 'string' ? cmdText(value) : String(value)
    // Un texto vacío no se pasa: `+server.url` sin nada detrás se llevaría la
    // siguiente orden como valor.
    if (text.length === 0) continue
    args.push(`+${key}`, text)
  }
  return args
}

function clampPlayers(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_PLAYERS
  return Math.min(Math.max(Math.round(value), 1), MAX_PLAYERS)
}

function clampWorldSize(value: number): number {
  if (!Number.isFinite(value)) return 3000
  return Math.min(Math.max(Math.round(value), MIN_WORLD_SIZE), MAX_WORLD_SIZE)
}

export const rustAdapter: GameAdapter<RustManifest, RustCreateRequest> = {
  id: 'rust',

  async prepareCreate(request) {
    const options = request.options
    const worldSize = Math.round(options.worldSize)
    if (!Number.isFinite(worldSize) || worldSize < MIN_WORLD_SIZE || worldSize > MAX_WORLD_SIZE) {
      throw new Error(
        `El tamaño del mapa tiene que estar entre ${MIN_WORLD_SIZE} y ${MAX_WORLD_SIZE} metros.`
      )
    }
    const seed = options.seed ?? randomSeed()
    if (!Number.isInteger(seed) || seed < 1 || seed > MAX_SEED) {
      throw new Error(`La semilla tiene que ser un número entre 1 y ${MAX_SEED}.`)
    }
    for (const key of Object.keys(options.settings ?? {})) {
      if (!settingInfo(key)) throw new Error(`Rust no tiene ningún ajuste que se llame «${key}».`)
    }

    const data: RustData = {
      description: (options.description ?? '').trim(),
      worldSize,
      seed,
      maxPlayers: clampPlayers(options.maxPlayers ?? request.expectedPlayers ?? DEFAULT_MAX_PLAYERS),
      rconPassword: randomRconPassword(),
      rustPlus: options.rustPlus ?? false,
      settings: { ...(options.settings ?? {}) },
      wipe: { ...DEFAULT_WIPE_PLAN, ...(options.wipe ?? {}) },
      // Los plugins se añaden después de crear el servidor, como los mods en
      // los demás juegos: el asistente ya pregunta bastante.
      plugins: []
    }
    return data
  },

  async writeInitialFiles(manifest) {
    // El mapa lo genera el servidor en su primer arranque. Lo que se deja
    // puesto es la carpeta de la identidad y el bloque de `server.cfg` que
    // apaga Rust+, que no se puede decir por la línea de órdenes.
    await mkdir(identityDir(manifest.id), { recursive: true })
    await writeServerCfg(manifest)
  },

  async install(manifest, onProgress) {
    onProgress('steamcmd', null, 'Preparando SteamCMD')
    await ensureSteamCmd((detail) => onProgress('steamcmd', null, detail))

    onProgress('download', null, 'Descargando Rust de Steam (unos 5,5 GB la primera vez)')
    const result = await appUpdate({
      appId: RUST_APP_ID,
      installDir: serverDir(manifest.id),
      branch: manifest.data.branch ?? DEFAULT_BRANCH,
      onProgress: (progress, label) => {
        const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)
        const detail =
          progress.total > 0 ? `${label} · ${gb(progress.done)} de ${gb(progress.total)} GB` : label
        onProgress('download', progress.fraction, detail)
      }
    })

    await mkdir(identityDir(manifest.id), { recursive: true })
    await writeServerCfg(manifest)

    const changes: Partial<RustData> = {
      buildId: result.buildId ?? undefined,
      branch: result.branch
    }

    // ⚠ Actualizar Rust quita Oxide: el parche vuelve a traer los DLL que Oxide
    // había sustituido. Se vuelve a poner solo si ya existe la Oxide de esta
    // build; si no, el servidor arranca sin plugins y se dice por qué.
    const oxide = manifest.data.oxide
    if (oxide) {
      onProgress('oxide', null, 'Volviendo a poner Oxide')
      changes.oxide = await reapplyOxide(manifest.id, oxide.added, result.buildId, (detail) =>
        onProgress('oxide', null, detail)
      )
    }

    onProgress('done', 1, 'Servidor listo')
    return changes
  },

  async checkUpdate(manifest) {
    await ensureSteamCmd()
    const check = await checkAppUpdate(
      RUST_APP_ID,
      serverDir(manifest.id),
      manifest.data.branch ?? DEFAULT_BRANCH
    )
    return { available: check.available, installed: check.installed, latest: check.latest }
  },

  listVersions(manifest) {
    return steamVersions(RUST_APP_ID, serverDir(manifest.id), manifest.data.buildId)
  },

  async prepareVersionChange(manifest, versionId) {
    return {
      branch: await requireBranch(RUST_APP_ID, versionId),
      // La de verdad se lee del servidor al arrancarlo.
      gameVersion: undefined
    }
  },

  /** Los jugadores esperados son el límite de jugadores. */
  applyChanges(current, next, changes) {
    if (changes.expectedPlayers && changes.expectedPlayers !== current.expectedPlayers) {
      next.data = { ...next.data, maxPlayers: clampPlayers(changes.expectedPlayers) }
    }
    return next
  },

  async launch(manifest) {
    const command = executablePath(manifest.id)
    if (!(await exists(command))) {
      throw new Error('Falta el ejecutable del servidor. Reinstálalo desde Configuración → Servidor.')
    }

    // La consola remota va en el puerto siguiente y es por donde se para el
    // servidor. Si otro programa la tiene cogida, arrancar sería dejar un
    // servidor que la app no puede parar sin matarlo: mejor decirlo antes.
    if (await isPortInUse(rconPortFor(manifest.port))) {
      throw new Error(
        `El puerto ${rconPortFor(manifest.port)} (TCP), que usa la app para hablar con el servidor, ` +
          'lo tiene ocupado otro programa. Cambia el puerto del servidor en Configuración → Conexión.'
      )
    }

    await mkdir(identityDir(manifest.id), { recursive: true })
    await writeServerCfg(manifest)

    return {
      command,
      args: launchArgs(manifest),
      cwd: serverDir(manifest.id),
      dropEchoes: true
    } satisfies LaunchSpec
  },

  /**
   * Parada limpia: `quit` por WebRCON, que guarda y cierra.
   *
   * Si se pide mientras genera el mapa, el servidor no la atiende hasta
   * terminar (medido): el plazo es largo a propósito, y se avisa en la consola
   * para que nadie crea que se ha colgado.
   */
  stop(manifest) {
    return {
      // Por la sesión de siempre y no con una conexión nueva: Rust no suelta
      // las conexiones cerradas, y la parada no puede quedarse sin sitio.
      kind: 'api',
      request: () => quit(manifest),
      graceMs: STOP_GRACE_MS,
      whileStarting:
        'Rust no atiende la orden de parar mientras genera el mapa. Se parará, guardando, en cuanto ' +
        'termine: con un mapa grande, unos minutos.'
    }
  },

  /** La consola de la app va por WebRCON: la entrada estándar no la lee. */
  async sendCommand(manifest, command) {
    return rustRcon(manifest, command)
  },

  parseLine,
  diagnoseExit,

  /**
   * Quién está dentro, preguntándoselo al servidor.
   *
   * `playerlist` da la lista entera y exacta en cualquier momento, que vale más
   * que ir sumando y restando nombres del registro (lección de Zomboid).
   * Mientras genera el mapa no contesta, y eso no es «no hay nadie».
   */
  async poll(manifest) {
    try {
      const answer = await rustRcon(manifest, 'playerlist', 4_000)
      const players = parsePlayerList(answer)
      return {
        players: players.map((p) => p.name),
        playerCount: players.length
      } satisfies LiveStatus
    } catch {
      return {}
    }
  },
  pollIntervalMs: 5_000,

  async backupEntries(manifest) {
    // Sin mapa no hay copia que valga: al crear el servidor ya hay un
    // `server.cfg`, y guardar solo eso llenaría el historial de copias vacías.
    const identity = identityDir(manifest.id)
    const names = await readdir(identity).catch((): string[] => [])
    if (!names.some((n) => n.startsWith('proceduralmap.'))) return []

    // El mapa, los jugadores y la moderación, que es todo lo que se pierde. El
    // juego son 5,5 GB que se vuelven a bajar de Steam.
    const entries = [`server/${IDENTITY}`]
    // Y los plugins con su configuración y sus datos (kits, permisos…), que
    // son parte de la partida tanto como el mapa.
    for (const dir of ['oxide/plugins', 'oxide/config', 'oxide/data']) {
      if (await exists(join(serverDir(manifest.id), ...dir.split('/')))) entries.push(dir)
    }
    return entries
  },

  async restoreTargets(manifest) {
    // La identidad entera: si no, un mapa que no estaba en la copia se quedaría
    // al lado del restaurado y el servidor podría cargar el que no es.
    const targets: string[] = []
    if (await exists(identityDir(manifest.id))) targets.push(`server/${IDENTITY}`)
    for (const dir of ['oxide/config', 'oxide/data']) {
      if (await exists(join(serverDir(manifest.id), ...dir.split('/')))) targets.push(dir)
    }
    return targets
  },

  backupMeta(manifest) {
    return {
      version: manifest.data.gameVersion ?? manifest.data.buildId ?? 'desconocida',
      variant: `mapa ${manifest.data.worldSize} · semilla ${manifest.data.seed}`
    }
  },

  /**
   * El servidor busca su mapa por tamaño y semilla, y los dos están en el
   * manifiesto. Una copia de antes de un borrado trae el mapa de la semilla de
   * entonces: si no se apunta, el servidor no lo encontraría y generaría otro,
   * y la restauración no habría servido de nada.
   *
   * No hay ambigüedad posible: un borrado desde la app se lleva **todos** los
   * mapas, así que si hay uno en disco que no es el del manifiesto, es que
   * viene de la copia.
   */
  async afterRestore(manifest) {
    const maps = await mapsOnDisk(manifest.id)
    if (maps.length === 0) return
    if (currentMap(maps, manifest.data.worldSize, manifest.data.seed)) return
    const restaurado = maps[0]!
    return { worldSize: restaurado.size, seed: restaurado.seed }
  },

  /**
   * Copia en caliente: se le pide que guarde y se espera a que termine.
   *
   * `server.save` contesta por WebRCON con cuatro mensajes, el último «Saving
   * complete» (grabado). Aun así se espera a que la carpeta deje de moverse,
   * que es la lección de Zomboid: el aviso de guardado puede llegar antes de
   * que el último fichero se cierre.
   */
  async holdSaves(manifest, supervisor) {
    if (!supervisor.isRunning) return true
    // Las dos vías a la vez: la respuesta de la orden y la línea del registro.
    // Con un mapa lleno, entre un mensaje y el siguiente puede pasar más que el
    // silencio con el que la consola remota da la respuesta por terminada.
    const guardado = supervisor.waitForLog(SAVED_PATTERN, 120_000)
    const answer = await rustRcon(manifest, 'server.save', 120_000).catch(() => '')
    if (!/Saving complete/i.test(answer) && !(await guardado)) return false
    return waitUntilQuiet(identityDir(manifest.id))
  },

  /**
   * ¿Responde el servidor?
   *
   * Con el protocolo de verdad, el mismo que usa la lista del juego, en su
   * puerto de consulta. Como no se puede dejar de publicar, contesta siempre
   * que esté listo. Si no, se le pregunta por su consola.
   */
  async ping(manifest) {
    const start = Date.now()
    try {
      const info = await queryInfo('127.0.0.1', queryPortFor(manifest.port), { timeoutMs: 4_000 })
      const keywords = parseKeywords(info.keywords)
      return {
        ok: true,
        motd: info.name,
        versionName: keywords.version ?? info.version ?? manifest.data.gameVersion,
        playersOnline: info.players,
        playersMax: info.maxPlayers,
        latencyMs: Date.now() - start
      }
    } catch {
      // Sin consulta todavía: se prueba por la consola.
    }
    try {
      const info = parseServerInfo(await rustRcon(manifest, 'serverinfo', 4_000))
      return {
        ok: true,
        motd: info.hostname ?? manifest.name,
        ...(info.version ? { versionName: info.version } : {}),
        ...(info.players !== undefined ? { playersOnline: info.players } : {}),
        ...(info.maxPlayers !== undefined ? { playersMax: info.maxPlayers } : {}),
        latencyMs: Date.now() - start
      }
    } catch (err) {
      if (await isUdpPortInUse(manifest.port)) {
        return {
          ok: false,
          error:
            'El servidor tiene su puerto abierto pero todavía no contesta. Suele ser que aún está ' +
            'generando el mapa.'
        }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  /**
   * Comprobación desde internet: el servidor se da de alta en el servidor
   * maestro de Valve nada más arrancar («SteamServer Connected»), y eso se
   * puede consultar sin clave.
   */
  async checkFromInternet(host, port) {
    const registration = await steamRegistration(host, RUST_GAME_APP_ID, port)
    if (!registration.registered) {
      return {
        reachable: false,
        error:
          'Steam no tiene registrado ningún servidor de Rust en tu dirección. Si acabas de ' +
          'arrancarlo, dale un minuto: el alta la hace el servidor hacia fuera en cuanto termina ' +
          'el mapa. La prueba de verdad es que entre alguien de otra red.'
      }
    }
    return { reachable: true }
  }
}

/**
 * Manda `quit` y espera a que el servidor lo atienda.
 *
 * La consola remota se abre a los pocos segundos de lanzar el proceso: si se
 * pulsa Parar antes, se reintenta hasta que abra. Y el plazo de la orden es el
 * de la parada entera, porque mientras genera el mapa el servidor no contesta
 * hasta terminar (medido), y cortar la conexión esperando no ayudaría.
 */
async function quit(manifest: RustManifest): Promise<void> {
  const limite = Date.now() + 2 * 60_000
  for (;;) {
    try {
      await rustRcon(manifest, 'quit', STOP_GRACE_MS)
      return
    } catch (err) {
      // Sin respuesta en todo el plazo: la orden está en cola y el supervisor
      // decide cuándo dejar de esperar.
      if (err instanceof WebRconSilenceError) return
      if (Date.now() > limite) throw err
      await new Promise((resolve) => setTimeout(resolve, 3_000))
    }
  }
}

/**
 * Vuelve a poner Oxide tras actualizar Rust, si ya existe la Oxide de esa
 * build. Si no, lo deja apuntado como pendiente: el servidor arranca sin
 * plugins y la pantalla de plugins dice por qué y cuándo volver a mirar.
 */
export async function reapplyOxide(
  id: string,
  previouslyAdded: string[],
  buildId: string | null,
  onProgress?: (detail: string) => void
): Promise<RustData['oxide']> {
  try {
    const release = await latestOxide()
    const fits = oxideFits(release, buildId, await publicBranch())
    if (!fits.ok) {
      return { version: release.version, added: previouslyAdded, pending: true, ...(buildId ? { buildId } : {}) }
    }
    const added = await installOxide(id, release, onProgress)
    return {
      version: release.version,
      // Lo que ya estaba de antes (Oxide.Core.dll…) cuenta como suyo aunque
      // esta vez no fuera nuevo: quitar Oxide tiene que llevárselo igual.
      added: [...new Set([...previouslyAdded, ...added])],
      ...(buildId ? { buildId } : {})
    }
  } catch {
    // Sin conexión con uMod: se deja pendiente, que es lo honesto.
    return { version: 'desconocida', added: previouslyAdded, pending: true }
  }
}

// --- El registro ---------------------------------------------------------------------

/**
 * Una IPv4 que no es la del propio equipo.
 *
 * Sin nada pegado delante: el registro también tiene versiones de cuatro
 * números («Oxide.Compiler v1.0.32.0», grabado) que no son direcciones.
 */
const FOREIGN_IP = /(?<![\w.])(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g

/**
 * Lo que se enseña. El registro de Rust es, como el de Satisfactory, ruido del
 * motor casi entero (sombreadores que no hay, pasos de la generación del mapa,
 * rutas de los NPC). Se guarda todo para diagnosticar un cierre inesperado.
 */
const USEFUL =
  /Server startup complete|Generating procedural map|entities from save|SteamServer Connected|Saving complete|Shutting Down|Loaded plugin|Unloaded plugin|joined \[|disconnecting|\[CHAT\]|Kicked|Banned|Couldn't|Failed to|Exception/i

/** Lo que no se esconde nunca: es justo lo que explica que algo no arranque. */
const ALWAYS_SHOW = /Exception|Couldn't start|Failed to bind|Address already in use|out of memory/i

export function parseLine(raw: string): ParsedEvent {
  // Rust mete un BOM delante de algunas líneas (medido).
  const clean = raw.replace(/^﻿+/, '').trim()

  // ⚠ LO PRIMERO: la línea de órdenes entera, que lleva la contraseña de la
  // consola remota. Se guarda para diagnosticar, pero sin la contraseña.
  if (/^Command Line:/.test(clean)) {
    return {
      level: 'info',
      text: clean.replace(/("\+rcon\.password"\s+")[^"]*(")/, '$1<contraseña>$2'),
      hidden: true
    }
  }

  // ⚠ Y la IP pública del equipo («IP address from external API: 87.x.x.x»),
  // y la de cada jugador al entrar («1.2.3.4:5678/7656…/Nombre joined»). La
  // dirección se borra incluso del texto que se guarda.
  if (FOREIGN_IP.test(clean)) {
    FOREIGN_IP.lastIndex = 0
    const sinIp = clean.replace(FOREIGN_IP, '<dirección>')

    // Quién entra y quién sale. ⚠ No grabadas con un jugador real (hacen falta
    // clientes del juego): la forma es la del registro de Rust de siempre. No
    // deciden nada: quién está dentro se le pregunta al servidor (`poll`).
    const entra = /^<dirección>\/(\d+)\/(.+?) joined \[/.exec(sinIp)
    if (entra) return { level: 'info', text: `${entra[2]} ha entrado.` }
    const sale = /^<dirección>\/(\d+)\/(.+?) disconnecting: (.*)$/.exec(sinIp)
    if (sale) return { level: 'info', text: `${sale[2]} ha salido.` }

    return { level: 'info', text: sinIp, hidden: true }
  }
  FOREIGN_IP.lastIndex = 0

  if (/^Server startup complete/.test(clean)) {
    return { level: 'info', text: 'Mapa cargado. El servidor ya acepta jugadores.', ready: true }
  }

  const generando = /^Generating procedural map of size (\d+) with seed (\d+)/.exec(clean)
  if (generando) {
    return {
      level: 'info',
      text:
        `Preparando el mapa (${generando[1]} m, semilla ${generando[2]}). Si es nuevo, generarlo ` +
        'tarda unos minutos.'
    }
  }

  const guardado = /^Spawning (\d+) entities from save/.exec(clean)
  if (guardado) {
    return { level: 'info', text: `Recuperando lo construido (${guardado[1]} objetos del mapa)…` }
  }

  if (/^SteamServer Connected/.test(clean)) {
    return { level: 'info', text: 'Conectado con Steam: el servidor ya sale en la lista del juego.' }
  }

  if (/^Saving complete/.test(clean)) return { level: 'info', text: SAVED_TEXT }
  if (/^Saved [\d,.]+ ents/.test(clean)) return { level: 'info', text: 'Guardando el mapa…', hidden: true }

  if (/Server Shutting Down/.test(clean)) {
    return { level: 'info', text: 'Cerrando el servidor…' }
  }

  if (/^RCON: IP .* attempted to connect with incorrect password/.test(clean)) {
    return {
      level: 'warn',
      text: 'Algo ha intentado entrar en la consola remota del servidor con una contraseña que no es.'
    }
  }

  // Oxide. Lo que dice por consola está grabado con Oxide 2.0.7726.
  const oxide = /^Loading Oxide Core v([\d.]+)/.exec(clean)
  if (oxide) return { level: 'info', text: 'Cargando Oxide, el cargador de plugins…' }
  if (/^\[CSharp\] Downloading Oxide\.Compiler\.exe/.test(clean)) {
    return { level: 'info', text: 'Oxide está descargando su compilador (solo la primera vez).' }
  }
  const cargado = /^Loaded plugin (.+?) v([\d.]+) by (.+)$/.exec(clean)
  if (cargado) {
    // Los dos de serie de Oxide (Unity y Rust) no son plugins del usuario.
    if (/^(Unity|Rust)$/.test(cargado[1]!)) return { level: 'info', text: clean, hidden: true }
    return { level: 'info', text: `Plugin en marcha: ${cargado[1]} (versión ${cargado[2]}).` }
  }
  const descargado = /^Unloaded plugin (.+?) v([\d.]+)/.exec(clean)
  if (descargado) return { level: 'info', text: `Plugin detenido: ${descargado[1]}.` }
  // El resto de lo que cuenta Oxide de sí mismo (extensiones, su compilador)
  // es detalle interno: se guarda, no se enseña.
  if (/compiled successfully|^Loaded extension|compiler|^\[CSharp\]/i.test(clean) && !/error/i.test(clean)) {
    return { level: 'info', text: clean, hidden: true }
  }
  const noCompila = /^Error while compiling:?\s*(\S+?)(?:\.cs)?\b(.*)$/i.exec(clean)
  if (noCompila) {
    return {
      level: 'error',
      text:
        `El plugin ${noCompila[1]} no compila con esta versión de Rust: no va a funcionar. Busca ` +
        'si hay versión nueva en Configuración → Plugins.'
    }
  }

  // El chat. ⚠ Sin grabar (hacen falta clientes): la forma es la del registro
  // de Rust de siempre, `[CHAT] Nombre[7656…] : mensaje`.
  const chat = /^\[CHAT\]\s+(.+?)\[\d+\]\s*:\s*(.*)$/.exec(clean)
  if (chat) return { level: 'chat', text: `${chat[1]}: ${chat[2]}`, chat: { player: chat[1]!, message: chat[2]! } }

  const level: ParsedEvent['level'] = /Exception|^Error|\bERROR\b/.test(clean)
    ? 'error'
    : /^Warning|\bWARNING\b/i.test(clean)
      ? 'warn'
      : 'info'

  return { level, text: clean, hidden: !ALWAYS_SHOW.test(clean) && !USEFUL.test(clean) }
}

export function diagnoseExit(code: number | null, recentLines: string[]): Diagnosis {
  const recent = recentLines.join('\n')

  // `quit` escrito en la consola de la app: sale con -1 como siempre, pero no
  // es un fallo.
  if (/Server Shutting Down \(quit\)/.test(recent)) {
    return {
      code: 'clean-exit',
      title: 'El servidor se ha cerrado',
      detail: 'Se cerró con normalidad, guardando el mapa (alguien mandó «quit» por la consola).'
    }
  }

  if (/Couldn't start server|Failed to bind|Address already in use|Couldn't Start Server/i.test(recent)) {
    return {
      code: 'port-in-use',
      title: 'El puerto ya está ocupado',
      detail:
        'Otro programa está usando alguno de los puertos del servidor (el de juego o los dos ' +
        'siguientes). Cambia el puerto en Configuración → Conexión o cierra lo que lo esté usando.',
      action: { kind: 'change-port' }
    }
  }

  if (/OutOfMemory|out of memory|Could not allocate memory/i.test(recent)) {
    return {
      code: 'out-of-memory',
      title: 'El equipo se ha quedado sin memoria',
      detail:
        'Rust es el más pesado de todos: un mapa mediano usa más de 4 GB solo arrancar. Cierra lo ' +
        'que puedas —incluidos otros servidores— o elige un mapa más pequeño en el próximo borrado.'
    }
  }

  if (/Oxide/i.test(recent) && /MissingMethodException|TypeLoadException|MissingFieldException/.test(recent)) {
    return {
      code: 'oxide-mismatch',
      title: 'Oxide no encaja con esta versión de Rust',
      detail:
        'El cargador de plugins es de otra versión del juego. Mira Configuración → Plugins: si ya ' +
        'ha salido la Oxide nueva se puede volver a poner, y si no, quitarlo deja el servidor como ' +
        'vino de Steam.'
    }
  }

  return {
    code: 'unknown-exit',
    title: 'El servidor se cerró inesperadamente',
    detail: `Código de salida ${code}. Mira las últimas líneas de la consola para ver qué pasó.`
  }
}

/** Para el servicio y las pruebas: dónde está cada cosa y cuánto se espera. */
export const rustPaths = {
  identityDir,
  pluginsDir: (id: string): string => join(serverDir(id), ...PLUGINS_DIR.split('/')),
  readyTimeoutMs: READY_TIMEOUT_MS,
  savedText: SAVED_TEXT,
  installedBuildId: (id: string): Promise<string | null> => installedBuildId(serverDir(id), RUST_APP_ID)
}

/**
 * Espera a que la carpeta deje de moverse. Es la misma comprobación que hacen
 * Zomboid y Enshrouded, por el mismo motivo: el aviso de guardado puede llegar
 * antes de que el último fichero termine de escribirse.
 */
async function waitUntilQuiet(dir: string, timeoutMs = 60_000): Promise<boolean> {
  const limite = Date.now() + timeoutMs
  let anterior = ''
  while (Date.now() < limite) {
    const foto = await folderFingerprint(dir)
    if (foto === anterior) return true
    anterior = foto
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
  return false
}

async function folderFingerprint(dir: string): Promise<string> {
  let files = 0
  let bytes = 0
  let newest = 0
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile()) continue
    const info = await stat(join(dir, entry.name)).catch(() => null)
    if (!info) continue
    files++
    bytes += info.size
    newest = Math.max(newest, info.mtimeMs)
  }
  return `${files}:${bytes}:${newest}`
}
