import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnosis, ZomboidCreateRequest, ZomboidManifest } from '@shared/types'
import {
  DEFAULT_MAX_PLAYERS,
  DEFAULT_MEMORY_MB,
  DEFAULT_RCON_PORT,
  FIRST_START_TIMEOUT_MS,
  MAX_MEMORY_MB,
  MAX_PLAYERS,
  MIN_MEMORY_MB,
  MIN_PASSWORD_LENGTH,
  SERVER_NAME,
  STOP_GRACE_MS,
  mapSetting,
  modsSetting,
  ZOMBOID_APP_ID,
  presetInfo,
  udpPortFor,
  type ZomboidData
} from '@shared/games/zomboid/types'
import type { GameAdapter, LaunchSpec, ParsedEvent, ProgressFn } from '../types'
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
import { rconCommand } from '../../net/rcon'
import { KeyValueFile } from '../../formats/keyValue'
import { installedEntries } from './mods'
import {
  DATA_DIR,
  exists,
  gameDirFor,
  iniPathFor,
  databasePathFor,
  javaPathFor,
  homeDirFor,
  modsDirFor,
  presetPathFor,
  sandboxPathFor,
  savePathFor,
  serverFilesDirFor,
  zomboidDirFor
} from './paths'
import { parseEditable } from '../../formats/editable'

/**
 * Project Zomboid como juego del núcleo (fase 5 de la hoja de ruta multijuego).
 *
 * Es el juego más parecido a Minecraft de todos: lee órdenes por su entrada
 * estándar, tiene RCON, guarda su configuración en ficheros de texto y su
 * memoria es la de una JVM. Por eso reutiliza casi toda la gestión que ya
 * existía, y por eso es el primero desde Minecraft con consola, jugadores por
 * nombre y moderación de verdad a la vez.
 *
 * Lo comprobado contra el servidor real (Build 42.20, `pz-fase5.mjs` del
 * material de desarrollo) que no es negociable (ANALISIS.md §19.22):
 *
 * 1. **Se aísla con `-Duser.home` y `-cachedir`.** Por defecto escribe en
 *    `%USERPROFILE%\\Zomboid`, que es la carpeta del juego del usuario: sus
 *    partidas de un jugador. Es la misma trampa que Valheim y Satisfactory.
 * 2. **Sin Steam (`-Dzomboid.steam=0`) no se anuncia en ningún sitio**, que es
 *    como arranca la app salvo que se le diga lo contrario. El propio `.ini`
 *    avisa de que con Steam el servidor sale en su navegador aunque
 *    `Public=false`.
 * 3. **Sin Steam el servidor no contesta al A2S** en ningún puerto. Lo que sí
 *    contesta siempre es RCON, así que por ahí se pregunta quién está dentro.
 * 4. **Sin contraseña de RCON no hay RCON**: con la de serie (vacía) el puerto
 *    ni se abre. La app genera una siempre.
 * 5. **El servidor reescribe su `.ini` al arrancar**, conservando los valores
 *    pero borrando lo que no es suyo. Por eso la app edita las claves que
 *    gestiona sobre el fichero que hay, y no guarda nada suyo dentro.
 * 6. **`-adminpassword` evita el plantón del primer arranque**: sin él, el
 *    servidor se queda esperando en la consola a que alguien escriba la
 *    contraseña del administrador.
 * 7. **`UPnP=true` puede colgar el arranque** —lo dice el propio servidor en su
 *    registro—, así que la app lo deja en false: de abrir puertos ya se encarga
 *    la pantalla de conexión.
 */

/**
 * Dónde está cada cosa: en `paths.ts`, porque lo necesitan tanto el arranque
 * como los mods. Se reexporta para que quien ya lo importaba de aquí siga
 * funcionando.
 */
export {
  gameDirFor,
  homeDirFor,
  zomboidDirFor,
  serverFilesDirFor,
  iniPathFor,
  sandboxPathFor,
  savePathFor,
  databasePathFor,
  modsDirFor,
  javaPathFor,
  presetPathFor,
  folderSize
} from './paths'

/** Lo que tarda como mucho en cargar el mundo y quedar listo. */
const READY_TIMEOUT_MS = 300_000

/**
 * Lo que sale en la consola cuando el servidor termina de guardar.
 *
 * ⚠ La copia en caliente espera a ESTE texto, no a la línea del juego («Saving
 * took 85 ms»): `waitForLog` mira lo que se ha enseñado, que ya viene traducido
 * por `parseLine`. Por eso la constante la comparten los dos.
 */
const SAVED_TEXT = 'Partida guardada.'
const SAVED_PATTERN = /Partida guardada/

