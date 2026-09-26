import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { EnshroudedWorld } from '@shared/games/enshrouded/types'

/**
 * Mundos de un servidor de Enshrouded.
 *
 * Un servidor carga un mundo, el que diga `saveDirectory` en su configuración,
 * pero puede guardar todos los que quiera. Cambiar de uno a otro es cambiar esa
 * carpeta, así que **solo se puede con el servidor parado**.
 *
 * A diferencia de Valheim, aquí el nombre **no decide el terreno**: Enshrouded
 * genera siempre el mismo mundo, que es un mapa hecho a mano. El nombre es solo
 * el de la partida.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function WorldsPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const [worlds, setWorlds] = useState<EnshroudedWorld[]>([])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setWorlds(await window.qubiq.enshrouded.worlds.list(manifest.id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void load()
  }, [load, status])

  function run(action: () => Promise<EnshroudedWorld[]>): void {
    setBusy(true)
    setError(null)
    void action()
      .then((list) => {
        setWorlds(list)
        setConfirming(null)
        onChanged()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>No se pudo completar la acción</strong>
          <p>{error}</p>
        </div>
      )}

      {running && (
        <div className="alert info">
          <strong>El servidor está arrancado</strong>
          <p>
            Para cambiar de mundo, crear otro o borrar alguno hay que pararlo: el que se carga se
            decide al arrancar.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Mundos de este servidor</h3>
        <p className="hint">
          El marcado es el que carga el servidor. Los demás siguen guardados y se puede volver a
          ellos cuando quieras.
        </p>

        {worlds.map((world) => (
          <div className="row between" key={world.name} style={{ marginBottom: 12 }}>
            <div>
              <strong>{world.name}</strong>
              {world.active && <span className="badge"> en uso</span>}
              <div className="help" style={{ margin: 0 }}>
                {world.savedAt === null
                  ? 'Sin empezar: el mundo se crea la primera vez que arranques con él.'
                  : `${formatSize(world.sizeBytes)} · guardado ${formatDate(world.savedAt)}`}
              </div>
            </div>
            <div className="row" style={{ flexShrink: 0 }}>
              {!world.active && (
                <button
                  disabled={busy || running}
                  onClick={() =>
                    run(() => window.qubiq.enshrouded.worlds.activate(manifest.id, world.name))
                  }
                >
                  Jugar en este
                </button>
              )}
              {!world.active && (
                <button
                  className="danger"
                  disabled={busy || running}
                  onClick={() => setConfirming(world.name)}
                >
                  Borrar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirming && (
        <div className="card danger-zone">
          <h3>¿Borrar el mundo «{confirming}»?</h3>
          <p className="hint">
            Se pierde todo lo construido en él. Antes de borrarlo se hace una copia de seguridad
            automática, así que se podría recuperar desde Copias.
          </p>
          <div className="row">
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                run(() => window.qubiq.enshrouded.worlds.remove(manifest.id, confirming))
              }
            >
              {busy ? 'Borrando…' : 'Sí, borrarlo'}
            </button>
            <button disabled={busy} onClick={() => setConfirming(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Empezar un mundo nuevo</h3>
        <p className="hint">
          El de ahora no se borra: se queda guardado y puedes volver cuando quieras. En Enshrouded
          el terreno es siempre el mismo mapa, así que el nombre es solo el de la partida.
        </p>
        <div className="row">
          <input
            className="grow"
            value={newName}
            maxLength={40}
            placeholder="Nombre del mundo"
            disabled={running}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="primary"
            style={{ flexShrink: 0 }}
            disabled={busy || running || newName.trim().length === 0}
            onClick={() =>
              run(async () => {
                const list = await window.qubiq.enshrouded.worlds.create(manifest.id, newName.trim())
                setNewName('')
                return list
              })
            }
          >
            Crear y usarlo
          </button>
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(Math.round(bytes / 1024), 1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
