import type { GameId } from '@shared/types'
import { uiFor } from './games'

/**
 * Icono propio de un juego (no su logo oficial: ANALISIS.md §13.1).
 *
 * Es decorativo: siempre va junto al nombre del juego o del servidor, así que
 * no repite el texto para los lectores de pantalla.
 */
export function GameIcon({ game, size }: { game: GameId; size: number }): React.JSX.Element {
  return <img className="game-icon" src={uiFor(game).icon} width={size} height={size} alt="" draggable={false} />
}
