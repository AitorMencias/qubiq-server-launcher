import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type { Diagnosis, FactorioCreateRequest, FactorioManifest } from '@shared/types'
import {
  DEFAULT_AUTOSAVE_MINUTES,
  DEFAULT_AUTOSAVE_SLOTS,
  DEFAULT_MAX_PLAYERS,
  FACTORIO_APP_ID,
  MIN_PASSWORD_LENGTH,
  STOP_GRACE_MS,
  modList,
  serverSettings,
  type FactorioData
} from '@shared/games/factorio/types'
import type { GameAdapter, LaunchSpec, ParsedEvent, ProgressFn } from '../types'
import { serverDir } from '../../paths'
import {
  appUpdate,
  checkAppUpdate,
  DEFAULT_BRANCH,
  ensureSteamCmd,
  installedBuildId
} from '../../tools/steamcmd'
import { requireBranch, steamVersions } from '../steamVersions'
import { isUdpPortInUse } from '../../net/network'
import { rconCommand } from '../../net/rcon'

/**
 * Factorio como juego del núcleo (fase 4 de la hoja de ruta multijuego).
 *
 * Es el primer juego que no tiene servidor dedicado: en Windows se lanza el
 * ejecutable del propio juego con `--start-server`, y por eso hace falta que el
 * usuario tenga Factorio. Todo lo que sigue está comprobado contra el juego
 * real, no sacado de una wiki (ANALISIS.md §19.19):
 *
 * 1. **Sin entrada estándar.** `factorio.exe` es un binario de subsistema GUI:
 *    escribir en su stdin da EPIPE. La única vía de control es RCON, así que
 *    todos los servidores llevan RCON —atado a 127.0.0.1— aunque el usuario no
 *    sepa que existe. Ctrl+Break tampoco vale: no hace nada y no guarda.
 * 2. **El aislamiento es un `config.ini` propio.** Con `write-data` apuntando a
 *    la carpeta de datos del servidor, las partidas, los mods, el registro y
 *    las listas de moderación dejan de ir a `%APPDATA%\\Factorio`, que es donde
 *    el usuario tiene sus partidas de un jugador.
 * 3. **El juego se adelgaza.** Copiar la instalación sin imágenes ni sonidos la
 *    deja en ~246 MB de 5,1 GB, con los **mismos checksums de prototipos**: los
 *    clientes entran igual y el mapa se crea 15 veces más rápido. Los `.lua`
 *    que viven dentro de `graphics/` sí hacen falta.
 * 4. **La versión estable (2.0.77) no termina de cerrarse.** Guarda entero y
 *    luego se queda ahí (probado hasta 240 s); la 2.1.19 cierra en 0,4 s. Como
 *    al llegar ahí la partida ya está en disco, agotar el plazo y cerrar el
 *    proceso es seguro, y los arranques siguientes lo confirman.
 */

/** Dentro de la instancia: el juego por un lado y lo que se guarda por otro. */
const GAME_DIR = 'juego'
const DATA_DIR = 'datos'

/** Lo que tarda como mucho en cargar la partida y quedar listo. */
const READY_TIMEOUT_MS = 180_000

/**
 * Lo que sale en la consola cuando el servidor termina de guardar.
 *
 * ⚠ La copia en caliente espera a ESTE texto, no a la línea del juego («Saving
 * finished»): `waitForLog` mira lo que se ha enseñado, que ya viene traducido
 * por `parseLine`. Por eso la constante la comparten los dos.
 */
const SAVED_TEXT = 'Partida guardada.'
const SAVED_PATTERN = /Partida guardada/

export function gameDirFor(id: string): string {
  return join(serverDir(id), GAME_DIR)
}

export function dataDirFor(id: string): string {
  return join(serverDir(id), DATA_DIR)
}

export function executablePath(id: string): string {
  return join(gameDirFor(id), 'bin', 'x64', 'factorio.exe')
}

export function savePathFor(id: string, saveName: string): string {
  return join(dataDirFor(id), 'saves', `${saveName}.zip`)
}