/** Contraseña de RCON: no la escribe nadie a mano, así que se genera. */
function randomRconPassword(): string {
  return randomBytes(18).toString('base64url')
}

/**
 * La línea de órdenes del servidor.
 *
 * Es casi la del `.bat` oficial, con tres diferencias que importan: el
 * aislamiento (`-Duser.home` y `-cachedir`), la memoria que eligió el usuario
 * en vez de los 16 GB fijos del `.bat`, y Steam apagado salvo que se pida.
 */
export function launchArgs(manifest: ZomboidManifest): string[] {
  const { data } = manifest
  const memoryMb = clampMemory(data.memoryMb)
  return [
    '-Djava.awt.headless=true',
    // ⚠ Con Steam el servidor sale en el navegador de servidores de Steam con
    // la dirección del usuario, aunque `Public` esté en false.
    `-Dzomboid.steam=${data.useSteam ? 1 : 0}`,
    '-Dzomboid.znetlog=1',
    '-XX:+UseZGC',
    '-XX:-CreateCoredumpOnCrash',
    '-XX:-OmitStackTraceInFastThrow',
    // El montón inicial se queda en la mitad: reservarlo entero (que es lo que
    // hace el `.bat` con sus 16 GB) deja al equipo sin sitio para nada más.
    `-Xms${Math.max(Math.round(memoryMb / 2), MIN_MEMORY_MB / 2)}m`,
    `-Xmx${memoryMb}m`,
    // Sin esto el servidor escribe en la carpeta del juego del usuario.
    `-Duser.home=${homeDirFor(manifest.id)}`,
    '-Djava.library.path=natives/',
    '-cp',
    'java/;java/projectzomboid.jar',
    'zombie.network.GameServer',
    '-statistic',
    '0',
    `-cachedir=${zomboidDirFor(manifest.id)}`,
    // Sin esto el primer arranque se queda esperando en la consola.
    '-adminpassword',
    data.adminPassword,
    '-servername',
    SERVER_NAME
  ]
}

export function clampMemory(memoryMb: number): number {
  if (!Number.isFinite(memoryMb)) return DEFAULT_MEMORY_MB
  return Math.min(Math.max(Math.round(memoryMb), MIN_MEMORY_MB), MAX_MEMORY_MB)
}

/**
 * Las claves del `.ini` que salen del manifiesto.
 *
 * Se aplican antes de cada arranque sobre el fichero que haya: el usuario puede
 * tocar las otras 120 claves desde la pestaña de ajustes y no se le pisan.
 */
export function managedSettings(manifest: ZomboidManifest): Record<string, string> {
  const { data } = manifest
  return {
    DefaultPort: String(manifest.port),
    UDPPort: String(udpPortFor(manifest.port)),
    PublicName: manifest.name,
    PublicDescription: data.description,
    // Aparecer en el navegador del juego publica la dirección del usuario. La
    // app no lo hace sola; con Steam encendido el propio juego ya lo anuncia y
    // así se dice en la pantalla de conexión.
    Public: 'false',
    Password: data.password,
    MaxPlayers: String(Math.min(Math.max(data.maxPlayers, 1), MAX_PLAYERS)),
    PVP: data.pvp ? 'true' : 'false',
    Open: data.openToNewPlayers ? 'true' : 'false',
    RCONPort: String(data.rconPort),
    RCONPassword: data.rconPassword,
    SteamVAC: data.useSteam ? 'true' : 'false',
    // El propio servidor avisa: «If the server hangs here, set UPnP=false».
    UPnP: 'false'
  }
}

/**
 * Escribe en el `.ini` las claves del manifiesto, sin tocar las demás.
 *
 * Vale también cuando el fichero todavía no existe, y ahí está la gracia: el
 * servidor **acepta un `.ini` a medias y lo completa** con sus otras 130 claves
 * y sus comentarios (comprobado). Sin esto, el primer arranque usaría siempre
 * el puerto 16261 aunque el usuario hubiera elegido otro, que es justo cuando
 * más fácil es chocar con algo que ya esté escuchando ahí.
 */
async function applyManagedSettings(manifest: ZomboidManifest): Promise<void> {
  const path = iniPathFor(manifest.id)
  await mkdir(serverFilesDirFor(manifest.id), { recursive: true })
  const file = await KeyValueFile.load(path)
  file.setAll(managedSettings(manifest))
  file.setAll(await modSettings(manifest))
  await file.save(path)
}

/**
 * Las tres claves de los mods, calculadas de lo que hay en disco.
 *
 * No salen del manifiesto porque el manifiesto guarda lo que el usuario pidió
 * («quiero este objeto del taller»), y lo que el servidor necesita es otra cosa
 * («carga estos identificadores, en este orden»). Entre lo uno y lo otro está
 * lo que trae cada descarga, que solo se sabe mirando el disco.
 */
