import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { BASE_MAP, type ZomboidModEntry } from '@shared/games/zomboid/types'
import { Rich, t } from '../../i18n'

/**
 * Los mods del taller de Steam.
 *
 * Zomboid no tiene un catálogo que se pueda buscar desde fuera —su taller vive
 * en Steam—, así que aquí se pega el enlace del mod y la app hace el resto:
 * preguntarle a Steam cómo se llama, descargarlo, dejarlo donde el juego lo
 * busca y rellenar las tres claves que el servidor necesita (`Mods`, `Map` y
 * `WorkshopItems`). Eso último es lo que la gente falla a mano.
 *
 * Dos cosas se dicen aquí y no se esconden:
 *
 * - **Cambiar mods exige el servidor parado.** El juego los lee al cargar el
 *   mundo y no los vuelve a mirar.
 * - **Tus amigos tendrán que suscribirse ellos.** Este servidor arranca sin
 *   Steam, así que no puede pasárselos.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function ModsPanel({ state, onChanged }: Props): React.JSX.Element {
  const id = state.manifest.id
  const parado = state.status === 'stopped' || state.status === 'crashed'

  const [entries, setEntries] = useState<ZomboidModEntry[]>([])
  const [conActualizacion, setConActualizacion] = useState<string[]>([])
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await window.qubiq.zomboid.mods.list(id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function run(accion: string, fn: () => Promise<unknown>, hecho: string): Promise<void> {
    setBusy(accion)
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(hecho)
      await reload()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function mirarActualizaciones(): Promise<void> {
    setBusy('updates')
    setError(null)
    try {
      const ids = await window.qubiq.zomboid.mods.updates(id)
      setConActualizacion(ids)
      setNotice(ids.length === 0 ? t('pz.mods.upToDate') : t('pz.mods.withUpdates', { count: ids.length }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const activos = entries.filter((e) => e.ref.enabled)
  const mapas = [...new Set(activos.flatMap((e) => e.mods.flatMap((m) => m.maps)))]

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('catalog.error')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {!parado && (
        <div className="alert info">
          <strong>{t('catalog.lookOnly')}</strong>
          <p>{t('pz.mods.runningText')}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('pz.mods.addTitle')}</h3>
        <p className="hint">{t('pz.mods.addHint')}</p>
        <div className="row">
          <input
            className="grow"
            placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..."
            value={texto}
            disabled={!parado || busy !== null}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button
            className="primary"
            style={{ flex: 'none' }}
            disabled={!parado || busy !== null || texto.trim() === ''}
            onClick={() =>
              void run('add', async () => {
                await window.qubiq.zomboid.mods.add(id, texto)
                setTexto('')
              }, t('pz.mods.added'))
            }
          >
            {busy === 'add' ? t('pz.mods.downloading') : t('mc.official.add')}
          </button>
          <button
            style={{ flex: 'none' }}
            onClick={() =>
              void window.qubiq.system.openExternal(
                'https://steamcommunity.com/app/108600/workshop/'
              )
            }
          >
            {t('pz.mods.openWorkshop')}
          </button>
        </div>
        <div className="help">
          <Rich k="pz.mods.friendsSubscribe" values={{ friends: <strong>{t('pz.mods.friendsBold')}</strong> }} />
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>{t('pz.mods.installedTitle')}</h3>
          <button disabled={busy !== null || entries.length === 0} onClick={() => void mirarActualizaciones()}>
            {busy === 'updates' ? t('catalog.looking') : t('catalog.lookUpdates')}
          </button>
        </div>

        {loading ? (
          <p className="hint">{t('pz.mods.loading')}</p>
        ) : entries.length === 0 ? (
          <p className="hint">{t('pz.mods.none')}</p>
        ) : (
          <>
            <p className="hint">
              <Rich k="pz.mods.order" values={{ last: <strong>{t('pz.mods.lastWins')}</strong> }} />
            </p>
            {entries.map((entry, i) => (
              <div className="cfg-option" key={entry.ref.workshopId}>
                <div className="row between" style={{ gap: 10 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{entry.ref.title}</strong>
                      {!entry.ref.enabled && <span className="badge muted">{t('catalog.off')}</span>}
                      {conActualizacion.includes(entry.ref.workshopId) && (
                        <span className="badge warn">{t('pz.mods.newVersion')}</span>
                      )}
                    </div>
                    <div className="help" style={{ margin: 0 }}>
                      {/* Casi siempre el objeto del taller se llama igual que
                          el mod que trae: repetirlo sería ruido. */}
                      {entry.mods.length === 0
                        ? t('pz.mods.empty')
                        : entry.mods
                            .map((mod) => {
                              const version = mod.version ?? t('pz.mods.noVersion')
                              return mod.name === entry.ref.title
                                ? t('catalog.versionShort', { version })
                                : `${mod.name} (${version})`
                            })
                            .join(' · ')}
                      {entry.mods.some((mod) => mod.maps.length > 0) &&
                        ` · ${t('pz.mods.maps', { list: entry.mods.flatMap((mod) => mod.maps).join(', ') })}`}
                    </div>
                    {entry.problem && (
                      <div className="cfg-error">{entry.problem}</div>
                    )}
                  </div>

                  <button
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null || i === 0}
                    title={t('pz.mods.loadBefore')}
                    onClick={() =>
                      void run('move', () => window.qubiq.zomboid.mods.move(id, entry.ref.workshopId, -1), t('pz.mods.orderChanged'))
                    }
                  >
                    ↑
                  </button>
                  <button
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null || i === entries.length - 1}
                    title={t('pz.mods.loadAfter')}
                    onClick={() =>
                      void run('move', () => window.qubiq.zomboid.mods.move(id, entry.ref.workshopId, 1), t('pz.mods.orderChanged'))
                    }
                  >
                    ↓
                  </button>
                  <button
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null}
                    onClick={() =>
                      void run(
                        'enable',
                        () =>
                          window.qubiq.zomboid.mods.setEnabled(
                            id,
                            entry.ref.workshopId,
                            !entry.ref.enabled
                          ),
                        entry.ref.enabled ? t('pz.mods.turnedOff') : t('pz.mods.turnedOn')
                      )
                    }
                  >
                    {entry.ref.enabled ? t('pz.mods.turnOff') : t('pz.mods.turnOn')}
                  </button>
                  <button
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null}
                    onClick={() =>
                      void run(
                        'update',
                        () => window.qubiq.zomboid.mods.update(id, entry.ref.workshopId),
                        t('pz.mods.updated')
                      )
                    }
                  >
                    {busy === 'update' ? t('pz.mods.fetching') : t('version.update')}
                  </button>
                  <button
                    className="danger"
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null}
                    onClick={() =>
                      void run(
                        'remove',
                        () => window.qubiq.zomboid.mods.remove(id, entry.ref.workshopId),
                        t('pz.mods.removed')
                      )
                    }
                  >
                    {t('catalog.remove')}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {mapas.length > 0 && (
        <div className="card">
          <h3>{t('pz.mods.mapsTitle')}</h3>
          <p className="hint">{t('pz.mods.mapsHint')}</p>
          <code>{[...mapas, BASE_MAP].join(' · ')}</code>
        </div>
      )}
    </div>
  )
}
