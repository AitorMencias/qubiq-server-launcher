import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'

/**
 * Confirmación para borrar un servidor.
 *
 * Es la acción más destructiva de la app: se lleva el mundo, las copias de
 * seguridad y la configuración, y no hay vuelta atrás. Por eso NO basta un
 * "¿seguro?": hay que escribir el nombre del servidor.
 *
 * Escribirlo obliga a leer qué se está borrando, que es justo lo que falla
 * cuando alguien tiene varios servidores parecidos y pulsa en el equivocado.
 */

interface Props {
  state: InstanceState
  onCancel: () => void
  onDeleted: () => void
}

export function ConfirmDelete({ state, onCancel, onDeleted }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status !== 'stopped' && status !== 'crashed'

  const [typed, setTyped] = useState('')
  const [worlds, setWorlds] = useState<number | null>(null)
  const [backups, setBackups] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Se enseña lo que hay dentro para que la consecuencia sea concreta y no
  // una advertencia genérica que nadie lee.
  useEffect(() => {
    void Promise.all([
      window.qubiq.worlds.list(manifest.id).catch(() => []),
      window.qubiq.backups.list(manifest.id).catch(() => [])
    ]).then(([w, b]) => {
      setWorlds(w.length)
      setBackups(b.length)
    })
  }, [manifest.id])

  const confirmed = typed.trim() === manifest.name.trim()

  async function remove(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.instances.remove(manifest.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Borrar &quot;{manifest.name}&quot;</h3>
          <button disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>

        <div className="modal-body">
          <p>
            Esto borra el servidor entero y <strong>no se puede deshacer</strong>. Se perderá:
          </p>

          <ul>
            <li>
              {worlds === null
                ? 'Sus mundos'
                : worlds === 1
                  ? 'Su mundo, con todo lo construido'
                  : `Sus ${worlds} mundos, con todo lo construido`}
            </li>
            <li>
              {backups === null
                ? 'Sus copias de seguridad'
                : backups === 0
                  ? 'No hay copias de seguridad que perder'
                  : `Sus ${backups} ${backups === 1 ? 'copia de seguridad' : 'copias de seguridad'}, que están dentro de la carpeta del servidor`}
            </li>
            <li>Su configuración, sus jugadores y sus registros</li>
          </ul>

          {backups !== null && backups > 0 && (
            <p className="note">
              Ojo: las copias de seguridad viven dentro del servidor, así que se van con él. Si
              quieres conservar el mundo, cancela y copia primero la carpeta a otro sitio con
              &quot;Abrir carpeta&quot;.
            </p>
          )}

          {running && (
            <p className="note">
              El servidor está en marcha. Se cerrará correctamente antes de borrar, para no dejar
              nada a medias.
            </p>
          )}

          {error && (
            <div className="alert error" style={{ marginTop: 16 }}>
              <strong>No se pudo borrar</strong>
              <p>{error}</p>
            </div>
          )}

          <div className="field" style={{ marginTop: 20, marginBottom: 0 }}>
            <label>
              Para confirmar, escribe <code>{manifest.name}</code>
            </label>
            <input
              value={typed}
              disabled={busy}
              autoFocus
              placeholder={manifest.name}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && confirmed && !busy) void remove()
              }}
            />
          </div>

          <div className="row between" style={{ marginTop: 20 }}>
            <button disabled={busy} onClick={onCancel}>
              Mejor no
            </button>
            <button className="danger" disabled={!confirmed || busy} onClick={() => void remove()}>
              {busy ? 'Borrando...' : 'Borrar este servidor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
