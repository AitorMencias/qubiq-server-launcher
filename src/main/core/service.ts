import { EventEmitter } from 'node:events'
import { appendFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AppSettings,
  BackupEstimate,
  BackupInfo,
  ConnectionInfo,
  CreateInstanceRequest,
  Diagnosis,
  ExternalCheck,
  InstanceManifest,
  InstanceState,
  LogLine,
  ManifestChanges,
  ProgressUpdate,
  ServerStatus
} from '@shared/types'
import {
  gameInfo,
  requiredAgreements,
  type InstallableVersion,
  type PortProtocol,
  type UpdateCheck
} from '@shared/games'
import { intervalMinutes, MIN_BACKUP_MINUTES } from '@shared/backup'
import { ServerSupervisor } from './runtime/supervisor'
import * as instances from './instances/manager'
import * as backups from './backup/manager'
import * as network from './net/network'
import * as settings from './settings/manager'
import { serverDir, launcherLogPath, ensureBaseDirs } from './paths'
import { evaluateRestart } from './runtime/restartPolicy'
import { gameFor, gameOf, isKnownGame } from './games/registry'
import { createMinecraftService, type GameHost } from './games/minecraft/service'
import { createSatisfactoryService } from './games/satisfactory/service'
import { createValheimService } from './games/valheim/service'
import { createFactorioService } from './games/factorio/service'
import { createZomboidService } from './games/zomboid/service'
import { createEnshroudedService } from './games/enshrouded/service'
import { createRustService, type RustHost } from './games/rust/service'

/**
 * Orquestador del núcleo (§5).
 *
 * Une instancias, juegos, supervisor y copias, y expone una superficie de
 * comandos + eventos. No conoce la interfaz ni ningún juego en concreto: lo
 * propio de cada uno lo pide al adaptador de su juego (`games/registry.ts`).
 */

export interface ServiceEvents {
  log: (instanceId: string, line: LogLine) => void
  status: (instanceId: string, status: ServerStatus) => void
  players: (instanceId: string, players: string[], playerCount: number | null) => void
  /** Código para entrar, en los juegos que se conectan por relé (Valheim). */
  joinCode: (instanceId: string, code: string | null) => void
  progress: (update: ProgressUpdate) => void
  diagnosis: (instanceId: string, diagnosis: Diagnosis) => void
}

/**
 * Fichero que deja un plugin en el directorio de trabajo del servidor para
 * pedir que se vuelva a arrancar. Su mera existencia es la señal; el contenido
 * es informativo y solo se usa para el texto del mensaje.
 */
const RESTART_REQUEST_FILE = 'hardcore-restart.request'

/** Margen antes de volver a arrancar, para que el proceso anterior suelte todo. */
const RESTART_DELAY_MS = 3_000

class LauncherService extends EventEmitter implements GameHost, RustHost {
  private readonly supervisors = new Map<string, ServerSupervisor>()
  /** Instancias con una instalación en curso. */
  private readonly installing = new Set<string>()
  /** Temporizadores de copia programada, uno por instancia arrancada. */
  private readonly backupTimers = new Map<string, NodeJS.Timeout>()
  /** Reinicios ya programados, para poder cancelarlos. */
  private readonly pendingRestarts = new Map<string, NodeJS.Timeout>()
  /** Marcas de tiempo de reinicios recientes, para la política anti-bucle. */
  private readonly restartHistory = new Map<string, number[]>()

  /** Operaciones exclusivas de Minecraft (propiedades, plugins, mundos). */
  readonly minecraft = createMinecraftService(this)

  /** Operaciones exclusivas de Satisfactory (partidas y ajustes por su API). */
  readonly satisfactory = createSatisfactoryService(this)

  /** Operaciones exclusivas de Valheim (mundos y listas de moderación). */
  readonly valheim = createValheimService(this)

  /** Operaciones exclusivas de Factorio (partidas y moderación, por RCON). */
  readonly factorio = createFactorioService(this)

