import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { MODERATION_LISTS, type FactorioListKind } from '@shared/games/factorio/types'
import { t } from '../../i18n'

/**
 * Moderación de un servidor de Factorio.
 *
 * Se modera por **nombre de cuenta de Factorio**, que es el que sale en el chat
 * y el que el servidor escribe al entrar alguien. Con el servidor en marcha la
 * orden va por su consola remota y vetar echa al momento; además se escribe su
 * fichero, que es lo que queda para el siguiente arranque. Hace falta lo
 * segundo porque el juego no deja nombrar administrador por la consola a quien
 * no ha entrado nunca.
 *
 * Las acciones rápidas sobre quien está conectado viven en la pantalla
 * principal, en Jugadores; aquí están las listas completas.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function ModerationPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const [lists, setLists] = useState<Record<string, string[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const loaded: Record<string, string[]> = {}
      for (const list of MODERATION_LISTS) {
        loaded[list.kind] = await window.qubiq.factorio.moderation.get(manifest.id, list.kind)
      }
      setLists(loaded)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void load()
  }, [load, status])

  async function run(kind: FactorioListKind, action: () => Promise<string[]>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const updated = await action()
      setLists((prev) => ({ ...prev, [kind]: updated }))
      setDrafts((prev) => ({ ...prev, [kind]: '' }))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function add(kind: FactorioListKind, player: string): void {
    const name = player.trim()
    if (name.length === 0) return
    void run(kind, () => window.qubiq.factorio.moderation.add(manifest.id, kind, name))
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('panel.actionFailed')}</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="alert info">
        <strong>{running ? t('fa.moderation.running') : t('fa.moderation.stopped')}</strong>
        <p>
          {running ? t('fa.moderation.runningText') : t('fa.moderation.stoppedText')}{' '}
          {t('fa.moderation.usePlayers', { tab: t('panel.tab.players') })}
        </p>
      </div>

      {MODERATION_LISTS.map((list) => {
        const entries = lists[list.kind] ?? []
        return (
          <div className="card" key={list.kind}>
            <h3>{list.title}</h3>
            <p className="hint">{list.description}</p>

            {entries.length === 0 ? (
              <p className="hint" style={{ marginBottom: 14 }}>
                {t('vh.mod.emptyList')}
              </p>
            ) : (
              entries.map((player) => (
                <div className="row between" key={player} style={{ marginBottom: 8 }}>
                  <code>{player}</code>
                  <button
                    style={{ flexShrink: 0 }}
                    disabled={busy}
                    onClick={() =>
                      void run(list.kind, () =>
                        window.qubiq.factorio.moderation.remove(manifest.id, list.kind, player)
                      )
                    }
                  >
                    {t('catalog.remove')}
                  </button>
                </div>
              ))
            )}

            <div className="row">
              <input
                className="grow"
                value={drafts[list.kind] ?? ''}
                placeholder={t('fa.moderation.placeholder')}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [list.kind]: e.target.value
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add(list.kind, drafts[list.kind] ?? '')
                }}
              />
              <button
                style={{ flexShrink: 0 }}
                disabled={busy || (drafts[list.kind] ?? '').trim().length === 0}
                onClick={() => add(list.kind, drafts[list.kind] ?? '')}
              >
                {t('mc.official.add')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
