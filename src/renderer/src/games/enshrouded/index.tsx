import {
  MAX_PLAYERS,
  presetInfo,
  roleLabel,
  type EnshroudedRole
} from '@shared/games/enshrouded/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { EnshroudedSettingsPanel } from './SettingsPanel'
import { RolesPanel } from './RolesPanel'
import { ModerationPanel } from './ModerationPanel'
import { ModsPanel } from './ModsPanel'
import { WorldsPanel } from './WorldsPanel'
import icon from './icon.svg'
import { Rich, quote, t } from '../../i18n'

/** Piezas de interfaz de Enshrouded. */
export const enshroudedUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: t('tab.settings'),
        slot: 'first' as const,
        render: () => <EnshroudedSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'roles',
        label: t('en.tab.roles'),
        slot: 'first' as const,
        render: () => <RolesPanel state={state} onSaved={onRefresh} />
      },
      {
        id: 'mundos',
        label: t('tab.worlds'),
        slot: 'afterConnection' as const,
        render: () => <WorldsPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'vetados',
        label: t('en.tab.bans'),
        slot: 'afterConnection' as const,
        render: () => <ModerationPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'mods',
        label: t('tab.mods'),
        slot: 'afterConnection' as const,
        render: () => <ModsPanel state={state} onChanged={onRefresh} />
      }
    ]
  },

  /**
   * Sin botones sobre quien está dentro, y no por dejadez: **el servidor de
   * Enshrouded no sabe expulsar**. Lo dice su propio ejecutable («Dedicated
   * server kick not implemented»), y vetar tampoco se puede desde fuera. Lo
   * explica `GameInfo.moderationHint`, que es lo que enseña la pantalla de
   * jugadores cuando un juego no trae acciones.
   */

  detailRows(manifest) {
    if (manifest.game !== 'enshrouded') return []
    const { data } = manifest

    const conClave = data.roles.filter((r) => r.password.length > 0).length
    const abierto = data.roles.find((r) => r.password.length === 0)

    return [
      { label: t('vh.summary.world'), value: data.worldName },
      { label: t('mc.wizard.summary.difficulty'), value: presetInfo(data.preset).label },
      {
        label: t('en.tab.roles'),
        value: abierto
          ? `${t('en.details.withPassword', { count: conClave })} · ${t('en.details.open', { role: roleLabel(abierto.name) })}`
          : t('en.details.withPassword', { count: conClave })
      },
      { label: t('pz.summary.admin'), value: passwordOf(data.roles, 'Admin') },
      { label: t('en.summary.friend'), value: passwordOf(data.roles, 'Friend') },
      {
        label: t('en.summary.slots'),
        value: t('cfg.countOf', { n: manifest.expectedPlayers ?? 4, total: MAX_PLAYERS })
      },
      { label: t('help.router.port'), value: `${manifest.port} (UDP)` },
      { label: t('en.create.textChat'), value: data.enableTextChat ? t('common.yes') : t('common.no') },
      { label: t('en.details.listed'), value: t('en.details.always') },
      { label: t('details.gameVersion'), value: data.gameVersion ?? t('details.knownAtStart') },
      { label: t('details.steamBuild'), value: data.buildId ?? t('details.unknown') },
      {
        label: t('catalog.loaderTitle.mod'),
        value: data.loaderVersion ? `Shroudtopia ${data.loaderVersion}` : t('en.details.notInstalled')
      }
    ]
  },

  get routerSafetyNote() {
    return (
      <Rich
        k="en.routerSafety"
        values={{
          one: <strong>{t('en.routerSafety.one')}</strong>,
          path: (
            <strong>
              {t('panel.configuration')} → {t('en.tab.roles')}
            </strong>
          )
        }}
      />
    )
  },

  async describeLoss(manifest) {
    if (manifest.game !== 'enshrouded') return t('mc.loss.worlds')
    try {
      const worlds = await window.qubiq.enshrouded.worlds.list(manifest.id)
      const empezados = worlds.filter((w) => w.savedAt !== null)
      if (empezados.length === 0) return t('en.loss.notStarted')
      if (empezados.length === 1) {
        return t('vh.loss.named', { name: quote(empezados[0]!.name) })
      }
      return t('mc.loss.count', { count: empezados.length })
    } catch {
      return t('vh.loss.named', { name: quote(manifest.data.worldName) })
    }
  }
}

/** La contraseña de un rol, para la ficha técnica del modo avanzado. */
function passwordOf(roles: EnshroudedRole[], name: string): string {
  const role = roles.find((r) => r.name === name)
  if (!role) return t('en.details.noRole')
  return role.password.length > 0 ? role.password : t('wizard.summary.noPassword')
}
