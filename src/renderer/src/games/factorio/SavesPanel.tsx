import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { FactorioSave } from '@shared/games/factorio/types'
import { modSizeLabel } from '@shared/games/mods'
import { formatDate as formatDateTime, quote, t } from '../../i18n'

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
  return modSizeLabel(bytes)
}

function formatDate(iso: string): string {
  return formatDateTime(iso, {
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
          <strong>{t('panel.actionFailed')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      <div className="card">
        <h3>{t('fa.saves.title')}</h3>
        <p className="hint">{t('fa.saves.hint', { n: autosaveMinutes })}</p>

        {principales.length === 0 && (
          <p className="hint" style={{ marginBottom: 14 }}>
            {t('fa.saves.none')}
          </p>
        )}
        {principales.map((save) => (
          <div className="row between" key={save.name} style={{ marginBottom: 12 }}>
            <div>
              <strong>{save.name}</strong>
              {save.active && (
                <span className="badge" style={{ marginLeft: 8 }}>
                  {t('mc.worlds.inUse')}
                </span>
              )}
              <p className="hint" style={{ margin: 0 }}>
                {formatSize(save.sizeBytes)} · {t('fa.saves.savedAt', { date: formatDate(save.modifiedAt) })}
              </p>
            </div>
            {!save.active && (
              <button
                className="danger"
                style={{ flexShrink: 0 }}
                disabled={busy || running}
                onClick={() => setConfirming(save)}
              >
                {t('backup.delete')}
              </button>
            )}
          </div>
        ))}

        <div className="row">
          <button
            disabled={busy || !running}
            onClick={() =>
              void run(() => window.qubiq.factorio.saves.saveNow(manifest.id), t('sf.saves.saved'))
            }
          >
            {t('sf.saves.saveNow')}
          </button>
          {!running && (
            <p className="hint" style={{ margin: 0 }}>
              {t('fa.saves.onlyRunning')}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>{t('fa.saves.autoTitle')}</h3>
        <p className="hint">{t('fa.saves.autoHint')}</p>

        {autosaves.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {t('fa.saves.autoNone')}
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
                    t('fa.saves.restored')
                  )
                }
              >
                {t('fa.saves.backTo')}
              </button>
            </div>
          ))
        )}
        {running && autosaves.length > 0 && (
          <p className="hint">{t('fa.saves.stopToRestore')}</p>
        )}
      </div>

      {confirming && (
        <div className="card danger-zone">
          <h3>{t('fa.saves.confirmDelete', { name: quote(confirming.name) })}</h3>
          <p className="hint">{t('fa.saves.confirmDeleteText')}</p>
          <div className="row">
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void run(
                  () => window.qubiq.factorio.saves.remove(manifest.id, confirming.name),
                  t('fa.saves.deleted')
                )
              }
            >
              {t('sf.saves.yesDelete')}
            </button>
            <button disabled={busy} onClick={() => setConfirming(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
