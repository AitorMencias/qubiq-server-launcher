import {
  GLOBAL_KEYS,
  MODIFIERS,
  PRESETS,
  queryPortFor,
  type ValheimModifierKey
} from '@shared/games/valheim/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { ValheimSettingsPanel } from './SettingsPanel'
import { WorldsPanel } from './WorldsPanel'
import { ModerationPanel } from './ModerationPanel'
import { CatalogModsPanel } from '../../CatalogModsPanel'
import icon from './icon.svg'
import { Rich, quote, t } from '../../i18n'

/** Piezas de interfaz de Valheim. */
export const valheimUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: t('tab.settings'),
        slot: 'first' as const,
        render: () => <ValheimSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'mundos',
        label: t('tab.worlds'),
        slot: 'afterConnection' as const,
        render: () => <WorldsPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'moderacion',
        label: t('tab.moderation'),
        slot: 'afterConnection' as const,
        render: () => <ModerationPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'mods',
        label: t('tab.mods'),
        slot: 'afterConnection' as const,
        render: () => (
          <CatalogModsPanel
            state={state}
            onChanged={onRefresh}
            api={window.qubiq.valheim.mods}
            loaderId="denikson-BepInExPack_Valheim"
            catalog={{ name: 'Thunderstore', url: 'thunderstore.io' }}
            playersNote={t('vh.mods.playersNote')}
            searchPlaceholder={t('common.forExample', { examples: 'Plant Everything, Epic Loot, Jotunn…' })}
          />
        )
      }
    ]
  },

  /**
   * Moderar en Valheim es escribir en sus listas de texto, no mandar una orden:
   * no hay consola. Lo que sí hace el servidor es releerlas al vuelo, así que
   * **vetar a alguien que está dentro lo echa al momento** (comprobado con un
   * jugador real).
   */
  playerActions({ state, onRefresh }) {
    const id = state.manifest.id
    const add = async (kind: 'admin' | 'banned' | 'permitted', player: string): Promise<void> => {
      await window.qubiq.valheim.moderation.add(id, kind, player)
      onRefresh()
    }
    return [
      {
        id: 'admin',
        label: t('vh.action.admin'),
        run: (player) => add('admin', player)
      },
      {
        id: 'permitted',
        label: t('vh.action.invite'),
        help: t('vh.action.inviteHelp'),
        run: (player) => add('permitted', player)
      },
      {
        id: 'banned',
        label: t('vh.action.ban'),
        danger: true,
        help: t('vh.action.banHelp'),
        run: (player) => add('banned', player)
      }
    ]
  },

  /** El juego solo da el identificador de Steam, así que se dice que lo es. */
  playerLabel(player) {
    return `Steam ${player}`
  },

  detailRows(manifest) {
    if (manifest.game !== 'valheim') return []
    const { data } = manifest

    // Solo los modificadores que se han tocado: los que están en `default` son
    // «lo que diga la dificultad», y listarlos todos sería ruido.
    const tweaked = MODIFIERS.filter(
      (m) => data.modifiers[m.key] && data.modifiers[m.key] !== 'default'
    ).map((m) => {
      const value = data.modifiers[m.key as ValheimModifierKey]!
      return `${m.label}: ${m.options.find((o) => o.value === value)?.label ?? value}`
    })

    return [
      { label: t('vh.summary.world'), value: data.worldName },
      {
        label: t('vh.summary.password'),
        value: data.password.length > 0 ? data.password : t('wizard.summary.noPassword')
      },
      {
        label: t('mc.wizard.summary.difficulty'),
        value: PRESETS.find((p) => p.value === data.preset)?.label ?? data.preset
      },
      {
        label: t('vh.details.tweaked'),
        value: tweaked.length > 0 ? tweaked.join(' · ') : t('details.noneM')
      },
      {
        label: t('vh.create.rules'),
        value:
          data.globalKeys.length > 0
            ? data.globalKeys
                .map((key) => GLOBAL_KEYS.find((r) => r.key === key)?.label ?? key)
                .join(' · ')
            : t('details.noneF')
      },
      {
        label: t('vh.summary.ports'),
        value: t('vh.summary.portsValue', { a: manifest.port, b: queryPortFor(manifest.port) })
      },
      { label: t('vh.details.listed'), value: data.listed ? t('common.yes') : t('common.no') },
      {
        label: t('vh.details.saveEvery'),
        value: t('panel.uptime.minutes', { m: Math.round(data.saveIntervalSeconds / 60) })
      },
      { label: t('details.gameVersion'), value: data.gameVersion ?? t('details.knownAtStart') },
      { label: t('details.steamBuild'), value: data.buildId ?? t('details.unknown') }
    ]
  },

  get routerSafetyNote() {
    return (
      <Rich
        k="vh.routerSafety"
        values={{
          two: <strong>{t('sf.routerSafety.two')}</strong>,
          password: <strong>{t('vh.routerSafety.password')}</strong>,
          crossplay: <strong>crossplay</strong>
        }}
      />
    )
  },

  async describeLoss(manifest) {
    if (manifest.game !== 'valheim') return t('mc.loss.worlds')
    try {
      const worlds = await window.qubiq.valheim.worlds.list(manifest.id)
      const generated = worlds.filter((w) => w.savedAt !== null)
      if (generated.length === 0) return t('vh.loss.notGenerated')
      if (generated.length === 1) {
        return t('vh.loss.named', { name: quote(generated[0]!.name) })
      }
      return t('mc.loss.count', { count: generated.length })
    } catch {
      return t('vh.loss.named', { name: quote(manifest.data.worldName) })
    }
  }
}