async function modSettings(manifest: ZomboidManifest): Promise<Record<string, string>> {
  // `?? []` a propósito: un servidor creado antes de que existieran los mods no
  // tiene la lista en su manifiesto, y eso no puede impedir que arranque.
  const entries = await installedEntries(
    manifest.id,
    manifest.data.mods ?? [],
    manifest.data.gameVersion
  )
  return {
    Mods: modsSetting(entries),
    Map: mapSetting(entries),
    // ⚠ Vacío a propósito: esta clave es para que el servidor se los descargue
    // él por Steam, y este arranca sin Steam. Los mods ya están copiados.
    WorkshopItems: ''
  }
}

/**
 * Deja la partida con el preajuste de dificultad elegido.
 *
 * Los presets del juego son ficheros Lua sueltos (`Apocalypse.lua`…) con los
 * valores y **sin un solo comentario**. Copiarlos encima del `SandboxVars.lua`
 * del servidor dejaría al usuario con un fichero de 300 opciones sin una sola
 * explicación, que es justo lo que hace falta para poder editarlo.
 *
 * Así que se hace al revés: se leen los valores del preset y se escriben uno a
 * uno sobre el fichero que generó el servidor, que sí trae los comentarios. Lo
 * que el preset no diga se queda como estaba.
 */
