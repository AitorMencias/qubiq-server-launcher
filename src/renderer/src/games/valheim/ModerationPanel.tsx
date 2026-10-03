import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import {
  MODERATION_LISTS,
  type ValheimListEntry,
  type ValheimListKind
} from '@shared/games/valheim/types'
import { Rich, t } from '../../i18n'

/**
 * Moderación de un servidor de Valheim.
 *
 * Valheim no tiene consola ni RCON: moderar es escribir identificadores en tres
 * ficheros de texto. Esta pantalla los edita sin que el usuario tenga que
 * abrirlos, y sobre todo **dice lo que cada lista hace de verdad**, incluida la
 * de invitados, que en cuanto tiene una línea deja fuera a todos los demás: es
 * la forma más fácil de cerrarse la puerta uno mismo.
 *
 * El servidor relee las listas al vuelo: **vetar a alguien que está dentro lo
 * echa al momento** (comprobado con un jugador real). Por eso las acciones
 * rápidas sobre quien está conectado viven en la pantalla principal, en
 * Jugadores, que es donde se está mirando cuando hace falta usarlas; aquí están
 * las listas completas, para añadir o quitar a quien no está conectado.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function ModerationPanel({ state }: Props): React.JSX.Element {
  const { manifest, status, players } = state
  const running = status === 'running'
  const [lists, setLists] = useState<Record<string, ValheimListEntry[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const loaded: Record<string, ValheimListEntry[]> = {}
      for (const list of MODERATION_LISTS) {
        loaded[list.kind] = await window.qubiq.valheim.moderation.get(manifest.id, list.kind)
      }
      setLists(loaded)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void load()
  }, [load])

  function run(kind: ValheimListKind, action: () => Promise<ValheimListEntry[]>): void {
    setBusy(true)
    setError(null)
    void action()
      .then((entries) => setLists((prev) => ({ ...prev, [kind]: entries })))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  function add(kind: ValheimListKind, id: string): void {
    if (id.trim().length === 0) return
    run(kind, async () => {
      const entries = await window.qubiq.valheim.moderation.add(manifest.id, kind, id.trim())
      setDrafts((prev) => ({ ...prev, [kind]: '' }))
      return entries
    })
  }

  /** Los que están dentro ahora mismo, quitando los que ya estén en la lista. */
  function connectedNotIn(kind: ValheimListKind): string[] {
    const ids = new Set((lists[kind] ?? []).map((e) => e.id))
    return players.filter((id) => !ids.has(id))
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('vh.mod.listFailed')}</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="alert info">
        <strong>{t('vh.mod.byIdTitle')}</strong>
        <p>
          {t('vh.mod.byIdText')}
          {running && players.length > 0 && (
            <>
              {' '}
              <Rich
                k="vh.mod.usePlayers"
                values={{ players: <strong>{t('panel.tab.players')}</strong> }}
              />
            </>
          )}
        </p>
      </div>

      {MODERATION_LISTS.map((list) => {
        const entries = lists[list.kind] ?? []
        const candidates = connectedNotIn(list.kind)
        return (
          <div className="card" key={list.kind}>
            <h3>{list.label}</h3>
            <p className="hint">{list.help}</p>

            {entries.length === 0 ? (
              <div className="help" style={{ marginBottom: 14 }}>
                {t('vh.mod.emptyList')} {list.emptyMeans}
              </div>
            ) : (
              entries.map((entry) => (
                <div className="row between" key={entry.id} style={{ marginBottom: 8 }}>
                  <code>
                    {entry.id}
                    {entry.note && <span className="help"> · {entry.note}</span>}
                  </code>
                  <button
                    style={{ flexShrink: 0 }}
                    disabled={busy}
                    onClick={() =>
                      run(list.kind, () =>
                        window.qubiq.valheim.moderation.remove(manifest.id, list.kind, entry.id)
                      )
                    }
                  >
                    {t('catalog.remove')}
                  </button>
                </div>
              ))
            )}

            {list.kind === 'permitted' && entries.length > 0 && (
              <div className="alert warn">
                <strong>{t('vh.mod.onlyListed')}</strong>
                <p>
                  {t('vh.mod.onlyListedText')}
                  {candidates.length > 0 && ` ${t('vh.mod.onlyListedInside')}`}
                </p>
              </div>
            )}

            <div className="row">
              <input
                className="grow"
                value={drafts[list.kind] ?? ''}
                placeholder={t('vh.mod.idPlaceholder')}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [list.kind]: e.target.value }))}
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

      <div className="card">
        <h3>{t('vh.mod.howId')}</h3>
        <p className="hint">
          <Rich k="vh.mod.howIdText" values={{ console: <strong>{t('vh.mod.console')}</strong> }} />
        </p>
      </div>
    </div>
  )
}
