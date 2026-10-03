import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { ValheimWorld } from '@shared/games/valheim/types'
import { formatBytes, formatDate as formatDateTime, quote, t } from '../../i18n'

/**
 * Mundos de un servidor de Valheim.
 *
 * Un servidor carga un mundo, el que diga `-world` al arrancar, pero puede
 * guardar todos los que quiera en la misma carpeta. Cambiar de uno a otro es
 * cambiar ese argumento, así que **solo se puede con el servidor parado**.
 *
 * Un mundo recién creado no existe todavía en disco: el terreno lo genera el
 * servidor la primera vez que arranca con él, a partir del nombre. Por eso sale
 * en la lista con «sin generar» en vez de desaparecer hasta entonces.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function WorldsPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const [worlds, setWorlds] = useState<ValheimWorld[]>([])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setWorlds(await window.qubiq.valheim.worlds.list(manifest.id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void load()
  }, [load, status])

  function run(action: () => Promise<ValheimWorld[]>): void {
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
          <strong>{t('panel.actionFailed')}</strong>
          <p>{error}</p>
        </div>
      )}

      {running && (
        <div className="alert info">
          <strong>{t('vh.settings.running')}</strong>
          <p>{t('vh.worlds.runningText')}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('mc.worlds.title')}</h3>
        <p className="hint">{t('vh.worlds.hint')}</p>

        {worlds.map((world) => (
          <div className="row between" key={world.name} style={{ marginBottom: 12 }}>
            <div>
              <strong>{world.name}</strong>
              {world.active && <span className="badge"> {t('mc.worlds.inUse')}</span>}
              <div className="help" style={{ margin: 0 }}>
                {world.savedAt === null
                  ? t('vh.worlds.notGenerated')
                  : `${formatSize(world.sizeBytes)} · ${t('vh.worlds.savedAt', { date: formatDate(world.savedAt) })}`}
              </div>
            </div>
            <div className="row" style={{ flexShrink: 0 }}>
              {!world.active && (
                <button
                  disabled={busy || running}
                  onClick={() => run(() => window.qubiq.valheim.worlds.activate(manifest.id, world.name))}
                >
                  {t('mc.worlds.playThis')}
                </button>
              )}
              {!world.active && (
                <button
                  className="danger"
                  disabled={busy || running}
                  onClick={() => setConfirming(world.name)}
                >
                  {t('backup.delete')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirming && (
        <div className="card danger-zone">
          <h3>{t('vh.worlds.confirmDelete', { name: quote(confirming) })}</h3>
          <p className="hint">{t('vh.worlds.confirmDeleteText', { tab: t('panel.tab.backups') })}</p>
          <div className="row">
            <button
              className="danger"
              disabled={busy}
              onClick={() => run(() => window.qubiq.valheim.worlds.remove(manifest.id, confirming))}
            >
              {busy ? t('delete.deleting') : t('vh.worlds.yesDelete')}
            </button>
            <button disabled={busy} onClick={() => setConfirming(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>{t('vh.worlds.newTitle')}</h3>
        <p className="hint">{t('vh.worlds.newHint')}</p>
        <div className="row">
          <input
            className="grow"
            value={newName}
            maxLength={40}
            placeholder={t('vh.worlds.namePlaceholder')}
            disabled={running}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="primary"
            style={{ flexShrink: 0 }}
            disabled={busy || running || newName.trim().length === 0}
            onClick={() =>
              run(async () => {
                const list = await window.qubiq.valheim.worlds.create(manifest.id, newName.trim())
                setNewName('')
                return list
              })
            }
          >
            {t('vh.worlds.createUse')}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  return formatBytes(Math.max(bytes, 1024))
}

function formatDate(iso: string): string {
  return formatDateTime(iso, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
