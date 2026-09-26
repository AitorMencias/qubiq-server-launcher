import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { modSizeLabel, type ModsView } from '@shared/games/mods'

/**
 * Mods de un servidor de Enshrouded, con Shroudtopia de cargador.
 *
 * **Por qué esta pantalla no es la de Satisfactory y Valheim** (`CatalogModsPanel`):
 * aquellos dos tienen cargador **y** catálogo con buscador, y aquí solo hay lo
 * primero. Los mods de Enshrouded viven en Nexus Mods, cuya API no deja
 * descargar sin cuenta de pago, así que el fichero lo trae el usuario. Forzar
 * el molde habría dejado un buscador que no encuentra nada.
 *
 * Lo que sí hace la app, que es casi todo lo demás: instalar y actualizar el
 * cargador sola, reconocer el paquete que le traigan, dejarlo donde el cargador
 * lo busca, encenderlo, apagarlo y quitarlo.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function ModsPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'

  const [view, setView] = useState<ModsView | null>(null)
  const [update, setUpdate] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.qubiq.enshrouded.mods
      .list(manifest.id)
      .then(setView)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [manifest.id])

  useEffect(load, [load])

  useEffect(() => {
    let alive = true
    void window.qubiq.enshrouded.mods
      .loaderUpdate(manifest.id)
      .then((version) => {
        if (alive) setUpdate(version)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [manifest.id, view?.loader.version])

  function run(label: string, action: () => Promise<ModsView>): void {
    setBusy(label)
    setError(null)
    setNotice(null)
    void action()
      .then((next) => {
        setView(next)
        onChanged()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(null))
  }

  async function addFile(): Promise<void> {
    const file = await window.qubiq.enshrouded.mods.pickFile()
    if (!file) return
    run('add', async () => {
      const next = await window.qubiq.enshrouded.mods.addFile(manifest.id, file)
      setNotice('Mod instalado. Se cargará la próxima vez que arranques el servidor.')
      return next
    })
  }

  if (!view) {
    return (
      <div className="panel">
        {error ? (
          <div className="alert error">
            <strong>No se pudo leer la lista de mods</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className="hint">Leyendo los mods…</p>
        )}
      </div>
    )
  }

  const { loader, mods } = view

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {running && (
        <div className="alert info">
          <strong>El servidor está arrancado</strong>
          <p>
            Los mods se cargan al arrancar el proceso, así que para poner o quitar alguno hay que
            parar el servidor.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Cómo se amplía Enshrouded</h3>
        <p className="hint">
          Enshrouded todavía no tiene mods oficiales ni taller de Steam: su estudio dice que
          llegarán. Mientras tanto, la comunidad usa un cargador, <strong>{loader.name}</strong>,
          que se pone al lado del ejecutable y carga los mods que dejes en su carpeta.
        </p>
        <p className="hint">
          Los mods se descargan de <strong>Nexus Mods</strong>, que no deja que un programa se los
          baje por ti sin una cuenta de pago. Así que el fichero lo bajas tú y lo traes aquí: la app
          se encarga del resto.
        </p>
        <div className="row">
          <button
            onClick={() =>
              void window.qubiq.system.openExternal('https://www.nexusmods.com/games/enshrouded')
            }
          >
            Abrir Nexus Mods
          </button>
          <button onClick={() => void window.qubiq.enshrouded.mods.openFolder(manifest.id)}>
            Abrir la carpeta de mods
          </button>
        </div>
      </div>

      <div className="card">
        <h3>El cargador</h3>
        {loader.installed ? (
          <>
            <p className="hint">
              {loader.name} {loader.version ?? ''} está puesto. Se engancha con un{' '}
              <code>winmm.dll</code> al lado del ejecutable y va contando por la consola qué mods
              encuentra y cuáles carga.
            </p>
            {update && (
              <div className="alert info">
                <strong>Hay una versión nueva: {update}</strong>
                <p>
                  Conviene ponerla cuando Enshrouded se actualiza: el cargador se engancha a
                  direcciones concretas del juego y una versión vieja puede dejar los mods a medias.
                </p>
                <button
                  className="primary"
                  disabled={busy !== null || running}
                  onClick={() =>
                    run('loader', () => window.qubiq.enshrouded.mods.installLoader(manifest.id))
                  }
                >
                  {busy === 'loader' ? 'Actualizando…' : `Actualizar a ${update}`}
                </button>
              </div>
            )}
            <button
              className="danger"
              disabled={busy !== null || running || mods.length > 0}
              onClick={() =>
                run('removeLoader', () => window.qubiq.enshrouded.mods.removeLoader(manifest.id))
              }
            >
              {busy === 'removeLoader' ? 'Quitando…' : 'Quitar el cargador'}
            </button>
            {mods.length > 0 && (
              // `p.hint` y no `.help`: suelta en una tarjeta, `.help` sale a
              // tamaño normal y compite con el texto de arriba.
              <p className="hint" style={{ margin: '8px 0 0' }}>
                Quita antes los mods: sin cargador se quedarían en el disco sin cargarse.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="hint">
              Sin cargador, un mod en la carpeta no hace absolutamente nada. Se instala solo al
              poner el primer mod, o desde aquí.
            </p>
            <button
              className="primary"
              disabled={busy !== null || running}
              onClick={() =>
                run('loader', () => window.qubiq.enshrouded.mods.installLoader(manifest.id))
              }
            >
              {busy === 'loader' ? 'Instalando…' : `Instalar ${loader.name}`}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3>Mods instalados</h3>
        {mods.length === 0 ? (
          <p className="hint">
            Todavía no hay ninguno. Baja el fichero del mod de Nexus Mods (un <code>.dll</code>, o
            un <code>.zip</code> que lo lleve dentro) y tráelo aquí.
          </p>
        ) : (
          mods.map((mod) => (
            <div className="field" key={mod.id}>
              <label>
                {mod.name}
                {!mod.enabled && <span className="badge"> apagado</span>}
              </label>
              <div className="row between">
                <span className="help">
                  {mod.version} · {modSizeLabel(mod.sizeBytes)}
                  {mod.problem ? ` · ${mod.problem}` : ''}
                </span>
                <div className="row" style={{ flexShrink: 0 }}>
                  <button
                    disabled={busy !== null || running || mod.addedAt === ''}
                    onClick={() =>
                      run(mod.id, () =>
                        window.qubiq.enshrouded.mods.setEnabled(manifest.id, mod.id, !mod.enabled)
                      )
                    }
                  >
                    {mod.enabled ? 'Apagar' : 'Encender'}
                  </button>
                  <button
                    className="danger"
                    disabled={busy !== null || running || mod.addedAt === ''}
                    onClick={() =>
                      run(mod.id, () => window.qubiq.enshrouded.mods.remove(manifest.id, mod.id))
                    }
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        <button
          className="primary"
          disabled={busy !== null || running}
          onClick={() => void addFile()}
        >
          {busy === 'add' ? 'Instalando…' : 'Traer un mod…'}
        </button>
      </div>

      <div className="card">
        <h3>Lo que conviene saber</h3>
        <p className="hint">
          <strong>Apagar un mod es sacar su fichero de la carpeta</strong>, no renombrarlo: el
          cargador recorre la carpeta entera buscando <code>.dll</code>. La app lo aparta fuera del
          servidor y lo devuelve al encenderlo.
        </p>
        <p className="hint">
          <strong>Hay mods que también hay que poner en el juego de cada uno.</strong> Los que solo
          tocan las reglas del servidor valen con ponerlos aquí; los que añaden objetos o cambian lo
          que se ve, no. Lo dice la ficha de cada mod en Nexus.
        </p>
        <p className="hint">
          <strong>Una actualización de Enshrouded puede romperlos.</strong> Este cargador se
          engancha a direcciones de memoria del juego, así que cuando el juego cambia hay que
          esperar a que sus autores publiquen versión nueva. Cuando pasa, sale en la consola: «el
          mod X no encaja con esta versión».
        </p>
      </div>
    </div>
  )
}
