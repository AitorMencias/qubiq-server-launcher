import { EventEmitter } from 'node:events'
import { appendFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AppSettings,
  BackupEstimate,
  BackupInfo,
  ConnectionInfo,
  ContentInfo,
  CreateInstanceRequest,
  CreateWorldRequest,
  Diagnosis,
  ExternalCheck,
  InstanceManifest,
  InstanceState,
  LogLine,
  ProgressUpdate,
  ServerStatus,
  WorldInfo
} from '@shared/types'
import { ServerSupervisor } from './runtime/supervisor'
import { installerFor } from './install'
import type { InstallContext } from './install'
import * as instances from './instances/manager'
import * as java from './java/manager'
import * as backups from './backup/manager'
import * as worlds from './worlds/manager'
import * as content from './content/manager'
import * as official from './content/official'
import type { OfficialPluginStatus } from './content/official'
import { officialPluginById, serverPropertiesFor } from '@shared/officialPlugins'
import * as network from './net/network'
import * as settings from './settings/manager'
import { serverDir, launcherLogPath, ensureBaseDirs } from './paths'
import { evaluateRestart } from './runtime/restartPolicy'

/**
 * Orquestador del núcleo (§5).
 *
 * Une catálogo, Java, instalador y supervisor, y expone una superficie de
 * comandos + eventos. No conoce la interfaz: eso permite reutilizarlo tal cual
 * desde una CLI o un panel web más adelante.
 */

export interface ServiceEvents {
  log: (instanceId: string, line: LogLine) => void
  status: (instanceId: string, status: ServerStatus) => void
  players: (instanceId: string, players: string[]) => void
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

class LauncherService extends EventEmitter {
  private readonly supervisors = new Map<string, ServerSupervisor>()
  /** Instancias con una instalación en curso. */
  private readonly installing = new Set<string>()
  /** Temporizadores de copia programada, uno por instancia arrancada. */
  private readonly backupTimers = new Map<string, NodeJS.Timeout>()
  /** Reinicios ya programados, para poder cancelarlos. */
  private readonly pendingRestarts = new Map<string, NodeJS.Timeout>()
  /** Marcas de tiempo de reinicios recientes, para la política anti-bucle. */
  private readonly restartHistory = new Map<string, number[]>()

  async initialize(): Promise<void> {
    await ensureBaseDirs()
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
    return manifests.map((manifest) => this.stateFor(manifest))
  }

