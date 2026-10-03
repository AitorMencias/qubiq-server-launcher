import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { gameInfo } from '@shared/games'
import { uiFor } from './games'
import { Rich, t } from './i18n'

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
  /** Lo que se pierde de la partida, dicho por el juego («Sus 3 mundos…»). */
  const [loss, setLoss] = useState<string | null>(null)
  const [backups, setBackups] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Se enseña lo que hay dentro para que la consecuencia sea concreta y no
  // una advertencia genérica que nadie lee.
  useEffect(() => {
    void Promise.all([
      uiFor(manifest).describeLoss(manifest),
      window.qubiq.backups.list(manifest.id).catch(() => [])
    ]).then(([description, b]) => {
      setLoss(description)
      setBackups(b.length)
    })
    // El juego no cambia en la vida de un servidor: basta con su id.
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
          <h3>{t('delete.title', { name: manifest.name })}</h3>
          <button disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>

        <div className="modal-body">
          <p>
            <Rich
              k="delete.intro"
              values={{ undone: <strong>{t('delete.cannotUndo')}</strong> }}
            />
          </p>

          <ul>
            <li>{loss ?? t(`delete.lossDefault.${gameInfo(manifest.game).save}`)}</li>
            <li>
              {backups === null
                ? t('delete.backupsUnknown')
                : backups === 0
                  ? t('delete.backupsNone')
                  : t('delete.backupsCount', { count: backups })}
            </li>
            <li>{t('delete.configLoss')}</li>
          </ul>

          {backups !== null && backups > 0 && (
            <p className="note">
              {t(`delete.backupsNote.${gameInfo(manifest.game).save}`, {
                button: t('panel.openFolder')
              })}
            </p>
          )}

          {running && (
            <p className="note">{t('delete.running')}</p>
          )}

          {error && (
            <div className="alert error" style={{ marginTop: 16 }}>
              <strong>{t('delete.failed')}</strong>
              <p>{error}</p>
            </div>
          )}

          <div className="field" style={{ marginTop: 20, marginBottom: 0 }}>
            <label>
              <Rich k="delete.typeToConfirm" values={{ name: <code>{manifest.name}</code> }} />
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
              {t('common.betterNot')}
            </button>
            <button className="danger" disabled={!confirmed || busy} onClick={() => void remove()}>
              {busy ? t('delete.deleting') : t('panel.delete.title')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
