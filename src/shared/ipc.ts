/**
 * Contrato IPC entre el núcleo y la interfaz.
 * Al vivir en `shared`, los dos lados comparten los mismos nombres y tipos.
 */

export const IPC = {
  // Ajustes de la aplicación
  getSettings: 'app:getSettings',
  updateSettings: 'app:updateSettings',

  // Catálogo
  listVersions: 'catalog:listVersions',
  defaultVersion: 'catalog:defaultVersion',
  suggestedMemory: 'catalog:suggestedMemory',
  recommendMemory: 'catalog:recommendMemory',

  // Instancias
  listInstances: 'instances:list',
  getInstance: 'instances:get',
  createInstance: 'instances:create',
  updateInstance: 'instances:update',
  deleteInstance: 'instances:delete',
  reinstallInstance: 'instances:reinstall',

  // Ejecución
  startServer: 'server:start',
  stopServer: 'server:stop',
  sendCommand: 'server:command',

  // Configuración
  getProperties: 'config:get',
  setProperties: 'config:set',
  propertyCatalog: 'config:catalog',

  // Plugins y mods
  listContent: 'content:list',
  contentFolder: 'content:folder',
  setContentEnabled: 'content:setEnabled',
  removeContent: 'content:remove',

  // Plugins oficiales
  listOfficialPlugins: 'official:list',
  installOfficialPlugin: 'official:install',
  uninstallOfficialPlugin: 'official:uninstall',
  setOfficialPluginConfig: 'official:config',

  // Mundos
  listWorlds: 'worlds:list',
  createWorld: 'worlds:create',
  activateWorld: 'worlds:activate',
  deleteWorld: 'worlds:delete',

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
  openInstanceFolder: 'system:openFolder'
} as const

/** Eventos que el núcleo empuja hacia la interfaz. */
export const EVENTS = {
  log: 'event:log',
  status: 'event:status',
  players: 'event:players',
  progress: 'event:progress',
  diagnosis: 'event:diagnosis'
} as const

export interface MemoryInfo {
  suggestedMb: number
  totalMb: number
  warningThresholdMb: number
}
