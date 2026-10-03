import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  nativeImage,
  powerSaveBlocker,
  safeStorage,
  type NativeImage
} from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { registerRemoteIpc } from './ipc/remote'
import { registerRemoteLinksIpc } from './ipc/remoteLinks'
import { service } from './core/service'
import { RemoteAccess } from './core/remote'
import { RemoteLinks } from './core/remote/links'
import { serviceOrderHost } from './core/remote/serviceHost'
import { gameResourcePath, setDataRoot, setResourcesRoot } from './core/paths'
import { readSettings } from './core/settings/manager'
import type { AppSettings } from '@shared/types'
import { resolveLanguage, setLanguage, t } from '@shared/i18n'
import {
  finishRelocation,
  readDataLocation,
  resolveDataRoot,
  runPendingRelocation
} from './dataFolder'

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
 *
 * Los datos de la app pueden vivir en otra carpeta elegida en la
 * configuración; esta sigue siendo la de Electron y la que guarda dónde están
 * (`data-location.json`, ver `dataFolder.ts`).
 */
app.setPath('userData', join(app.getPath('appData'), 'qubiq-server-launcher'))

/**
 * Lo de Chromium (su caché HTTP, `Local Storage`, `GPUCache`…) en una
 * subcarpeta propia, no mezclado con los datos de la app.
 *
 * Por defecto va a la misma carpeta que `userData`, y su caché se llama
 * `Cache`: en Windows es LA MISMA carpeta que nuestra `cache` de descargas. Al
 * mover la carpeta de datos se arrastraban ficheros que Chromium tiene
 * abiertos, y al volver a abrir la app él recreaba `Cache` en el sitio viejo,
 * que así parecía tener datos de QubiQ (recorrido del traslado, 0.11.0).
 */
app.setPath('sessionData', join(app.getPath('userData'), 'electron'))

/**
 * Una sola copia de la app. Con el acceso remoto encendido, cerrar la ventana
 * la esconde en la bandeja y es fácil volver a abrirla sin darse cuenta: dos
 * copias gestionarían los mismos servidores y pelearían por el puerto. La
 * segunda solo enseña la primera. El bloqueo va por carpeta de `userData`, así
 * que el recorrido de interfaz con datos aislados no choca con la app real.
 */
const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()

let mainWindow: BrowserWindow | null = null
let powerBlockerId: number | null = null
let quitting = false
let tray: Tray | null = null
let trayHintShown = false

/**
 * Control remoto por órdenes (§19.31). La página remota sale de la misma
 * compilación que la interfaz (`out/renderer/remote.html`).
 */
const remote = new RemoteAccess({
  host: serviceOrderHost(),
  staticRoot: join(__dirname, '../renderer'),
  // Solo para los recorridos de interfaz: `127.0.0.1`, para no abrirse a la
  // red de casa al probar. La app normal escucha en todas las interfaces.
  listenHost: process.env['QUBIQ_REMOTE_LISTEN'] || undefined
})

/**
 * Servidores de otros QubiQ (0.13.0): este equipo como dispositivo suyo. La
 * clave privada de cada conexión va cifrada con DPAPI (`safeStorage`): solo
 * este usuario de Windows en este equipo puede usarla.
 */
const remoteLinks = new RemoteLinks({
  secrets: {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64'))
  }
})

/** La lista de los otros QubiQ solo se pide con la ventana a la vista. */
function updateLinksActivity(): void {
  const visible = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()
  remoteLinks.setActive(visible)
}

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
    // Empaquetada, Windows toma el icono del propio .exe. En desarrollo no hay
    // .exe propio y saldría el de Electron: se le pasa el de build/.
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), 'build', 'icon.ico') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  for (const event of ['show', 'hide', 'minimize', 'restore', 'closed'] as const) {
    mainWindow.on(event as 'show', () => updateLinksActivity())
  }

  mainWindow.on('close', (event) => {
    if (quitting) return

    // Con el acceso remoto encendido, cerrar la ventana no cierra la app: si
    // no, nadie recibiría las órdenes. Se queda en la bandeja. Sin icono en la
    // bandeja no se esconde: no habría forma de volver a abrirla.
    if (remote.enabled && tray) {
      event.preventDefault()
      mainWindow?.hide()
      if (!trayHintShown) {
        trayHintShown = true
        tray.displayBalloon({
          title: t('remote.tray.hiddenTitle'),
          content: t('remote.tray.hiddenText'),
          noSound: true
        })
      }
      return
    }

    // Con servidores en marcha se pregunta AQUÍ, con la ventana todavía
    // abierta. Esperar a `before-quit` era tarde: la ventana ya se había
    // cerrado, y al cancelar la app se quedaba viva y sin ventana, con los
    // servidores dentro y sin forma de volver a verlos (0.13.0).
    if (!service.hasRunningServers()) return
    event.preventDefault()
    if (confirmStopServers()) stopServersAndQuit()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * El icono de la bandeja. En los recursos de la app (empaquetada, junto al
 * ejecutable); en desarrollo, el de `build/`; y si no aparece ninguno, el del
 * propio ejecutable, que siempre existe.
 */
async function trayIcon(): Promise<NativeImage> {
  for (const path of [gameResourcePath('app', 'icon.ico'), join(app.getAppPath(), 'build', 'icon.ico')]) {
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) return image
  }
  return app.getFileIcon(process.execPath, { size: 'small' })
}

/**
 * Icono en la bandeja mientras el acceso remoto esté encendido.
 *
 * ⚠ Nunca lanza: se llama desde el aviso `changed` del acceso remoto, y un
 * fallo aquí subiría hasta quien lo está encendiendo y lo dejaría a medias.
 */
let trayPending: Promise<void> | null = null
function updateTray(): void {
  if (!remote.enabled) {
    tray?.destroy()
    tray = null
    return
  }
  if (tray) {
    setTrayMenu(tray)
    return
  }
  if (trayPending) return
  trayPending = trayIcon()
    .then((icon) => {
      if (!remote.enabled || tray) return
      tray = new Tray(icon)
      tray.on('click', showWindow)
      setTrayMenu(tray)
    })
    .catch(() => undefined)
    .finally(() => {
      trayPending = null
    })
}

function setTrayMenu(tray: Tray): void {
  tray.setToolTip(t('remote.tray.tooltip'))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('remote.tray.open'), click: showWindow },
      { type: 'separator' },
      { label: t('remote.tray.quit'), click: () => app.quit() }
    ])
  )
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

