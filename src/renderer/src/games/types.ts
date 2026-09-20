import type { ComponentType, ReactNode } from 'react'
import type { InstanceManifest, InstanceState, ProgressUpdate, UiMode } from '@shared/types'

/**
 * Lo que un juego aporta a la interfaz.
 *
 * Los componentes comunes (la pantalla del servidor, la lista, el borrado) no
 * nombran ningún juego: piden aquí las piezas que cambian de uno a otro.
 */

export interface WizardProps {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: Pick<ProgressUpdate, 'phase' | 'progress' | 'detail'> | null
}

export interface GameConfigTab {
  id: string
  label: string
  /**
   * Dónde va respecto a las pestañas comunes. `first` va antes de «Conexión»
   * (los ajustes del juego); `afterConnection`, entre «Conexión» y «Copias».
   */
  slot: 'first' | 'afterConnection'
  render: () => ReactNode
}

export interface GameConfigContext {
  state: InstanceState
  mode: UiMode
  onRefresh: () => void
}

/**
 * Una acción sobre alguien que está conectado, de las que salen en la pantalla
 * principal del servidor.
 *
 * Cada juego modera a su manera —Minecraft por la consola, Valheim escribiendo
 * en sus listas de texto—, así que los botones los pone el juego y la pantalla
 * común solo los coloca.
 */
export interface GamePlayerAction {
  id: string
  label: string
  /** Se pinta como acción destructiva (echar, vetar). */
  danger?: boolean
  /** Qué se le dice al usuario al pulsarlo, si conviene explicarlo. */
  help?: string
  run: (player: string) => Promise<void>
}

/**
 * Lo que recibe la barra de búsqueda de un juego, además del contexto.
 *
 * `onSearching` es cómo le dice a la pantalla de Configuración que está
 * enseñando resultados: mientras lo sea, el contenido de la pestaña no se
 * pinta, porque lo que manda es la búsqueda.
 */
export interface GameConfigSearchProps extends GameConfigContext {
  onSearching: (searching: boolean) => void
}

export interface GameUi {
  /** URL de su icono propio (`games/<juego>/icon.png`, 128×128), nunca el logo oficial. */
  icon: string
  BasicWizard: ComponentType<WizardProps>
  AdvancedWizard: ComponentType<WizardProps>
  /** Pestañas propias del juego dentro de Configuración. */
  configTabs(context: GameConfigContext): GameConfigTab[]
  /** Ficha técnica que se enseña en modo avanzado. */
  detailRows(manifest: InstanceManifest): { label: string; value: string }[]
  /**
   * Qué se pierde al borrar el servidor, dicho en concreto («Sus 3 mundos,
   * con todo lo construido»).
   */
  describeLoss(manifest: InstanceManifest): Promise<string>
  /**
   * Qué se puede hacer con quien está dentro. Solo se piden a los juegos que
   * declaran la capacidad `moderation`.
   */
  playerActions?(context: GameConfigContext): GamePlayerAction[]
  /**
   * Cómo se enseña un jugador cuando el juego no da nombres, sino
   * identificadores (Valheim: «Steam 7656…»).
   */
  playerLabel?(player: string): string
  /**
   * Buscador que se pinta encima de las pestañas de Configuración.
   *
   * Solo lo pone el juego que lo necesita. Lo estrena Project Zomboid, que
   * reparte más de cuatrocientas opciones entre dos ficheros: sin esto hay que
   * saber de antemano en qué pestaña vive cada una. Los demás juegos tienen
   * pocos ajustes y no lo ponen.
   */
  ConfigSearch?: ComponentType<GameConfigSearchProps>

  /** Qué ajustes del juego proteger antes de abrir un puerto en el router. */
  routerSafetyNote: ReactNode
}
