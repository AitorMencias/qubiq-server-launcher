import { access } from 'node:fs/promises'
import { app, dialog } from 'electron'
import type { RelocationStatus } from '@shared/dataFolder'
import { t } from '@shared/i18n'
import { readLocation, writeLocation, type DataLocation } from './core/dataFolder/location'
import { RelocationError, relocateData } from './core/dataFolder/relocate'
import { samePath } from './core/dataFolder/plan'

/**
 * La carpeta de datos vista desde Electron: dónde está, qué hacer si ha
 * desaparecido y el traslado que se hace al arrancar.
 *
 * El núcleo (`core/dataFolder`) sabe mover y comprobar; esto decide CUÁNDO,
 * porque depende del arranque de la app y de sus diálogos.
 */

/** La carpeta de siempre. Guarda también el fichero que dice dónde están los datos. */
export function configDir(): string {
  return app.getPath('userData')
}

let status: RelocationStatus = { state: 'idle' }
let notify: (status: RelocationStatus) => void = () => undefined

export function relocationStatus(): RelocationStatus {
  return status
}

export function onRelocation(handler: (status: RelocationStatus) => void): void {
  notify = handler
}

function setStatus(next: RelocationStatus): void {
  status = next
  notify(next)
}

/** La interfaz ya ha enseñado el resultado: el siguiente arranque de la ventana es normal. */
export function dismissRelocation(): void {
  if (status.state === 'done' || status.state === 'failed') status = { state: 'idle' }
}

/** Lo que hay que escribir para que los datos estén en `root`. */
function locationFor(root: string): DataLocation {
  return samePath(root, configDir()) ? {} : { dataRoot: root }
}

/** Pide el traslado para el siguiente arranque. Quien llama reinicia la app. */
export async function requestRelocation(from: string, to: string): Promise<void> {
  await writeLocation(configDir(), { ...locationFor(from), pendingMove: { from, to } })
}

export async function readDataLocation(): Promise<DataLocation> {
  return readLocation(configDir())
}

/**
 * Hace el traslado pendiente y devuelve dónde quedan los datos. Nunca lanza:
 * si falla, los datos siguen en el origen y el estado lo cuenta.
 */
export async function runPendingRelocation(move: { from: string; to: string }): Promise<string> {
  const { from, to } = move
  setStatus({ state: 'moving', from, to, progress: { phase: 'measuring' } })
  try {
    const result = await relocateData(from, to, (progress) =>
      setStatus({ state: 'moving', from, to, progress })
    )
    await writeLocation(configDir(), locationFor(to))
    // El resultado se anuncia cuando el núcleo esté listo (`finishRelocation`),
    // para que al seguir la interfaz encuentre ya los servidores.
    status = { state: 'done', from, to, leftovers: result.leftovers }
    return to
  } catch (err) {
    const error = err instanceof RelocationError ? err : null
    // Se quita el traslado pendiente pase lo que pase: reintentarlo en cada
    // arranque dejaría la app sin abrir mientras el problema siga ahí.
    await writeLocation(configDir(), locationFor(from)).catch(() => undefined)
    status = {
      state: 'failed',
      from,
      to,
      error: error?.code ?? 'other',
      detail: err instanceof Error ? err.message : String(err)
    }
    return from
  }
}

/** Avisa a la interfaz del resultado, con el núcleo ya arrancado. */
export function finishRelocation(): void {
  if (status.state === 'done' || status.state === 'failed') notify(status)
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

/**
 * La carpeta de datos con la que arrancar, o null si el usuario prefiere salir.
 *
 * Si está en otro disco y ese disco no está (uno externo sin conectar), NO se
 * crea una vacía: la app arrancaría diciendo que no hay servidores, y el que
 * luego crease uno acabaría con dos carpetas de datos. Se pregunta.
 */
export async function resolveDataRoot(location: DataLocation): Promise<string | null> {
  const root = location.dataRoot
  if (!root || samePath(root, configDir())) return configDir()

  for (;;) {
    if (await exists(root)) return root

    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [t('main.missing.retry'), t('main.missing.useDefault'), t('main.missing.quit')],
      defaultId: 0,
      cancelId: 2,
      title: t('main.missing.title'),
      message: t('main.missing.message', { path: root }),
      detail: t('main.missing.detail', { defaultPath: configDir() })
    })
    if (choice === 0) continue
    if (choice === 2) return null
    // No se borra ni se mueve nada: solo se deja de apuntar a la otra carpeta.
    await writeLocation(configDir(), {})
    return configDir()
  }
}
