import { useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import { capabilitiesFor, gameInfo } from '@shared/games'
import { uiFor } from './games'
import { t } from './i18n'

/**
 * Moderación: quién está conectado y qué se le puede hacer.
 *
 * No todos los juegos dan lo mismo, y esta pantalla no nombra a ninguno:
 *
 * - Minecraft dice el nombre de quien entra y se modera por la consola.
 * - Valheim dice **el identificador de Steam**, no el nombre, y se modera
 *   escribiendo en sus listas de texto. Se puede listar y moderar igual, pero
 *   hay que explicar qué es ese número en vez de hacerlo pasar por un nombre.
 * - Satisfactory solo dice CUÁNTOS son y no deja moderar desde fuera.
 *
 * Las acciones las aporta el juego (`GameUi.playerActions`); aquí solo se
 * colocan. Cuando falta algo se explica por qué y dónde se hace, en vez de
 * enseñar botones que no funcionarían o una lista vacía que parece un fallo.
 */

interface Props {
  state: InstanceState
  players: string[]
  mode: UiMode
  onRun: (action: () => Promise<void>) => void
  onRefresh: () => void
}

export function PlayersPanel({
  state,
  players,
  mode,
  onRun,
  onRefresh
}: Props): React.JSX.Element {
  const { manifest, status, playerCount } = state
  const running = status === 'running'
  const capabilities = capabilitiesFor(manifest)
  const info = gameInfo(manifest.game)
  const gameUi = uiFor(manifest)
  const [note, setNote] = useState<string | null>(null)

  if (!running) {
    return (
      <div className="panel">
        <div className="alert info">
          <strong>{t('players.notRunning')}</strong>
          <p>{capabilities.moderation ? t('players.startToModerate') : t('players.startToSee')}</p>
        </div>
      </div>
    )
  }

  // Juegos que solo dan el número (Satisfactory): se cuenta, y se dice qué se
  // puede hacer y dónde, que es lo que el usuario necesita saber.
  if (!capabilities.playerIds) {
    const count = playerCount ?? players.length
    return (
      <div className="panel">
        <div className="card">
          <h3>
            {count === 0 ? t('players.nobody') : t('players.inside', { count })}
          </h3>
          <p className="hint">{t('players.countOnly', { game: info.name })}</p>
        </div>

        {info.moderationHint && (
          <div className="card">
            <h3>{t('players.moderate')}</h3>
            <p className="hint">{info.moderationHint}</p>
          </div>
        )}
      </div>
    )
  }

  const actions = capabilities.moderation
    ? gameUi.playerActions?.({ state, mode, onRefresh }) ?? []
    : []

  return (
    <div className="panel">
      {/* Con identificadores en vez de nombres hay que decir qué son: si no,
          parece que la app enseña un número por no saber el nombre. */}
      {!capabilities.playerNames && info.moderationHint && (
        <div className="alert info">
          <strong>{t('players.idsOnly', { game: info.name })}</strong>
          <p>{info.moderationHint}</p>
        </div>
      )}

      {note && <div className="alert info">{note}</div>}

      {players.length === 0 && (
        <div className="alert info">
          <strong>{t('players.nobody')}</strong>
          <p>{capabilities.moderation ? t('players.willAppearActions') : t('players.willAppear')}</p>
        </div>
      )}

      <div className="player-list">
        {players.map((player) => (
          <div className="player" key={player}>
            <span className="pname">{gameUi.playerLabel?.(player) ?? player}</span>
            {actions.map((action) => (
              <button
                key={action.id}
                className={action.danger ? 'danger' : undefined}
                title={action.help}
                onClick={() =>
                  onRun(async () => {
                    await action.run(player)
                    if (action.help) setNote(action.help)
                  })
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
