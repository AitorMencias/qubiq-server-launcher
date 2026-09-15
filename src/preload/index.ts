import { contextBridge, ipcRenderer } from 'electron'
import { IPC, MINECRAFT_IPC, EVENTS, type MemoryInfo } from '../shared/ipc'
import type { UpdateCheck } from '../shared/games'
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
    freePort: (from: number): Promise<number> => ipcRenderer.invoke(IPC.suggestFreePort, from),
    checkFromInternet: (id: string): Promise<ExternalCheck> =>
      ipcRenderer.invoke(IPC.checkFromInternet, id),
    publicIp: (): Promise<string | null> => ipcRenderer.invoke(IPC.publicIp)
  },

  minecraft,

  on: {
    log: (handler: (id: string, line: LogLine) => void) =>
      subscribe<[string, LogLine]>(EVENTS.log, handler),
    status: (handler: (id: string, status: ServerStatus) => void) =>
      subscribe<[string, ServerStatus]>(EVENTS.status, handler),
    players: (handler: (id: string, players: string[]) => void) =>
      subscribe<[string, string[]]>(EVENTS.players, handler),
    progress: (handler: (update: ProgressUpdate) => void) =>
      subscribe<[ProgressUpdate]>(EVENTS.progress, handler),
    diagnosis: (handler: (id: string, diagnosis: Diagnosis) => void) =>
      subscribe<[string, Diagnosis]>(EVENTS.diagnosis, handler)
  }
}

export type QubiqApi = typeof api

contextBridge.exposeInMainWorld('qubiq', api)