  /** Operaciones exclusivas de Zomboid (ajustes, reglas de partida y cuentas). */
  readonly zomboid = createZomboidService(this)

  /** Operaciones exclusivas de Enshrouded (ajustes, mundos, vetados y mods). */
  readonly enshrouded = createEnshroudedService(this)

  /** Operaciones exclusivas de Rust (ajustes, borrado, moderación, Oxide y plugins). */
  readonly rust = createRustService(this)

  async initialize(): Promise<void> {
    await ensureBaseDirs()
    // El borrado programado de Rust mira cada diez minutos si ha salido el
    // parche del mes. Solo hace algo en los servidores que lo tienen pedido.
    this.rust.startWatcher()
  }

  // --- Ajustes de la aplicación ---------------------------------------------

  async getSettings(): Promise<AppSettings> {
    return settings.readSettings()
  }

  async updateSettings(changes: Partial<AppSettings>): Promise<AppSettings> {
    return settings.updateSettings(changes)
  }

  // --- Instancias -----------------------------------------------------------

  async list(): Promise<InstanceState[]> {
    const manifests = await instances.listInstances()
    // Un servidor de un juego que esta versión no conoce (creado con una app
    // más nueva) no se enseña: la interfaz no sabría pintarlo. Queda intacto en
    // disco y vuelve a aparecer al actualizar.
    return manifests
      .filter((manifest) => isKnownGame(manifest.game))
      .map((manifest) => this.stateFor(manifest))
  }

  async get(id: string): Promise<InstanceState> {
    return this.stateFor(await this.requireManifest(id))
  }

  readManifest(id: string): Promise<InstanceManifest | null> {
    return instances.readManifest(id)
  }

