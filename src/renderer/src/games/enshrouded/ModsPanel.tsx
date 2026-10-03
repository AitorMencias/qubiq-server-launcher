import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { modSizeLabel, type ModsView } from '@shared/games/mods'
import { Rich, t } from '../../i18n'

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
      setNotice(t('en.mods.installed'))
      return next
    })
  }

  if (!view) {
    return (
      <div className="panel">
        {error ? (
          <div className="alert error">
            <strong>{t('en.mods.readFailed')}</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className="hint">{t('en.mods.reading')}</p>
        )}
      </div>
    )
  }

  const { loader, mods } = view

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('catalog.error')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {running && (
        <div className="alert info">
          <strong>{t('vh.settings.running')}</strong>
          <p>{t('en.mods.runningText')}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('en.mods.howTitle')}</h3>
        <p className="hint">
          <Rich k="en.mods.howText" values={{ loader: <strong>{loader.name}</strong> }} />
        </p>
        <p className="hint">
          <Rich k="en.mods.nexusText" values={{ nexus: <strong>Nexus Mods</strong> }} />
        </p>
        <div className="row">
          <button
            onClick={() =>
              void window.qubiq.system.openExternal('https://www.nexusmods.com/games/enshrouded')
            }
          >
            {t('en.mods.openNexus')}
          </button>
          <button onClick={() => void window.qubiq.enshrouded.mods.openFolder(manifest.id)}>
            {t('mc.content.openFolder.mods')}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>{t('en.mods.loader')}</h3>
        {loader.installed ? (
          <>
            <p className="hint">
              <Rich
                k="en.mods.loaderInstalled"
                vars={{ name: `${loader.name} ${loader.version ?? ''}`.trim() }}
                values={{ dll: <code>winmm.dll</code> }}
              />
            </p>
            {update && (
              <div className="alert info">
                <strong>{t('version.newerNamed', { version: update })}</strong>
                <p>{t('en.mods.updateText')}</p>
                <button
                  className="primary"
                  disabled={busy !== null || running}
                  onClick={() =>
                    run('loader', () => window.qubiq.enshrouded.mods.installLoader(manifest.id))
                  }
                >
                  {busy === 'loader' ? t('version.updating') : t('catalog.updateTo', { version: update })}
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
              {busy === 'removeLoader' ? t('en.mods.removing') : t('en.mods.removeLoader')}
            </button>
            {mods.length > 0 && (
              // `p.hint` y no `.help`: suelta en una tarjeta, `.help` sale a
              // tamaño normal y compite con el texto de arriba.
              <p className="hint" style={{ margin: '8px 0 0' }}>
                {t('en.mods.removeModsFirst')}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="hint">{t('en.mods.noLoader')}</p>
            <button
              className="primary"
              disabled={busy !== null || running}
              onClick={() =>
                run('loader', () => window.qubiq.enshrouded.mods.installLoader(manifest.id))
              }
            >
              {busy === 'loader'
                ? t('catalog.installing')
                : t('en.mods.installLoader', { name: loader.name })}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3>{t('pz.mods.installedTitle')}</h3>
        {mods.length === 0 ? (
          <p className="hint">
            <Rich k="en.mods.none" values={{ dll: <code>.dll</code>, zip: <code>.zip</code> }} />
          </p>
        ) : (
          mods.map((mod) => (
            <div className="field" key={mod.id}>
              <label>
                {mod.name}
                {!mod.enabled && <span className="badge"> {t('catalog.off')}</span>}
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
                    {mod.enabled ? t('pz.mods.turnOff') : t('pz.mods.turnOn')}
                  </button>
                  <button
                    className="danger"
                    disabled={busy !== null || running || mod.addedAt === ''}
                    onClick={() =>
                      run(mod.id, () => window.qubiq.enshrouded.mods.remove(manifest.id, mod.id))
                    }
                  >
                    {t('catalog.remove')}
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
          {busy === 'add' ? t('catalog.installing') : t('en.mods.bring')}
        </button>
      </div>

      <div className="card">
        <h3>{t('help.tunnel.knowTitle')}</h3>
        <p className="hint">
          <strong>{t('en.mods.know1Title')}</strong>{' '}
          <Rich k="en.mods.know1" values={{ dll: <code>.dll</code> }} />
        </p>
        <p className="hint">
          <strong>{t('en.mods.know2Title')}</strong> {t('en.mods.know2')}
        </p>
        <p className="hint">
          <strong>{t('en.mods.know3Title')}</strong> {t('en.mods.know3')}
        </p>
      </div>
    </div>
  )
}
