import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { EnshroudedBan } from '@shared/games/enshrouded/types'

/**
 * Vetados de un servidor de Enshrouded.
 *
 * Es toda la moderación que existe desde fuera del juego, y hay que decir muy
 * claro lo que no se puede, en vez de esconderlo:
 *
 * - **No se puede echar a nadie desde aquí.** Lo dice el propio ejecutable del
 *   servidor: «Dedicated server kick not implemented».
 * - **Vetar tampoco**: se hace desde dentro del juego, entrando con la
 *   contraseña de Administrador, en la pestaña Social.
 * - **Lo que sí se puede es quitar un veto**, porque la lista vive en el
 *   fichero de configuración. Con el servidor parado, que es cuando el fichero
 *   es de la app y no suyo.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function ModerationPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'

  const [bans, setBans] = useState<EnshroudedBan[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.qubiq.enshrouded.bans
      .list(manifest.id)
      .then(setBans)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [manifest.id])

  useEffect(load, [load])

  async function unban(ban: EnshroudedBan): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setBans(await window.qubiq.enshrouded.bans.remove(manifest.id, ban.accountId))
      onChanged()
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
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>Lo que Enshrouded no deja hacer desde fuera</h3>
        <p className="hint">
          No es una limitación de esta app: el servidor de Enshrouded no sabe expulsar a nadie
          —tiene la orden sin terminar— y tampoco admite vetar desde su configuración.
        </p>
        <p className="hint">
          Para echar o vetar a alguien, entra tú al servidor con la contraseña de{' '}
          <strong>Administrador</strong> y hazlo desde la pestaña <strong>Social</strong> del propio
          juego. Si hace falta cortar de raíz, para el servidor o cámbiale las contraseñas de los
          roles en <strong>Configuración → Roles</strong>.
        </p>
      </div>

      <div className="card">
        <h3>Vetados</h3>
        {bans === null ? (
          <p className="hint">Leyendo la lista…</p>
        ) : bans.length === 0 ? (
          <p className="hint">
            No hay nadie vetado. Los que vetes desde el juego aparecerán aquí la próxima vez que
            pares el servidor.
          </p>
        ) : (
          <>
            {running && (
              <div className="alert info">
                <strong>Con el servidor arrancado solo se puede mirar</strong>
                <p>
                  Enshrouded reescribe su fichero de configuración al cerrarse, así que un veto
                  quitado ahora volvería solo. Para el servidor para poder quitarlo.
                </p>
              </div>
            )}
            {bans.map((ban) => (
              // En `div.field` para que la nota de debajo salga como nota: la
              // clase `.help` solo tiene estilo dentro de un campo, de un paso
              // del asistente o de una casilla.
              <div className="field" key={ban.accountId}>
                <label>{ban.displayName || `Cuenta de Steam #${ban.accountId}`}</label>
                <div className="row between">
                  <span className="help">
                    {ban.characterName ? `Personaje: ${ban.characterName}. ` : ''}
                    Vetado el {formatDate(ban.banDate)}.
                  </span>
                  <button
                    style={{ flexShrink: 0 }}
                    disabled={busy || running}
                    onClick={() => void unban(ban)}
                  >
                    Quitar el veto
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/** La fecha de un veto, que el servidor guarda en segundos desde 1970. */
function formatDate(seconds: number): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}