/**
 * Ficheros que no hacen falta para servir una partida.
 *
 * Son el 95 % del tamaño. Se quitan de la copia del servidor, nunca del sitio
 * de donde se copió: si el usuario tiene Factorio instalado, su juego no se
 * toca.
 */
const USELESS_EXTENSIONS = ['.png', '.jpg', '.ogg', '.voc', '.wav']

async function trimGameCopy(dir: string, onProgress?: (detail: string) => void): Promise<number> {
  let removed = 0
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else if (USELESS_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        const size = await stat(path).then(
          (s) => s.size,
          () => 0
        )
        await rm(path, { force: true })
        removed += size
        if (removed % (64 * 1024 * 1024) < size) {
          onProgress?.(`Quitando lo que un servidor no dibuja (${Math.round(removed / 1024 ** 2)} MB)`)
        }
      }
    }
  }
  await walk(join(dir, 'data'))
  // La documentación en HTML y los símbolos de depuración tampoco pintan nada.
  await rm(join(dir, 'doc-html'), { recursive: true, force: true })
  await rm(join(dir, 'bin', 'x64', 'factorio.pdb'), { force: true })
  return removed
}

/** Contraseña de RCON: no la ve nadie, así que se genera y se olvida. */
function randomRconPassword(): string {
  return randomBytes(18).toString('base64url')
}

/**
 * Puerto de RCON. Va pegado al del juego para que sea fácil de reconocer en un
 * netstat, y solo escucha en 127.0.0.1.
 */
function rconPortFor(gamePort: number): number {
  return gamePort + 1
}

function configIni(id: string): string {
  const data = dataDirFor(id)
  return [
    '; Lo escribe QubiQ en cada arranque. Lo importante es write-data: sin esto,',
    '; Factorio guardaría las partidas en %APPDATA%\\Factorio, junto a las tuyas.',
    '[path]',
    'read-data=__PATH__executable__\\..\\..\\data',
    `write-data=${data}`,
    '',
    '[general]',
    'locale=es-ES',
    ''
  ].join('\n')
}

/** Escribe la configuración derivada del manifiesto. Se rehace en cada arranque. */
async function writeServerFiles(manifest: FactorioManifest): Promise<void> {
  const data = dataDirFor(manifest.id)
  await mkdir(join(data, 'config'), { recursive: true })
  await mkdir(join(data, 'saves'), { recursive: true })
  await mkdir(join(data, 'mods'), { recursive: true })
  await writeFile(join(data, 'config', 'config.ini'), configIni(manifest.id), 'utf8')
  await writeFile(
    join(data, 'server-settings.json'),
    JSON.stringify(serverSettings(manifest.name, manifest.data), null, 2),
    'utf8'
  )
  await writeFile(
    join(data, 'mods', 'mod-list.json'),
    JSON.stringify(modList(manifest.data.spaceAge), null, 2),
    'utf8'
  )
}

/** ¿Trae el DLC? Solo llega si la cuenta de Steam lo tiene. */
export async function hasSpaceAge(gameDir: string): Promise<boolean> {
  return stat(join(gameDir, 'data', 'space-age')).then(
    () => true,
    () => false
  )
}

const run = promisify(execFile)

/**
 * Crea el mapa antes del primer arranque.
 *
 * Tiene que ser aquí y no en el primer arranque del servidor porque
 * `--start-server` exige que la partida ya exista, y porque los mods que estén
 * puestos en ese momento (Space Age o no) quedan grabados EN el mapa: cambiarlos
 * después no sirve de nada.
 */
async function createMap(manifest: FactorioManifest, onProgress: ProgressFn): Promise<void> {
  const save = savePathFor(manifest.id, manifest.data.saveName)
  const yaEstá = await stat(save).then(
    () => true,
    () => false
  )
  if (yaEstá) return

  onProgress('map', null, 'Generando el mapa')
  const args = [
    '--config',
    join(dataDirFor(manifest.id), 'config', 'config.ini'),
    '--mod-directory',
    join(dataDirFor(manifest.id), 'mods'),
    '--create',
    save,
    '--preset',
    manifest.data.preset,
    ...(manifest.data.seed ? ['--map-gen-seed', manifest.data.seed] : [])
  ]
  const { stdout } = await run(executablePath(manifest.id), args, {
    cwd: join(gameDirFor(manifest.id), 'bin', 'x64'),
    maxBuffer: 8 * 1024 * 1024
  })
  if (!/Creating new map/.test(stdout)) {
    throw new Error('Factorio no ha llegado a crear el mapa. Mira el registro del servidor.')
  }
}

