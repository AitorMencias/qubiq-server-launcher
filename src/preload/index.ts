import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  MINECRAFT_IPC,
  SATISFACTORY_IPC,
  VALHEIM_IPC,
  FACTORIO_IPC,
  ZOMBOID_IPC,
  ENSHROUDED_IPC,
  RUST_IPC,
  REMOTE_IPC,
  REMOTE_LINKS_IPC,
  EVENTS,
  type MemoryInfo,
  type SystemMemory
} from '../shared/ipc'
import type {
  RemoteActivityEntry,
  RemoteArgs,
  RemoteClientResult,
  RemoteInvite,
  RemoteLink,
  RemoteLinkRequest,
  RemoteLinksState,
  RemoteOrder,
  RemotePermissions,
  RemoteProbe,
  RemoteStatus,
  RemoteUnlinkResult
} from '../shared/remote'
import type { InstallableVersion, PortProtocol, UpdateCheck } from '../shared/games'
import type { JournalEntry } from '../shared/journal'
import type {
  BootInfo,
  DataFolderInfo,
  RelocationPlan,
  RelocationStatus
} from '../shared/dataFolder'
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
import type { ConfigChange } from '../shared/editableConfig'
import type {
  ContentConfigDocument,
  ContentConfigInfo,
  ContentConfigSaveResult,
  ContentInfo,
  CreateWorldRequest,
  Distribution,
  DistributionVersion,
  ImportInspection,
  PropertyDefinition,
  StartFileInfo,
  WorldInfo
} from '../shared/games/minecraft/types'
import type {
  SatisfactorySessions,
  SatisfactoryState
} from '../shared/games/satisfactory/types'
import type {
  ModCatalogItem,
  ModInstallResult,
  ModsView
} from '../shared/games/mods'
import type {
  ValheimListEntry,
  ValheimListKind,
  ValheimWorld
} from '../shared/games/valheim/types'
import type { FactorioListKind, FactorioSave } from '../shared/games/factorio/types'
import type {
  ZomboidAccount,
  ZomboidBannedIp,
  ZomboidModEntry,
  ZomboidRole
} from '../shared/games/zomboid/types'
import type {
  EnshroudedBan,
  EnshroudedRole,
  EnshroudedWorld
} from '../shared/games/enshrouded/types'
import type {
  RustAdmin,
  RustBan,
  RustConfigChanges,
  RustConfigView,
  RustMapView,
  RustPlayer,
  RustWipeOptions,
  RustWipePlan
} from '../shared/games/rust/types'
import type { EditableConfig } from '../shared/editableConfig'

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
      ipcRenderer.invoke(MINECRAFT_IPC.removeContent, id, fileName),

    /** Configuración de un plugin o mod instalado (§19.20). */
    config: {
      files: (id: string, fileName: string): Promise<ContentConfigInfo> =>
        ipcRenderer.invoke(MINECRAFT_IPC.contentConfigFiles, id, fileName),
      read: (id: string, path: string): Promise<ContentConfigDocument> =>
        ipcRenderer.invoke(MINECRAFT_IPC.readContentConfig, id, path),
      write: (
        id: string,
        path: string,
        hash: string,
        changes: ConfigChange[]
      ): Promise<ContentConfigSaveResult> =>
        ipcRenderer.invoke(MINECRAFT_IPC.writeContentConfig, id, path, hash, changes),
      /** Abre el fichero o la carpeta con el programa de Windows. */
      open: (id: string, path: string): Promise<void> =>
        ipcRenderer.invoke(MINECRAFT_IPC.openContentConfig, id, path)
    }
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
  },

  /** Servidores a medida: traer una carpeta que ya existe y elegir cómo arranca. */
  custom: {
    /** Abre el selector de carpetas de Windows. Null si se cancela. */
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(MINECRAFT_IPC.pickImportFolder),
    inspect: (folder: string): Promise<ImportInspection> =>
      ipcRenderer.invoke(MINECRAFT_IPC.inspectImport, folder),
    /** Elegir a mano el archivo de inicio, dentro de la carpeta o del servidor ya traído. */
    pickStartFile: (
      target: { folder: string } | { instanceId: string }
    ): Promise<StartFileInfo | null> => ipcRenderer.invoke(MINECRAFT_IPC.pickStartFile, target),
    startFiles: (id: string): Promise<StartFileInfo[]> =>
      ipcRenderer.invoke(MINECRAFT_IPC.listStartFiles, id),
    setStartFile: (id: string, path: string): Promise<InstanceManifest> =>
      ipcRenderer.invoke(MINECRAFT_IPC.setStartFile, id, path)
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
    ipcRenderer.invoke(SATISFACTORY_IPC.setClientPassword, id, password),

  /**
   * Mods de ficsit.app. Buscar no toca el servidor; lo demás exige tenerlo
   * parado, porque la carpeta de mods se lee al arrancar.
   */
  mods: {
    search: (id: string, text: string): Promise<ModCatalogItem[]> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.searchMods, id, text),
    list: (id: string): Promise<ModsView> => ipcRenderer.invoke(SATISFACTORY_IPC.listMods, id),
    add: (id: string, modId: string): Promise<ModInstallResult> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.addMod, id, modId),
    remove: (id: string, modId: string): Promise<ModsView> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.removeMod, id, modId),
    setEnabled: (id: string, modId: string, enabled: boolean): Promise<ModsView> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.setModEnabled, id, modId, enabled),
    updates: (id: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.modUpdates, id),
    update: (id: string, modId: string): Promise<ModsView> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.updateMod, id, modId),
    removeLoader: (id: string): Promise<ModsView> =>
      ipcRenderer.invoke(SATISFACTORY_IPC.removeLoader, id)
  }
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
  },

  /**
   * Mods de Thunderstore, con BepInEx de cargador. Todo con el servidor parado:
   * el cargador se engancha al arrancar el proceso.
   */
  mods: {
    search: (id: string, text: string): Promise<ModCatalogItem[]> =>
      ipcRenderer.invoke(VALHEIM_IPC.searchMods, id, text),
    list: (id: string): Promise<ModsView> => ipcRenderer.invoke(VALHEIM_IPC.listMods, id),
    add: (id: string, modId: string): Promise<ModInstallResult> =>
      ipcRenderer.invoke(VALHEIM_IPC.addMod, id, modId),
    remove: (id: string, modId: string): Promise<ModsView> =>
      ipcRenderer.invoke(VALHEIM_IPC.removeMod, id, modId),
    setEnabled: (id: string, modId: string, enabled: boolean): Promise<ModsView> =>
      ipcRenderer.invoke(VALHEIM_IPC.setModEnabled, id, modId, enabled),
    updates: (id: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke(VALHEIM_IPC.modUpdates, id),
    update: (id: string, modId: string): Promise<ModsView> =>
      ipcRenderer.invoke(VALHEIM_IPC.updateMod, id, modId),
    removeLoader: (id: string): Promise<ModsView> =>
      ipcRenderer.invoke(VALHEIM_IPC.removeLoader, id)
  }
}

