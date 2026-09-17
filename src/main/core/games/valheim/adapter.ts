import { access, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnosis, ValheimCreateRequest, ValheimManifest } from '@shared/types'
import {
  DEFAULT_BACKUPS,
  DEFAULT_SAVE_INTERVAL_SECONDS,
  MIN_SAVE_INTERVAL_SECONDS,
  VALHEIM_APP_ID,
  VALHEIM_GAME_APP_ID,
  crossplayEnabled,
  modifierArgs,
  queryPortFor,
  type ValheimData
} from '@shared/games/valheim/types'
import type { GameAdapter, LaunchSpec, ParsedEvent } from '../types'
import { serverDir } from '../../paths'
import { appUpdate, checkAppUpdate, ensureSteamCmd, installedBuildId } from '../../tools/steamcmd'
import { isUdpPortInUse } from '../../net/network'
import { queryInfo } from '../../net/a2s'
import { steamRegistration } from '../../net/steamServers'

/**
 * Valheim como juego del núcleo (fase 3 de la hoja de ruta multijuego).
 *
 * Es el juego más sencillo de configurar de todos y el que peor se deja
 * preguntar. Todo lo que se puede decidir va en la línea de órdenes al
 * arrancar: no hay fichero de configuración, ni consola que lea comandos, ni
 * API. Lo que el servidor cuenta, lo cuenta por su registro.
 *
 * Cuatro cosas comprobadas contra el servidor real que no son negociables
 * (ANALISIS.md §19.16):
 *
 * 1. **Se para con Ctrl+Break, no con Ctrl+C** (fase 1), y no antes de que el
 *    mundo esté cargado: durante la generación la señal se ignora.
 * 2. **`-savedir` es obligatorio.** Sin él, el servidor escribe los mundos en
 *    `%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim`, junto a las partidas
 *    de un jugador del usuario. Es la misma trampa que Project Zomboid y que
 *    Satisfactory.
 * 3. **Las reglas de sí/no no van por `-modifier`, sino por `-setkey`.** El
 *    servidor rechaza `-modifier nobuildcost true` sin hacer nada más que una
 *    línea en el registro que nadie lee.
 * 4. **Con `-public 0` el servidor no contesta a las consultas de Steam**, ni
 *    siquiera desde el propio equipo: el puerto de consulta está abierto pero
 *    calla. Por eso «responde» se comprueba de otra forma cuando el servidor no
 *    está publicado.
 * 5. **Con crossplay cambia la línea de «listo»**: dice «Opened PlayFab server»
 *    y la de Steam no llega nunca. Y escribe la IP pública del usuario en el
 *    registro, que no se enseña.
 */

/** Carpeta de datos del servidor dentro de la instancia (relativa a `server/`). */
const SAVE_DIR = 'datos'

/** Dentro de ella, los mundos. El nombre lo pone el juego. */
const WORLDS_DIR = `${SAVE_DIR}/worlds_local`

/** Lo que tarda como mucho en generar un mundo nuevo y quedar listo. */
const READY_TIMEOUT_MS = 300_000

/**
 * Plazo de gracia al parar. Generoso a propósito: un mundo grande tarda en
 * volcarse, y matar el proceso es justo lo que no se puede hacer aquí.
 */
const STOP_GRACE_MS = 120_000

/**
 * Cada cuánto se repite el Ctrl+Break mientras no se cierre.
 *
 * Si el usuario pulsa Parar mientras el mundo se está generando, la señal se
 * ignora (fase 1) y sin repetirla el servidor acabaría muriendo a la fuerza
 * pasado el plazo. Repitiéndola, en cuanto termina de cargar la atiende.
 */
const STOP_RETRY_MS = 15_000

/**
 * Lo que sale en la consola cuando el servidor termina de guardar el mundo.
 *
 * ⚠ La copia en caliente espera a ESTE texto, no a la línea original del juego
 * («World save (5/5) done»): `waitForLog` mira lo que se ha enseñado, que ya
 * viene traducido por `parseLine`. Por eso la constante la comparten los dos.
 */