export function parseLine(raw: string): ParsedEvent {
  const line = raw.trim()

  // Los eventos de jugador vienen con fecha delante y en un formato fijo:
  // «2026-09-18 00:31:44 [JOIN] Fulano joined the game».
  const join = /\[JOIN\] (.+) joined the game/.exec(line)
  if (join) return { level: 'info', text: `${join[1]} ha entrado.`, playerJoined: join[1] }

  const leave = /\[LEAVE\] (.+) left the game/.exec(line)
  if (leave) return { level: 'info', text: `${leave[1]} ha salido.`, playerLeft: leave[1] }

  const chat = /\[CHAT\] ([^:]+): (.*)$/.exec(line)
  if (chat) {
    // Lo que manda la propia app por RCON vuelve como chat del servidor: sería
    // un eco de lo que el usuario acaba de escribir.
    if (chat[1] === '<server>') return { level: 'info', text: chat[2], hidden: true }
    return { level: 'info', text: `${chat[1]}: ${chat[2]}`, chat: { player: chat[1], message: chat[2] } }
  }

  // Listo para entrar. Las dos líneas llegan juntas; vale la primera.
  if (/Hosting game at IP ADDR/.test(line) || /changing state from\(CreatingGame\) to\(InGame\)/.test(line)) {
    return { level: 'info', text: 'Servidor listo: ya se puede entrar.', ready: true }
  }

  if (/Saving finished/.test(line)) return { level: 'info', text: SAVED_TEXT, saved: true }
  if (/Saving to (\S+) \(blocking\)/.test(line)) {
    return { level: 'info', text: 'Guardando la partida…' }
  }
  if (/Saving map as/.test(line)) return { level: 'info', text: 'Guardando la partida…' }

  // Quien intenta entrar sin contraseña: el cliente solo ve que le cortan.
  //
  // ⚠ La dirección que escribe Factorio lleva paréntesis dentro
  // («(IP ADDR:({127.0.0.1:60544}))»), así que no se puede leer con un
  // `\(([^)]+)\)`: se salta hasta el nombre, que es lo que importa.
  const refused = /Refusing connection .*username \(([^)]+)\)\.\s*(\w+)/.exec(line)
  if (refused) {
    const [, user, reason] = refused
    if (reason === 'PasswordMissing' || reason === 'PasswordMismatch') {
      return {
        level: 'warn',
        text: `${user} ha intentado entrar sin la contraseña correcta.`
      }
    }
    if (reason === 'UserVerificationMissing' || reason === 'UserVerificationFailed') {
      return {
        level: 'warn',
        text: `${user} no ha pasado la comprobación de cuenta de Factorio.`
      }
    }
    return { level: 'warn', text: `Se ha rechazado la conexión de ${user} (${reason}).` }
  }

  if (/Quitting: remote-quit/.test(line)) {
    return { level: 'info', text: 'Parando el servidor…' }
  }

  // El registro de Factorio es casi todo ruido del motor con la forma
  // «0.123 Info Fichero.cpp:456: …». Se guarda para diagnosticar, pero
  // enseñarlo entero dejaría la consola inservible.
  const engine = /^\s*[\d.]+ (Info|Verbose|Script) /.test(line)
  const failed = /^\s*[\d.]+ (Error|Warning) /.exec(line)
  if (failed) {
    return { level: failed[1] === 'Error' ? 'error' : 'warn', text: line.replace(/^\s*[\d.]+ /, '') }
  }
  return { level: 'info', text: line, ...(engine ? { hidden: true } : {}) }
}

