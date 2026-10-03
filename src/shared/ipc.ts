/**
 * Contrato IPC entre el núcleo y la interfaz.
 * Al vivir en `shared`, los dos lados comparten los mismos nombres y tipos.
 *
 * Los canales comunes sirven a cualquier juego. Los de un juego concreto llevan
 * su prefijo (`minecraft:`) y viven en su propio bloque, para que añadir un
 * juego no mezcle sus operaciones con las de los demás.
 */

export const IPC = {
  // Ajustes de la aplicación
  getSettings: 'app:getSettings',
  updateSettings: 'app:updateSettings',
  bootInfo: 'app:boot',

  // Carpeta de datos de la app y su traslado
  dataFolderInfo: 'app:dataFolder:info',
  dataFolderChoose: 'app:dataFolder:choose',
  dataFolderPlan: 'app:dataFolder:plan',
  dataFolderApply: 'app:dataFolder:apply',
  dataFolderOpen: 'app:dataFolder:open',
  relocationDismiss: 'app:relocation:dismiss',

  // Instancias
  listInstances: 'instances:list',
  getInstance: 'instances:get',
  createInstance: 'instances:create',
  updateInstance: 'instances:update',
  deleteInstance: 'instances:delete',
  reinstallInstance: 'instances:reinstall',
  checkForUpdate: 'instances:checkUpdate',
  listVersions: 'instances:listVersions',
  changeVersion: 'instances:changeVersion',
  updateServer: 'instances:updateServer',

  // Ejecución
  startServer: 'server:start',
  stopServer: 'server:stop',
  sendCommand: 'server:command',

  // Copias de seguridad
  listBackups: 'backup:list',
  backupEstimate: 'backup:estimate',
  createBackup: 'backup:create',
  restoreBackup: 'backup:restore',
  deleteBackup: 'backup:delete',

  // Red
  connectionInfo: 'network:info',
  suggestFreePort: 'network:freePort',
  checkFromInternet: 'network:checkExternal',
  publicIp: 'network:publicIp',

  // Sistema
  openInstanceFolder: 'system:openFolder',
  openExternal: 'system:openExternal',
  systemMemory: 'system:memory'
} as const

/** Canales exclusivos de Minecraft. */
export const MINECRAFT_IPC = {
  // Catálogo
  listVersions: 'minecraft:catalog:listVersions',
  defaultVersion: 'minecraft:catalog:defaultVersion',
  suggestedMemory: 'minecraft:catalog:suggestedMemory',
  recommendMemory: 'minecraft:catalog:recommendMemory',

  // Configuración
  getProperties: 'minecraft:config:get',
  setProperties: 'minecraft:config:set',
  propertyCatalog: 'minecraft:config:catalog',

  // Plugins y mods
  listContent: 'minecraft:content:list',
  contentFolder: 'minecraft:content:folder',
  setContentEnabled: 'minecraft:content:setEnabled',
  removeContent: 'minecraft:content:remove',

  // Configuración de plugins y mods
  contentConfigFiles: 'minecraft:content:config:files',
  readContentConfig: 'minecraft:content:config:read',
  writeContentConfig: 'minecraft:content:config:write',
  openContentConfig: 'minecraft:content:config:open',

  // Plugins oficiales
  listOfficialPlugins: 'minecraft:official:list',
  installOfficialPlugin: 'minecraft:official:install',
  uninstallOfficialPlugin: 'minecraft:official:uninstall',
  setOfficialPluginConfig: 'minecraft:official:config',

  // Mundos
  listWorlds: 'minecraft:worlds:list',
  createWorld: 'minecraft:worlds:create',
  activateWorld: 'minecraft:worlds:activate',
  deleteWorld: 'minecraft:worlds:delete',

  // Servidores a medida: traer una carpeta y elegir con qué se arranca
  pickImportFolder: 'minecraft:import:pickFolder',
  inspectImport: 'minecraft:import:inspect',
  pickStartFile: 'minecraft:import:pickStartFile',
  listStartFiles: 'minecraft:custom:startFiles',
  setStartFile: 'minecraft:custom:setStartFile'
} as const

