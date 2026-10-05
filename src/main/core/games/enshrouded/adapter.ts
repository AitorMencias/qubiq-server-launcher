import { access, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnosis, EnshroudedCreateRequest, EnshroudedManifest } from '@shared/types'
import {
  DEFAULT_ROLES,
  ENSHROUDED_APP_ID,
  ENSHROUDED_GAME_APP_ID,
  presetSettings,
  roleProblems,
  validWorldName,
  type EnshroudedData
} from '@shared/games/enshrouded/types'
import type { GameAdapter, LaunchSpec, LiveStatus, ParsedEvent } from '../types'
import { childPath, serverDir } from '../../paths'
import {
  appUpdate,
  checkAppUpdate,
  DEFAULT_BRANCH,
  ensureSteamCmd,
  installedBuildId
} from '../../tools/steamcmd'
import { requireBranch, steamVersions } from '../steamVersions'
import { isUdpPortInUse } from '../../net/network'
import { queryInfo } from '../../net/a2s'
import { steamRegistration } from '../../net/steamServers'
import { WORLDS_DIR, writeConfig } from './config'

/**
 * Enshrouded como juego del núcleo (fase 6 de la hoja de ruta multijuego).
 *
 * Por fuera se parece mucho a Valheim —se para con Ctrl+Break, no lee órdenes
 * y lo cuenta todo por su registro— pero por dentro es el más cómodo de los
 * juegos de Steam: un solo puerto UDP, toda la configuración en un JSON, y los
 * guardados ya salen dentro de la carpeta del servidor sin tener que pelearse
 * con ninguna carpeta del usuario.
 *
 * Lo medido contra el servidor real 0.9.0.0 que no es negociable
 * (ANALISIS.md §19.24):
 *
 * 1. **«Listo» es «Host_Online».** La línea es `[Session] finished transition
 *    from 'Lobby' to 'Host_Online'`, y llega en 2-4 s.
 * 2. **Ctrl+Break guarda y sale con código 0** en medio segundo. Pero antes de
 *    que el servidor esté listo **no hay manejador puesto**: la señal mata el
 *    proceso con código `0xC000013A`. Por eso se repite en vez de mandarla una
 *    sola vez.
 * 3. **El servidor escribe la IP pública del equipo** (`[online] Public
 *    ipv4: …`), igual que Valheim con crossplay. No se enseña.
 * 4. **Se anuncia siempre.** No hay `-public 0`: en cuanto arranca se registra
 *    en Steam. A cambio, la consulta de Steam contesta siempre y de ahí salen
 *    «¿responde?» y cuánta gente hay.
 * 5. **El fichero de configuración lo reescribe él**, y de ahí sale la regla de
 *    conservar los vetados (ver `config.ts`).
 */

/** Lo que tarda como mucho en quedar listo. Medido: 2 s con el mundo hecho. */
const READY_TIMEOUT_MS = 180_000

/** Plazo de gracia al parar. Medido: guarda y cierra en 0,5 s. */
const STOP_GRACE_MS = 90_000

/**
 * Cada cuánto se repite el Ctrl+Break.
 *
 * Mandarlo mientras el servidor arranca no lo para: lo mata (código
 * `0xC000013A`, comprobado). Repitiéndolo, en cuanto termina de cargar lo
 * atiende y guarda como debe.
 */
const STOP_RETRY_MS = 10_000

/** Lo que sale en la consola cuando el servidor termina de guardar. */
const SAVED_TEXT = 'Mundo guardado.'
const SAVED_PATTERN = /Mundo guardado/

/**
 * Cuánto se espera a que el servidor guarde.
 *
 * Medido: guarda **cada 5 minutos** (a los 303 s y a los 603 s de arrancar, en
 * un cuarto de hora de observación). Se espera algo más que eso.
 */
const SAVE_WAIT_MS = 6 * 60_000

export function worldsDirFor(id: string): string {
  return join(serverDir(id), WORLDS_DIR)
}

/** El nombre llega de la interfaz: `childPath` impide salir de la carpeta de mundos. */
export function worldDirFor(id: string, name: string): string {
  return childPath(worldsDirFor(id), name)
}