const SAVED_TEXT = 'Mundo guardado.'
const SAVED_PATTERN = /Mundo guardado/

export function saveDirFor(id: string): string {
  return join(serverDir(id), SAVE_DIR)
}

export function worldsDirFor(id: string): string {
  return join(serverDir(id), WORLDS_DIR)
}

export function executablePath(id: string): string {
  return join(serverDir(id), 'valheim_server.exe')
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * La línea de órdenes completa. Es toda la configuración del servidor: lo que
 * no vaya aquí, no existe.
 */
export function launchArgs(manifest: ValheimManifest): string[] {
  const { data } = manifest
  const args = [
    '-nographics',
    '-batchmode',
    '-name',
    manifest.name,
    '-port',
    String(manifest.port),
    '-world',
    data.worldName,
    '-public',
    data.listed ? '1' : '0',
    // Sin esto los mundos se van a la carpeta del juego del usuario.
    '-savedir',
    saveDirFor(manifest.id),
    '-saveinterval',
    String(Math.max(data.saveIntervalSeconds, MIN_SAVE_INTERVAL_SECONDS)),
    '-backups',
    String(Math.max(data.backups, 0))
  ]

  // Una contraseña vacía no se manda: `-password ""` haría que el servidor se
  // quejara en vez de quedarse sin contraseña.
  if (data.password.length > 0) args.push('-password', data.password)

  // El crossplay va con la forma de exponer el servidor, no con un ajuste
  // suyo: es la opción de «desde fuera sin tocar el router».
  if (crossplayEnabled(manifest.exposure)) args.push('-crossplay')

  // `default` es «lo que traiga el mundo»: no se manda, para no pisar lo que ya
  // tuviera un mundo creado antes.
  if (data.preset !== 'default') args.push('-preset', data.preset)

  args.push(...modifierArgs(data.modifiers))
  for (const key of data.globalKeys) args.push('-setkey', key)

  return args
}

export const valheimAdapter: GameAdapter<ValheimManifest, ValheimCreateRequest> = {
  id: 'valheim',

  async prepareCreate(request, name) {
    const options = request.options
    const worldName = (options.worldName ?? '').trim() || name.trim()

    // El nombre del mundo es el de una carpeta y el de un fichero: si lleva
    // algo raro, el servidor arranca y no guarda, que es lo peor que puede
    // pasar. Se corta aquí, antes de crear nada.
    if (!/^[\w áéíóúñÁÉÍÓÚÑ.-]{1,40}$/.test(worldName)) {
      throw new Error(
        'El nombre del mundo solo puede llevar letras, números, espacios, puntos y guiones.'
      )
    }

    // Que la contraseña esté dentro del nombre del servidor es un aviso del
    // propio juego: quien vea la lista de servidores la leería.
    if (
      options.password.length > 0 &&
      name.toLowerCase().includes(options.password.toLowerCase())
    ) {
      throw new Error(
        'La contraseña no puede estar dentro del nombre del servidor: cualquiera que lo vea la sabría.'
      )
    }

    const data: ValheimData = {
      password: options.password,
      worldName,
      preset: options.preset,
      modifiers: options.modifiers ?? {},
      globalKeys: options.globalKeys ?? [],
      listed: options.listed ?? false,
      saveIntervalSeconds: DEFAULT_SAVE_INTERVAL_SECONDS,
      backups: DEFAULT_BACKUPS
    }
    return data
  },

  async writeInitialFiles(manifest) {
    // El servidor se crea sus listas y su carpeta de mundos al arrancar; lo
    // único que hace falta es que `-savedir` apunte a algo que exista.
    await mkdir(saveDirFor(manifest.id), { recursive: true })
  },

  async install(manifest, onProgress) {
    onProgress('steamcmd', null, 'Preparando SteamCMD')
    await ensureSteamCmd((detail) => onProgress('steamcmd', null, detail))

    onProgress('download', null, 'Descargando Valheim de Steam (unos 2 GB la primera vez)')
    const result = await appUpdate({
      appId: VALHEIM_APP_ID,
      installDir: serverDir(manifest.id),
      onProgress: (progress, label) => {
        const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)
        const detail =
          progress.total > 0 ? `${label} · ${gb(progress.done)} de ${gb(progress.total)} GB` : label
        onProgress('download', progress.fraction, detail)
      }
    })

    // El mundo no se genera aquí: lo crea el propio servidor en su primer
    // arranque, y tarda medio minuto largo. Arrancarlo ahora solo para eso
    // duplicaría la espera sin dar nada a cambio (a diferencia de Satisfactory,
    // donde el primer arranque es lo que deja el servidor reclamado).
    onProgress('done', 1, 'Servidor listo')
    return { buildId: result.buildId ?? undefined }
  },

  async checkUpdate(manifest) {
    const check = await checkAppUpdate(VALHEIM_APP_ID, serverDir(manifest.id))
    return { available: check.available, installed: check.installed, latest: check.latest }
  },

  async launch(manifest) {
    const command = executablePath(manifest.id)
    if (!(await exists(command))) {
      throw new Error(
        'Falta el ejecutable del servidor. Reinstálalo desde Configuración → Servidor.'
      )
    }

    // El de consulta es el siguiente al de juego y no se puede mover: si está
    // pillado, el servidor arranca pero nadie lo encuentra.
    const query = queryPortFor(manifest.port)
    if (await isUdpPortInUse(query)) {
      throw new Error(
        `El puerto ${query}, que Valheim usa siempre para que le pregunten por el servidor, ` +
          `está ocupado. Es el siguiente al del juego (${manifest.port}) y no se puede cambiar por ` +
          'separado: elige otro puerto de juego en Configuración → Conexión.'
      )
    }

    return {
      command,
      args: launchArgs(manifest),
      cwd: serverDir(manifest.id),
      // Sin esto el servidor no arranca: Steam necesita saber de qué juego es,
      // y el identificador es el del JUEGO (892970), no el del servidor.
      env: { SteamAppId: String(VALHEIM_GAME_APP_ID) }
    } satisfies LaunchSpec
  },

  /**
   * Parada limpia: Ctrl+Break. El servidor ejecuta su cierre normal, guarda el
   * mundo («World save (5/5) done») y sale con código 0 en unos 3 s.
   */
  stop() {
    return { kind: 'ctrl-break', graceMs: STOP_GRACE_MS, retryEveryMs: STOP_RETRY_MS }
  },

  parseLine,
  diagnoseExit,

  async backupEntries(manifest) {
    // Sin mundo no hay copia que valga: el servidor lo crea en su primer
    // arranque, y guardar solo las listas vacías llenaría el historial de ruido.
    if (!(await exists(worldsDirFor(manifest.id)))) return []
    const entries = [WORLDS_DIR]
    // Las listas son parte de cómo está montado el servidor: se pierden igual.
    for (const file of ['adminlist.txt', 'bannedlist.txt', 'permittedlist.txt']) {
      if (await exists(join(saveDirFor(manifest.id), file))) entries.push(`${SAVE_DIR}/${file}`)
    }
    return entries
  },

  async restoreTargets(manifest) {
    // Se sustituyen los mundos; las listas de moderación se respetan, porque
    // restaurar una partida no debería readmitir a quien se echó.
    return (await exists(worldsDirFor(manifest.id))) ? [WORLDS_DIR] : []
  },

  backupMeta(manifest) {
    return {
      version: manifest.data.gameVersion ?? 'desconocida',
      variant: manifest.data.worldName
    }
  },

  /**
   * Copia en caliente.
   *
   * Valheim no tiene forma de pedirle que guarde ni de suspender el guardado
   * automático: no lee órdenes. Lo que sí hace es escribir el mundo de un tirón
   * y avisar cuando termina («World save (5/5) done»), así que se espera a que
   * pase un guardado y se copia justo después.
   *
   * Si no llega ninguno a tiempo se devuelve false y la copia se cancela: es
   * preferible quedarse sin copia a guardar un mundo a medio escribir.
   */
  async holdSaves(manifest, supervisor) {
    const intervalMs = Math.max(manifest.data.saveIntervalSeconds, MIN_SAVE_INTERVAL_SECONDS) * 1000
    // Un poco más de lo que tarda en tocarle guardar, para no fallar por unos
    // segundos cuando la copia programada cae justo antes de un guardado.
    return supervisor.waitForLog(SAVED_PATTERN, intervalMs + 30_000)
  },

  /**
   * ¿Responde el servidor?
   *
   * Con `-public 1` se le pregunta con el protocolo de verdad, el mismo que usa
   * el navegador de servidores de Steam, y **solo en el puerto de consulta**:
   * en el de juego no contesta ni estando publicado (grabado en `a2s.json`).
   *
   * Con `-public 0` no contesta en ninguno, así que lo único honesto que se
   * puede mirar es si tiene su puerto de juego abierto: no prueba que se pueda
   * entrar, y por eso se dice así en la propia respuesta.
   */
  async ping(manifest) {
    const start = Date.now()

    if (manifest.data.listed) {
      try {
        const info = await queryInfo('127.0.0.1', queryPortFor(manifest.port), { timeoutMs: 4_000 })
        return {
          ok: true,
          motd: info.name,
          // ⚠ `version` dice «1.0.0.0» siempre: la versión de verdad viaja en
          // las palabras clave (`g=1.0.12,n=40`). Comprobado con el servidor
          // real publicado.
          versionName: versionFromKeywords(info.keywords) ?? manifest.data.gameVersion,
          playersOnline: info.players,
          playersMax: info.maxPlayers,
          latencyMs: Date.now() - start
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

    const listening = await isUdpPortInUse(manifest.port)
    return listening
      ? {
          ok: true,
          motd: manifest.name,
          versionName: manifest.data.gameVersion,
          latencyMs: Date.now() - start
        }
      : { ok: false, error: 'El servidor no tiene abierto su puerto de juego.' }
  },

  /**
   * Comprobación desde internet.
   *
   * No hay ningún servicio que sepa hablar el protocolo de Valheim, pero un
   * servidor publicado se da de alta en el servidor maestro de Valve, y eso sí
   * se puede consultar. Solo vale para los publicados: uno con `-public 0` no
   * sale nunca, y entonces se dice eso en vez de dar por hecho que falla.
   */
  async checkFromInternet(host, port) {
    const registration = await steamRegistration(host, VALHEIM_GAME_APP_ID, port)
    if (!registration.registered) {
      return {
        reachable: false,
        error:
          'Steam no tiene registrado ningún servidor de Valheim en tu dirección. Si no has marcado ' +
          '«aparecer en la lista de Steam», es lo normal: esa comprobación solo funciona con los ' +
          'servidores publicados. La prueba de verdad es que entre alguien de otra red.'
      }
    }
    return { reachable: true }
  }
}

/**
 * Líneas del registro que le dicen algo al usuario.
 *
 * El servidor escribe cientos de líneas de motor de Unity por arranque
 * (memoria, shaders, assets) y otras tantas de generación del mundo («Failed to
 * place all GoblinHut02»), que suenan a fallo y no lo son. Se enseña lo que
 * cuenta algo y se guarda todo para diagnosticar un cierre inesperado, igual
 * que en Satisfactory.
 */
const USEFUL =
  /Valheim version|Setting world modifier|Could not parse|Failed to parse key|Opened (Steam|PlayFab) server|Registering lobby|Game server connected|Load world|Get create world|join code|Got connection|Closing socket|World save|OnApplicationQuit|Shutting down|Steam game server|Authentication|DungeonDB Start|Zonesystem Start|Logged in PlayFab/i

/** Lo que no se esconde nunca: es justo lo que explica que algo no arranque. */
const ALWAYS_SHOW =
  /Exception|Fatal|Failed to bind|out of memory|Could not connect|PlayFab.*failed|VC\+\+ Redistributables/i

export function parseLine(raw: string): ParsedEvent {
  // El servidor pone delante la fecha y la hora en formato americano. Se quita
  // para no repetir la hora, que la consola ya pone.
  const clean = raw.replace(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}:\s*/, '').trim()

  const level: ParsedEvent['level'] = /Exception|Fatal|error:/i.test(clean)
    ? 'error'
    : /Could not parse|Failed to parse|warning/i.test(clean)
      ? 'warn'
      : 'info'

  // ⚠ LO PRIMERO DE TODO: con crossplay el servidor escribe **la IP pública del
  // usuario** en varias líneas, porque es la que registra en PlayFab. No tiene
  // nada que hacer en una consola que se enseña y se copia y pega; se guarda
  // para diagnosticar, pero no se enseña. Va antes que nada para que no se
  // cuele por ninguna de las reglas de abajo.
  if (/\d{1,3}(\.\d{1,3}){3}:\d+/.test(clean) && !/127\.0\.0\.1|0\.0\.0\.0/.test(clean)) {
    // Una de esas líneas trae también el código de crossplay («…with join code
    // 835901 and IP …»), así que se aprovecha antes de esconderla: si la que lo
    // anuncia se perdiera, esta lo salva.
    const conCodigo = /join code (\d{4,8})/i.exec(clean)
    return {
      level: 'info',
      // La dirección se borra incluso del texto que se guarda: lo que no está
      // no se puede enseñar por accidente más adelante.
      text: clean.replace(/\d{1,3}(\.\d{1,3}){3}:\d+/g, '<dirección>'),
      hidden: true,
      ...(conCodigo ? { joinCode: conCodigo[1] } : {})
    }
  }

  // Listo de verdad: el mundo está cargado y el servidor acepta conexiones.
  //
  // ⚠ Con crossplay **no dice «Opened Steam server»**, sino «Opened PlayFab
  // server»: comprobado arrancando el servidor real con `-crossplay` y
  // esperando tres minutos a una línea que no llega nunca. Buscando solo la de
  // Steam, un servidor con crossplay se quedaría «Arrancando» para siempre.
  if (/Opened (Steam|PlayFab) server/i.test(clean)) {
    return { level: 'info', text: 'Mundo cargado. El servidor ya acepta jugadores.', ready: true }
  }

  // El código de crossplay: es la única forma de entrar cuando no hay puertos
  // abiertos, así que se saca del registro y se enseña en la pantalla.
  const code = /join code (\d{4,8})/i.exec(clean)
  if (code) {
    return {
      level: 'info',
      text: `Código para entrar con crossplay: ${code[1]}`,
      joinCode: code[1]
    }
  }

  // La misma línea, antes de que haya código: el juego la escribe con el hueco
  // vacío («that has join code , now 0 player(s)»). No dice nada todavía.
  if (/join code\s*,/i.test(clean)) {
    return { level: 'info', text: clean, hidden: true }
  }

  // Quién está dentro. Valheim solo da el identificador de Steam, no el nombre
  // del personaje, pero es justo lo que hace falta para las listas de
  // moderación, que van por identificador.
  const joined = /Got connection SteamID (\d+)/i.exec(clean)
  if (joined) {
    return {
      level: 'info',
      text: `Alguien ha entrado (Steam ${joined[1]})`,
      playerJoined: joined[1]
    }
  }

  const left = /Closing socket (\d+)/i.exec(clean)
  if (left) {
    return { level: 'info', text: `Alguien se ha ido (Steam ${left[1]})`, playerLeft: left[1] }
  }

  if (/World save \(5\/5\) done/i.test(clean)) {
    return { level: 'info', text: SAVED_TEXT }
  }

  if (/Could not parse '(.+?)' as a world modifier preset/i.test(clean)) {
    return {
      level: 'warn',
      text: `El juego no ha entendido la dificultad elegida (${clean}). Se queda con la que tuviera el mundo.`
    }
  }

  if (/VC\+\+ Redistributables/i.test(clean)) {
    return {
      level: 'error',
      text:
        'A Windows le falta el componente Visual C++ de Microsoft, que Valheim necesita para el ' +
        'crossplay. Instálalo desde la web de Microsoft y vuelve a arrancar el servidor.',
      diagnosis: {
        code: 'missing-vcredist',
        title: 'Falta un componente de Windows',
        detail:
          'Valheim necesita Visual C++ Redistributable de Microsoft para el crossplay. Se descarga ' +
          'gratis de la web de Microsoft; después, vuelve a arrancar el servidor.'
      }
    }
  }

  return { level, text: clean, hidden: !ALWAYS_SHOW.test(clean) && !USEFUL.test(clean) }
}

export function diagnoseExit(code: number | null, recentLines: string[]): Diagnosis {
  const recent = recentLines.join('\n')

  if (/Failed to bind|Address already in use|socket.*in use/i.test(recent)) {
    return {
      code: 'port-in-use',
      title: 'El puerto ya está ocupado',
      detail:
        'Otro programa está usando el puerto del servidor, o el siguiente, que Valheim usa para ' +
        'las consultas. Cambia el puerto en Configuración → Conexión o cierra lo que lo esté usando.',
      action: { kind: 'change-port' }
    }
  }

  if (/VC\+\+ Redistributables|PlayFabParty/i.test(recent)) {
    return {
      code: 'missing-vcredist',
      title: 'Falta un componente de Windows',
      detail:
        'Valheim necesita Visual C++ Redistributable de Microsoft para el crossplay, y no está ' +
        'instalado. Se descarga gratis de la web de Microsoft. Mientras tanto, puedes desactivar ' +
        'el crossplay en Configuración → Ajustes.'
    }
  }

  if (/out of memory|Failed to allocate/i.test(recent)) {
    return {
      code: 'out-of-memory',
      title: 'El equipo se ha quedado sin memoria',
      detail:
        'Valheim pide poco, pero si tienes otros servidores o el propio juego abiertos puede no ' +
        'quedar sitio. Cierra algo y vuelve a arrancarlo.'
    }
  }

  if (/Exception|Fatal/i.test(recent)) {
    return {
      code: 'game-crash',
      title: 'El servidor ha fallado',
      detail:
        'El juego se ha cerrado por un error interno. Si se repite, reinstálalo desde ' +
        'Configuración → Servidor: comprueba los ficheros sin volver a descargarlo todo.'
    }
  }

  return {
    code: 'unknown-exit',
    title: 'El servidor se cerró inesperadamente',
    detail: `Código de salida ${code}. Mira las últimas líneas de la consola para ver qué pasó.`
  }
}

/** Para el servicio: dónde está cada cosa y cuánto se espera a que arranque. */
export const valheimPaths = {
  saveDir: saveDirFor,
  worldsDir: worldsDirFor,
  readyTimeoutMs: READY_TIMEOUT_MS,
  installedBuildId: (id: string): Promise<string | null> =>
    installedBuildId(serverDir(id), VALHEIM_APP_ID)
}

/**
 * La versión del juego que anuncia el servidor en su consulta de Steam.
 *
 * El campo `version` del protocolo no sirve (siempre «1.0.0.0»); lo bueno está
 * en las palabras clave: `g=1.0.12,n=40` es la versión del juego y la de red.
 */
export function versionFromKeywords(keywords: string | undefined): string | undefined {
  return /(?:^|,)g=([^,]+)/.exec(keywords ?? '')?.[1]
}

/** Tamaño de una carpeta de mundo, sumando todos sus ficheros. */
export async function worldSize(dir: string): Promise<{ bytes: number; savedAt: string | null }> {
  let bytes = 0
  let newest = 0
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const info = await stat(join(dir, entry.name)).catch(() => null)
    if (!info) continue
    bytes += info.size
    newest = Math.max(newest, info.mtimeMs)
  }
  return { bytes, savedAt: newest > 0 ? new Date(newest).toISOString() : null }
}