export async function applyPreset(
  id: string,
  presetFile: string,
  extra: Record<string, number> = {}
): Promise<number> {
  const target = sandboxPathFor(id)
  if (!(await exists(target))) return 0

  const values = new Map<string, string>()
  if (presetFile) {
    const raw = await readFile(presetPathFor(id, presetFile), 'utf8').catch(() => null)
    if (raw === null) {
      throw new Error(
        `El juego no trae el preajuste de dificultad «${presetFile}». Reinstala el servidor desde ` +
          'Configuración → Servidor.'
      )
    }
    // El preset es `return { Clave = valor, ... }` con un nivel de anidamiento,
    // igual que el SandboxVars: se lee con el mismo editor.
    const doc = parseEditable('lua', raw.replace(/^\s*return\s*\{/, 'SandboxVars = {'))
    for (const option of doc.config.options) {
      if (option.path.length === 1 && option.path[0] === 'VERSION') continue
      values.set(option.path.join('.'), option.value)
    }
  }
  for (const [key, value] of Object.entries(extra)) values.set(key, String(value))

  const doc = parseEditable('lua', await readFile(target, 'utf8'))
  const changes = doc.config.options
    .filter((option) => option.editable && values.has(option.path.join('.')))
    .map((option) => ({
      path: option.path,
      value: valueFor(option.type, values.get(option.path.join('.'))!)
    }))
  doc.apply(changes)
  await writeFile(target, doc.serialize(), 'utf8')
  return changes.length
}

function valueFor(type: string, raw: string): string | number | boolean {
  if (type === 'boolean') return raw === 'true'
  if (type === 'integer' || type === 'number') return Number(raw)
  return raw
}

/**
 * Arranca el servidor una vez, espera a que esté listo y lo para.
 *
 * Hace falta porque los ficheros de configuración de Zomboid —el `.ini` con sus
 * 130 claves y el `SandboxVars.lua` con sus 300 opciones comentadas— **los
 * escribe el propio servidor**, no la app. Escribirlos nosotros sería
 * inventarse su contenido y dejar al usuario sin las explicaciones que el juego
 * pone en cada opción. Aquí tarda alrededor de un minuto y medio, y solo pasa
 * al instalar.
 */
async function firstStart(manifest: ZomboidManifest, onProgress: ProgressFn): Promise<string | null> {
  const child = spawn(javaPathFor(manifest.id), launchArgs(manifest), {
    cwd: gameDirFor(manifest.id),
    windowsHide: true
  })

  let salida = ''
  let version: string | null = null
  const leer = (chunk: Buffer | string): void => {
    salida += String(chunk)
    const encontrada = /version=([\d.]+)/.exec(salida)
    if (encontrada) version = encontrada[1]!
  }
  child.stdout.on('data', leer)
  child.stderr.on('data', leer)

  const muerto = new Promise<number | null>((resolve) => child.on('exit', resolve))
  try {
    const limite = Date.now() + FIRST_START_TIMEOUT_MS
    let avisado = 0
    while (!/\*\*\* SERVER STARTED/i.test(salida)) {
      if (child.exitCode !== null) {
        throw new Error(
          'El servidor se cerró durante su primer arranque. Mira el registro de la instancia.'
        )
      }
      if (Date.now() > limite) {
        throw new Error(
          'El servidor no ha llegado a arrancar en diez minutos. Prueba a reinstalarlo desde ' +
            'Configuración → Servidor.'
        )
      }
      const segundos = Math.round((FIRST_START_TIMEOUT_MS - (limite - Date.now())) / 1000)
      if (segundos >= avisado + 10) {
        avisado = segundos
        onProgress('primer-arranque', null, `Generando el mundo (${segundos} s)`)
      }
      await wait(1000)
    }
  } catch (error) {
    child.kill()
    throw error
  }

  onProgress('primer-arranque', null, 'Guardando y parando el servidor')
  child.stdin.write('quit\n')
  const cerroSolo = await Promise.race([muerto.then(() => true), wait(STOP_GRACE_MS).then(() => false)])
  if (!cerroSolo) child.kill()
  return version
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const zomboidAdapter: GameAdapter<ZomboidManifest, ZomboidCreateRequest> = {
  id: 'zomboid',

  async prepareCreate(request, name) {
    const options = request.options
    const adminPassword = options.adminPassword.trim()
    if (adminPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `La contraseña de administrador tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres: ` +
          'con ella se manda sobre la partida entera.'
      )
    }
    // El servidor la recibe por la línea de órdenes; un espacio o una comilla
    // la partirían en dos y la cuenta quedaría con otra contraseña.
    if (/["\s]/.test(adminPassword)) {
      throw new Error('La contraseña de administrador no puede llevar espacios ni comillas.')
    }
    const password = (options.password ?? '').trim()
    if (password.length > 0 && password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La contraseña del servidor tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
    }
    if (!presetInfo(options.preset)) {
      throw new Error('Hay que elegir una dificultad para la partida.')
    }

    const data: ZomboidData = {
      adminPassword,
      password,
      description: options.description ?? '',
      maxPlayers: Math.min(
        Math.max(options.maxPlayers ?? request.expectedPlayers ?? DEFAULT_MAX_PLAYERS, 1),
        MAX_PLAYERS
      ),
      pvp: options.pvp ?? false,
      openToNewPlayers: options.openToNewPlayers ?? true,
      preset: options.preset,
      sandbox: options.sandbox ?? {},
      // Los mods se añaden después de crear el servidor, como en Factorio: el
      // asistente ya pregunta bastante.
      mods: [],
      memoryMb: clampMemory(options.memoryMb ?? DEFAULT_MEMORY_MB),
      useSteam: options.useSteam ?? false,
      rconPort: DEFAULT_RCON_PORT,
      rconPassword: randomRconPassword()
    }
    return data
  },

  async writeInitialFiles(manifest) {
    // El grueso de la configuración la escribe el propio servidor en su primer
    // arranque. Lo que se deja puesto de antemano son las claves que no pueden
    // esperar a ese arranque: el puerto (si no, usaría el 16261 aunque el
    // usuario eligiera otro) y el RCON (sin contraseña ni siquiera abre el
    // puerto, y sin él la app no sabe nada del servidor).
    await mkdir(zomboidDirFor(manifest.id), { recursive: true })
    // La de mods se crea vacía: si no está, el servidor suelta tres trazas de
    // `NoSuchFileException` en cada arranque por su vigilante de ficheros.
    await mkdir(modsDirFor(manifest.id), { recursive: true })
    await applyManagedSettings(manifest)
  },

  async install(manifest, onProgress) {
    onProgress('steamcmd', null, 'Preparando SteamCMD')
    await ensureSteamCmd((detail) => onProgress('steamcmd', null, detail))

    onProgress('download', null, 'Descargando Project Zomboid de Steam (unos 6,7 GB la primera vez)')
    const result = await appUpdate({
      appId: ZOMBOID_APP_ID,
      installDir: gameDirFor(manifest.id),
      branch: manifest.data.branch ?? DEFAULT_BRANCH,
      onProgress: (progress, label) => {
        const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)
        const detail =
          progress.total > 0 ? `${label} · ${gb(progress.done)} de ${gb(progress.total)} GB` : label
        onProgress('download', progress.fraction, detail)
      }
    })

    // El primer arranque es lo que deja el servidor con su configuración
    // escrita, su cuenta de administrador creada y el mundo generado.
    onProgress('primer-arranque', null, 'Arrancando el servidor por primera vez')
    const version = await firstStart(manifest, onProgress)

    onProgress('ajustes', null, 'Aplicando lo que elegiste')
    await applyManagedSettings(manifest)
    // El preajuste primero y lo que el usuario eligió encima: si eligió «muchos
    // zombis» con una dificultad que trae pocos, manda lo que él dijo.
    const preset = presetInfo(manifest.data.preset)
    await applyPreset(manifest.id, preset.file ?? '', manifest.data.sandbox)

    onProgress('done', 1, 'Servidor listo')
    return {
      buildId: result.buildId ?? undefined,
      branch: result.branch,
      ...(version ? { gameVersion: version } : {})
    }
  },

  async checkUpdate(manifest) {
    await ensureSteamCmd()
    const check = await checkAppUpdate(
      ZOMBOID_APP_ID,
      gameDirFor(manifest.id),
      manifest.data.branch ?? DEFAULT_BRANCH
    )
    return { available: check.available, installed: check.installed, latest: check.latest }
  },

  listVersions(manifest) {
    return steamVersions(ZOMBOID_APP_ID, gameDirFor(manifest.id), manifest.data.buildId)
  },

  async prepareVersionChange(manifest, versionId) {
    return {
      branch: await requireBranch(ZOMBOID_APP_ID, versionId),
      // La versión de verdad se lee del servidor al arrancarlo.
      gameVersion: undefined
    }
  },

  /**
   * Cambiar la memoria no toca nada en disco: va en la línea de órdenes del
   * siguiente arranque. Lo que sí hay que mantener a la par es el límite de
   * jugadores cuando se cambian los jugadores esperados.
   */
  applyChanges(current, next, changes) {
    if (changes.expectedPlayers && changes.expectedPlayers !== current.expectedPlayers) {
      const maxPlayers = Math.min(Math.max(changes.expectedPlayers, 1), MAX_PLAYERS)
      next.data = { ...next.data, maxPlayers }
    }
    return next
  },

  async launch(manifest) {
    const java = javaPathFor(manifest.id)
    if (!(await exists(java))) {
      throw new Error(
        'Falta el Java que trae el servidor de Zomboid. Reinstálalo desde Configuración → Servidor.'
      )
    }

    // La configuración se rehace en cada arranque: el manifiesto manda, y así
    // un cambio en Configuración no se queda sin aplicar.
    await applyManagedSettings(manifest)

    return {
      command: java,
      args: launchArgs(manifest),
      cwd: gameDirFor(manifest.id)
    } satisfies LaunchSpec
  },

  /**
   * Parada limpia por la entrada estándar, igual que Minecraft. El servidor
   * guarda («Saving took…») y cierra con código 0 en unos diez segundos.
   */
  stop() {
    return { kind: 'stdin', command: 'quit', graceMs: STOP_GRACE_MS }
  },

  parseLine,
  diagnoseExit,

  /**
   * Quién está dentro, preguntándoselo al servidor.
   *
   * No sale del registro a propósito. Zomboid sí escribe algo cuando alguien
   * entra, pero RCON da la lista entera y exacta en cualquier momento: con el
   * registro habría que ir sumando y restando nombres y bastaría perder una
   * línea para que la lista quedara mal para siempre.
   */
  async poll(manifest) {
    try {
      const answer = await rcon(manifest, 'players')
      return { ready: true, ...parsePlayers(answer) }
    } catch {
      // Todavía arrancando (RCON no escucha hasta el final) o ya parando.
      return {}
    }
  },
  pollIntervalMs: 5_000,

  async backupEntries(manifest) {
    // Sin partida no hay copia que valga: al crear el servidor ya hay un `.ini`
    // en disco, y guardar solo eso llenaría el historial de copias que no
    // contienen nada que se pueda perder.
    if (!(await exists(savePathFor(manifest.id)))) return []

    // Y con partida, lo que se pierde: ella, la configuración y la base de
    // datos de cuentas. El juego son 6,7 GB que se vuelven a descargar.
    const base = `${DATA_DIR}/Zomboid`
    const entries = [`${base}/Saves`]
    if (await exists(serverFilesDirFor(manifest.id))) entries.push(`${base}/Server`)
    if (await exists(join(zomboidDirFor(manifest.id), 'db'))) entries.push(`${base}/db`)
    return entries
  },

  async restoreTargets(manifest) {
    // Se sustituye la partida. La configuración y las cuentas también: en
    // Zomboid el personaje vive dentro de la partida y la cuenta que lo
    // gobierna está en la base de datos, así que separarlos dejaría personajes
    // sin dueño.
    const base = `${DATA_DIR}/Zomboid`
    const targets: string[] = []
    if (await exists(savePathFor(manifest.id))) targets.push(`${base}/Saves`)
    if (await exists(join(zomboidDirFor(manifest.id), 'db'))) targets.push(`${base}/db`)
    return targets
  },

  backupMeta(manifest) {
    return {
      version: manifest.data.gameVersion ?? manifest.data.branch ?? 'desconocida',
      variant: presetInfo(manifest.data.preset).name
    }
  },

  /**
   * Copia en caliente: se le pide que guarde y se espera a que lo diga.
   *
   * Zomboid no sabe suspender el guardado automático, pero `save` vuelca la
   * partida entera de un tirón y contesta «World saved» por RCON, así que basta
   * con copiar justo después.
   */
  async holdSaves(manifest, supervisor) {
    if (!supervisor.isRunning) return true
    const guardado = supervisor.waitForLog(SAVED_PATTERN, 120_000)
    const answer = await rcon(manifest, 'save').catch(() => '')
    if (!/World saved/i.test(answer) && !(await guardado)) return false

    // ⚠ «World saved» llega ANTES de que el servidor termine de escribir. Una
    // copia hecha justo después falla con un «tar.exe: (null)» que no dice nada:
    // los ficheros de la partida cambian de tamaño mientras se leen. Por eso se
    // espera a que la carpeta deje de moverse, en vez de fiarse de la respuesta.
    return waitUntilQuiet(savePathFor(manifest.id))
  },

  /**
   * ¿Responde el servidor?
   *
   * Con Steam se le pregunta con el protocolo de verdad, el mismo que usa el
   * navegador de servidores (grabado en `zomboid-a2s.json`). Sin Steam **no
   * contesta al A2S en ningún puerto** (comprobado), así que se le pregunta por
   * RCON, que es como habla con la app.
   */
  async ping(manifest) {
    const started = Date.now()

    if (manifest.data.useSteam) {
      try {
        const info = await queryInfo('127.0.0.1', manifest.port, { timeoutMs: 4_000 })
        return {
          ok: true,
          motd: info.name,
          versionName: versionFromKeywords(info.keywords) ?? manifest.data.gameVersion,
          playersOnline: info.players,
          playersMax: info.maxPlayers,
          latencyMs: Date.now() - started
        }
      } catch {
        // Con Steam encendido el A2S debería contestar, pero si no lo hace vale
        // más preguntar por RCON que dar el servidor por muerto.
      }
    }

    try {
      const answer = await rcon(manifest, 'players')
      const { playerCount } = parsePlayers(answer)
      return {
        ok: true,
        motd: manifest.name,
        ...(manifest.data.gameVersion ? { versionName: manifest.data.gameVersion } : {}),
        ...(playerCount === undefined ? {} : { playersOnline: playerCount }),
        playersMax: manifest.data.maxPlayers,
        latencyMs: Date.now() - started
      }
    } catch (error) {
      if (await isUdpPortInUse(manifest.port)) {
        return { ok: true, error: 'El servidor está en marcha, pero no contesta a la consola.' }
      }
      return { ok: false, error: error instanceof Error ? error.message : 'No responde.' }
    }
  }
}

/** Una orden por la consola remota. Devuelve lo que conteste el servidor. */
export function rcon(manifest: ZomboidManifest, command: string): Promise<string> {
  return rconCommand(
    {
      host: '127.0.0.1',
      port: manifest.data.rconPort,
      password: manifest.data.rconPassword,
      timeoutMs: 10_000
    },
    command
  )
}

/**
 * La respuesta de `players`, que es así:
 *
 *     Players connected (2):
 *     -Fulano
 *     -Mengano
 *
 * Grabada contra el servidor real con cero jugadores; con jugadores dentro
 * falta por confirmar si el guion va pegado al nombre, así que se aceptan las
 * dos formas y se quita lo que sobre.
 */
export function parsePlayers(answer: string): { playerCount?: number; players?: string[] } {
  const total = /\((\d+)\)/.exec(answer)
  const players = answer
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().replace(/^-\s*/, ''))
    .filter((line) => line.length > 0)
  return {
    ...(total ? { playerCount: Number(total[1]) } : {}),
    ...(players.length > 0 ? { players } : { players: [] })
  }
}

