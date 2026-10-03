import { capabilitiesFor } from '@shared/games'
import { DISTRIBUTION_LABELS, contentKindFor, minecraftOf } from '@shared/games/minecraft/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { ConfigPanel } from './ConfigPanel'
import { WorldsPanel } from './WorldsPanel'
import { ContentPanel } from './ContentPanel'
import icon from './icon.svg'
import { Rich, formatSize, quote, t } from '../../i18n'

/** Piezas de interfaz de Minecraft. */
export const minecraftUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    const { manifest } = state
    const capabilities = capabilitiesFor(manifest)
    const kind = contentKindFor(minecraftOf(manifest).data.distribution)

    return [
      {
        id: 'ajustes',
        label: t('tab.settings'),
        slot: 'first' as const,
        render: () => <ConfigPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      ...(capabilities.worlds
        ? [
            {
              id: 'mundos',
              label: t('tab.worlds'),
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
              label: kind === 'mods' ? t('tab.mods') : t('tab.plugins'),
              slot: 'afterConnection' as const,
              render: () => <ContentPanel state={state} mode={mode} />
            }
          ]
        : [])
    ]
  },

  /**
   * Moderar en Minecraft es mandar una orden por la consola del servidor. Estos
   * tres comandos estaban escritos a fuego en la pantalla común de jugadores,
   * que es de todos los juegos: ahora los pone quien sabe de ellos.
   */
  playerActions({ state }) {
    const id = state.manifest.id
    const command = (text: string): Promise<void> => window.qubiq.server.command(id, text)
    return [
      {
        id: 'kick',
        label: t('mod.kick'),
        run: (player) => command(`kick ${player} ${t('mc.kickReason')}`)
      },
      {
        id: 'ban',
        label: t('mod.ban'),
        danger: true,
        run: (player) => command(`ban ${player} ${t('mc.banReason')}`)
      },
      { id: 'op', label: t('mc.giveOp'), run: (player) => command(`op ${player}`) }
    ]
  },

  detailRows(manifest) {
    const { data } = minecraftOf(manifest)
    return [
      {
        label: t('mc.wizard.summary.type'),
        value: `${DISTRIBUTION_LABELS[data.distribution].name}${
          data.custom ? ` · ${t('games.summary.custom')}` : ''
        }`
      },
      { label: t('mc.wizard.summary.version'), value: data.minecraftVersion },
      ...(data.build ? [{ label: 'Build', value: data.build }] : []),
      ...(data.custom ? [{ label: t('mc.details.startsWith'), value: data.custom.startFile }] : []),
      { label: 'Java', value: String(data.javaMajor) },
      {
        label: t('chooser.memory'),
        // Si la fija su script, el número del manifiesto no es el que usa.
        value:
          data.custom?.memory === 'script'
            ? t('mc.details.memoryByScript')
            : formatSize(data.memoryMb / 1024, 'GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      }
    ]
  },

  // Getter: el texto se pide al pintar, en el idioma de ese momento.
  get routerSafetyNote() {
    return (
      <Rich
        k="mc.routerSafety"
        vars={{ settings: t('tab.settings') }}
        values={{
          online: <strong>{quote(t('mc.prop.online-mode.label'))}</strong>,
          whitelist: <strong>{quote(t('mc.prop.white-list.label'))}</strong>
        }}
      />
    )
  },

  async describeLoss(manifest) {
    const worlds = await window.qubiq.minecraft.worlds.list(manifest.id).catch(() => null)
    if (worlds === null) return t('mc.loss.worlds')
    return t('mc.loss.count', { count: worlds.length })
  }
}
