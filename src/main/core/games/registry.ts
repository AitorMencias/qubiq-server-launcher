import type { GameId, InstanceManifest } from '@shared/types'
import type { GameAdapter } from './types'
import { minecraftAdapter } from './minecraft/adapter'
import { satisfactoryAdapter } from './satisfactory/adapter'

/**
 * Registro de juegos del núcleo.
 *
 * Los juegos que trae la app vienen registrados de serie. `registerGame` existe
 * para que las pruebas puedan añadir un juego falso y demostrar que el núcleo no
 * depende de ninguno en concreto, sin tocar nada del código de la app.
 */

const games = new Map<string, GameAdapter>()

export function registerGame(adapter: GameAdapter): void {
  games.set(adapter.id, adapter)
}

registerGame(minecraftAdapter as unknown as GameAdapter)
registerGame(satisfactoryAdapter as unknown as GameAdapter)

export function isKnownGame(id: string): boolean {
  return games.has(id)
}

export function gameFor(id: GameId | string): GameAdapter {
  const adapter = games.get(id)
  if (!adapter) {
    throw new Error(
      `Este servidor es de un juego que esta versión de la app no sabe gestionar ("${id}"). ` +
        'Actualiza la app para poder usarlo.'
    )
  }
  return adapter
}

export function gameOf(manifest: InstanceManifest): GameAdapter {
  return gameFor(manifest.game)
}