export function diagnoseExit(code: number | null, recentLines: string[]): Diagnosis {
  const text = recentLines.join('\n')

  if (/Error Socket\.cpp.*bind|Address already in use|Cannot bind/i.test(text)) {
    return {
      code: 'port-in-use',
      title: 'El puerto ya está ocupado',
      detail:
        'Otro programa está usando el puerto del servidor. Cambia el puerto en Configuración → ' +
        'Conexión o cierra lo que lo esté usando.',
      action: { kind: 'change-port' }
    }
  }
  if (/Map version .* is too new|incompatible|Unknown mod|Error Util\.cpp.*mod/i.test(text)) {
    return {
      code: 'save-version-mismatch',
      title: 'La partida no casa con la versión instalada',
      detail:
        'Una partida guardada con una versión más nueva no se puede abrir con una más vieja. ' +
        'Vuelve a la versión que tenías desde Configuración → Versión.'
    }
  }
  if (/Is another instance already running/i.test(text)) {
    return {
      code: 'already-running',
      title: 'Ya hay otro Factorio con esta carpeta',
      detail: 'Cierra el servidor que esté en marcha y vuelve a arrancarlo.'
    }
  }
  if (/factorio.exe.*not recognized|no such file|ENOENT/i.test(text)) {
    return {
      code: 'missing-game',
      title: 'Falta el juego de este servidor',
      detail:
        'No está el Factorio que usa este servidor. Vuelve a instalarlo desde Configuración → Servidor.'
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
    code: 'unknown',
    title: 'El servidor se ha cerrado de forma inesperada',
    detail: `Terminó con el código ${code}. Las últimas líneas de la consola suelen decir por qué.`
  }
}

export const factorioAdapter: GameAdapter<FactorioManifest, FactorioCreateRequest> = {
  id: 'factorio',

  async prepareCreate(request, name) {
    const options = request.options
    if (options.password && options.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
    }
    if (options.spaceAge === undefined) {
      throw new Error('Hay que decir si el servidor lleva Space Age antes de crear el mapa.')
    }
    const data: FactorioData = {
      password: options.password,
      description: options.description ?? `Servidor de ${name}`,
      maxPlayers: options.maxPlayers ?? DEFAULT_MAX_PLAYERS,
      // El nombre del fichero no lo elige el usuario: lo que él llama «la
      // partida» es el servidor entero, y un nombre fijo evita rarezas con
      // acentos y barras dentro de la carpeta de guardados.
      saveName: 'partida',
      preset: options.preset,
      ...(options.seed ? { seed: options.seed } : {}),
      spaceAge: options.spaceAge,
      autosaveMinutes: DEFAULT_AUTOSAVE_MINUTES,
      autosaveSlots: DEFAULT_AUTOSAVE_SLOTS,
      autoPause: options.autoPause ?? true,
      allowCommands: 'admins-only',
      // Por defecto sí: así nadie puede entrar haciéndose pasar por otro, que
      // es lo que pasa cuando el nombre lo elige el cliente. El precio es que
      // el servidor consulta a auth.factorio.com al arrancar, y se dice.
      verifyAccounts: options.verifyAccounts ?? true,
      rconPort: rconPortFor(request.port),
      rconPassword: randomRconPassword(),
      source: options.source,
      ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
      ...(options.steamUser ? { steamUser: options.steamUser } : {})
    }
    if (data.source === 'local' && !data.sourcePath) {
      throw new Error('Hay que decir de qué carpeta copiar Factorio.')
    }
    if (data.source === 'steamcmd' && !data.steamUser) {
      throw new Error('Hay que decir con qué cuenta de Steam descargar Factorio.')
    }
    return data
  },

  async writeInitialFiles(manifest) {
    await writeServerFiles(manifest)
  },

  async install(manifest, onProgress) {
    const gameDir = gameDirFor(manifest.id)
    const branch = manifest.data.branch ?? DEFAULT_BRANCH

    if (manifest.data.source === 'local') {
      const from = manifest.data.sourcePath
      if (!from) throw new Error('No se sabe de qué carpeta copiar Factorio.')
      onProgress('copy', null, 'Copiando Factorio de la instalación que ya tienes')
      await cp(from, gameDir, { recursive: true })
    } else {
      onProgress('steamcmd', null, 'Preparando SteamCMD')
      await ensureSteamCmd((detail) => onProgress('steamcmd', null, detail))

      // La descarga va a una carpeta aparte y de ahí se copia adelgazada: si se
      // adelgazara la descarga en sitio, Steam ya no podría actualizarla
      // (cambiar de versión sobre una instalación recortada falla con
      // «state is 0x426», comprobado).
      const staging = join(serverDir(manifest.id), '.descarga')
      onProgress('download', null, 'Descargando Factorio de Steam (unos 5 GB)')
      const result = await appUpdate({
        appId: FACTORIO_APP_ID,
        installDir: staging,
        branch,
        ...(manifest.data.steamUser ? { account: { user: manifest.data.steamUser } } : {}),
        onProgress: (progress, label) => {
          const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)
          const detail =
            progress.total > 0 ? `${label} · ${gb(progress.done)} de ${gb(progress.total)} GB` : label
          onProgress('download', progress.fraction, detail)
        }
      })

      onProgress('copy', null, 'Preparando el servidor')
      await rm(gameDir, { recursive: true, force: true })
      await cp(staging, gameDir, { recursive: true })
      // La descarga completa no se guarda: ocupa 5 GB y el usuario eligió no
      // tener un almacén permanente. Volver a descargar es el precio de eso.
      await rm(staging, { recursive: true, force: true })

      const spaceAge = await hasSpaceAge(gameDir)
      if (manifest.data.spaceAge && !spaceAge) {
        throw new Error(
          'Esta cuenta de Steam no tiene Space Age, así que el servidor no puede usarlo. ' +
            'Crea el servidor sin Space Age.'
        )
      }

      onProgress('trim', null, 'Quitando lo que un servidor no necesita')
      const removed = await trimGameCopy(gameDir, (detail) => onProgress('trim', null, detail))
      onProgress('trim', 1, `Ahorrados ${Math.round(removed / 1024 ** 2)} MB`)

      await writeServerFiles(manifest)
      await createMap(manifest, onProgress)
      onProgress('done', 1, 'Servidor listo')
      return {
        buildId: result.buildId ?? undefined,
        branch: result.branch
      }
    }

    await trimGameCopy(gameDir, (detail) => onProgress('trim', null, detail))
    await writeServerFiles(manifest)
    await createMap(manifest, onProgress)
    onProgress('done', 1, 'Servidor listo')
    return { buildId: (await installedBuildId(gameDir, FACTORIO_APP_ID)) ?? undefined }
  },

  async checkUpdate(manifest) {
    // Lo instalado se sabe por el manifiesto: la copia del servidor no lleva
    // `steamapps/` porque se copió de la descarga, no la generó Steam aquí.
    await ensureSteamCmd()
    const check = await checkAppUpdate(
      FACTORIO_APP_ID,
      join(serverDir(manifest.id), '.descarga'),
      manifest.data.branch ?? DEFAULT_BRANCH
    )
    return {
      available: check.available,
      installed: manifest.data.buildId ?? check.installed,
      latest: check.latest
    }
  },

  listVersions(manifest) {
    return steamVersions(
      FACTORIO_APP_ID,
      join(serverDir(manifest.id), '.descarga'),
      manifest.data.buildId
    )
  },

  async prepareVersionChange(_manifest, versionId) {
    // Cambiar de versión en Factorio es descargar otra vez: la copia del
    // servidor está adelgazada y Steam no sabe actualizar sobre ella
    // («state is 0x426»). El `install` que viene detrás se encarga.
    const branch = await requireBranch(FACTORIO_APP_ID, versionId)
    return { branch }
  },

  async launch(manifest): Promise<LaunchSpec> {
    // La configuración se rehace en cada arranque: el manifiesto manda, y así
    // un cambio en Configuración no se queda sin aplicar.
    await writeServerFiles(manifest)

    const data = dataDirFor(manifest.id)
    const save = savePathFor(manifest.id, manifest.data.saveName)
    return {
      command: executablePath(manifest.id),
      args: [
        '--config',
        join(data, 'config', 'config.ini'),
        '--mod-directory',
        join(data, 'mods'),
        '--start-server',
        save,
        '--server-settings',
        join(data, 'server-settings.json'),
        '--server-adminlist',
        join(data, 'server-adminlist.json'),
        '--server-banlist',
        join(data, 'server-banlist.json'),
        '--port',
        String(manifest.port),
        // ⚠ `--rcon-port` escucharía en 0.0.0.0, o sea, en toda la red local
        // (visto en netstat). Con `--rcon-bind` a 127.0.0.1 la consola remota
        // no sale del equipo, que es justo lo que hace falta: es de la app.
        '--rcon-bind',
        `127.0.0.1:${manifest.data.rconPort}`,
        '--rcon-password',
        manifest.data.rconPassword,
        // Copia limpia de los eventos (entradas, salidas y chat), sin el ruido
        // del motor. El servidor la escribe él solo.
        '--console-log',
        join(data, 'console.log')
      ],
      cwd: join(gameDirFor(manifest.id), 'bin', 'x64')
    }
  },

  /**
   * La consola de la app habla con Factorio por RCON, no por la entrada
   * estándar: el ejecutable no la tiene. Lo que conteste sale en la consola,
   * porque muchas órdenes responden ahí y en ningún otro sitio (`/players`,
   * `/version`, `/seed`…).
   */
  async sendCommand(manifest, command) {
    return rconCommand(
      {
        host: '127.0.0.1',
        port: manifest.data.rconPort,
        password: manifest.data.rconPassword,
        terminatorEcho: false
      },
      command.startsWith('/') ? command : `/${command}`
    )
  },

  stop(manifest) {
    return {
      kind: 'rcon',
      host: '127.0.0.1',
      port: manifest.data.rconPort,
      password: manifest.data.rconPassword,
      command: '/quit',
      // Factorio contesta al comando pero ignora el paquete terminador.
      terminatorEcho: false,
      graceMs: STOP_GRACE_MS
    }
  },

  parseLine,
  diagnoseExit,

  async backupEntries(manifest) {
    // Solo los datos: partidas, mods, moderación y configuración. El juego son
    // cientos de megas que se vuelven a descargar de Steam.
    const data = dataDirFor(manifest.id)
    const exists = await stat(data).then(
      () => true,
      () => false
    )
    return exists ? [DATA_DIR] : []
  },

  async restoreTargets() {
    return [DATA_DIR]
  },

  backupMeta(manifest) {
    return {
      version: manifest.data.gameVersion ?? manifest.data.branch ?? 'desconocida',
      ...(manifest.data.spaceAge ? { variant: 'Space Age' } : {})
    }
  },

  async holdSaves(manifest, supervisor) {
    if (!supervisor.isRunning) return true
    const saved = supervisor.waitForLog(SAVED_PATTERN, 60_000)
    await rconCommand(
      {
        host: '127.0.0.1',
        port: manifest.data.rconPort,
        password: manifest.data.rconPassword,
        terminatorEcho: false
      },
      '/server-save'
    )
    return saved
  },

  async ping(manifest) {
    const started = Date.now()
    try {
      // Factorio no contesta a nada por su puerto de juego que sirva para esto,
      // así que se le pregunta por RCON, que es como habla con la app.
      const answer = await rconCommand(
        {
          host: '127.0.0.1',
          port: manifest.data.rconPort,
          password: manifest.data.rconPassword,
          timeoutMs: 5000,
          terminatorEcho: false
        },
        '/players online'
      )
      const count = /\((\d+)\)/.exec(answer)
      return {
        ok: true,
        latencyMs: Date.now() - started,
        playersOnline: count ? Number(count[1]) : undefined,
        playersMax: manifest.data.maxPlayers,
        ...(manifest.data.gameVersion ? { versionName: manifest.data.gameVersion } : {})
      }
    } catch (error) {
      // Si el puerto del juego está abierto, el servidor está vivo aunque RCON
      // no conteste: decir «no responde» sería mentir.
      if (await isUdpPortInUse(manifest.port)) {
        return { ok: true, error: 'El servidor está en marcha, pero no contesta a la consola.' }
      }
      return { ok: false, error: error instanceof Error ? error.message : 'No responde.' }
    }
  }
}

export const factorioInternals = {
  READY_TIMEOUT_MS,
  SAVED_TEXT,
  configIni,
  rconPortFor,
  trimGameCopy
}