  private async requireManifest(id: string): Promise<InstanceManifest> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    return manifest
  }

  private stateFor(manifest: InstanceManifest): InstanceState {
    const supervisor = this.supervisors.get(manifest.id)
    const status: ServerStatus = this.installing.has(manifest.id)
      ? 'installing'
      : (supervisor?.status ?? 'stopped')

    return {
      manifest,
      status,
      players: supervisor?.players ?? [],
      playerCount: supervisor?.playerCount ?? null,
      joinCode: supervisor?.joinCode ?? null,
      uptimeSeconds: supervisor?.uptimeSeconds ?? null,
      lastError: null
    }
  }

  /**
   * Crea la instancia y la deja instalada y lista para arrancar.
   * Es la operación larga del asistente: descarga todo lo que el juego necesite.
   */
  async create(request: CreateInstanceRequest): Promise<InstanceManifest> {
    const manifest = await instances.createInstance(request, gameFor(request.game))
    await this.install(manifest.id)
    return manifest
  }

  /**
   * `skipBackup` lo usa quien ya ha guardado una copia por su cuenta: cambiar
   * de versión la hace antes de apuntar la versión nueva, para que quede
   * etiquetada con la que tenía y no con la que va a instalarse.
   */
  async install(id: string, options: { skipBackup?: boolean } = {}): Promise<void> {
    const manifest = await this.requireManifest(id)
    if (this.installing.has(id)) throw new Error('Ya hay una instalación en curso.')
    const game = gameOf(manifest)

    this.installing.add(id)
    this.emitStatus(id, 'installing')

    const progress = (phase: string, value: number | null, detail?: string): void => {
      this.emit('progress', { instanceId: id, phase, progress: value, detail })
      if (detail) void this.appendLauncherLog(id, `[${phase}] ${detail}`)
    }

    try {
      // Reinstalar sobre una partida existente es una operación de riesgo: se
      // guarda una copia antes de tocar nada (§12). Si aún no hay partida,
      // falla en silencio porque no hay nada que perder.
      if (!options.skipBackup) {
        await this.createBackup(id, 'Copia previa a reinstalar', true).catch(() => undefined)
      }

      const changes = await game.install(manifest, progress)
      if (changes && Object.keys(changes).length > 0) {
        await instances.updateInstance(id, { data: changes }, game)
      }

      progress('done', 1, 'Servidor listo')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.appendLauncherLog(id, `ERROR de instalación: ${message}`)
      this.emit('diagnosis', id, {
        code: 'install-failed',
        title: 'No se pudo preparar el servidor',
        detail: message
      })
      throw err
    } finally {
      this.installing.delete(id)
      this.emitStatus(id, this.supervisors.get(id)?.status ?? 'stopped')
    }
  }

  /** Null si el juego no gestiona actualizaciones (Minecraft). */
  async checkForUpdate(id: string): Promise<UpdateCheck | null> {
    const manifest = await this.requireManifest(id)
    const game = gameOf(manifest)
    return game.checkUpdate ? game.checkUpdate(manifest) : null
  }

  /** Actualiza el servidor instalado. Solo parado: se sustituyen sus ficheros. */
  async updateServer(id: string): Promise<void> {
    this.assertStopped(id, 'actualizarlo')
    await this.install(id)
  }

  /** Versiones a las que se puede llevar el servidor. Vacío si el juego no elige. */
  async listVersions(id: string): Promise<InstallableVersion[]> {
    const manifest = await this.requireManifest(id)
    const game = gameOf(manifest)
    return game.listVersions ? game.listVersions(manifest) : []
  }

  /**
   * Lleva el servidor a otra versión: la apunta en el manifiesto y reinstala.
   *
   * Sirve igual para subir que para bajar. Bajar es lo delicado —una partida
   * guardada por una versión posterior puede no volver a abrirse—, así que el
   * aviso lo da la interfaz antes de llegar aquí y la copia de seguridad la
   * hace `install`, que ya guarda una antes de tocar nada (§12).
   */
  async changeVersion(id: string, versionId: string): Promise<void> {
    this.assertStopped(id, 'cambiarle la versión')
    const manifest = await this.requireManifest(id)
    const game = gameOf(manifest)
    if (!game.prepareVersionChange) {
      throw new Error(`Los servidores de ${gameInfo(manifest.game).name} no cambian de versión.`)
    }

    // Se valida ANTES de escribir el manifiesto: si la versión no existe, el
    // servidor se queda como estaba en vez de apuntando a una que no se puede
    // instalar.
    const changes = await game.prepareVersionChange(manifest, versionId)

    // Y la copia, antes todavía: la que se guarda es la partida de AHORA, y
    // así queda anotada con la versión de ahora. Si se hiciera después de
    // apuntar la nueva, la copia diría que es de una versión que nunca tuvo, y
    // eso es lo que se lee al restaurarla cuando algo ha salido mal.
    await this.createBackup(id, 'Copia previa a cambiar de versión', true).catch(() => undefined)

    await instances.updateInstance(id, { data: changes }, game)
    await this.install(id, { skipBackup: true })
  }

  async update(id: string, changes: ManifestChanges): Promise<InstanceManifest> {
    return this.updateInstance(id, changes)
  }

  async updateInstance(id: string, changes: ManifestChanges): Promise<InstanceManifest> {
    const manifest = await this.requireManifest(id)
    const updated = await instances.updateInstance(id, changes, gameOf(manifest))
    // Un intervalo nuevo vale desde ya, no desde el próximo arranque.
    if (changes.backup && this.supervisors.get(id)?.status === 'running') {
      await this.startBackupSchedule(id)
    }
    return updated
  }

  async remove(id: string): Promise<void> {
    this.cancelPendingRestart(id)

    const supervisor = this.supervisors.get(id)
    if (supervisor?.isRunning) {
      // Nunca se borra un servidor arrancado: primero se cierra bien (§7).
      await supervisor.stop()
    }
    this.supervisors.delete(id)
    await instances.deleteInstance(id)
  }

  // --- Ejecución ------------------------------------------------------------

  async start(id: string): Promise<void> {
    // Si el usuario arranca a mano durante la espera del reinicio, gana él.
    this.cancelPendingRestart(id)

    const manifest = await this.requireManifest(id)
    const game = gameOf(manifest)

    const missing = requiredAgreements(manifest.game).find(
      (agreement) => !manifest.agreements.includes(agreement.id)
    )
    if (missing) {
      throw new Error(`Hay que aceptar ${missing.label} antes de arrancar el servidor.`)
    }

    const existing = this.supervisors.get(id)
    if (existing?.isRunning) throw new Error('Este servidor ya está arrancado.')

    const spec = await game.launch(manifest)

    const supervisor = this.supervisorFor(id)
    supervisor.setAutoRestart(manifest.autoRestart)
    supervisor.start({
      ...spec,
      stop: game.stop(manifest),
      parseLine: (raw) => game.parseLine(raw),
      diagnoseExit: (code, recent) => game.diagnoseExit(code, recent),
      // Los juegos que no cuentan nada por el registro (Satisfactory) dicen por
      // aquí si ya se puede entrar y cuánta gente hay dentro.
      ...(game.poll
        ? { poll: () => game.poll!(manifest), pollIntervalMs: game.pollIntervalMs }
        : {})
    })
  }

  async stop(id: string): Promise<void> {
    // Va ANTES de comprobar si hay proceso: pulsar "Parar" durante los 3 s de
    // espera debe cancelar el reinicio aunque el servidor ya esté apagado.
    this.cancelPendingRestart(id)

    const supervisor = this.supervisors.get(id)
    if (!supervisor?.isRunning) return
    await supervisor.stop()
  }

  /**
   * Manda un comando al servidor.
   *
   * Lo normal es la entrada estándar del proceso, pero hay juegos que no la
   * tienen: `factorio.exe` es un binario gráfico y solo escucha por RCON. Esos
   * lo declaran en su adaptador, y aquí se enseña en la consola lo enviado y lo
   * que contestaron, para que se vea igual en todos los juegos.
   */
  async sendCommand(id: string, command: string): Promise<void> {
    const supervisor = this.supervisors.get(id)
    if (!supervisor?.isRunning) throw new Error('El servidor no está arrancado.')

    const manifest = await this.readManifest(id)
    const adapter = manifest ? gameOf(manifest) : null
    const clean = command.replace(/[\r\n]+/g, ' ').trim()
    if (clean.length === 0) return

    if (manifest && adapter?.sendCommand) {
      const answer = await adapter.sendCommand(manifest, clean)
      supervisor.echoCommand(clean, answer)
      return
    }
    supervisor.sendCommand(clean)
  }

  /** Cierre limpio de todo lo arrancado. Se llama al salir de la app (§7). */
  async stopAll(): Promise<void> {
    // Cerrar la app cancela cualquier reinicio pendiente: la decisión del
    // usuario siempre gana a la petición de un plugin.
    for (const id of [...this.pendingRestarts.keys()]) this.cancelPendingRestart(id)

    const running = [...this.supervisors.values()].filter((s) => s.isRunning)
    await Promise.all(running.map((s) => s.stop()))
  }

  hasRunningServers(): boolean {
    return [...this.supervisors.values()].some((s) => s.isRunning)
  }

  isRunning(id: string): boolean {
    return this.supervisors.get(id)?.isRunning ?? false
  }

  /** Los identificadores de todos los servidores, de cualquier juego. */
  async listInstanceIds(): Promise<string[]> {
    return (await instances.listInstances()).map((manifest) => manifest.id)
  }

  /** Una línea de sistema en la consola, para lo que hace la app por su cuenta. */
  logSystem(id: string, text: string): void {
    this.systemLog(id, text)
  }

  /**
   * Progreso de algo largo que no es una instalación.
   *
   * Lo usan las operaciones de un juego que tardan y no pasan por `install`
   * (descargar un mod del taller), para que la interfaz se entere por el mismo
   * sitio que de todo lo demás.
   */
  emitProgress(id: string, phase: string, detail: string): void {
    this.emit('progress', { instanceId: id, phase, progress: null, detail })
  }

  /** Lanza un error legible si el servidor está en marcha. */
  assertStopped(id: string, action: string): void {
    const supervisor = this.supervisors.get(id)
    if (supervisor?.isRunning) {
      throw new Error(`Hay que parar el servidor para ${action}.`)
    }
  }

  // --- Reinicio bajo petición del servidor ----------------------------------

  /**
   * Se ejecuta cada vez que un servidor termina.
   *
   * Solo se vuelve a arrancar si el propio servidor dejó un fichero pidiéndolo.
   * Nunca se reinicia por cuenta propia tras un cierre normal ni tras un fallo:
   * eso sería otra cosa (reinicio ante caídas) y no está conectado a nada.
   */
  private async handleExit(id: string, code: number | null, requested: boolean): Promise<void> {
    const requestPath = join(serverDir(id), RESTART_REQUEST_FILE)

    let raw: string
    try {
      raw = await readFile(requestPath, 'utf8')
    } catch {
      return // Sin petición: comportamiento de siempre.
    }

    // Se borra ANTES de decidir nada. Si quedara en disco y el siguiente
    // arranque fallara, se reintentaría sin fin.
    try {
      await rm(requestPath, { force: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.appendLauncherLog(
        id,
        `No se pudo borrar ${RESTART_REQUEST_FILE}, no se reinicia para evitar un bucle: ${message}`
      )
      return
    }

    if (requested) {
      this.systemLog(id, 'Petición de reinicio descartada: el servidor se ha parado a mano.')
      return
    }

    const decision = evaluateRestart(this.restartHistory.get(id) ?? [], Date.now())
    this.restartHistory.set(id, decision.recent)

    if (!decision.allowed) {
      this.emit('diagnosis', id, {
        code: 'restart-loop',
        title: 'El servidor ha pedido reiniciarse demasiadas veces',
        detail:
          'Se ha reiniciado 5 veces en 10 minutos a petición de un plugin. ' +
          'No se vuelve a arrancar solo para no entrar en bucle. Revisa el registro.'
      })
      return
    }

    const run = parseRunNumber(raw)
    const parts = ['Un plugin ha pedido reiniciar el servidor']
    if (run !== null) parts.push(`(run #${run} terminada)`)
    // Que exista el fichero demuestra que el plugin ya hizo su trabajo, así que
    // se reinicia aunque el código de salida no sea 0; pero se deja constancia.
    if (code !== 0) parts.push(`tras salir con código ${code}`)
    this.systemLog(id, `${parts.join(' ')}. Arrancando de nuevo en 3 s…`)

    const timer = setTimeout(() => {
      this.pendingRestarts.delete(id)
      if (this.supervisors.get(id)?.isRunning) return

      void this.start(id).catch(async (err: Error) => {
        await this.appendLauncherLog(id, `No se pudo reiniciar: ${err.message}`)
        this.emit('diagnosis', id, {
          code: 'restart-failed',
          title: 'No se pudo volver a arrancar el servidor',
          detail: err.message
        })
      })
    }, RESTART_DELAY_MS)

    timer.unref?.()
    this.pendingRestarts.set(id, timer)
  }

  private cancelPendingRestart(id: string): void {
    const timer = this.pendingRestarts.get(id)
    if (!timer) return
    clearTimeout(timer)
    this.pendingRestarts.delete(id)
  }

  /**
   * Línea de sistema en la consola y en el log de la app.
   * `pushLog` del supervisor es privado, así que desde aquí se emite igual que
   * hace su listener de `log`.
   */
  private systemLog(id: string, text: string): void {
    this.emit('log', id, { ts: Date.now(), level: 'system', text })
    void this.appendLauncherLog(id, text)
  }

  private supervisorFor(id: string): ServerSupervisor {
    const existing = this.supervisors.get(id)
    if (existing) return existing

    const supervisor = new ServerSupervisor(id)
    supervisor.on('log', (line: LogLine) => {
      this.emit('log', id, line)
      void this.appendLauncherLog(id, line.text)
    })
    supervisor.on('status', (status: ServerStatus) => {
      this.emitStatus(id, status)
      // Las copias programadas solo tienen sentido con el servidor en marcha.
      if (status === 'running') void this.startBackupSchedule(id)
      else this.stopBackupSchedule(id)
    })
    supervisor.on('players', (players: string[], playerCount: number | null) =>
      this.emit('players', id, players, playerCount)
    )
    supervisor.on('joinCode', (code: string | null) => this.emit('joinCode', id, code))
    supervisor.on('diagnosis', (diagnosis: Diagnosis) => this.emit('diagnosis', id, diagnosis))
    supervisor.on('exit', (code: number | null, requested: boolean) => {
      void this.handleExit(id, code, requested)
    })

    this.supervisors.set(id, supervisor)
    return supervisor
  }

  private emitStatus(id: string, status: ServerStatus): void {
    this.emit('status', id, status)
  }

  /** Log propio de la app, separado del log del servidor (§5.1). */
  private async appendLauncherLog(id: string, text: string): Promise<void> {
    try {
      await appendFile(launcherLogPath(id), `${new Date().toISOString()} ${text}\r\n`, 'utf8')
    } catch {
      // El log nunca debe romper la operación en curso.
    }
  }

  // --- Copias de seguridad (§12) -------------------------------------------

  async listBackups(id: string): Promise<BackupInfo[]> {
    return backups.listBackups(id)
  }

  /**
   * Crea una copia. Si el servidor está arrancado, primero pide al juego que
   * deje la partida consistente en disco (en Minecraft: save-off -> save-all
   * flush -> confirmación) y la reanuda al terminar. Sin eso el ZIP puede salir
   * corrupto y no se nota hasta que hace falta.
   */
  async createBackup(id: string, reason?: string, automatic = false): Promise<BackupInfo> {
    const manifest = await this.requireManifest(id)
    const game = gameOf(manifest)

    const supervisor = this.supervisors.get(id)
    const running = supervisor?.isRunning ?? false

    const progress = (detail: string): void => {
      this.emit('progress', { instanceId: id, phase: 'backup', progress: null, detail })
    }

    if (running && supervisor) {
      if (!game.holdSaves) {
        throw new Error('Este juego no permite copias con el servidor en marcha. Páralo primero.')
      }
      progress('Pidiendo al servidor que guarde la partida')
      const flushed = await game.holdSaves(manifest, supervisor)
      if (!flushed) {
        // Se reanuda el guardado automático antes de rendirse: dejarlo apagado
        // sería mucho peor que no tener la copia.
        game.resumeSaves?.(manifest, supervisor)
        throw new Error(
          'El servidor no confirmó que había guardado la partida. ' +
            'No se hace la copia para no guardar datos a medias.'
        )
      }
    }

    try {
      return await backups.createBackup({
        manifest,
        entries: await game.backupEntries(manifest),
        meta: game.backupMeta(manifest),
        automatic,
        reason,
        onProgress: progress
      })
    } finally {
      if (running && supervisor) game.resumeSaves?.(manifest, supervisor)
    }
  }

  async restoreBackup(id: string, fileName: string): Promise<void> {
    const manifest = await this.requireManifest(id)
    const game = gameOf(manifest)

    const supervisor = this.supervisors.get(id)
    if (supervisor?.isRunning) {
      throw new Error('Hay que parar el servidor antes de restaurar una copia.')
    }

    await backups.restoreBackup(manifest, fileName, {
      targets: await game.restoreTargets(manifest),
      saveCurrent: () => this.createBackup(id, `Estado previo a restaurar ${fileName}`, true),
      onProgress: (detail) => {
        this.emit('progress', { instanceId: id, phase: 'restore', progress: null, detail })
      }
    })

    // Lo restaurado puede depender de algo del manifiesto (en Rust, la semilla
    // del mapa): el juego dice qué hay que poner al día.
    const changes = await game.afterRestore?.(manifest)
    if (changes && Object.keys(changes).length > 0) {
      await instances.updateInstance(id, { data: changes }, game)
    }
  }

  async deleteBackup(id: string, fileName: string): Promise<void> {
    await backups.deleteBackup(id, fileName)
  }

  /** Cuánto ocupa una copia y cuánto espacio queda (§12). */
  async backupEstimate(id: string): Promise<BackupEstimate> {
    const manifest = await this.requireManifest(id)
    return backups.estimate(id, await gameOf(manifest).backupEntries(manifest))
  }

  async applyRetention(id: string): Promise<number> {
    const manifest = await instances.readManifest(id)
    if (!manifest?.backup.enabled) return 0
    return backups.applyRetention(id, manifest.backup.keep)
  }

  /** Programa copias periódicas mientras el servidor esté en marcha. */
  private async startBackupSchedule(id: string): Promise<void> {
    this.stopBackupSchedule(id)

    const manifest = await instances.readManifest(id)
    if (!manifest?.backup.enabled || manifest.backup.intervalHours <= 0) return

    // El suelo se aplica también aquí por si el manifiesto se editó a mano.
    const minutes = Math.max(intervalMinutes(manifest.backup), MIN_BACKUP_MINUTES)
    let inFlight = false
    const timer = setInterval(() => {
      // Con intervalos cortos y mundos grandes, una copia puede durar más que
      // el intervalo (o esperar al guardado del juego): no se amontonan.
      if (inFlight) {
        void this.appendLauncherLog(id, 'Copia programada omitida: la anterior aún no ha terminado.')
        return
      }
      inFlight = true
      void this.createBackup(id, 'Copia programada', true)
        .then(() => this.applyRetention(id))
        .catch((err: Error) => {
          void this.appendLauncherLog(id, `Copia programada fallida: ${err.message}`)
        })
        .finally(() => {
          inFlight = false
        })
    }, minutes * 60 * 1000)

    // No debe impedir que la app se cierre si es lo único pendiente.
    timer.unref?.()
    this.backupTimers.set(id, timer)
  }

  private stopBackupSchedule(id: string): void {
    const timer = this.backupTimers.get(id)
    if (!timer) return
    clearInterval(timer)
    this.backupTimers.delete(id)
  }

  // --- Red (§10) ------------------------------------------------------------

  /**
   * Estado de conexión de una instancia.
   * El sondeo lo hace el juego con su propio protocolo, que es lo que hace un
   * cliente de verdad: que el puerto acepte conexiones no significa que se
   * pueda entrar.
   */
  async connectionInfo(id: string): Promise<ConnectionInfo> {
    const manifest = await this.requireManifest(id)

    const supervisor = this.supervisors.get(id)
    const running = supervisor?.status === 'running'

    const info: ConnectionInfo = {
      port: manifest.port,
      loopback: `localhost:${manifest.port}`,
      localAddresses: network.localAddresses(),
      ping: { state: running ? 'comprobando' : 'parado' },
      exposure: manifest.exposure ?? { mode: 'local' },
      // Se lee siempre porque es local y barato: no sale de la máquina.
      gateway: await network.defaultGateway()
    }

    if (!running) return info

    const ping = await gameOf(manifest).ping(manifest)
    info.ping = ping.ok
      ? {
          state: 'ok',
          motd: ping.motd,
          versionName: ping.versionName,
          playersOnline: ping.playersOnline,
          playersMax: ping.playersMax,
          latencyMs: ping.latencyMs
        }
      : { state: 'no-responde' }

    return info
  }

  /**
   * IP pública, para poder enseñar la dirección que de verdad sirve cuando el
   * usuario ha elegido abrir el puerto del router.
   *
   * Implica consultar un servicio externo, así que solo se llama cuando esa
   * elección ya se ha hecho: sin la IP no hay dirección que darle a nadie.
   */
  async publicIp(): Promise<string | null> {
    return network.publicIp()
  }

  /**
   * Sugiere un puerto libre cuando el elegido está ocupado (§7).
   *
   * El protocolo importa: un puerto UDP «reservable» no está libre, y los
   * juegos de Steam usan casi siempre UDP (ver README).
   */
  async suggestFreePort(from: number, protocol: PortProtocol = 'tcp'): Promise<number> {
    return network.findFreePortBlock(from, protocol)
  }

  /**
   * Comprueba si el servidor es accesible DESDE INTERNET.
   *
   * Solo se ejecuta cuando el usuario lo pide de forma explícita: consulta su
   * IP pública y pide a un servicio externo que intente conectarse, así que
   * implica contactar con terceros (§10, nota de privacidad).
   *
   * Es la única comprobación honesta: desde esta máquina el servidor siempre
   * se ve, esté o no abierto al exterior.
   */
  async checkFromInternet(id: string): Promise<ExternalCheck> {
    const manifest = await this.requireManifest(id)
    const game = gameOf(manifest)

    const exposure = manifest.exposure ?? { mode: 'local' as const }
    const checkedAt = new Date().toISOString()

    // Hay juegos a los que nadie de fuera sabe preguntar (Satisfactory no sale
    // en ninguna lista pública). Decirlo es más honesto que un botón que
    // siempre respondería que no se llega.
    if (!game.checkFromInternet) {
      return {
        reachable: false,
        address: '',
        checkedAt,
        error:
          `${gameInfo(manifest.game).name} no aparece en ninguna lista pública, así que no hay ` +
          'ningún servicio al que preguntar si se llega desde fuera. La única prueba de verdad es ' +
          'que alguien de otra red añada tu dirección en su juego.'
      }
    }

    const supervisor = this.supervisors.get(id)
    if (supervisor?.status !== 'running') {
      return {
        reachable: false,
        address: '',
        checkedAt,
        error: 'El servidor tiene que estar arrancado para poder comprobarlo.'
      }
    }

    // Con túnel se comprueba la dirección que da playit.gg; con router, la IP
    // pública. Son destinos distintos y comprobar el equivocado no diría nada.
    if (exposure.mode === 'tunnel') {
      const address = (exposure.tunnelAddress ?? '').trim()
      if (address.length === 0) {
        return {
          reachable: false,
          address: '',
          checkedAt,
          error: 'Falta la dirección que te ha dado playit.gg.'
        }
      }

      const [host, port] = splitAddress(address, manifest.port)
      const result = await game.checkFromInternet(host, port)
      return { ...result, address, checkedAt }
    }

    const ip = await network.publicIp()
    if (!ip) {
      return {
        reachable: false,
        address: '',
        checkedAt,
        error: 'No se pudo averiguar tu IP pública. ¿Tienes conexión a internet?'
      }
    }

    const result = await game.checkFromInternet(ip, manifest.port)
    return { ...result, address: `${ip}:${manifest.port}`, publicIp: ip, checkedAt }
  }
}

/**
 * Número de run del fichero de petición, solo para el texto del mensaje.
 * El formato puede cambiar, así que cualquier fallo se traga y se omite el dato.
 */
function parseRunNumber(raw: string): number | null {
  try {
    const data = JSON.parse(raw) as { run?: unknown }
    return typeof data.run === 'number' ? data.run : null
  } catch {
    return null
  }
}

/**
 * Separa "host:puerto" tolerando que el usuario pegue solo el host.
 * playit.gg suele dar direcciones sin puerto explícito.
 */
function splitAddress(address: string, fallbackPort: number): [string, number] {
  const clean = address.replace(/^\w+:\/\//, '').trim()
  const index = clean.lastIndexOf(':')
  if (index === -1) return [clean, fallbackPort]

  const port = Number(clean.slice(index + 1))
  if (!Number.isFinite(port) || port <= 0) return [clean, fallbackPort]
  return [clean.slice(0, index), port]
}

export const service = new LauncherService()