/** Una instalación de Factorio encontrada en el equipo. */
interface LocalFactorio {
  path: string
  version: string | null
  spaceAge: boolean
  source: 'steam'
}

/** Credenciales del portal de mods de factorio.com. */
interface PortalCredentials {
  username: string
  token: string
}

/** Un mod tal como lo enseña el buscador del portal. */
interface ModSearchResult {
  name: string
  title: string
  owner: string
  summary: string
  downloadsCount: number
  latestVersion: string | null
  factorioVersion: string | null
}

/** Un mod que está en la carpeta del servidor. */
interface InstalledMod {
  name: string
  version: string | null
  title: string | null
  enabled: boolean
  sizeBytes: number
}

/** Cuenta de Steam. La contraseña viaja una vez y no se guarda en ningún sitio. */
interface SteamAccount {
  user: string
  password?: string
  guardCode?: string
}

const factorio = {
  /**
   * Cuenta de Steam con la que descargar el juego.
   *
   * Se comprueba antes de empezar una descarga de 5 GB. Si falla, el error dice
   * si es cosa de la contraseña o de Steam Guard, que es lo que decide si hay
   * que volver a preguntar una u otro.
   */
  steam: {
    login: (account: SteamAccount): Promise<void> =>
      ipcRenderer.invoke(FACTORIO_IPC.steamLogin, account),
    findLocal: (): Promise<LocalFactorio[]> => ipcRenderer.invoke(FACTORIO_IPC.findLocal),
    inspectFolder: (path: string): Promise<LocalFactorio> =>
      ipcRenderer.invoke(FACTORIO_IPC.inspectFolder, path)
  },

  /** Partidas del servidor, incluidos los autoguardados que hace el juego. */
  saves: {
    list: (id: string): Promise<FactorioSave[]> => ipcRenderer.invoke(FACTORIO_IPC.listSaves, id),
    restoreAutosave: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke(FACTORIO_IPC.restoreAutosave, id, name),
    remove: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke(FACTORIO_IPC.deleteSave, id, name),
    saveNow: (id: string): Promise<void> => ipcRenderer.invoke(FACTORIO_IPC.saveNow, id)
  },

  /** Moderación: en caliente por RCON, y en frío escribiendo sus ficheros. */
  moderation: {
    get: (id: string, kind: FactorioListKind): Promise<string[]> =>
      ipcRenderer.invoke(FACTORIO_IPC.getList, id, kind),
    add: (id: string, kind: FactorioListKind, player: string): Promise<string[]> =>
      ipcRenderer.invoke(FACTORIO_IPC.addToList, id, kind, player),
    remove: (id: string, kind: FactorioListKind, player: string): Promise<string[]> =>
      ipcRenderer.invoke(FACTORIO_IPC.removeFromList, id, kind, player),
    kick: (id: string, player: string, reason?: string): Promise<void> =>
      ipcRenderer.invoke(FACTORIO_IPC.kick, id, player, reason)
  },

  players: {
    online: (id: string): Promise<string[]> => ipcRenderer.invoke(FACTORIO_IPC.onlinePlayers, id)
  },

  /**
   * Mods del portal oficial.
   *
   * Buscar no pide nada; descargar exige usuario y token de factorio.com. El
   * token **no se guarda en disco**: o se lee de la sesión del propio juego
   * cuando el usuario lo pide, o se consigue entrando y vive en memoria
   * mientras la ventana esté abierta.
   */
  mods: {
    search: (query: string): Promise<ModSearchResult[]> =>
      ipcRenderer.invoke(FACTORIO_IPC.searchMods, query),
    list: (id: string): Promise<InstalledMod[]> => ipcRenderer.invoke(FACTORIO_IPC.listMods, id),
    install: (
      id: string,
      name: string,
      credentials: PortalCredentials,
      gameVersion?: string
    ): Promise<InstalledMod> =>
      ipcRenderer.invoke(FACTORIO_IPC.installMod, id, name, credentials, gameVersion),
    setEnabled: (id: string, name: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(FACTORIO_IPC.setModEnabled, id, name, enabled),
    remove: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke(FACTORIO_IPC.removeMod, id, name)
  },

  portal: {
    /** Lee el usuario y el token que el juego ya tiene guardados. */
    credentialsFromGame: (): Promise<PortalCredentials | null> =>
      ipcRenderer.invoke(FACTORIO_IPC.credentialsFromGame),
    login: (username: string, password: string): Promise<PortalCredentials> =>
      ipcRenderer.invoke(FACTORIO_IPC.portalLogin, username, password)
  }
}

const zomboid = {
  /**
   * Ajustes del servidor (`servertest.ini`).
   *
   * Se pueden cambiar con el servidor arrancado: por dentro van por su consola
   * remota, que es lo que ofrece el propio juego.
   */
  settings: {
    get: (id: string): Promise<EditableConfig> => ipcRenderer.invoke(ZOMBOID_IPC.getSettings, id),
    set: (id: string, changes: ConfigChange[]): Promise<EditableConfig> =>
      ipcRenderer.invoke(ZOMBOID_IPC.setSettings, id, changes)
  },

  /**
   * Reglas de la partida (`SandboxVars.lua`). Exigen el servidor parado: el
   * juego las lee al cargar el mundo y no las vuelve a mirar.
   */
  sandbox: {
    get: (id: string): Promise<EditableConfig> => ipcRenderer.invoke(ZOMBOID_IPC.getSandbox, id),
    set: (id: string, changes: ConfigChange[]): Promise<EditableConfig> =>
      ipcRenderer.invoke(ZOMBOID_IPC.setSandbox, id, changes),
    /** Vuelve a poner las reglas del preajuste de dificultad elegido. */
    applyPreset: (id: string): Promise<EditableConfig> =>
      ipcRenderer.invoke(ZOMBOID_IPC.applyPreset, id)
  },

  /**
   * Cuentas del servidor. Se leen de su base de datos (siempre) y se cambian
   * por la consola remota (solo con el servidor arrancado).
   */
  accounts: {
    list: (id: string): Promise<ZomboidAccount[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.listAccounts, id),
    setRole: (
      id: string,
      username: string,
      role: ZomboidRole,
      reason?: string
    ): Promise<ZomboidAccount[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.setRole, id, username, role, reason),
    add: (id: string, username: string, password: string): Promise<ZomboidAccount[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.addAccount, id, username, password),
    setPassword: (id: string, username: string, password: string): Promise<void> =>
      ipcRenderer.invoke(ZOMBOID_IPC.setPassword, id, username, password),
    kick: (id: string, username: string, reason?: string): Promise<void> =>
      ipcRenderer.invoke(ZOMBOID_IPC.kick, id, username, reason),
    bannedIps: (id: string): Promise<ZomboidBannedIp[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.listBannedIps, id),
    unbanIp: (id: string, ip: string): Promise<ZomboidBannedIp[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.unbanIp, id, ip)
  },

  /** Lo que se le puede pedir al servidor en marcha. */
  broadcast: (id: string, message: string): Promise<void> =>
    ipcRenderer.invoke(ZOMBOID_IPC.broadcast, id, message),
  saveNow: (id: string): Promise<void> => ipcRenderer.invoke(ZOMBOID_IPC.saveNow, id),

  /**
   * Mods del taller de Steam.
   *
   * Todo lo que cambia algo exige el servidor parado: el juego lee los mods al
   * cargar el mundo y no los vuelve a mirar. Listarlos se puede siempre.
   */
  mods: {
    list: (id: string): Promise<ZomboidModEntry[]> => ipcRenderer.invoke(ZOMBOID_IPC.listMods, id),
    /** Acepta el enlace del taller o el número suelto. */
    add: (id: string, text: string): Promise<ZomboidModEntry[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.addMod, id, text),
    remove: (id: string, workshopId: string): Promise<ZomboidModEntry[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.removeMod, id, workshopId),
    setEnabled: (id: string, workshopId: string, enabled: boolean): Promise<ZomboidModEntry[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.setModEnabled, id, workshopId, enabled),
    /** `-1` lo sube en el orden de carga, `1` lo baja. */
    move: (id: string, workshopId: string, delta: number): Promise<ZomboidModEntry[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.moveMod, id, workshopId, delta),
    /** Los que su autor ha tocado desde que se instalaron. */
    updates: (id: string): Promise<string[]> => ipcRenderer.invoke(ZOMBOID_IPC.modUpdates, id),
    update: (id: string, workshopId: string): Promise<ZomboidModEntry[]> =>
      ipcRenderer.invoke(ZOMBOID_IPC.updateMod, id, workshopId)
  }
}

/**
 * Ajustes de Enshrouded, con el preajuste que se le escribe de verdad.
 *
 * `effectivePreset` no siempre es el elegido: en cuanto un ajuste se aparta del
 * preajuste hay que poner «Custom», o el servidor los ignora en silencio.
 */
interface EnshroudedConfigView {
  preset: string
  effectivePreset: string
  settings: Record<string, number | boolean | string>
  changed: string[]
  roles: EnshroudedRole[]
  tags: string[]
  enableTextChat: boolean
  enableVoiceChat: boolean
  voiceChatMode: 'Proximity' | 'Global'
  slotCount: number
}

const enshrouded = {
  /**
   * Toda la configuración del juego vive en un JSON que el servidor reescribe
   * al arrancar, así que se cambia con el servidor parado.
   */
  config: {
    get: (id: string): Promise<EnshroudedConfigView> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.getConfig, id),
    set: (id: string, changes: Record<string, unknown>): Promise<EnshroudedConfigView> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.setConfig, id, changes)
  },

  /** Mundos: cambiar de uno a otro es cambiar la carpeta de guardado. */
  worlds: {
    list: (id: string): Promise<EnshroudedWorld[]> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.listWorlds, id),
    create: (id: string, name: string): Promise<EnshroudedWorld[]> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.createWorld, id, name),
    activate: (id: string, name: string): Promise<EnshroudedWorld[]> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.activateWorld, id, name),
    rename: (id: string, name: string, newName: string): Promise<EnshroudedWorld[]> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.renameWorld, id, name, newName),
    remove: (id: string, name: string): Promise<EnshroudedWorld[]> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.deleteWorld, id, name)
  },

  /**
   * Vetados. Es lo único que se modera desde fuera del juego, y solo para
   * quitar: vetar se hace desde dentro, con la contraseña de administrador.
   */
  bans: {
    list: (id: string): Promise<EnshroudedBan[]> => ipcRenderer.invoke(ENSHROUDED_IPC.listBans, id),
    remove: (id: string, accountId: number): Promise<EnshroudedBan[]> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.removeBan, id, accountId)
  },

  /**
   * Mods con Shroudtopia de cargador. No hay buscador: los mods viven en Nexus
   * Mods, que no deja descargar sin cuenta de pago, así que el fichero lo trae
   * el usuario.
   */
  mods: {
    list: (id: string): Promise<ModsView> => ipcRenderer.invoke(ENSHROUDED_IPC.listMods, id),
    installLoader: (id: string): Promise<ModsView> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.installLoader, id),
    removeLoader: (id: string): Promise<ModsView> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.removeLoader, id),
    pickFile: (): Promise<string | null> => ipcRenderer.invoke(ENSHROUDED_IPC.pickModFile),
    openFolder: (id: string): Promise<string> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.openModsFolder, id),
    addFile: (id: string, filePath: string): Promise<ModsView> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.addModFile, id, filePath),
    remove: (id: string, modId: string): Promise<ModsView> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.removeMod, id, modId),
    setEnabled: (id: string, modId: string, enabled: boolean): Promise<ModsView> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.setModEnabled, id, modId, enabled),
    loaderUpdate: (id: string): Promise<string | null> =>
      ipcRenderer.invoke(ENSHROUDED_IPC.loaderUpdate, id)
  }
}


