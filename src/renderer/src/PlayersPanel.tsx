import type { InstanceState } from '@shared/types'
import { capabilitiesFor, gameInfo } from '@shared/games'

/**
 * Moderación: quién está conectado y qué se le puede hacer.
 *
 * No todos los juegos dan lo mismo. Minecraft dice quién está dentro y deja
 * expulsar y banear; Satisfactory solo dice CUÁNTOS son y no deja moderar desde
 * fuera. Cuando falta algo se explica por qué y dónde se hace, en vez de
 * enseñar botones que no funcionarían o una lista vacía que parece un fallo.
 */

interface Props {
  state: InstanceState
  players: string[]
  onRun: (action: () => Promise<void>) => void
}

export function PlayersPanel({ state, players, onRun }: Props): React.JSX.Element {
  const { manifest, status, playerCount } = state
  const running = status === 'running'
  const capabilities = capabilitiesFor(manifest)
  const command = (text: string): void => onRun(() => window.qubiq.server.command(manifest.id, text))

  if (!running) {
    return (
      <div className="panel">
        <div className="alert info">
          <strong>El servidor no está arrancado</strong>
          <p>Arráncalo para ver quién está conectado{capabilities.moderation && ' y poder moderar'}.</p>
        </div>
      </div>
    )
  }

  // Juegos que solo dan el número (Satisfactory): se cuenta, y se dice qué se
  // puede hacer y dónde, que es lo que el usuario necesita saber.
  if (!capabilities.playerNames) {
    const count = playerCount ?? 0
    return (
      <div className="panel">
        <div className="card">
          <h3>
            {count === 0
              ? 'No hay nadie conectado'
              : `${count} jugador${count === 1 ? '' : 'es'} dentro`}
          </h3>
          <p className="hint">
            {gameInfo(manifest.game).name} dice cuánta gente hay en la partida, pero no quién es:
            desde fuera del juego no hay forma de saberlo. En la consola sí aparece quién entra.
          </p>
        </div>

        <div className="card">
          <h3>Moderar</h3>
          <p className="hint">
            Este juego no deja expulsar ni banear desde fuera. Entra tú a la partida con tu
            contraseña de administrador y hazlo desde el menú del propio juego. Si hace falta cortar
            de raíz, para el servidor o ponle una contraseña para entrar desde Ajustes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      {players.length === 0 && (
        <div className="alert info">
          <strong>No hay nadie conectado</strong>
          <p>Cuando entre alguien aparecerá aquí con sus acciones de moderación.</p>
        </div>
      )}
      <div className="player-list">
        {players.map((player) => (
          <div className="player" key={player}>
            <span className="pname">{player}</span>
            {capabilities.moderation && (
              <>
                <button onClick={() => command(`kick ${player} Expulsado`)}>Expulsar</button>
                <button className="danger" onClick={() => command(`ban ${player} Baneado`)}>
                  Banear
                </button>
                <button onClick={() => command(`op ${player}`)}>Dar OP</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
