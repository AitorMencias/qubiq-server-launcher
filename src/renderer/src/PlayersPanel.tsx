import type { InstanceState } from '@shared/types'

/**
 * Moderación: quién está conectado y qué se le puede hacer.
 * Lo comparten el modo básico y el avanzado; solo cambia dónde se muestra.
 */

interface Props {
  state: InstanceState
  players: string[]
  onRun: (action: () => Promise<void>) => void
}

export function PlayersPanel({ state, players, onRun }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const command = (text: string): void => onRun(() => window.qubiq.server.command(manifest.id, text))

  return (
    <div className="panel">
      {!running && (
        <div className="alert info">
          <strong>El servidor no está arrancado</strong>
          <p>Arráncalo para ver quién está conectado y poder moderar.</p>
        </div>
      )}
      {running && players.length === 0 && (
        <div className="alert info">
          <strong>No hay nadie conectado</strong>
          <p>Cuando entre alguien aparecerá aquí con sus acciones de moderación.</p>
        </div>
      )}
      <div className="player-list">
        {players.map((player) => (
          <div className="player" key={player}>
            <span className="pname">{player}</span>
            <button onClick={() => command(`kick ${player} Expulsado`)}>Expulsar</button>
            <button className="danger" onClick={() => command(`ban ${player} Baneado`)}>
              Banear
            </button>
            <button onClick={() => command(`op ${player}`)}>Dar OP</button>
          </div>
        ))}
      </div>
    </div>
  )
}
