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

  // Instancias
  listInstances: 'instances:list',
  getInstance: 'instances:get',
  createInstance: 'instances:create',
  updateInstance: 'instances:update',
  deleteInstance: 'instances:delete',
  reinstallInstance: 'instances:reinstall',
  checkForUpdate: 'instances:checkUpdate',
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
  openInstanceFolder: 'system:openFolder'
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

  // Plugins oficiales
  listOfficialPlugins: 'minecraft:official:list',
  installOfficialPlugin: 'minecraft:official:install',
  uninstallOfficialPlugin: 'minecraft:official:uninstall',
  setOfficialPluginConfig: 'minecraft:official:config',

  // Mundos
  listWorlds: 'minecraft:worlds:list',
  createWorld: 'minecraft:worlds:create',
  activateWorld: 'minecraft:worlds:activate',
  deleteWorld: 'minecraft:worlds:delete'
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
