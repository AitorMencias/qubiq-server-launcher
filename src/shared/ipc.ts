/**
 * Contrato IPC entre el núcleo y la interfaz.
 * Al vivir en `shared`, los dos lados comparten los mismos nombres y tipos.
 */

export const IPC = {
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
