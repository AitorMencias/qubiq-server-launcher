import { app, session, shell, type WebContents } from 'electron'

/**
 * Lo que impide que una página que no es la de la app llegue a la ventana.
 *
 * El preload se vuelve a cargar en cada navegación: si la ventana principal
 * llegara a otra página (arrastrando un enlace o un `.html` encima, o con un
 * enlace sin `target`), esa página tendría todo `window.qubiq`, que puede
 * arrancar, mandar órdenes y borrar servidores. Comprobado en Electron 44 (§19.36).
 *
 * Por eso: la ventana no sale nunca de la app, los enlaces externos se abren en
 * el navegador del usuario, no se abren ventanas nuevas de Electron, no hay
 * `<webview>` y no se concede ningún permiso salvo escribir en el portapapeles
 * (el botón «Copiar»).
 */

/** ¿Es una dirección de la propia app? La compilada (file://) o el servidor de desarrollo. */
function isAppUrl(url: string, appUrl: string): boolean {
  try {
    const target = new URL(url)
    const own = new URL(appUrl)
    if (own.protocol === 'file:') return target.protocol === 'file:' && target.pathname === own.pathname
    return target.origin === own.origin
  } catch {
    return false
  }
}

/** Solo `https`: lo mismo que filtra `system:openExternal`. */
function openInBrowser(url: string): void {
  try {
    if (new URL(url).protocol === 'https:') void shell.openExternal(url)
  } catch {
    // Una dirección rota no se abre.
  }
}

/** Para todo `webContents` que se cree, sea de la ventana que sea. */
export function hardenApp(): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openInBrowser(url)
      return { action: 'deny' }
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.on('will-navigate', (event, url) => {
      if (isAppUrl(url, contents.getURL())) return
      event.preventDefault()
      openInBrowser(url)
    })
    // También los iframes: la app no tiene ninguno, así que ninguno navega.
    contents.on('will-frame-navigate', (event) => {
      if (!event.isMainFrame) event.preventDefault()
    })
  })

  app.whenReady().then(() => {
    const allowed = new Set(['clipboard-sanitized-write'])
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(allowed.has(permission))
    })
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission))
  }, () => undefined)
}
