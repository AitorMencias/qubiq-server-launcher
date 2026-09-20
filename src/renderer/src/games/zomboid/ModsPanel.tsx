import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { BASE_MAP, type ZomboidModEntry } from '@shared/games/zomboid/types'

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
      setNotice(
        ids.length === 0
          ? 'Todos los mods están al día.'
          : `${ids.length} mod${ids.length === 1 ? '' : 's'} con una versión nueva.`
      )
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
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {!parado && (
        <div className="alert info">
          <strong>Con el servidor arrancado solo se puede mirar</strong>
          <p>
            Zomboid lee los mods al cargar el mundo y no los vuelve a mirar. Párala para añadir,
            quitar o reordenar.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Añadir un mod del taller</h3>
        <p className="hint">
          Busca el mod en el taller de Steam y pega aquí su enlace. También vale el número que sale
          al final de la dirección.
        </p>
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
              }, 'Mod añadido.')
            }
          >
            {busy === 'add' ? 'Descargando…' : 'Añadir'}
          </button>
          <button
            style={{ flex: 'none' }}
            onClick={() =>
              void window.qubiq.system.openExternal(
                'https://steamcommunity.com/app/108600/workshop/'
              )
            }
          >
            Abrir el taller
          </button>
        </div>
        <div className="help">
          Se descarga sin cuenta de Steam. <strong>Tus amigos tendrán que suscribirse al mismo mod</strong>{' '}
          en el taller para poder entrar: este servidor arranca sin Steam y no puede pasárselos.
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Mods instalados</h3>
          <button disabled={busy !== null || entries.length === 0} onClick={() => void mirarActualizaciones()}>
            {busy === 'updates' ? 'Mirando…' : 'Buscar actualizaciones'}
          </button>
        </div>

        {loading ? (
          <p className="hint">Cargando…</p>
        ) : entries.length === 0 ? (
          <p className="hint">
            Todavía no hay ninguno. El servidor funciona igual: los mods son opcionales.
          </p>
        ) : (
          <>
            <p className="hint">
              El orden es el de carga: cuando dos mods tocan lo mismo, <strong>manda el último</strong>.
            </p>
            {entries.map((entry, i) => (
              <div className="cfg-option" key={entry.ref.workshopId}>
                <div className="row between" style={{ gap: 10 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{entry.ref.title}</strong>
                      {!entry.ref.enabled && <span className="badge muted">apagado</span>}
                      {conActualizacion.includes(entry.ref.workshopId) && (
                        <span className="badge warn">hay versión nueva</span>
                      )}
                    </div>
                    <div className="help" style={{ margin: 0 }}>
                      {/* Casi siempre el objeto del taller se llama igual que
                          el mod que trae: repetirlo sería ruido. */}
                      {entry.mods.length === 0
                        ? 'Sin mods dentro'
                        : entry.mods
                            .map((mod) => {
                              const version = mod.version ?? 'sin versión válida'
                              return mod.name === entry.ref.title
                                ? `versión ${version}`
                                : `${mod.name} (${version})`
                            })
                            .join(' · ')}
                      {entry.mods.some((mod) => mod.maps.length > 0) &&
                        ` · mapas: ${entry.mods.flatMap((mod) => mod.maps).join(', ')}`}
                    </div>
                    {entry.problem && (
                      <div className="cfg-error">{entry.problem}</div>
                    )}
                  </div>

                  <button
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null || i === 0}
                    title="Cargar antes"
                    onClick={() =>
                      void run('move', () => window.qubiq.zomboid.mods.move(id, entry.ref.workshopId, -1), 'Orden cambiado.')
                    }
                  >
                    ↑
                  </button>
                  <button
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null || i === entries.length - 1}
                    title="Cargar después"
                    onClick={() =>
                      void run('move', () => window.qubiq.zomboid.mods.move(id, entry.ref.workshopId, 1), 'Orden cambiado.')
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
                        entry.ref.enabled ? 'Mod apagado.' : 'Mod encendido.'
                      )
                    }
                  >
                    {entry.ref.enabled ? 'Apagar' : 'Encender'}
                  </button>
                  <button
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null}
                    onClick={() =>
                      void run(
                        'update',
                        () => window.qubiq.zomboid.mods.update(id, entry.ref.workshopId),
                        'Mod actualizado.'
                      )
                    }
                  >
                    {busy === 'update' ? 'Bajando…' : 'Actualizar'}
                  </button>
                  <button
                    className="danger"
                    style={{ flex: 'none' }}
                    disabled={!parado || busy !== null}
                    onClick={() =>
                      void run(
                        'remove',
                        () => window.qubiq.zomboid.mods.remove(id, entry.ref.workshopId),
                        'Mod quitado.'
                      )
                    }
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {mapas.length > 0 && (
        <div className="card">
          <h3>Mapas</h3>
          <p className="hint">
            Estos mods traen mapas, y el servidor los carga en este orden. El del juego va siempre el
            último: lo que hay encima se superpone.
          </p>
          <code>{[...mapas, BASE_MAP].join(' · ')}</code>
        </div>
      )}
    </div>
  )
}