export function executablePath(id: string): string {
  return join(serverDir(id), 'enshrouded_server.exe')
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Una contraseña que nadie va a adivinar, para los roles del asistente. */
export function randomPassword(prefix: string): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789'
  let resto = ''
  for (let i = 0; i < 10; i++) {
    resto += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  }
  return `${prefix}-${resto}`
}

export const enshroudedAdapter: GameAdapter<EnshroudedManifest, EnshroudedCreateRequest> = {
  id: 'enshrouded',

  async prepareCreate(request, name) {
    const options = request.options
    const worldName = (options.worldName ?? '').trim() || name.trim()

    if (!validWorldName(worldName)) {
      throw new Error(
        'El nombre del mundo solo puede llevar letras, números, espacios, puntos y guiones.'
      )
    }

    // Las dos reglas de los roles las trata el servidor como error interno
    // («Only one user group can be without password»), así que se cortan aquí,
    // que es donde se pueden explicar.
    const problema = roleProblems(options.roles)
    if (problema) throw new Error(problema)

    const data: EnshroudedData = {
      worldName,
      preset: options.preset,
      // Se parte de lo que aplica el preajuste elegido, no de los valores de
      // Normal: así pasar a «A mi manera» no cambia la partida por sorpresa.
      settings: { ...presetSettings(options.preset), ...(options.settings ?? {}) },
      roles: options.roles.map((role) => ({ ...role })),
      tags: options.tags ?? [],
      enableTextChat: options.enableTextChat ?? true,
      enableVoiceChat: false,
      voiceChatMode: 'Proximity'
    }
    return data
  },

  async writeInitialFiles(manifest) {
    // El servidor crea el mundo en su primer arranque; lo que hace falta es que
    // `saveDirectory` apunte a algo que exista.
    await mkdir(worldDirFor(manifest.id, manifest.data.worldName), { recursive: true })
    await writeConfig(manifest)
  },

  async install(manifest, onProgress) {
    onProgress('steamcmd', null, 'Preparando SteamCMD')
    await ensureSteamCmd((detail) => onProgress('steamcmd', null, detail))

    onProgress('download', null, 'Descargando Enshrouded de Steam (unos 8,8 GB la primera vez)')
    const result = await appUpdate({
      appId: ENSHROUDED_APP_ID,
      installDir: serverDir(manifest.id),
      branch: manifest.data.branch ?? DEFAULT_BRANCH,
      onProgress: (progress, label) => {
        const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)
        const detail =
          progress.total > 0 ? `${label} · ${gb(progress.done)} de ${gb(progress.total)} GB` : label
        onProgress('download', progress.fraction, detail)
      }
    })

    // El fichero de configuración se vuelve a escribir después de instalar: una
    // reinstalación no puede dejar al servidor con el suyo de serie, que trae
    // contraseñas distintas y el puerto 15637.
    await writeConfig(manifest)

    onProgress('done', 1, 'Servidor listo')
    return { buildId: result.buildId ?? undefined, branch: result.branch }
  },

  async checkUpdate(manifest) {
    await ensureSteamCmd()
    const check = await checkAppUpdate(
      ENSHROUDED_APP_ID,
      serverDir(manifest.id),
      manifest.data.branch ?? DEFAULT_BRANCH
    )
    return { available: check.available, installed: check.installed, latest: check.latest }
  },

  listVersions(manifest) {
    return steamVersions(ENSHROUDED_APP_ID, serverDir(manifest.id), manifest.data.buildId)
  },

  async prepareVersionChange(manifest, versionId) {
    return {
      branch: await requireBranch(ENSHROUDED_APP_ID, versionId),
      // La de verdad se lee del servidor al arrancarlo.
      gameVersion: undefined
    }
  },

  async launch(manifest) {
    const command = executablePath(manifest.id)
    if (!(await exists(command))) {
      throw new Error(
        'Falta el ejecutable del servidor. Reinstálalo desde Configuración → Servidor.'
      )
    }

    // Toda la configuración va en el JSON, y el servidor lo reescribe: hay que
    // volver a dejarlo como dice el manifiesto en cada arranque.
    await mkdir(worldDirFor(manifest.id, manifest.data.worldName), { recursive: true })
    await writeConfig(manifest)

    return {
      command,
      args: [],
      cwd: serverDir(manifest.id)
    } satisfies LaunchSpec
  },

  /**
   * Parada limpia: Ctrl+Break. El servidor escribe «Trigger gameflow shutdown,
   * exit: Ctrl_Break», guarda («[server] Saved») y sale con código 0.
   */
  stop() {
    return { kind: 'ctrl-break', graceMs: STOP_GRACE_MS, retryEveryMs: STOP_RETRY_MS }
  },

  parseLine,
  diagnoseExit,

  /**
   * Cuánta gente hay dentro, por la consulta de Steam.
   *
   * El registro no lo dice de forma fiable y aquí no hay ni consola ni RCON,
   * pero el servidor **siempre** está publicado, así que el A2S contesta
   * siempre. Es exacto y no depende de que no cambie el formato del registro.
   */
  async poll(manifest) {
    try {
      const info = await queryInfo('127.0.0.1', manifest.port, { timeoutMs: 3_000 })
      return { playerCount: info.players } satisfies LiveStatus
    } catch {
      // Todavía no contesta (arrancando) o el puerto es de otro: no se dice
      // nada, que es distinto de decir que no hay nadie.
      return {}
    }
  },

  async backupEntries(manifest) {
    // Sin mundo no hay copia que valga: el servidor lo crea al arrancar.
    if (!(await exists(worldsDirFor(manifest.id)))) return []
    const entries = [WORLDS_DIR]
    // La configuración entra porque lleva los roles con sus contraseñas y la
    // lista de vetados: restaurar un mundo sin ellos dejaría entrar a quien se
    // había echado.
    if (await exists(join(serverDir(manifest.id), 'enshrouded_server.json'))) {
      entries.push('enshrouded_server.json')
    }
    return entries
  },

  /**
   * Qué se retira antes de restaurar.
   *
   * Solo la carpeta de mundos, que se sustituye entera: si no, un mundo que ya
   * no estaba en la copia se quedaría ahí mezclado con los restaurados.
   *
   * El `enshrouded_server.json` no hace falta retirarlo porque es un fichero
   * suelto y la copia lo pisa. Y sí entra en la restauración a propósito, por
   * los vetados: volver a un mundo de hace una semana sin ellos dejaría entrar
   * otra vez a quien se echó. El resto del fichero lo reescribe el siguiente
   * arranque desde el manifiesto, que es quien manda.
   */
  async restoreTargets(manifest) {
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
   * Enshrouded no tiene forma de pedirle que guarde ni de suspender el
   * guardado: no lee órdenes. Lo que sí hace es avisar cuando termina
   * («[server] Saved»), así que se espera a que pase un guardado.
   *
   * **Guarda cada 5 minutos**, medido dejándolo arrancado un cuarto de hora
   * (guardados a los 303 s y a los 603 s), así que el plazo da de sobra.
   *
   * Y después se espera a que la carpeta deje de moverse, que es una lección de
   * Project Zomboid: la línea de «guardado» llega antes de que los ficheros
   * terminen de escribirse, y copiar en ese momento da un `tar.exe: (null)` que
   * no explica nada. Si no llegara ningún guardado, esa misma comprobación deja
   * copiar lo que haya en disco —que será el último guardado— en vez de
   * quedarse sin copia; lo que nunca se copia es un mundo escribiéndose.
   */
  async holdSaves(manifest, supervisor) {
    if (!supervisor.isRunning) return true
    await supervisor.waitForLog(SAVED_PATTERN, SAVE_WAIT_MS)
    return waitUntilQuiet(worldDirFor(manifest.id, manifest.data.worldName))
  },

  /**
   * ¿Responde el servidor?
   *
   * Con el protocolo de verdad, el mismo que usa la lista del juego, y en su
   * único puerto. Aquí no hay el matiz de Valheim: como no se puede dejar de
   * publicar, el A2S contesta siempre que el servidor esté listo.
   */
  async ping(manifest) {
    const start = Date.now()
    try {
      const info = await queryInfo('127.0.0.1', manifest.port, { timeoutMs: 4_000 })
      return {
        ok: true,
        motd: info.name,
        versionName: info.version || manifest.data.gameVersion,
        playersOnline: info.players,
        playersMax: info.maxPlayers,
        latencyMs: Date.now() - start
      }
    } catch (err) {
      // Que el puerto esté abierto no es que se pueda entrar, y se dice así.
      if (await isUdpPortInUse(manifest.port)) {
        return {
          ok: false,
          error:
            'El servidor tiene su puerto abierto pero todavía no contesta. Suele ser que aún está ' +
            'cargando el mundo.'
        }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  /**
   * Comprobación desde internet.
   *
   * No hay ningún servicio que hable el protocolo de Enshrouded, pero el
   * servidor se da de alta en el servidor maestro de Valve nada más arrancar,
   * y eso sí se puede consultar sin clave.
   */
  async checkFromInternet(host, port) {
    const registration = await steamRegistration(host, ENSHROUDED_GAME_APP_ID, port)
    if (!registration.registered) {
      return {
        reachable: false,
        error:
          'Steam no tiene registrado ningún servidor de Enshrouded en tu dirección. Si acabas de ' +
          'arrancarlo, dale un minuto: el alta la hace el servidor hacia fuera y tarda un poco. La ' +
          'prueba de verdad es que entre alguien de otra red.'
      }
    }
    return { reachable: true }
  }
}

/**
 * Líneas del registro que le dicen algo al usuario.
 *
 * El servidor escribe cientos de líneas de motor por arranque (hilos, cachés,
 * histogramas de red al cerrar) que no significan nada para quien monta un
 * servidor. Se enseña lo que cuenta algo y se guarda todo para diagnosticar un
 * cierre inesperado, igual que en Satisfactory y Valheim.
 */
const USEFUL =
  /enshrouded_server\(|Config Parsed|Game Settings|Host_Online|Server connected to Steam|Server SteamId|not VAC Secure|Start Saving|\[server\] Saved|Trigger gameflow shutdown|Added peer|Removed peer|logged in with|Rejecting peer|maximal peer count|shroudtopia|Close Log file|Open Container|Close Container/i

/** Lo que no se esconde nunca: es justo lo que explica que algo no arranque. */
const ALWAYS_SHOW =
  /Fatal|Failed to bind|Address already in use|out of memory|Failed to connected to Steam|Lost connection to Steam|Could not create lobby|VCRUNTIME|MSVCP/i

export function parseLine(raw: string): ParsedEvent {
  const clean = raw.trim()

  // ⚠ LO PRIMERO DE TODO: el servidor escribe **la IP pública del equipo**
  // («[online] Public ipv4: 87.x.x.x»), porque es la que registra en Steam. No
  // tiene nada que hacer en una consola que se enseña y se copia y se pega; se
  // guarda para diagnosticar, pero sin la dirección. Va antes que nada para que
  // no se cuele por ninguna de las reglas de abajo.
  if (/\d{1,3}(\.\d{1,3}){3}/.test(clean) && !/127\.0\.0\.1|0\.0\.0\.0/.test(clean)) {
    return {
      level: 'info',
      // La dirección se borra incluso del texto que se guarda: lo que no está
      // no se puede enseñar por accidente más adelante.
      text: clean.replace(/\d{1,3}(\.\d{1,3}){3}(:\d+)?/g, '<dirección>'),
      hidden: true
    }
  }

  // Listo de verdad: el mundo está cargado y el servidor acepta jugadores.
  // Medido: llega a los 2-4 s del arranque.
  if (/finished transition from 'Lobby' to 'Host_Online'/.test(clean)) {
    return { level: 'info', text: 'Mundo cargado. El servidor ya acepta jugadores.', ready: true }
  }

  // El preajuste que ha aplicado de verdad. Es LA línea de este juego: si el
  // usuario tocó ajustes con un preajuste puesto, aquí se ve que no se aplican.
  const ajustes = /\[server\] Game Settings '(\w+)'/.exec(clean)
  if (ajustes) {
    return {
      level: 'info',
      text: `Dificultad en uso: ${ajustes[1]}.`
    }
  }

  if (/\[server\] Start Saving/.test(clean)) {
    return { level: 'info', text: 'Guardando el mundo…' }
  }

  if (/\[server\] Saved/.test(clean)) {
    return { level: 'info', text: SAVED_TEXT, saved: true }
  }

  if (/Trigger gameflow shutdown, exit: Ctrl_Break/.test(clean)) {
    return { level: 'info', text: 'Cerrando el servidor y guardando el mundo…' }
  }

  // Quién entra y quién sale. ⚠ Estas dos no están grabadas contra jugadores
  // reales (hacen falta dos clientes del juego): se reconocen por la forma que
  // tienen en el ejecutable, y **no deciden nada**, porque cuánta gente hay se
  // le pregunta al servidor por la consulta de Steam (`poll`).
  const entra = /\[online\] Added peer (\S+)/.exec(clean)
  if (entra) return { level: 'info', text: 'Alguien ha entrado en el servidor.' }

  const sale = /\[online\] Removed peer (\S+)/.exec(clean)
  if (sale) return { level: 'info', text: 'Alguien ha salido del servidor.' }

  // ⚠ Se enseña, pero **no se apunta como jugador** (`playerJoined`): quién
  // está dentro se le pregunta al servidor por su consulta de Steam, que da el
  // número exacto. Mezclar las dos fuentes daría una lista que se queda mal en
  // cuanto se pierde una línea, que es justo lo que se evitó en Zomboid.
  const permisos = /\[server\] Player '(.+?)' logged in with Permissions/.exec(clean)
  if (permisos) return { level: 'info', text: `${permisos[1]} ha entrado.` }

  if (/Rejecting peer .* with mismatching build version/.test(clean)) {
    return {
      level: 'warn',
      text:
        'Alguien ha intentado entrar con una versión del juego distinta a la del servidor. Tiene ' +
        'que actualizar Enshrouded en Steam, o hay que actualizar el servidor.'
    }
  }

  if (/Couldn't add peer, maximal peer count attained/.test(clean)) {
    return {
      level: 'warn',
      text: 'El servidor está lleno: alguien ha intentado entrar y no cabía.'
    }
  }

  // El cargador de mods habla por la consola, al revés que BepInEx en Valheim.
  const cargador = /^\[shroudtopia\]\[(\w+)\]\s*(.+)$/.exec(clean)
  if (cargador) return parseLoaderLine(cargador[1]!, cargador[2]!)

  if (/Lost connection to Steam|Server lost connection to Steam/.test(clean)) {
    return {
      level: 'warn',
      text:
        'El servidor ha perdido la conexión con Steam. Mientras no vuelva, nadie de fuera lo ' +
        'encontrará en la lista del juego.'
    }
  }

  const level: ParsedEvent['level'] = /^\[E |Fatal|error:/i.test(clean)
    ? 'error'
    : /^\[W |warning/i.test(clean)
      ? 'warn'
      : 'info'

  return { level, text: clean, hidden: !ALWAYS_SHOW.test(clean) && !USEFUL.test(clean) }
}

/** Lo que dice Shroudtopia, traducido. Es lo único que cuenta de los mods. */
function parseLoaderLine(level: string, text: string): ParsedEvent {
  const registrado = /^Registered mod: (.+)$/.exec(text)
  if (registrado) return { level: 'info', text: `Mod encontrado: ${registrado[1]}` }

  const cargado = /^Loading mod: (.+)$/.exec(text)
  if (cargado) return { level: 'info', text: `Cargando el mod ${cargado[1]}…` }

  const activo = /^Activating: (.+)$/.exec(text)
  if (activo) return { level: 'info', text: `Mod ${activo[1]} en marcha.` }

  // El fallo típico de este cargador: se engancha a direcciones de memoria del
  // juego, así que una actualización de Enshrouded puede dejar un mod a medias
  // sin tumbar el servidor. Sin esta línea no se notaría.
  const noEncaja = /^\((.+?)\) class (\w+) not found/.exec(text)
  if (noEncaja) {
    return {
      level: 'warn',
      text:
        `El mod ${noEncaja[1]} no encaja con esta versión de Enshrouded y parte de lo que hace no ` +
        'va a funcionar. Busca si su autor ha publicado una versión nueva.'
    }
  }

  if (/^Configuration loaded/.test(text)) {
    return { level: 'info', text: 'Cargador de mods Shroudtopia en marcha.' }
  }

  // El resto del cargador es detalle interno (hilos, retardos, direcciones).
  return { level: level === 'ERRO' ? 'error' : 'info', text: `Mods: ${text}`, hidden: level === 'DEBG' }
}

export function diagnoseExit(code: number | null, recentLines: string[]): Diagnosis {
  const recent = recentLines.join('\n')

  // 0xC000013A: el proceso murió por un Ctrl+Break que llegó antes de que el
  // servidor tuviera puesto su manejador, o sea, mientras arrancaba. Medido.
  if (code === 3221225786) {
    return {
      code: 'stopped-while-starting',
      title: 'Se paró mientras arrancaba',
      detail:
        'La orden de cierre llegó antes de que el servidor terminara de cargar el mundo, así que ' +
        'no le dio tiempo a guardar. Si acababas de arrancarlo no se pierde nada; si llevaba rato ' +
        'jugándose, restaura la última copia de seguridad.'
    }
  }

  if (/Failed to bind|Address already in use|socket.*in use/i.test(recent)) {
    return {
      code: 'port-in-use',
      title: 'El puerto ya está ocupado',
      detail:
        'Otro programa está usando el puerto del servidor. Cambia el puerto en Configuración → ' +
        'Conexión o cierra lo que lo esté usando.',
      action: { kind: 'change-port' }
    }
  }

  if (/VCRUNTIME|MSVCP|api-ms-win/i.test(recent)) {
    return {
      code: 'missing-vcredist',
      title: 'Falta un componente de Windows',
      detail:
        'Enshrouded necesita Visual C++ Redistributable de Microsoft, y no está instalado. Se ' +
        'descarga gratis de la web de Microsoft; después, vuelve a arrancar el servidor.'
    }
  }

  if (/out of memory|Failed to allocate|bad_alloc/i.test(recent)) {
    return {
      code: 'out-of-memory',
      title: 'El equipo se ha quedado sin memoria',
      detail:
        'Enshrouded pide bastante: 6 GB libres como mínimo y 12 para ir cómodo. Cierra lo que ' +
        'puedas —incluidos otros servidores— y vuelve a arrancarlo.'
    }
  }

  if (/Failed to connected to Steam|Server failed to connected to Steam/i.test(recent)) {
    return {
      code: 'steam-unreachable',
      title: 'No ha podido conectar con Steam',
      detail:
        'El servidor de Enshrouded necesita hablar con Steam para dejarse encontrar. Comprueba la ' +
        'conexión a internet y que el cortafuegos no lo esté bloqueando.'
    }
  }

  return {
    code: 'unknown-exit',
    title: 'El servidor se cerró inesperadamente',
    detail: `Código de salida ${code}. Mira las últimas líneas de la consola para ver qué pasó.`
  }
}

/** Para el servicio: dónde está cada cosa y cuánto se espera a que arranque. */
export const enshroudedPaths = {
  worldsDir: worldsDirFor,
  worldDir: worldDirFor,
  readyTimeoutMs: READY_TIMEOUT_MS,
  installedBuildId: (id: string): Promise<string | null> =>
    installedBuildId(serverDir(id), ENSHROUDED_APP_ID)
}

/** Los roles de serie, cada uno con su contraseña propia recién sorteada. */
export function defaultRoles(): EnshroudedData['roles'] {
  return DEFAULT_ROLES.map((role) => ({
    ...role,
    password: randomPassword(role.name.toLowerCase())
  }))
}

/**
 * Espera a que la carpeta del mundo deje de moverse.
 *
 * Copiar mientras el servidor escribe da un `tar.exe: (null)` que no explica
 * nada, porque los ficheros cambian de tamaño mientras se leen. Es la misma
 * comprobación que hace Project Zomboid, por el mismo motivo.
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
  // Si en un minuto no se ha estado quieta, algo raro pasa: vale más quedarse
  // sin copia que guardar un mundo a medio escribir.
  return false
}

/** Cuántos ficheros, cuánto ocupan y cuál se tocó el último. */
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