/**
 * Cada línea del servidor lleva delante su nivel, su categoría y dos contadores
 * internos:
 *
 *     LOG  : General      f:0 st:12.766.505> version=42.20.4 b0bbce05d5 demo=false
 *     WARN : Sprite       f:0 st:29.147.527 at IsoSpriteManager.AddSprite > duplicate texture
 *
 * Nada de eso le dice nada al usuario, así que se quita y se queda el mensaje.
 */
const PREFIX = /^(LOG|WARN|ERROR|DEBUG)\s*:\s*(\w+)\s+f:\d+ st:[\d.]+(?:\s+at\s+[^>]*?)?>\s*/

/**
 * Lo que sí se enseña. El registro de Zomboid es, como el de Satisfactory,
 * ruido del motor casi entero: carga de sprites, iconos que faltan, definiciones
 * de mapa. Se guarda todo para diagnosticar un cierre inesperado, pero enseñarlo
 * entero dejaría la consola inservible.
 */
const USEFUL =
  /SERVER STARTED|Steam is enabled|version=|Administrator account|admin password|command entered|Shutdown handling|Saving |SaveAll|Server exited|RCON|UPnP|Quit$|is trying to connect|fully connected|Connected new client|Disconnected player|disconnected from server|banned|kicked|Access Level|Invalid username|required mod|^loading \S+$/i

