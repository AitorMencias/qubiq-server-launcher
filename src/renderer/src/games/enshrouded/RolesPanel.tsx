import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { roleProblems, type EnshroudedRole } from '@shared/games/enshrouded/types'
import { RolesEditor } from './RolesEditor'

/**
 * Los roles de un servidor de Enshrouded, que son su forma de dar permisos.
 *
 * Es lo más parecido a una pantalla de moderación que tiene este juego: no hay
 * lista de usuarios ni cuentas, solo contraseñas. Quien entra con la de
 * Administrador puede echar y vetar **desde dentro del juego**; la app no
 * puede, y eso se dice en la pestaña de Vetados.
 */

interface Props {
  state: InstanceState
  onSaved: () => void
}

export function RolesPanel({ state, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'

  const [original, setOriginal] = useState<EnshroudedRole[] | null>(null)
  const [roles, setRoles] = useState<EnshroudedRole[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.qubiq.enshrouded.config
      .get(manifest.id)
      .then((config) => {
        if (!alive) return
        setOriginal(config.roles)
        setRoles(config.roles)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [manifest.id])

  if (!original) {
    return (
      <div className="panel">
        {error ? (
          <div className="alert error">
            <strong>No se pudieron leer los roles</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className="hint">Leyendo los roles…</p>
        )}
      </div>
    )
  }

  const problem = roleProblems(roles)
  const changed = JSON.stringify(roles) !== JSON.stringify(original)

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const saved = await window.qubiq.enshrouded.config.set(manifest.id, { roles })
      setOriginal(saved.roles)
      setRoles(saved.roles)
      setNotice('Guardado. Las contraseñas nuevas valen desde el próximo arranque.')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>No se pudo guardar</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {running && (
        <div className="alert info">
          <strong>El servidor está arrancado</strong>
          <p>
            Los roles se leen al arrancar, y el servidor reescribe su fichero al cerrarse. Para el
            servidor para poder cambiarlos.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Quién puede hacer qué</h3>
        <p className="hint">
          Enshrouded no tiene cuentas: la contraseña con la que entras es la que decide tu rol. Dale
          a cada persona la que corresponda.
        </p>
        <RolesEditor roles={roles} onChange={setRoles} disabled={running} />
        {problem && (
          <div className="alert error">
            <strong>Así el servidor no arranca</strong>
            <p>{problem}</p>
          </div>
        )}
      </div>

      <div className="row between">
        <span className="hint">{changed ? 'Hay cambios sin guardar.' : 'Todo guardado.'}</span>
        <button
          className="primary"
          disabled={!changed || busy || running || problem !== null}
          onClick={() => void save()}
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
