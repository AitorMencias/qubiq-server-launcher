import { PRESETS } from '@shared/games/factorio/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { FactorioSettingsPanel } from './SettingsPanel'
import { SavesPanel } from './SavesPanel'
import { ModerationPanel } from './ModerationPanel'
import { ModsPanel } from './ModsPanel'
import icon from './icon.svg'
import { Rich, t } from '../../i18n'

/** Piezas de interfaz de Factorio. */
export const factorioUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: t('tab.settings'),
        slot: 'first' as const,
        render: () => <FactorioSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'partidas',
        label: t('tab.saves'),
        slot: 'afterConnection' as const,
        render: () => <SavesPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'mods',
        label: t('tab.mods'),
        slot: 'afterConnection' as const,
        render: () => <ModsPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'moderacion',
        label: t('tab.moderation'),
        slot: 'afterConnection' as const,
        render: () => <ModerationPanel state={state} onChanged={onRefresh} />
      }
    ]
  },

  /**
   * Con el servidor en marcha se modera por su consola remota, así que esto sí
   * tiene efecto inmediato: echar saca a la persona, y vetar además impide que
   * vuelva. Los nombres son los de las cuentas de Factorio, los mismos del chat.
   */
  playerActions({ state, onRefresh }) {
    const id = state.manifest.id
    return [
      {
        id: 'admin',
        label: t('vh.action.admin'),
        help: t('fa.action.adminHelp'),
        run: async (player) => {
          await window.qubiq.factorio.moderation.add(id, 'admin', player)
          onRefresh()
        }
      },
      {
        id: 'kick',
        label: t('fa.action.kick'),
        danger: true,
        help: t('fa.action.kickHelp'),
        run: async (player) => {
          await window.qubiq.factorio.moderation.kick(id, player)
          onRefresh()
        }
      },
      {
        id: 'ban',
        label: t('vh.action.ban'),
        danger: true,
        help: t('fa.action.banHelp'),
        run: async (player) => {
          await window.qubiq.factorio.moderation.add(id, 'banned', player)
          onRefresh()
        }
      }
    ]
  },

  detailRows(manifest) {
    if (manifest.game !== 'factorio') return []
    const { data } = manifest

    return [
      { label: t('sf.wizard.summary.session'), value: data.saveName },
      {
        label: t('vh.summary.password'),
        value: data.password.length > 0 ? data.password : t('wizard.summary.noPassword')
      },
      {
        label: t('fa.summary.content'),
        value: data.spaceAge ? t('fa.wizard.spaceAge') : t('fa.details.base')
      },
      {
        label: t('fa.summary.map'),
        value: PRESETS.find((p) => p.id === data.preset)?.name ?? data.preset
      },
      { label: t('fa.create.seed'), value: data.seed ?? t('fa.details.random') },
      { label: t('details.maxPlayers'), value: String(data.maxPlayers) },
      { label: t('help.router.port'), value: `${manifest.port} (UDP)` },
      {
        label: t('fa.details.rcon'),
        value: t('fa.details.rconValue', { address: `127.0.0.1:${data.rconPort}` })
      },
      {
        label: t('fa.details.verify'),
        value: data.verifyAccounts ? t('fa.summary.verifyValue') : t('common.no')
      },
      { label: t('fa.details.autosave'), value: t('panel.uptime.minutes', { m: data.autosaveMinutes }) },
      {
        label: t('fa.details.source'),
        value:
          data.source === 'local'
            ? t('fa.details.copiedFrom', { path: data.sourcePath ?? t('fa.details.anInstall') })
            : t('fa.details.downloadedWith', { user: data.steamUser ?? '' }).trim()
      },
      {
        label: t('details.gameVersion'),
        value: data.gameVersion ?? t('details.knownAtStart')
      },
      { label: t('details.steamBuild'), value: data.buildId ?? t('details.unknown') }
    ]
  },

  get routerSafetyNote() {
    return (
      <Rich
        k="fa.routerSafety"
        values={{
          one: <strong>{t('fa.routerSafety.one')}</strong>,
          password: <strong>{t('vh.routerSafety.password')}</strong>,
          verify: <strong>{t('fa.routerSafety.verify')}</strong>
        }}
      />
    )
  },

  async describeLoss(manifest) {
    if (manifest.game !== 'factorio') return t('delete.lossDefault.game')
    try {
      const saves = await window.qubiq.factorio.saves.list(manifest.id)
      const autos = saves.filter((s) => s.automatic).length
      if (autos === 0) return t('fa.loss.save')
      return t('fa.loss.withAutosaves', { count: autos })
    } catch {
      return t('fa.loss.save')
    }
  }
}
