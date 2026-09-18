import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { FactorioSave } from '@shared/games/factorio/types'

/**
 * Partidas de un servidor de Factorio.
 *
 * Hay dos clases y conviene no mezclarlas: la partida del servidor (una sola, la
 * que se juega) y los autoguardados que hace el propio juego cada pocos minutos,
 * que se van sobrescribiendo por turnos.
 *
 * Por eso un autoguardado no se «activa»: se **copia encima** de la partida
 * buena, porque si se activara, el siguiente autoguardado se lo llevaría por
 * delante. Y antes de pisarla, la app hace una copia de seguridad.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

function formatSize(bytes: number): string {
  return bytes > 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
}

export function SavesPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const autosaveMinutes = manifest.game === 'factorio' ? manifest.data.autosaveMinutes : 10
  const [saves, setSaves] = useState<FactorioSave[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<FactorioSave | null>(null)

  const load = useCallback(async () => {
    try {
      setSaves(await window.qubiq.factorio.saves.list(manifest.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void load()
  }, [load, status])

  async function run(what: () => Promise<void>, message: string): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await what()
      setNotice(message)
      setConfirming(null)
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const principales = saves.filter((s) => !s.automatic)
  const autosaves = saves.filter((s) => s.automatic)

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>No se pudo completar la acción</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      <div className="card">
        <h3>La partida del servidor</h3>
        <p className="hint">
          Es la que se carga al arrancar. Se guarda sola cada {autosaveMinutes} minutos mientras hay
          alguien dentro, y siempre al parar el servidor.
        </p>

        {principales.length === 0 && (
          <p className="hint" style={{ marginBottom: 14 }}>
            Todavía no hay partida: se genera al instalar el servidor.
          </p>
        )}
        {principales.map((save) => (
          <div className="row between" key={save.name} style={{ marginBottom: 12 }}>
            <div>
              <strong>{save.name}</strong>
              {save.active && (
                <span className="badge" style={{ marginLeft: 8 }}>
                  en uso
                </span>
              )}
              <p className="hint" style={{ margin: 0 }}>
                {formatSize(save.sizeBytes)} · guardada {formatDate(save.modifiedAt)}
              </p>
            </div>
            {!save.active && (
              <button
                className="danger"
                style={{ flexShrink: 0 }}
                disabled={busy || running}
                onClick={() => setConfirming(save)}
              >
                Borrar
              </button>
            )}
          </div>
        ))}

        <div className="row">
          <button
            disabled={busy || !running}
            onClick={() =>
              void run(() => window.qubiq.factorio.saves.saveNow(manifest.id), 'Partida guardada.')
            }
          >
            Guardar ahora
          </button>
          {!running && (
            <p className="hint" style={{ margin: 0 }}>
              Solo con el servidor en marcha.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Autoguardados del juego</h3>
        <p className="hint">
          Los hace Factorio por su cuenta y los va sobrescribiendo. Volver a uno lo copia encima de
          la partida del servidor, y antes se hace una copia de seguridad por si acaso.
        </p>

        {autosaves.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Todavía no hay ninguno: aparecen a los pocos minutos de que alguien juegue.
          </p>
        ) : (
          autosaves.map((save) => (
            <div className="row between" key={save.name} style={{ marginBottom: 12 }}>
              <div>
                <strong>{save.name}</strong>
                <p className="hint" style={{ margin: 0 }}>
                  {formatSize(save.sizeBytes)} · {formatDate(save.modifiedAt)}
                </p>
              </div>
              <button
                style={{ flexShrink: 0 }}
                disabled={busy || running}
                onClick={() =>
                  void run(
                    () => window.qubiq.factorio.saves.restoreAutosave(manifest.id, save.name),
                    'Recuperado: el servidor arrancará desde ese punto.'
                  )
                }
              >
                Volver a este punto
              </button>
            </div>
          ))
        )}
        {running && autosaves.length > 0 && (
          <p className="hint">Para volver a un autoguardado hay que parar el servidor.</p>
        )}
      </div>

      {confirming && (
        <div className="card danger-zone">
          <h3>¿Borrar la partida «{confirming.name}»?</h3>
          <p className="hint">No es la que juega el servidor, pero no se podrá recuperar.</p>
          <div className="row">
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void run(
                  () => window.qubiq.factorio.saves.remove(manifest.id, confirming.name),
                  'Partida borrada.'
                )
              }
            >
              Sí, borrarla
            </button>
            <button disabled={busy} onClick={() => setConfirming(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