/** Canales exclusivos de Satisfactory. */
export const SATISFACTORY_IPC = {
  // Estado en vivo (jugadores, partida cargada, ritmo del servidor)
  state: 'satisfactory:state',

  // Partidas
  listSessions: 'satisfactory:sessions:list',
  createGame: 'satisfactory:sessions:create',
  loadSave: 'satisfactory:sessions:load',
  saveNow: 'satisfactory:sessions:save',
  deleteSave: 'satisfactory:sessions:deleteSave',
  deleteSession: 'satisfactory:sessions:deleteSession',

  // Ajustes del servidor y reglas de la partida
  getOptions: 'satisfactory:options:get',
  setOptions: 'satisfactory:options:set',
  getGameRules: 'satisfactory:rules:get',
  setGameRules: 'satisfactory:rules:set',

  // Contraseña de los jugadores
  setClientPassword: 'satisfactory:password:client',

  // Mods de ficsit.app. Buscar es libre; instalar exige el servidor parado,
  // porque la carpeta de mods se lee al arrancar y no se vuelve a mirar.
  searchMods: 'satisfactory:mods:search',
  listMods: 'satisfactory:mods:list',
  addMod: 'satisfactory:mods:add',
  removeMod: 'satisfactory:mods:remove',
  setModEnabled: 'satisfactory:mods:enable',
  modUpdates: 'satisfactory:mods:updates',
  updateMod: 'satisfactory:mods:update',
  removeLoader: 'satisfactory:mods:removeLoader'
} as const

/** Canales exclusivos de Valheim. */
export const VALHEIM_IPC = {
  // Mundos: todo con el servidor parado, porque el mundo activo va en la línea
  // de órdenes del arranque.
  listWorlds: 'valheim:worlds:list',
  createWorld: 'valheim:worlds:create',
  activateWorld: 'valheim:worlds:activate',
  renameWorld: 'valheim:worlds:rename',
  deleteWorld: 'valheim:worlds:delete',

  // Moderación: las tres listas de texto (administradores, vetados, invitados)
  getList: 'valheim:moderation:get',
  addToList: 'valheim:moderation:add',
  removeFromList: 'valheim:moderation:remove',

  // Mods de Thunderstore, con BepInEx como cargador. Todo con el servidor
  // parado: el cargador se engancha al arrancar el proceso.
  searchMods: 'valheim:mods:search',
  listMods: 'valheim:mods:list',
  addMod: 'valheim:mods:add',
  removeMod: 'valheim:mods:remove',
  setModEnabled: 'valheim:mods:enable',
  modUpdates: 'valheim:mods:updates',
  updateMod: 'valheim:mods:update',
  removeLoader: 'valheim:mods:removeLoader'
} as const

/** Canales exclusivos de Factorio. */
export const FACTORIO_IPC = {
  // Cuenta de Steam: el juego no tiene servidor dedicado anónimo, así que
  // descargarlo exige una cuenta que lo tenga. La contraseña no se guarda.
  steamLogin: 'factorio:steam:login',
  /** Instalaciones de Factorio que ya haya en el equipo, para no bajar 5 GB. */
  findLocal: 'factorio:local:find',
  inspectFolder: 'factorio:local:inspect',

  // Partidas: cambiar la que se juega exige el servidor parado.
  listSaves: 'factorio:saves:list',
  restoreAutosave: 'factorio:saves:restore',
  deleteSave: 'factorio:saves:delete',
  saveNow: 'factorio:saves:now',

  // Moderación: por RCON con el servidor en marcha, por fichero si está parado.
  getList: 'factorio:moderation:get',
  addToList: 'factorio:moderation:add',
  removeFromList: 'factorio:moderation:remove',
  kick: 'factorio:moderation:kick',
  onlinePlayers: 'factorio:players:online',

  // Mods del portal oficial. Buscar es libre; descargar exige el usuario y el
  // token de factorio.com, que el propio juego ya tiene guardados.
  searchMods: 'factorio:mods:search',
  listMods: 'factorio:mods:list',
  installMod: 'factorio:mods:install',
  setModEnabled: 'factorio:mods:enable',
  removeMod: 'factorio:mods:remove',
  credentialsFromGame: 'factorio:portal:fromGame',
  portalLogin: 'factorio:portal:login'
} as const

/** Canales exclusivos de Project Zomboid. */
export const ZOMBOID_IPC = {
  // Ajustes del servidor: en caliente por RCON, en frío editando el `.ini`.
  getSettings: 'zomboid:settings:get',
  setSettings: 'zomboid:settings:set',

  // Reglas de la partida (`SandboxVars.lua`), solo con el servidor parado.
  getSandbox: 'zomboid:sandbox:get',
  setSandbox: 'zomboid:sandbox:set',
  applyPreset: 'zomboid:sandbox:preset',

  // Cuentas: se leen de la base de datos del servidor y se cambian por RCON.
  listAccounts: 'zomboid:accounts:list',
  setRole: 'zomboid:accounts:role',
  addAccount: 'zomboid:accounts:add',
  setPassword: 'zomboid:accounts:password',
  kick: 'zomboid:accounts:kick',
  listBannedIps: 'zomboid:accounts:bannedIps',
  unbanIp: 'zomboid:accounts:unbanIp',

  // Lo que se le puede pedir al servidor en marcha.
  broadcast: 'zomboid:server:broadcast',
  saveNow: 'zomboid:server:save',

  // Mods del taller de Steam. Cambiarlos exige el servidor parado: el juego
  // los lee al cargar el mundo.
  listMods: 'zomboid:mods:list',
  addMod: 'zomboid:mods:add',
  removeMod: 'zomboid:mods:remove',
  setModEnabled: 'zomboid:mods:enable',
  moveMod: 'zomboid:mods:move',
  modUpdates: 'zomboid:mods:updates',
  updateMod: 'zomboid:mods:update'
} as const