/**
 * Idioma del proceso principal (sus diálogos nativos). El de la interfaz lo
 * decide ella con el mismo criterio: el elegido o, si no, el de Windows.
 */
function applyLanguage(settings: AppSettings | null): void {
  setLanguage(resolveLanguage(settings?.language, app.getPreferredSystemLanguages()))
}

app.on('second-instance', () => showWindow())

void app.whenReady().then(async () => {
  if (!primary) return

  // Sin menú nativo: File/Edit/View no significan nada para el usuario al que
  // va dirigida la app, y solo restan espacio y claridad (§3).
  Menu.setApplicationMenu(null)

  // Los jars de los plugins oficiales viajan con la aplicación. En desarrollo
  // están en el repositorio; empaquetados, junto al ejecutable.
  setResourcesRoot(
    app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  )

  // Antes de leer nada hay que saber dónde están los datos: pueden haberse
  // movido a otra carpeta desde la configuración (ver `dataFolder.ts`).
  applyLanguage(null)
  const location = await readDataLocation()
  const move = location.pendingMove

  // El núcleo no conoce Electron: se le inyecta dónde guardar los datos (§5).
  if (move) {
    // Traslado pedido en la sesión anterior. Se hace ahora, ANTES de arrancar
    // el núcleo, con la ventana enseñando el progreso: así nada tiene abiertos
    // los ficheros que se mueven.
    setDataRoot(move.from)
    applyLanguage(await readSettings().catch(() => null))
    registerIpc(() => mainWindow)
    createWindow()
    setDataRoot(await runPendingRelocation(move))
  } else {
    const root = await resolveDataRoot(location)
    if (!root) {
      app.quit()
      return
    }
    setDataRoot(root)
    applyLanguage(await readSettings().catch(() => null))
    registerIpc(() => mainWindow)
  }

  await service.initialize()

  service.on('status', () => updatePowerBlocker())
  service.on('settings', (settings: AppSettings) => {
    applyLanguage(settings)
    // El menú de la bandeja también cambia de idioma.
    if (tray) updateTray()
  })

  // Después del núcleo: si estaba encendido, se pone a escuchar ya. Un fallo
  // (puerto ocupado, certificado) queda en su estado y lo enseña Configuración.
  registerRemoteIpc(remote, () => mainWindow)
  remote.on('changed', () => updateTray())
  service.on('removed', (id: string) => void remote.forgetServer(id).catch(() => undefined))
  await remote.init().catch(() => undefined)
  updateTray()

  registerRemoteLinksIpc(remoteLinks, () => mainWindow)
  await remoteLinks.init().catch(() => undefined)
  updateLinksActivity()

  if (mainWindow) finishRelocation()
  else createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

/**
 * Pregunta si se paran los servidores para salir. Con la ventana a la vista y
 * como padre del diálogo, para que no quede detrás de ella.
 */
function confirmStopServers(): boolean {
  const options = {
    type: 'question' as const,
    buttons: [t('main.quit.confirm'), t('main.quit.cancel')],
    defaultId: 0,
    cancelId: 1,
    title: t('main.quit.title'),
    message: t('main.quit.message'),
    detail: t('main.quit.detail')
  }
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  const choice = window ? dialog.showMessageBoxSync(window, options) : dialog.showMessageBoxSync(options)
  return choice === 0
}

function stopServersAndQuit(): void {
  quitting = true
  void service.stopAll().finally(() => app.quit())
}

/**
 * Cierre con servidores activos: se pregunta y se cierra limpiamente.
 * Este es el punto donde un launcher mal hecho corrompe mundos.
 *
 * Cerrando con la X ya se preguntó en el `close` de la ventana; aquí llegan
 * las otras salidas («Salir» de la bandeja, el reinicio tras mover los datos).
 */
app.on('before-quit', (event) => {
  if (quitting) return
  if (!service.hasRunningServers()) {
    // Se marca igualmente: la ventana tiene que saber que esto es salir de
    // verdad y no esconderse en la bandeja.
    quitting = true
    return
  }

  event.preventDefault()
  showWindow()
  if (confirmStopServers()) stopServersAndQuit()
})

/**
 * Lo último: el acceso remoto deja de escuchar y guarda lo pendiente, todo
 * síncrono.
 *
 * No se cancela la salida para esperar a nada. Se probó: con `will-quit`
 * cancelado, un segundo `app.quit()` no hace nada (la app se quedaba viva y sin
 * ventana), y forzarla con `app.exit()` dejaba a veces procesos de Chromium
 * huérfanos (medido con Playwright, ANALISIS.md §19.31).
 */
app.on('will-quit', () => {
  if (!primary) return
  tray?.destroy()
  tray = null
  remote.shutdownNow()
  remoteLinks.shutdown()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