/** Lo que no se esconde nunca: es justo lo que explica que algo no arranque. */
const ALWAYS_SHOW =
  /Exception|OutOfMemory|Address already in use|Could not create|Unable to open file|FATAL|failed to bind/i

export function parseLine(raw: string): ParsedEvent {
  const prefix = PREFIX.exec(raw)
  const clean = (prefix ? raw.slice(prefix[0].length) : raw).trim()
  const level: ParsedEvent['level'] =
    prefix?.[1] === 'ERROR' || /Exception|OutOfMemory/i.test(clean)
      ? 'error'
      : prefix?.[1] === 'WARN'
        ? 'warn'
        : 'info'

  // ⚠ LO PRIMERO: la línea de quien intenta entrar trae SU DIRECCIÓN IP
  // («User: "Fulano" index=0 ip=203.0.113.5 is trying to connect»). Una consola
  // que se enseña y se copia y pega no es sitio para la IP de nadie: se guarda
  // para diagnosticar, pero sin la dirección.
  const intento = /User:\s*"([^"]+)"\s*index=\d+\s*ip=(\S+)/i.exec(clean)
  if (intento) {
    return { level: 'info', text: `${intento[1]} está intentando entrar…`, hidden: true }
  }

  // Listo de verdad: el mundo está cargado y el servidor acepta conexiones.
  if (/\*{3} SERVER STARTED/i.test(clean)) {
    return { level: 'info', text: 'Mundo cargado. El servidor ya acepta jugadores.', ready: true }
  }

  if (/Administrator account '(.+)' created/i.test(clean)) {
    const quien = /Administrator account '(.+)' created/i.exec(clean)![1]!
    return { level: 'info', text: `Creada la cuenta de administrador «${quien}».` }
  }

  // Entradas y salidas. ⚠ Estas tres líneas están sacadas de las cadenas del
  // propio ejecutable y NO están grabadas con un jugador real
  // (`fixtures/zomboid/sinteticas.txt`): la lista buena de quién está dentro
  // sale de `poll()`, que se la pregunta al servidor por RCON.
  const entra = /^Connected new client\s+(.+?)\s+ID #/i.exec(clean)
  if (entra) return { level: 'info', text: `${entra[1]} ha entrado.`, playerJoined: entra[1] }

  const dentro = /^"(.+?)"\s+fully connected/i.exec(clean)
  if (dentro) {
    return { level: 'info', text: `${dentro[1]} ya está jugando.`, playerJoined: dentro[1] }
  }

  const sale = /^Disconnected player\s+"(.+?)"/i.exec(clean)
  if (sale) return { level: 'info', text: `${sale[1]} ha salido.`, playerLeft: sale[1] }

  // Los mods. La primera es la que de verdad hace falta ver: un mod que no
  // carga solo deja esta línea, y el servidor sigue arrancando como si nada.
  const sinMod = /required mod "(.+?)" not found/i.exec(clean)
  if (sinMod) {
    return {
      level: 'warn',
      text:
        `No se encuentra el mod «${sinMod[1]}»: el servidor va a seguir sin él. ` +
        'Míralo en Configuración → Mods.'
    }
  }

  // ⚠ Sin la «i» y con un identificador sin espacios a propósito: el servidor
  // escribe también «LOADING ASSETS: START», que no es ningún mod.
  const modCargado = /^loading (\S+)$/.exec(clean)
  if (modCargado) return { level: 'info', text: `Mod cargado: ${modCargado[1]}.` }

  // Cuál pisa a cuál es ruido para quien juega, pero se guarda: es lo que
  // explica que dos mods se peleen.
  if (/^mod "(.+?)" overrides /i.test(clean)) return { level: 'info', text: clean, hidden: true }

  if (/Saving took|Shutdown handling finished/i.test(clean)) {
    return { level: 'info', text: SAVED_TEXT, saved: true }
  }
  if (/^SaveAll took|^Saving (players|worldgen|GlobalModData|finish)/i.test(clean)) {
    return { level: 'info', text: 'Guardando la partida…', hidden: true }
  }

  if (/command entered via server console \(System\.in\): "quit"/i.test(clean)) {
    return { level: 'info', text: 'Parando el servidor…' }
  }

  if (/If the server hangs here, set UPnP=false/i.test(clean)) {
    return {
      level: 'warn',
      text: 'Buscando un router que abra los puertos solo. La app lo deja apagado, así que esto no debería tardar.',
      hidden: true
    }
  }

  if (/No UPnP-enabled Internet gateway found/i.test(clean)) {
    return {
      level: 'info',
      text: 'Tu router no abre puertos solo. Si quieres que entre gente de fuera, mira Configuración → Conexión.',
      hidden: true
    }
  }

  const version = /^version=([\d.]+)/.exec(clean)
  if (version) return { level: 'info', text: `Project Zomboid ${version[1]}` }

  return { level, text: clean, hidden: !ALWAYS_SHOW.test(clean) && !USEFUL.test(clean) }
}

