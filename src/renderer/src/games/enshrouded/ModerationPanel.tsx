import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { EnshroudedBan } from '@shared/games/enshrouded/types'
import { Rich, formatDateOnly, t } from '../../i18n'

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
          <strong>{t('catalog.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('en.mod.cannotTitle')}</h3>
        <p className="hint">{t('en.mod.cannotText')}</p>
        <p className="hint">
          <Rich
            k="en.mod.howTo"
            values={{
              admin: <strong>{t('en.role.Admin')}</strong>,
              social: <strong>Social</strong>,
              path: (
                <strong>
                  {t('panel.configuration')} → {t('en.tab.roles')}
                </strong>
              )
            }}
          />
        </p>
      </div>

      <div className="card">
        <h3>{t('en.tab.bans')}</h3>
        {bans === null ? (
          <p className="hint">{t('en.mod.reading')}</p>
        ) : bans.length === 0 ? (
          <p className="hint">{t('en.mod.none')}</p>
        ) : (
          <>
            {running && (
              <div className="alert info">
                <strong>{t('catalog.lookOnly')}</strong>
                <p>{t('en.mod.runningText')}</p>
              </div>
            )}
            {bans.map((ban) => (
              // En `div.field` para que la nota de debajo salga como nota: la
              // clase `.help` solo tiene estilo dentro de un campo, de un paso
              // del asistente o de una casilla.
              <div className="field" key={ban.accountId}>
                <label>
                  {ban.displayName || t('en.mod.steamAccount', { id: String(ban.accountId) })}
                </label>
                <div className="row between">
                  <span className="help">
                    {ban.characterName ? `${t('en.mod.character', { name: ban.characterName })} ` : ''}
                    {t('en.mod.bannedOn', { date: formatDate(ban.banDate) })}
                  </span>
                  <button
                    style={{ flexShrink: 0 }}
                    disabled={busy || running}
                    onClick={() => void unban(ban)}
                  >
                    {t('en.mod.unban')}
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
  return formatDateOnly(seconds * 1000, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}
