import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  MINECRAFT_IPC,
  SATISFACTORY_IPC,
  VALHEIM_IPC,
  EVENTS,
  type MemoryInfo,
  type SystemMemory
} from '../shared/ipc'
import type { InstallableVersion, PortProtocol, UpdateCheck } from '../shared/games'
import type { OfficialPluginStatus } from '../shared/games/minecraft/officialPlugins'
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
} from '../shared/types'
import type {
  ContentInfo,
  CreateWorldRequest,
  Distribution,
  DistributionVersion,
  PropertyDefinition,
  WorldInfo
} from '../shared/games/minecraft/types'
import type {
  SatisfactorySessions,
  SatisfactoryState
} from '../shared/games/satisfactory/types'
import type {
  ValheimListEntry,
  ValheimListKind,
  ValheimWorld
} from '../shared/games/valheim/types'

/** Ajustes del servidor de Satisfactory, con lo pendiente de un reinicio. */
interface SatisfactoryOptions {
  options: Record<string, string>
  pending: Record<string, string>
}

/** Reglas de la partida, que son las que quitan los logros. */
interface SatisfactoryGameRules {
  creativeModeEnabled: boolean
  settings: Record<string, string>
}

/**
 * Superficie que ve la interfaz. Nada de Node ni de Electron llega al renderer:
 * solo estas funciones (§12, principio de mínimo privilegio).
 *
 * Lo común a cualquier juego cuelga directamente de `window.qubiq`; lo propio
 * de un juego, de su nombre (`window.qubiq.minecraft`).
 */

function subscribe<T extends unknown[]>(
  channel: string,
  handler: (...args: T) => void
): () => void {
  const listener = (_event: unknown, ...args: unknown[]): void => handler(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const minecraft = {
  catalog: {
    versions: (distribution: Distribution, includeUnstable = false): Promise<DistributionVersion[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.listVersions, distribution, includeUnstable),
    defaultVersion: (distribution: Distribution): Promise<string> =>
      ipcRenderer.invoke(MINECRAFT_IPC.defaultVersion, distribution),
    memory: (): Promise<MemoryInfo> => ipcRenderer.invoke(MINECRAFT_IPC.suggestedMemory),
    recommendMemory: (players: number, distribution: Distribution): Promise<number> =>
      ipcRenderer.invoke(MINECRAFT_IPC.recommendMemory, players, distribution)
  },

  config: {
    get: (id: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke(MINECRAFT_IPC.getProperties, id),
    set: (id: string, values: Record<string, string>): Promise<Record<string, string>> =>
      ipcRenderer.invoke(MINECRAFT_IPC.setProperties, id, values),
    catalog: (): Promise<PropertyDefinition[]> => ipcRenderer.invoke(MINECRAFT_IPC.propertyCatalog)
  },

  content: {
    list: (id: string): Promise<ContentInfo> => ipcRenderer.invoke(MINECRAFT_IPC.listContent, id),
    openFolder: (id: string): Promise<string | null> =>
      ipcRenderer.invoke(MINECRAFT_IPC.contentFolder, id),
    setEnabled: (id: string, fileName: string, enabled: boolean): Promise<ContentInfo> =>
      ipcRenderer.invoke(MINECRAFT_IPC.setContentEnabled, id, fileName, enabled),
    remove: (id: string, fileName: string): Promise<ContentInfo> =>
      ipcRenderer.invoke(MINECRAFT_IPC.removeContent, id, fileName)
  },

  official: {
    list: (id: string): Promise<OfficialPluginStatus[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.listOfficialPlugins, id),
    install: (id: string, pluginId: string, role?: string): Promise<OfficialPluginStatus[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.installOfficialPlugin, id, pluginId, role),
    uninstall: (
      id: string,
      pluginId: string,
      removeConfig: boolean
    ): Promise<OfficialPluginStatus[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.uninstallOfficialPlugin, id, pluginId, removeConfig),
    setConfig: (
      id: string,
      pluginId: string,
      values: Record<string, string | number | boolean>
    ): Promise<OfficialPluginStatus[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.setOfficialPluginConfig, id, pluginId, values)
  },

  worlds: {
    list: (id: string): Promise<WorldInfo[]> => ipcRenderer.invoke(MINECRAFT_IPC.listWorlds, id),
    create: (id: string, request: CreateWorldRequest): Promise<WorldInfo[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.createWorld, id, request),
    activate: (id: string, name: string): Promise<WorldInfo[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.activateWorld, id, name),
    remove: (id: string, name: string): Promise<WorldInfo[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.deleteWorld, id, name)
  }
}

const satisfactory = {
  /** Estado en vivo. `null` si el servidor no está arrancado. */
  state: (id: string): Promise<SatisfactoryState | null> =>
    ipcRenderer.invoke(SATISFACTORY_IPC.state, id),

  sessions: {
    list: (id: string): Promise<SatisfactorySessions> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.listSessions, id),
    create: (id: string, sessionName: string): Promise<SatisfactorySessions> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.createGame, id, sessionName),
    load: (id: string, saveName: string, sessionName: string): Promise<SatisfactorySessions> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.loadSave, id, saveName, sessionName),
    saveNow: (id: string, saveName: string): Promise<SatisfactorySessions> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.saveNow, id, saveName),
    removeSave: (id: string, saveName: string): Promise<SatisfactorySessions> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.deleteSave, id, saveName),
    removeSession: (id: string, sessionName: string): Promise<SatisfactorySessions> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.deleteSession, id, sessionName)
  },

  options: {
    get: (id: string): Promise<SatisfactoryOptions> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.getOptions, id),
    set: (id: string, options: Record<string, string>): Promise<SatisfactoryOptions> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.setOptions, id, options)
  },

  rules: {
    get: (id: string): Promise<SatisfactoryGameRules> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.getGameRules, id),
    set: (id: string, settings: Record<string, string>): Promise<SatisfactoryGameRules> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.setGameRules, id, settings)
  },

  setClientPassword: (id: string, password: string): Promise<void> =>
    ipcRenderer.invoke(SATISFACTORY_IPC.setClientPassword, id, password)
}

