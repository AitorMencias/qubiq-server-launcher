import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import type { SatisfactorySave, SatisfactorySessions } from '@shared/games/satisfactory/types'
import { Rich, formatDate as formatDateTime, quote, t } from '../../i18n'

/**
 * Partidas de un servidor de Satisfactory: lo que en Minecraft son los mundos.
 *
 * Una «partida» (sesión) agrupa sus guardados, y el servidor carga uno de
 * ellos. Todo pasa por la API, así que hace falta el servidor arrancado; y como
 * cargar o borrar se lleva por delante lo que no esté guardado, cada acción
 * dice antes qué va a pasar y el núcleo hace una copia por su cuenta.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onChanged: () => void
}

export function SavesPanel({ state, mode, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const advanced = mode === 'advanced'

  const [data, setData] = useState<SatisfactorySessions | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newSession, setNewSession] = useState('')
  const [confirmingSession, setConfirmingSession] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!running) return
    try {
      setData(await window.qubiq.satisfactory.sessions.list(manifest.id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id, running])

  useEffect(() => {
    void load()
  }, [load])

  function run(action: () => Promise<SatisfactorySessions>, done: string): void {
    setBusy(true)
    setError(null)
    setNotice(null)
    action()
      .then((result) => {
        setData(result)
        setNotice(done)
        onChanged()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  if (!running) {
    return (
      <div className="panel">
        <div className="alert info">
          <strong>{t('sf.saves.startFirst')}</strong>
          <p>{t('sf.saves.startFirstText')}</p>
        </div>
      </div>
    )
  }

  const current = data?.currentSessionName ?? null

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('panel.actionFailed')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div className="alert info">
          <p style={{ margin: 0 }}>{notice}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('sf.saves.saveNow')}</h3>
        <p className="hint">{t('sf.saves.saveNowHint', { tab: t('tab.settings') })}</p>
        <button
          disabled={busy || !current}
          onClick={() =>
            run(
              () => window.qubiq.satisfactory.sessions.saveNow(manifest.id, current ?? ''),
              t('sf.saves.saved')
            )
          }
        >
          {t('sf.saves.saveButton')}
        </button>
      </div>

      {(data?.sessions ?? []).map((session) => (
        <div className="card" key={session.sessionName}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>
              {session.sessionName}
              {session.sessionName === current && (
                <span className="status" style={{ marginLeft: 8 }}>
                  {t('sf.saves.loadedNow')}
                </span>
              )}
            </h3>
            {session.sessionName !== current && (
              <button
                className="danger"
                disabled={busy}
                onClick={() => setConfirmingSession(session.sessionName)}
              >
                {t('sf.saves.deleteSession')}
              </button>
            )}
          </div>

          {confirmingSession === session.sessionName && (
            <div className="alert error" style={{ textAlign: 'left' }}>
              <strong>
                {t('sf.saves.confirmDelete', {
                  name: quote(session.sessionName),
                  count: session.saves.length
                })}
              </strong>
              <p>{t('sf.saves.confirmDeleteText', { tab: t('panel.tab.backups') })}</p>
              <div className="row">
                <button onClick={() => setConfirmingSession(null)}>{t('common.cancel')}</button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingSession(null)
                    run(
                      () =>
                        window.qubiq.satisfactory.sessions.removeSession(
                          manifest.id,
                          session.sessionName
                        ),
                      t('sf.saves.sessionDeleted', { name: quote(session.sessionName) })
                    )
                  }}
                >
                  {t('sf.saves.yesDelete')}
                </button>
              </div>
            </div>
          )}

          {session.saves.map((save) => (
            <SaveRow
              key={save.saveName}
              save={save}
              advanced={advanced}
              busy={busy}
              onLoad={() =>
                run(
                  () =>
                    window.qubiq.satisfactory.sessions.load(
                      manifest.id,
                      save.saveName,
                      save.sessionName
                    ),
                  t('sf.saves.loading', { name: quote(save.saveName) })
                )
              }
              onDelete={() =>
                run(
                  () => window.qubiq.satisfactory.sessions.removeSave(manifest.id, save.saveName),
                  t('sf.saves.saveDeleted', { name: quote(save.saveName) })
                )
              }
            />
          ))}
        </div>
      ))}

      <div className="card">
        <h3>{t('sf.saves.newTitle')}</h3>
        <p className="hint">
          <Rich k="sf.saves.newHint" values={{ not: <strong>{t('sf.saves.not')}</strong> }} />
        </p>
        <div className="field">
          <input
            value={newSession}
            maxLength={40}
            placeholder={t('sf.create.sessionName')}
            onChange={(e) => setNewSession(e.target.value)}
          />
        </div>
        <button
          className="primary"
          disabled={busy || newSession.trim().length === 0}
          onClick={() =>
            run(
              () => window.qubiq.satisfactory.sessions.create(manifest.id, newSession.trim()),
              t('sf.saves.creating', { name: quote(newSession.trim()) })
            )
          }
        >
          {t('sf.saves.create')}
        </button>
      </div>
    </div>
  )
}

interface SaveRowProps {
  save: SatisfactorySave
  advanced: boolean
  busy: boolean
  onLoad: () => void
  onDelete: () => void
}

function SaveRow({ save, advanced, busy, onLoad, onDelete }: SaveRowProps): React.JSX.Element {
  return (
    <div className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <div>
        <div>{save.saveName}</div>
        <div className="hint">
          {formatDate(save.savedAt)} ·{' '}
          {t('sf.saves.played', { time: formatDuration(save.playDurationSeconds) })}
          {save.creativeModeEnabled && ` · ${t('sf.saves.rulesChanged')}`}
          {advanced && ` · build ${save.buildVersion}`}
        </div>
      </div>
      <div className="row">
        <button disabled={busy} onClick={onLoad}>
          {t('sf.saves.load')}
        </button>
        {advanced && (
          <button className="danger" disabled={busy} onClick={onDelete}>
            {t('backup.delete')}
          </button>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return formatDateTime(date, { dateStyle: 'short', timeStyle: 'short' })
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return t('panel.uptime.hours', { h: hours, m: minutes })
  return t('panel.uptime.minutes', { m: minutes })
}
