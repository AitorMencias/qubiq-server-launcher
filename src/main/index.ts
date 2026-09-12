import { app, BrowserWindow, Menu, dialog, powerSaveBlocker } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { service } from './core/service'
import { setDataRoot, setResourcesRoot } from './core/paths'

/**
 * Proceso principal.
 *
 * Dos comportamientos específicos de Windows que no son opcionales (§14.1):
 *  - Al cerrar con servidores arrancados, se hace parada limpia. Matar el
 *    proceso corrompe el mundo, y en Windows no hay SIGTERM que valga.
 *  - Mientras haya un servidor en marcha se impide que el equipo se suspenda,
 *    porque suspenderlo tira el servidor con los jugadores dentro.
 */

/**
 * Carpeta de datos fijada a mano, ANTES de que la app esté lista.
 *
 * Por defecto Electron la deriva del nombre de la aplicación, que en desarrollo
 * es "qubiq-server-launcher" y en la versión empaquetada sería "QubiQ Server
 * Launcher". Serían dos carpetas distintas: al instalar el ejecutable, los
 * servidores creados en desarrollo parecerían haberse esfumado.
 *
 * Fijarla además evita espacios en la ruta, que es donde tropiezan el
 * instalador de Forge y otras herramientas (§14.1).
 */
app.setPath('userData', join(app.getPath('appData'), 'qubiq-server-launcher'))

let mainWindow: BrowserWindow | null = null
let powerBlockerId: number | null = null
let quitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    show: false,
    // El tamaño pedido es el del ÁREA DE CONTENIDO, no el del marco: así la
    // interfaz no pierde alto por la barra de título en pantallas escaladas.
    useContentSize: true,
    backgroundColor: '#12141a',
    title: 'QubiQ Server Launcher',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function updatePowerBlocker(): void {
  const running = service.hasRunningServers()
  if (running && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  } else if (!running && powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId)
    powerBlockerId = null
  }
}

void app.whenReady().then(async () => {
  // Sin menú nativo: File/Edit/View no significan nada para el usuario al que
  // va dirigida la app, y solo restan espacio y claridad (§3).
  Menu.setApplicationMenu(null)

  // El núcleo no conoce Electron: se le inyecta dónde guardar los datos (§5).
  setDataRoot(app.getPath('userData'))

  // Los jars de los plugins oficiales viajan con la aplicación. En desarrollo
  // están en el repositorio; empaquetados, junto al ejecutable.
  setResourcesRoot(
    app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  )
  await service.initialize()
  registerIpc(() => mainWindow)

  service.on('status', () => updatePowerBlocker())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

/**
 * Cierre con servidores activos: se pregunta y se cierra limpiamente.
 * Este es el punto donde un launcher mal hecho corrompe mundos.
 */
app.on('before-quit', (event) => {
  if (quitting || !service.hasRunningServers()) return

  event.preventDefault()

  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Cerrar servidores y salir', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    title: 'Hay servidores arrancados',
    message: 'Tienes servidores en marcha.',
    detail:
      'Se cerrarán correctamente para no dañar el mundo. Puede tardar unos segundos ' +
      'mientras guardan la partida.'
  })

  if (choice !== 0) return

  quitting = true
  void service.stopAll().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