const valheim = {
  /**
   * Mundos del servidor. Crear, cambiar y borrar exigen el servidor parado: el
   * mundo activo va en la línea de órdenes del arranque.
   */
  worlds: {
    list: (id: string): Promise<ValheimWorld[]> => ipcRenderer.invoke(VALHEIM_IPC.listWorlds, id),
    create: (id: string, name: string): Promise<ValheimWorld[]> =>
      ipcRenderer.invoke(VALHEIM_IPC.createWorld, id, name),
    activate: (id: string, name: string): Promise<ValheimWorld[]> =>
      ipcRenderer.invoke(VALHEIM_IPC.activateWorld, id, name),
    rename: (id: string, name: string, newName: string): Promise<ValheimWorld[]> =>
      ipcRenderer.invoke(VALHEIM_IPC.renameWorld, id, name, newName),
    remove: (id: string, name: string): Promise<ValheimWorld[]> =>
      ipcRenderer.invoke(VALHEIM_IPC.deleteWorld, id, name)
  },

  /** Las tres listas de texto con las que se modera en Valheim. */
  moderation: {
    get: (id: string, kind: ValheimListKind): Promise<ValheimListEntry[]> =>
      ipcRenderer.invoke(VALHEIM_IPC.getList, id, kind),
    add: (
      id: string,
      kind: ValheimListKind,
      playerId: string,
      note?: string
    ): Promise<ValheimListEntry[]> =>
      ipcRenderer.invoke(VALHEIM_IPC.addToList, id, kind, playerId, note),
    remove: (id: string, kind: ValheimListKind, playerId: string): Promise<ValheimListEntry[]> =>
      ipcRenderer.invoke(VALHEIM_IPC.removeFromList, id, kind, playerId)
  }
}

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.getSettings),
    update: (changes: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.updateSettings, changes)
  },

  instances: {
    list: (): Promise<InstanceState[]> => ipcRenderer.invoke(IPC.listInstances),
    get: (id: string): Promise<InstanceState> => ipcRenderer.invoke(IPC.getInstance, id),
    create: (request: CreateInstanceRequest): Promise<InstanceManifest> =>
      ipcRenderer.invoke(IPC.createInstance, request),
    update: (id: string, changes: ManifestChanges): Promise<InstanceManifest> =>
      ipcRenderer.invoke(IPC.updateInstance, id, changes),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.deleteInstance, id),
    reinstall: (id: string): Promise<void> => ipcRenderer.invoke(IPC.reinstallInstance, id),
    checkUpdate: (id: string): Promise<UpdateCheck | null> =>
      ipcRenderer.invoke(IPC.checkForUpdate, id),
    updateServer: (id: string): Promise<void> => ipcRenderer.invoke(IPC.updateServer, id),
    listVersions: (id: string): Promise<InstallableVersion[]> =>
      ipcRenderer.invoke(IPC.listVersions, id),
    changeVersion: (id: string, versionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.changeVersion, id, versionId),
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke(IPC.openInstanceFolder, id)
  },

  server: {
    start: (id: string): Promise<void> => ipcRenderer.invoke(IPC.startServer, id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IPC.stopServer, id),
    command: (id: string, command: string): Promise<void> =>
      ipcRenderer.invoke(IPC.sendCommand, id, command)
  },

  backups: {
    list: (id: string): Promise<BackupInfo[]> => ipcRenderer.invoke(IPC.listBackups, id),
    estimate: (id: string): Promise<BackupEstimate> => ipcRenderer.invoke(IPC.backupEstimate, id),
    create: (id: string, reason?: string): Promise<BackupInfo> =>
      ipcRenderer.invoke(IPC.createBackup, id, reason),
    restore: (id: string, fileName: string): Promise<void> =>
      ipcRenderer.invoke(IPC.restoreBackup, id, fileName),
    remove: (id: string, fileName: string): Promise<void> =>
      ipcRenderer.invoke(IPC.deleteBackup, id, fileName)
  },

  network: {
    info: (id: string): Promise<ConnectionInfo> => ipcRenderer.invoke(IPC.connectionInfo, id),
    freePort: (from: number, protocol: PortProtocol = 'tcp'): Promise<number> =>
      ipcRenderer.invoke(IPC.suggestFreePort, from, protocol),
    checkFromInternet: (id: string): Promise<ExternalCheck> =>
      ipcRenderer.invoke(IPC.checkFromInternet, id),
    publicIp: (): Promise<string | null> => ipcRenderer.invoke(IPC.publicIp)
  },

  system: {
    /** Memoria del equipo, para avisar de lo que pide cada juego. */
    memory: (): Promise<SystemMemory> => ipcRenderer.invoke(IPC.systemMemory)
  },

  minecraft,
  satisfactory,
  valheim,

  on: {
    log: (handler: (id: string, line: LogLine) => void) =>
      subscribe<[string, LogLine]>(EVENTS.log, handler),
    status: (handler: (id: string, status: ServerStatus) => void) =>
      subscribe<[string, ServerStatus]>(EVENTS.status, handler),
    players: (handler: (id: string, players: string[], playerCount: number | null) => void) =>
      subscribe<[string, string[], number | null]>(EVENTS.players, handler),
    joinCode: (handler: (id: string, code: string | null) => void) =>
      subscribe<[string, string | null]>(EVENTS.joinCode, handler),
    progress: (handler: (update: ProgressUpdate) => void) =>
      subscribe<[ProgressUpdate]>(EVENTS.progress, handler),
    diagnosis: (handler: (id: string, diagnosis: Diagnosis) => void) =>
      subscribe<[string, Diagnosis]>(EVENTS.diagnosis, handler)
  }
}

export type QubiqApi = typeof api

contextBridge.exposeInMainWorld('qubiq', api)
