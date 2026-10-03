import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { roleProblems, type EnshroudedRole } from '@shared/games/enshrouded/types'
import { RolesEditor } from './RolesEditor'
import { t } from '../../i18n'

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
            <strong>{t('en.rolesPanel.readFailed')}</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className="hint">{t('en.rolesPanel.reading')}</p>
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
      setNotice(t('en.rolesPanel.saved'))
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
          <strong>{t('common.saveFailed')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {running && (
        <div className="alert info">
          <strong>{t('vh.settings.running')}</strong>
          <p>{t('en.rolesPanel.runningText')}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('en.rolesPanel.title')}</h3>
        <p className="hint">{t('en.rolesPanel.hint')}</p>
        <RolesEditor roles={roles} onChange={setRoles} disabled={running} />
        {problem && (
          <div className="alert error">
            <strong>{t('en.create.wontStart')}</strong>
            <p>{problem}</p>
          </div>
        )}
      </div>

      <div className="row between">
        <span className="hint">{changed ? t('en.settings.unsaved') : t('en.settings.allSaved')}</span>
        <button
          className="primary"
          disabled={!changed || busy || running || problem !== null}
          onClick={() => void save()}
        >
          {busy ? t('common.saving') : t('cfg.save')}
        </button>
      </div>
    </div>
  )
}
