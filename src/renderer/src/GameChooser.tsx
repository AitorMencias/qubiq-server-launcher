import type { GameId } from '@shared/types'
import { GAME_IDS, gameInfo } from '@shared/games'

/**
 * Elección de juego al crear un servidor: el paso previo a elegir modo.
 *
 * Mientras la app solo gestione un juego NO se muestra (ver `App`): añadir un
 * clic para elegir entre una única opción sería ruido. Aparece sola en cuanto
 * se registre el segundo juego.
 */

interface Props {
  onChoose: (game: GameId) => void
  onCancel: () => void
}

export function GameChooser({ onChoose, onCancel }: Props): React.JSX.Element {
  return (
    <div className="panel">
      <div className="chooser-intro">
        <h2>¿De qué juego es el servidor?</h2>
        <p>Cada juego tiene su propio asistente y sus propias opciones.</p>
      </div>

      <div className="mode-choice-grid">
        {GAME_IDS.map((id) => (
          <button key={id} className="mode-card" onClick={() => onChoose(id)}>
            <div className="mode-card-head">
              <span className="mode-card-title">{gameInfo(id).name}</span>
            </div>
            <span className="mode-card-cta">Crear un servidor de {gameInfo(id).name} →</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