export function diagnoseExit(code: number | null, recentLines: string[]): Diagnosis {
  const recent = recentLines.join('\n')

  if (/Address already in use|Failed to bind|BindException/i.test(recent)) {
    return {
      code: 'port-in-use',
      title: 'El puerto ya está ocupado',
      detail:
        'Otro programa está usando el puerto del servidor. Cambia el puerto en Configuración → ' +
        'Conexión o cierra lo que lo esté usando.',
      action: { kind: 'change-port' }
    }
  }

  if (/OutOfMemoryError|Could not reserve enough space|Unable to allocate/i.test(recent)) {
    return {
      code: 'out-of-memory',
      title: 'Se ha quedado sin memoria',
      detail:
        'Zomboid pide bastante, y la Build 42 más que la anterior. Súbele la memoria en ' +
        'Configuración → Ajustes, o cierra algo para dejarle sitio.',
      action: { kind: 'set-memory' }
    }
  }

  if (/Unable to open file|FileNotFoundException|NoClassDefFoundError/i.test(recent)) {
    return {
      code: 'broken-install',
      title: 'Falta algo del juego',
      detail:
        'Al servidor le faltan ficheros. Reinstálalo desde Configuración → Servidor: comprueba ' +
        'lo que hay sin volver a descargarlo todo.'
    }
  }

  if (code === 0) {
    return {
      code: 'clean-exit',
      title: 'El servidor se ha cerrado',
      detail: 'Se cerró con normalidad, guardando la partida.'
    }
  }

  return {
    code: 'unknown-exit',
    title: 'El servidor se cerró inesperadamente',
    detail: `Código de salida ${code}. Mira las últimas líneas de la consola para ver qué pasó.`
  }
}

