import { presetInfo, udpPortFor } from '@shared/games/zomboid/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { ZomboidServerPanel, ZomboidSettingsPanel } from './SettingsPanel'
import { SandboxPanel } from './SandboxPanel'
import { ModerationPanel } from './ModerationPanel'
import { ZomboidConfigSearch } from './ConfigSearch'
import { ModsPanel } from './ModsPanel'
import icon from './icon.svg'
import { Rich, formatSize, t } from '../../i18n'

/** Piezas de interfaz de Project Zomboid. */
export const zomboidUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    const tabs = [
      {
        id: 'ajustes',
        label: t('tab.settings'),
        slot: 'first' as const,
        render: () => <ZomboidSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'partida',
        label: t('pz.tab.game'),
        slot: 'afterConnection' as const,
        render: () => <SandboxPanel state={state} onChanged={onRefresh} />
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

    // Las otras 130 claves del `.ini`, solo en avanzado: en básico son ruido, y
    // lo que de verdad hace falta ya está en «Ajustes».
    //
    // ⚠ No se llama «Servidor»: esa pestaña ya existe (versión, carpeta, borrar)
    // y salían dos con el mismo nombre.
    if (mode === 'advanced') {
      tabs.push({
        id: 'servidor-ini',
        label: t('pz.tab.allSettings'),
        slot: 'afterConnection' as const,
        render: () => <ZomboidServerPanel state={state} />
      })
    }
    return tabs
  },

  /**
   * Moderar en Zomboid va por la consola remota, así que tiene efecto al
   * momento: echar saca a la persona y vetar además le cierra la cuenta. Los
   * nombres son los de las cuentas del servidor, que es como se ven en el chat.
   */
  playerActions({ state, onRefresh }) {
    const id = state.manifest.id
    return [
      {
        id: 'admin',
        label: t('vh.action.admin'),
        help: t('pz.action.adminHelp'),
        run: async (player) => {
          await window.qubiq.zomboid.accounts.setRole(id, player, 'admin')
          onRefresh()
        }
      },
      {
        id: 'kick',
        label: t('fa.action.kick'),
        danger: true,
        help: t('fa.action.kickHelp'),
        run: async (player) => {
          await window.qubiq.zomboid.accounts.kick(id, player)
          onRefresh()
        }
      },
      {
        id: 'ban',
        label: t('vh.action.ban'),
        danger: true,
        help: t('pz.action.banHelp'),
        run: async (player) => {
          await window.qubiq.zomboid.accounts.setRole(id, player, 'banned')
          onRefresh()
        }
      }
    ]
  },

  detailRows(manifest) {
    if (manifest.game !== 'zomboid') return []
    const { data } = manifest

    return [
      { label: t('mc.wizard.summary.difficulty'), value: presetInfo(data.preset).name },
      { label: t('pz.summary.admin'), value: data.adminPassword },
      {
        label: t('vh.settings.password'),
        value: data.password.length > 0 ? data.password : t('wizard.summary.noPassword')
      },
      { label: t('details.maxPlayers'), value: String(data.maxPlayers) },
      { label: 'PvP', value: data.pvp ? t('common.yes') : t('common.no') },
      {
        label: t('pz.details.newAccounts'),
        value: data.openToNewPlayers ? t('pz.details.anyone') : t('pz.details.invite')
      },
      {
        label: t('chooser.memory'),
        value: formatSize(data.memoryMb / 1024, 'GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      },
      {
        label: t('help.router.port'),
        value: data.useSteam
          ? t('vh.summary.portsValue', { a: manifest.port, b: udpPortFor(manifest.port) })
          : `${manifest.port} (UDP)`
      },
      {
        label: 'Steam',
        value: data.useSteam ? t('pz.details.steamOn') : t('pz.details.steamOff')
      },
      {
        label: t('fa.details.rcon'),
        value: t('pz.details.rconValue', { port: data.rconPort })
      },
      { label: t('details.gameVersion'), value: data.gameVersion ?? t('details.knownAtStart') },
      { label: t('details.steamBuild'), value: data.buildId ?? t('details.unknown') }
    ]
  },

  /**
   * Zomboid es el único juego con su propio buscador: sus ajustes son más de
   * cuatrocientos y están repartidos entre dos pestañas, así que sin él hay que
   * saber de antemano dónde vive cada cosa.
   */
  ConfigSearch: ZomboidConfigSearch,

  get routerSafetyNote() {
    return (
      <Rich
        k="pz.routerSafety"
        values={{
          one: <strong>{t('fa.routerSafety.one')}</strong>,
          password: <strong>{t('vh.routerSafety.password')}</strong>
        }}
      />
    )
  },

  async describeLoss(manifest) {
    if (manifest.game !== 'zomboid') return t('delete.lossDefault.game')
    try {
      const cuentas = await window.qubiq.zomboid.accounts.list(manifest.id)
      if (cuentas.length <= 1) return t('pz.loss.save')
      return t('pz.loss.accounts', { count: cuentas.length })
    } catch {
      return t('pz.loss.save')
    }
  }
}
