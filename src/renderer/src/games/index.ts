import type { GameId, InstanceManifest } from '@shared/types'
import type { GameUi } from './types'
import { minecraftUi } from './minecraft'

/** Registro de juegos de la interfaz: el equivalente a `main/core/games/registry.ts`. */
export const GAME_UI: Record<GameId, GameUi> = {
  minecraft: minecraftUi
}

export function uiFor(game: GameId | InstanceManifest): GameUi {
  return GAME_UI[typeof game === 'string' ? game : game.game]
}

export type { GameUi, WizardProps, GameConfigTab } from './types'
