import { capabilitiesFor } from '@shared/games'
import { DISTRIBUTION_LABELS, contentKindFor } from '@shared/games/minecraft/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { ConfigPanel } from './ConfigPanel'
import { WorldsPanel } from './WorldsPanel'
import { ContentPanel } from './ContentPanel'

/** Piezas de interfaz de Minecraft. */
export const minecraftUi: GameUi = {
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    const { manifest } = state
    const capabilities = capabilitiesFor(manifest)
    const kind = manifest.game === 'minecraft' ? contentKindFor(manifest.data.distribution) : null

    return [
      {
        id: 'ajustes',
        label: 'Ajustes',
        slot: 'first' as const,
        render: () => <ConfigPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      ...(capabilities.worlds
        ? [
            {
              id: 'mundos',
              label: 'Mundos',
              slot: 'afterConnection' as const,
              render: () => <WorldsPanel state={state} mode={mode} onChanged={onRefresh} />
            }
          ]
        : []),
      // Vanilla no admite plugins ni mods: la pestaña ni aparece.
      ...(capabilities.content && kind !== null
        ? [
            {
              id: 'contenido',
              label: kind === 'mods' ? 'Mods' : 'Plugins',
              slot: 'afterConnection' as const,
              render: () => <ContentPanel state={state} mode={mode} />
            }
          ]
        : [])
    ]
  },

  detailRows(manifest) {
    const { data } = manifest
    return [
      { label: 'Tipo', value: DISTRIBUTION_LABELS[data.distribution].name },
      { label: 'Versión de Minecraft', value: data.minecraftVersion },
      ...(data.build ? [{ label: 'Build', value: data.build }] : []),
      { label: 'Java', value: String(data.javaMajor) },
      { label: 'Memoria', value: `${(data.memoryMb / 1024).toFixed(1)} GB` }
    ]
  },

  routerSafetyNote: (
    <>
      Abrir un puerto expone este ordenador a internet. Mantén activado <strong>&quot;Exigir cuenta
      oficial de Minecraft&quot;</strong> en Ajustes, y considera activar{' '}
      <strong>&quot;Solo pueden entrar los invitados&quot;</strong> para que solo entre gente que tú
      hayas añadido.
    </>
  ),

  async describeLoss(manifest) {
    const worlds = await window.qubiq.minecraft.worlds.list(manifest.id).catch(() => null)
    if (worlds === null) return 'Sus mundos'
    return worlds.length === 1
      ? 'Su mundo, con todo lo construido'
      : `Sus ${worlds.length} mundos, con todo lo construido`
  }
}