  async get(id: string): Promise<InstanceState> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    return this.stateFor(manifest)
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
      uptimeSeconds: supervisor?.uptimeSeconds ?? null,
      lastError: null
    }
  }

  /**
   * Crea la instancia y la deja instalada y lista para arrancar.
   * Es la operación larga del asistente: descarga Java, el servidor y, en el
   * caso de Forge, ejecuta el instalador oficial.
   */
  async create(request: CreateInstanceRequest): Promise<InstanceManifest> {
    const manifest = await instances.createInstance(request)
    await this.install(manifest.id)
    return manifest
  }

  async install(id: string): Promise<void> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (this.installing.has(id)) throw new Error('Ya hay una instalación en curso.')

    this.installing.add(id)
    this.emitStatus(id, 'installing')

    const progress = (phase: string, value: number | null, detail?: string): void => {
      this.emit('progress', { instanceId: id, phase, progress: value, detail })
      if (detail) void this.appendLauncherLog(id, `[${phase}] ${detail}`)
    }

    try {
      // Reinstalar sobre un mundo existente es una operación de riesgo: se
      // guarda una copia antes de tocar nada (§12). Si aún no hay mundo, falla
      // silenciosamente porque no hay nada que perder.
      await this.createBackup(id, 'Copia previa a reinstalar', true).catch(() => undefined)

      // 1. Java. El usuario nunca lo instala a mano (§4.7).
      progress('java', null, `Comprobando Java ${manifest.javaMajor}`)
      const runtime = await java.ensureJava(manifest.javaMajor, (phase, value, detail) => {
        progress(phase === 'download' ? 'java-download' : 'java-extract', value, detail)
      })

      // 2. La distribución elegida.
      const installer = installerFor(manifest.distribution)
      const ctx: InstallContext = {
        instanceId: id,
        serverDir: serverDir(id),
        minecraftVersion: manifest.minecraftVersion,
        build: manifest.build,
        javaPath: runtime.javaPath,
        memoryMb: manifest.memoryMb,
        onProgress: progress
      }

      const result = await installer.install(ctx)
      if (result.build && result.build !== manifest.build) {
        await instances.updateInstance(id, { build: result.build })
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

  async update(
    id: string,
    changes: Partial<Omit<InstanceManifest, 'id' | 'schemaVersion'>>
  ): Promise<InstanceManifest> {
    return instances.updateInstance(id, changes)
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

    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (!manifest.eulaAccepted) {
      throw new Error('Hay que aceptar el EULA de Minecraft antes de arrancar el servidor.')
    }

    const existing = this.supervisors.get(id)
    if (existing?.isRunning) throw new Error('Este servidor ya está arrancado.')

    const runtime = await java.ensureJava(manifest.javaMajor)
    const installer = installerFor(manifest.distribution)

    const ctx: InstallContext = {
      instanceId: id,
      serverDir: serverDir(id),
      minecraftVersion: manifest.minecraftVersion,
      build: manifest.build,
      javaPath: runtime.javaPath,
      memoryMb: manifest.memoryMb,
      onProgress: () => undefined
    }

    // El plan de arranque se recalcula siempre desde el disco: en Forge el
    // argfile puede haber cambiado tras una reinstalación (§6).
    const plan = await installer.buildLaunchPlan(ctx)

    const supervisor = this.supervisorFor(id)
    supervisor.setAutoRestart(manifest.autoRestart)
    supervisor.start({
      javaPath: runtime.javaPath,
      args: plan.args,
      cwd: serverDir(id)
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

  sendCommand(id: string, command: string): void {
    const supervisor = this.supervisors.get(id)
    if (!supervisor?.isRunning) throw new Error('El servidor no está arrancado.')
    supervisor.sendCommand(command)
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
    supervisor.on('players', (players: string[]) => this.emit('players', id, players))
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

  // --- Configuración --------------------------------------------------------

  async getProperties(id: string): Promise<Record<string, string>> {
    return instances.readProperties(id)
  }

  async setProperties(
    id: string,
    values: Record<string, string>
  ): Promise<Record<string, string>> {
    const supervisor = this.supervisors.get(id)
    if (supervisor?.isRunning) {
      throw new Error(
        'Hay que parar el servidor para cambiar su configuración. ' +
          'Si no, la sobrescribirá al cerrarse.'
      )
    }
    return instances.writeProperties(id, values)
  }

  // --- Plugins y mods (§4.8) ------------------------------------------------

  async listContent(id: string): Promise<ContentInfo> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    return content.listContent(id, manifest.distribution)
  }

  /** Ruta de la carpeta de plugins/mods, creada si hacía falta. */
  async contentFolder(id: string): Promise<string | null> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    return content.contentFolder(id, manifest.distribution)
  }

  async setContentEnabled(id: string, fileName: string, enabled: boolean): Promise<ContentInfo> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    this.assertStopped(id, 'activar o desactivar plugins y mods')
    return content.setEnabled(id, manifest.distribution, fileName, enabled)
  }

  async removeContent(id: string, fileName: string): Promise<ContentInfo> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    this.assertStopped(id, 'borrar plugins o mods')
    return content.removeContent(id, manifest.distribution, fileName)
  }

  // --- Plugins oficiales ----------------------------------------------------

  async listOfficialPlugins(id: string): Promise<OfficialPluginStatus[]> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    return official.listOfficial(id, manifest.distribution)
  }

  /**
   * Instala un plugin oficial y aplica los ajustes de `server.properties` que
   * necesita: aceptar transferencias siempre, y el modo extremo si el papel
   * elegido lo exige.
   *
   * La interfaz ya ha avisado de lo que va a cambiar; prometerlo y no hacerlo
   * dejaría la partida en supervivencia normal sin que nadie se diera cuenta
   * hasta morirse y reaparecer tan tranquilo, o con un lobby incapaz de mandar
   * a nadie a jugar.
   */
  async installOfficialPlugin(
    id: string,
    pluginId: string,
    role?: string
  ): Promise<OfficialPluginStatus[]> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    this.assertStopped(id, 'instalar un plugin')

    const result = await official.install(id, manifest.distribution, pluginId, role)

    const plugin = officialPluginById(pluginId)
    if (plugin) {
      const properties = serverPropertiesFor(plugin, role)
      if (Object.keys(properties).length > 0) {
        await instances.writeProperties(id, properties)
      }
    }

    return result
  }

  async uninstallOfficialPlugin(
    id: string,
    pluginId: string,
    removeConfig = false
  ): Promise<OfficialPluginStatus[]> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    this.assertStopped(id, 'quitar un plugin')
    return official.uninstall(id, manifest.distribution, pluginId, removeConfig)
  }

  async setOfficialPluginConfig(
    id: string,
    pluginId: string,
    values: Record<string, string | number | boolean>
  ): Promise<OfficialPluginStatus[]> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    // El plugin lee su configuración al arrancar: cambiarla en caliente no
    // tendría efecto y daría una falsa sensación de haberlo aplicado.
    this.assertStopped(id, 'cambiar la configuración de un plugin')
    return official.writeConfig(id, manifest.distribution, pluginId, values)
  }

  // --- Mundos ---------------------------------------------------------------

  async listWorlds(id: string): Promise<WorldInfo[]> {
    return worlds.listWorlds(id)
  }

  /**
   * Las tres operaciones de mundos escriben en server.properties, así que
   * exigen el servidor parado: en marcha lo reescribe al cerrarse y se
   * perderían los cambios (§8).
   */
  private assertStopped(id: string, action: string): void {
    const supervisor = this.supervisors.get(id)
    if (supervisor?.isRunning) {
      throw new Error(`Hay que parar el servidor para ${action}.`)
    }
  }

  async createWorld(id: string, request: CreateWorldRequest): Promise<WorldInfo[]> {
    this.assertStopped(id, 'crear un mundo')
    await worlds.createWorld(id, request)
    return worlds.listWorlds(id)
  }

  async activateWorld(id: string, name: string): Promise<WorldInfo[]> {
    this.assertStopped(id, 'cambiar de mundo')
    await worlds.activateWorld(id, name)
    return worlds.listWorlds(id)
  }

  async deleteWorld(id: string, name: string): Promise<WorldInfo[]> {
    this.assertStopped(id, 'borrar un mundo')

    // Un mundo borrado no se recupera, así que antes se guarda una copia,
    // igual que se hace antes de reinstalar o restaurar (§12).
    const active = await worlds.activeWorldName(id)
    if (name === active) {
      // No debería llegar aquí (el gestor lo impide), pero si el mundo activo
      // fuera el que se borra, la copia previa sería justo la que hace falta.
      await this.createBackup(id, `Copia previa a borrar "${name}"`, true).catch(() => undefined)
    }

    await worlds.deleteWorld(id, name)
    return worlds.listWorlds(id)
  }

  // --- Copias de seguridad (§12) -------------------------------------------

  async listBackups(id: string): Promise<BackupInfo[]> {
    return backups.listBackups(id)
  }

  /**
   * Crea una copia. Si el servidor está arrancado aplica la secuencia segura:
   *   save-off -> save-all flush -> esperar confirmación -> copiar -> save-on
   * Sin ella el ZIP puede salir corrupto y no se nota hasta que hace falta.
   */
  async createBackup(id: string, reason?: string, automatic = false): Promise<BackupInfo> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)

    const supervisor = this.supervisors.get(id)
    const running = supervisor?.isRunning ?? false

    const progress = (detail: string): void => {
      this.emit('progress', { instanceId: id, phase: 'backup', progress: null, detail })
    }

    if (running && supervisor) {
      progress('Pidiendo al servidor que guarde el mundo')
      const flushed = await supervisor.flushAndHoldSaves()
      if (!flushed) {
        // Se reanuda el autoguardado antes de rendirse: dejarlo apagado sería
        // mucho peor que no tener la copia.
        supervisor.resumeSaves()
        throw new Error(
          'El servidor no confirmó que había guardado el mundo. ' +
            'No se hace la copia para no guardar datos a medias.'
        )
      }
    }

    try {
      return await backups.createBackup({ manifest, automatic, reason, onProgress: progress })
    } finally {
      if (running && supervisor) supervisor.resumeSaves()
    }
  }

  async restoreBackup(id: string, fileName: string): Promise<void> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)

    const supervisor = this.supervisors.get(id)
    if (supervisor?.isRunning) {
      throw new Error('Hay que parar el servidor antes de restaurar una copia.')
    }

    await backups.restoreBackup(manifest, fileName, (detail) => {
      this.emit('progress', { instanceId: id, phase: 'restore', progress: null, detail })
    })
  }

  async deleteBackup(id: string, fileName: string): Promise<void> {
    await backups.deleteBackup(id, fileName)
  }

  /** Cuánto ocupa una copia y cuánto espacio queda (§12). */
  async backupEstimate(id: string): Promise<BackupEstimate> {
    return backups.estimate(id)
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

    const intervalMs = manifest.backup.intervalHours * 60 * 60 * 1000
    const timer = setInterval(() => {
      void this.createBackup(id, 'Copia programada', true)
        .then(() => this.applyRetention(id))
        .catch((err: Error) => {
          void this.appendLauncherLog(id, `Copia programada fallida: ${err.message}`)
        })
    }, intervalMs)

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
   * El sondeo usa Server List Ping, que es lo que hace el juego de verdad:
   * que el puerto acepte conexiones no significa que se pueda entrar.
   */
  async connectionInfo(id: string): Promise<ConnectionInfo> {
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)

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

    const ping = await network.serverListPing('127.0.0.1', manifest.port)
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

  /** Sugiere un puerto libre cuando el elegido está ocupado (§7). */
  async suggestFreePort(from: number): Promise<number> {
    return network.findFreePort(from)
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
    const manifest = await instances.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)

    const exposure = manifest.exposure ?? { mode: 'local' as const }
    const checkedAt = new Date().toISOString()

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

      const [host, portText] = splitAddress(address, manifest.port)
      const result = await network.checkFromInternet(host, portText)
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

    const result = await network.checkFromInternet(ip, manifest.port)
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