const rust = {
  /** Ajustes: van en la línea de órdenes, así que valen desde el siguiente arranque. */
  config: {
    get: (id: string): Promise<RustConfigView> => ipcRenderer.invoke(RUST_IPC.getConfig, id),
    set: (id: string, changes: RustConfigChanges): Promise<RustConfigView> =>
      ipcRenderer.invoke(RUST_IPC.setConfig, id, changes)
  },

  /** El mapa y el borrado mensual. */
  map: {
    get: (id: string): Promise<RustMapView> => ipcRenderer.invoke(RUST_IPC.getMap, id),
    wipePreview: (id: string, blueprints: boolean): Promise<string[]> =>
      ipcRenderer.invoke(RUST_IPC.wipePreview, id, blueprints),
    setPlan: (id: string, plan: Partial<RustWipePlan>): Promise<RustMapView> =>
      ipcRenderer.invoke(RUST_IPC.setWipePlan, id, plan),
    dismiss: (id: string): Promise<RustMapView> =>
      ipcRenderer.invoke(RUST_IPC.dismissWipeNotice, id),
    wipe: (id: string, options: RustWipeOptions): Promise<RustMapView> =>
      ipcRenderer.invoke(RUST_IPC.wipe, id, options)
  },

  /**
   * Moderación: con el servidor en marcha va por su consola remota y surte
   * efecto al momento; parado, se escribe en sus ficheros.
   */
  moderation: {
    players: (id: string): Promise<RustPlayer[]> => ipcRenderer.invoke(RUST_IPC.listPlayers, id),
    admins: (id: string): Promise<RustAdmin[]> => ipcRenderer.invoke(RUST_IPC.listAdmins, id),
    setAdmin: (
      id: string,
      steamId: string,
      name: string,
      level: RustAdmin['level']
    ): Promise<RustAdmin[]> => ipcRenderer.invoke(RUST_IPC.setAdmin, id, steamId, name, level),
    removeAdmin: (id: string, steamId: string): Promise<RustAdmin[]> =>
      ipcRenderer.invoke(RUST_IPC.removeAdmin, id, steamId),
    makeAdmin: (id: string, player: string): Promise<RustAdmin[]> =>
      ipcRenderer.invoke(RUST_IPC.makeAdmin, id, player),
    bans: (id: string): Promise<RustBan[]> => ipcRenderer.invoke(RUST_IPC.listBans, id),
    ban: (id: string, player: string, reason: string): Promise<RustBan[]> =>
      ipcRenderer.invoke(RUST_IPC.ban, id, player, reason),
    unban: (id: string, steamId: string): Promise<RustBan[]> =>
      ipcRenderer.invoke(RUST_IPC.unban, id, steamId),
    kick: (id: string, player: string, reason?: string): Promise<void> =>
      ipcRenderer.invoke(RUST_IPC.kick, id, player, reason)
  },

  /** Oxide y los plugins de uMod. Con Oxide puesto, los plugins valen en caliente. */
  plugins: {
    list: (id: string): Promise<ModsView> => ipcRenderer.invoke(RUST_IPC.listPlugins, id),
    search: (id: string, text: string): Promise<ModCatalogItem[]> =>
      ipcRenderer.invoke(RUST_IPC.searchPlugins, id, text),
    add: (id: string, name: string): Promise<ModInstallResult> =>
      ipcRenderer.invoke(RUST_IPC.addPlugin, id, name),
    remove: (id: string, name: string): Promise<ModsView> =>
      ipcRenderer.invoke(RUST_IPC.removePlugin, id, name),
    setEnabled: (id: string, name: string, enabled: boolean): Promise<ModsView> =>
      ipcRenderer.invoke(RUST_IPC.setPluginEnabled, id, name, enabled),
    updates: (id: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke(RUST_IPC.pluginUpdates, id),
    update: (id: string, name: string): Promise<ModsView> =>
      ipcRenderer.invoke(RUST_IPC.updatePlugin, id, name),
    installOxide: (id: string): Promise<ModsView> => ipcRenderer.invoke(RUST_IPC.installOxide, id),
    removeOxide: (id: string): Promise<ModsView> => ipcRenderer.invoke(RUST_IPC.removeOxide, id),
    openFolder: (id: string): Promise<string> => ipcRenderer.invoke(RUST_IPC.openPluginsFolder, id)
  }
}

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.getSettings),
    update: (changes: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.updateSettings, changes)
  },

  app: {
    /** Idioma y traslado en curso, antes de pintar nada. */
    boot: (): Promise<BootInfo> => ipcRenderer.invoke(IPC.bootInfo),
    /** Ya se ha enseñado el resultado del traslado. */
    dismissRelocation: (): Promise<void> => ipcRenderer.invoke(IPC.relocationDismiss)
  },

  dataFolder: {
    info: (): Promise<DataFolderInfo> => ipcRenderer.invoke(IPC.dataFolderInfo),
    /** Selector de carpetas de Windows. Null si se cancela. */
    choose: (): Promise<string | null> => ipcRenderer.invoke(IPC.dataFolderChoose),
    plan: (chosen: string): Promise<RelocationPlan> => ipcRenderer.invoke(IPC.dataFolderPlan, chosen),
    /**
     * Deja el traslado pedido y reinicia la app. Solo vuelve si algo lo impide,
     * con el plan y sus problemas.
     */
    apply: (chosen: string): Promise<RelocationPlan> =>
      ipcRenderer.invoke(IPC.dataFolderApply, chosen),
    open: (): Promise<void> => ipcRenderer.invoke(IPC.dataFolderOpen)
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
    /**
     * `journal: false` para las órdenes que manda un botón (moderar en
     * Minecraft): no son algo escrito en la consola y no van al historial.
     */
    command: (id: string, command: string, options?: { journal?: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC.sendCommand, id, command, options),
    /** Historial del servidor, de lo más reciente a lo más viejo. */
    journal: (id: string, limit?: number): Promise<JournalEntry[]> =>
      ipcRenderer.invoke(IPC.listJournal, id, limit)
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
    memory: (): Promise<SystemMemory> => ipcRenderer.invoke(IPC.systemMemory),
    /** Abre un enlace en el navegador del usuario. Solo https. */
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url)
  },

  /** Acceso remoto por órdenes (§19.31). */
  remote: {
    status: (): Promise<RemoteStatus> => ipcRenderer.invoke(REMOTE_IPC.status),
    activity: (limit?: number): Promise<RemoteActivityEntry[]> =>
      ipcRenderer.invoke(REMOTE_IPC.activity, limit),
    setEnabled: (enabled: boolean): Promise<RemoteStatus> =>
      ipcRenderer.invoke(REMOTE_IPC.setEnabled, enabled),
    setPort: (port: number): Promise<RemoteStatus> => ipcRenderer.invoke(REMOTE_IPC.setPort, port),
    createInvite: (permissions: RemotePermissions): Promise<RemoteInvite> =>
      ipcRenderer.invoke(REMOTE_IPC.createInvite, permissions),
    cancelInvite: (): Promise<void> => ipcRenderer.invoke(REMOTE_IPC.cancelInvite),
    updateDevice: (id: string, permissions: RemotePermissions): Promise<RemoteStatus> =>
      ipcRenderer.invoke(REMOTE_IPC.updateDevice, id, permissions),
    revokeDevice: (id: string): Promise<RemoteStatus> =>
      ipcRenderer.invoke(REMOTE_IPC.revokeDevice, id)
  },

  /** Servidores de otros QubiQ: este equipo como dispositivo suyo (0.13.0). */
  remoteLinks: {
    state: (): Promise<RemoteLinksState> => ipcRenderer.invoke(REMOTE_LINKS_IPC.state),
    probe: (address: string): Promise<RemoteClientResult<RemoteProbe>> =>
      ipcRenderer.invoke(REMOTE_LINKS_IPC.probe, address),
    pair: (request: RemoteLinkRequest): Promise<RemoteClientResult<RemoteLink>> =>
      ipcRenderer.invoke(REMOTE_LINKS_IPC.pair, request),
    order: <T = null>(id: string, order: RemoteOrder, args?: RemoteArgs): Promise<RemoteClientResult<T>> =>
      ipcRenderer.invoke(REMOTE_LINKS_IPC.order, id, order, args),
    refresh: (id: string): Promise<void> => ipcRenderer.invoke(REMOTE_LINKS_IPC.refresh, id),
    trust: (id: string, fingerprint: string): Promise<RemoteClientResult<RemoteLink>> =>
      ipcRenderer.invoke(REMOTE_LINKS_IPC.trust, id, fingerprint),
    remove: (id: string): Promise<RemoteClientResult<RemoteUnlinkResult>> =>
      ipcRenderer.invoke(REMOTE_LINKS_IPC.remove, id)
  },

  minecraft,
  satisfactory,
  valheim,
  factorio,
  zomboid,
  enshrouded,
  rust,

  on: {
    remote: (handler: () => void) => subscribe<[]>(EVENTS.remote, handler),
    remoteLinks: (handler: (state: RemoteLinksState) => void) =>
      subscribe<[RemoteLinksState]>(EVENTS.remoteLinks, handler),
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
      subscribe<[string, Diagnosis]>(EVENTS.diagnosis, handler),
    journal: (handler: (id: string, entry: JournalEntry) => void) =>
      subscribe<[string, JournalEntry]>(EVENTS.journal, handler),
    relocation: (handler: (status: RelocationStatus) => void) =>
      subscribe<[RelocationStatus]>(EVENTS.relocation, handler)
  }
}

export type QubiqApi = typeof api

contextBridge.exposeInMainWorld('qubiq', api)
