import { RELIABLE_PORT } from '@shared/games/satisfactory/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { SettingsPanel } from './SettingsPanel'
import { SavesPanel } from './SavesPanel'
import { CatalogModsPanel } from '../../CatalogModsPanel'
import icon from './icon.svg'
import { Rich, quote, t } from '../../i18n'

/** Piezas de interfaz de Satisfactory. */
export const satisfactoryUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: t('tab.settings'),
        slot: 'first' as const,
        render: () => <SettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'partidas',
        label: t('tab.saves'),
        slot: 'afterConnection' as const,
        render: () => <SavesPanel state={state} mode={mode} onChanged={onRefresh} />
      },
      {
        id: 'mods',
        label: t('tab.mods'),
        slot: 'afterConnection' as const,
        render: () => (
          <CatalogModsPanel
            state={state}
            onChanged={onRefresh}
            api={window.qubiq.satisfactory.mods}
            loaderId="SML"
            catalog={{ name: 'ficsit.app', url: 'ficsit.app' }}
            playersNote={t('sf.mods.playersNote')}
            searchPlaceholder={t('common.forExample', { examples: 'Refined Power, SnapOn, Infinite Zoop…' })}
          />
        )
      }
    ]
  },

  detailRows(manifest) {
    if (manifest.game !== 'satisfactory') return []
    const { data } = manifest
    return [
      { label: t('sf.wizard.summary.session'), value: data.sessionName },
      { label: t('details.maxPlayers'), value: String(data.maxPlayers) },
      { label: t('details.gameVersion'), value: data.gameVersion ?? t('details.knownAtStart') },
      { label: t('details.steamBuild'), value: data.buildId ?? t('details.unknown') },
      { label: t('sf.wizard.summary.admin'), value: data.adminPassword },
      {
        label: t('wizard.summary.joinPassword'),
        value: data.clientPassword.length > 0 ? data.clientPassword : t('wizard.summary.noPassword')
      }
    ]
  },

  get routerSafetyNote() {
    return (
      <Rich
        k="sf.routerSafety"
        vars={{ settings: t('tab.settings') }}
        values={{
          two: <strong>{t('sf.routerSafety.two')}</strong>,
          port: <strong>{RELIABLE_PORT}</strong>,
          password: <strong>{t('sf.routerSafety.password')}</strong>
        }}
      />
    )
  },

  async describeLoss(manifest) {
    if (manifest.game !== 'satisfactory') return t('sf.loss.saves')
    // Preguntar al servidor exigiría tenerlo arrancado, y borrar se hace con él
    // parado: se dice lo que se sabe sin inventar un número de partidas.
    return t('sf.loss.session', { name: quote(manifest.data.sessionName) })
  }
}
