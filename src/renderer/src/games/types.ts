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

export interface GameUi {
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
  /** Qué ajustes del juego proteger antes de abrir un puerto en el router. */
  routerSafetyNote: ReactNode
}