/**
 * La versión que anuncia el servidor en su consulta de Steam.
 *
 * Como en Valheim, el campo `version` del protocolo no sirve («1.0.0.0»): la
 * buena está en las palabras clave (`hidden;vanilla;pvp;VERSION:42.20`),
 * comprobado en la grabación real.
 */
export function versionFromKeywords(keywords: string | undefined): string | undefined {
  return /(?:^|;)VERSION:([^;]+)/.exec(keywords ?? '')?.[1]
}

/**
 * Espera a que una carpeta deje de cambiar.
 *
 * Mira cuántos ficheros hay, cuánto ocupan y cuál es el más reciente; cuando
 * esa foto se repite dos veces seguidas, nadie está escribiendo. Es lo único
 * fiable: el servidor dice que ha guardado antes de terminar, y las líneas de
 * su registro no dicen cuándo se ha cerrado el último fichero.
 */
async function waitUntilQuiet(dir: string, timeoutMs = 60_000): Promise<boolean> {
  const limite = Date.now() + timeoutMs
  let anterior = ''
  while (Date.now() < limite) {
    const foto = await folderFingerprint(dir)
    if (foto === anterior) return true
    anterior = foto
    await wait(700)
  }
  // Si en un minuto no se ha estado quieta, algo raro pasa: vale más quedarse
  // sin copia que guardar una partida a medio escribir.
  return false
}

/** Cuántos ficheros, cuánto ocupan y cuál se tocó el último. */
async function folderFingerprint(dir: string): Promise<string> {
  let files = 0
  let bytes = 0
  let newest = 0
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      const info = await stat(path).catch(() => null)
      if (!info) continue
      files++
      bytes += info.size
      newest = Math.max(newest, info.mtimeMs)
    }
  }
  await walk(dir)
  return `${files}:${bytes}:${newest}`
}

/** Para el servicio y las pruebas: dónde está cada cosa y cuánto se espera. */
export const zomboidPaths = {
  gameDir: gameDirFor,
  homeDir: homeDirFor,
  zomboidDir: zomboidDirFor,
  serverFilesDir: serverFilesDirFor,
  ini: iniPathFor,
  sandbox: sandboxPathFor,
  save: savePathFor,
  database: databasePathFor,
  readyTimeoutMs: READY_TIMEOUT_MS,
  savedText: SAVED_TEXT,
  installedBuildId: (id: string): Promise<string | null> =>
    installedBuildId(gameDirFor(id), ZOMBOID_APP_ID)
}