/** Canales exclusivos de Enshrouded. */
export const ENSHROUDED_IPC = {
  // Configuración: un solo JSON que el servidor reescribe al arrancar, así que
  // todo va con el servidor parado.
  getConfig: 'enshrouded:config:get',
  setConfig: 'enshrouded:config:set',

  // Mundos: cambiar de mundo es cambiar el `saveDirectory` del arranque.
  listWorlds: 'enshrouded:worlds:list',
  createWorld: 'enshrouded:worlds:create',
  activateWorld: 'enshrouded:worlds:activate',
  renameWorld: 'enshrouded:worlds:rename',
  deleteWorld: 'enshrouded:worlds:delete',

  // Vetados: la única moderación que existe desde fuera del juego, y solo para
  // quitar un veto. Vetar se hace desde dentro.
  listBans: 'enshrouded:bans:list',
  removeBan: 'enshrouded:bans:remove',

  // Mods de Shroudtopia. El cargador se baja de GitHub; los mods los trae el
  // usuario, porque Nexus Mods no deja descargar sin cuenta de pago.
  listMods: 'enshrouded:mods:list',
  installLoader: 'enshrouded:mods:installLoader',
  removeLoader: 'enshrouded:mods:removeLoader',
  pickModFile: 'enshrouded:mods:pickFile',
  openModsFolder: 'enshrouded:mods:openFolder',
  addModFile: 'enshrouded:mods:addFile',
  removeMod: 'enshrouded:mods:remove',
  setModEnabled: 'enshrouded:mods:enable',
  loaderUpdate: 'enshrouded:mods:loaderUpdate'
} as const

/** Canales exclusivos de Rust. */
export const RUST_IPC = {
  // Ajustes: van en la línea de órdenes, así que valen desde el siguiente arranque.
  getConfig: 'rust:config:get',
  setConfig: 'rust:config:set',

  // El mapa y el borrado mensual.
  getMap: 'rust:map:get',
  wipePreview: 'rust:map:wipePreview',
  setWipePlan: 'rust:map:setPlan',
  dismissWipeNotice: 'rust:map:dismiss',
  wipe: 'rust:map:wipe',

  // Jugadores y moderación: en caliente por la consola remota, o en sus
  // ficheros con el servidor parado.
  listPlayers: 'rust:players:list',
  listAdmins: 'rust:admins:list',
  setAdmin: 'rust:admins:set',
  removeAdmin: 'rust:admins:remove',
  makeAdmin: 'rust:admins:fromPlayer',
  listBans: 'rust:bans:list',
  ban: 'rust:bans:add',
  unban: 'rust:bans:remove',
  kick: 'rust:players:kick',

  // Oxide y los plugins de uMod.
  listPlugins: 'rust:plugins:list',
  searchPlugins: 'rust:plugins:search',
  addPlugin: 'rust:plugins:add',
  removePlugin: 'rust:plugins:remove',
  setPluginEnabled: 'rust:plugins:enable',
  pluginUpdates: 'rust:plugins:updates',
  updatePlugin: 'rust:plugins:update',
  installOxide: 'rust:oxide:install',
  removeOxide: 'rust:oxide:remove',
  openPluginsFolder: 'rust:plugins:openFolder'
} as const

/** Acceso remoto por órdenes (§19.31). */
export const REMOTE_IPC = {
  status: 'remote:status',
  activity: 'remote:activity',
  setEnabled: 'remote:setEnabled',
  setPort: 'remote:setPort',
  createInvite: 'remote:invite:create',
  cancelInvite: 'remote:invite:cancel',
  updateDevice: 'remote:device:update',
  revokeDevice: 'remote:device:revoke'
} as const

/** Eventos que el núcleo empuja hacia la interfaz. */
export const EVENTS = {
  log: 'event:log',
  status: 'event:status',
  players: 'event:players',
  joinCode: 'event:joinCode',
  progress: 'event:progress',
  diagnosis: 'event:diagnosis',
  /** Cómo va el traslado de la carpeta de datos, en el arranque que lo hace. */
  relocation: 'event:relocation',
  /** Ha cambiado algo del acceso remoto (estado, dispositivos, actividad). */
  remote: 'event:remote'
} as const

export interface MemoryInfo {
  suggestedMb: number
  totalMb: number
  warningThresholdMb: number
}

/**
 * Memoria del equipo, para poder avisar de lo que pide cada juego ANTES de
 * descargar 15 GB. Es común: ya no es solo cosa de la memoria de la JVM.
 */
export interface SystemMemory {
  totalMb: number
}
