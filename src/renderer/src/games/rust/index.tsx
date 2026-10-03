import {
  changedSettings,
  queryPortFor,
  rconPortFor,
  rustPlusPortFor,
  worldSizeLabel
} from '@shared/games/rust/types'
import type { GameUi } from '../types'
import { CatalogModsPanel, type ModsApi } from '../../CatalogModsPanel'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { RustSettingsPanel } from './SettingsPanel'
import { WipeNotice, WipePanel } from './WipePanel'
import { ModerationPanel } from './ModerationPanel'
import icon from './icon.svg'
import { Rich, t } from '../../i18n'

/** Oxide y uMod, con la forma que espera la pantalla común de catálogo. */
const pluginsApi: ModsApi = {
  search: (id, text) => window.qubiq.rust.plugins.search(id, text),
  list: (id) => window.qubiq.rust.plugins.list(id),
  add: (id, name) => window.qubiq.rust.plugins.add(id, name),
  remove: (id, name) => window.qubiq.rust.plugins.remove(id, name),
  setEnabled: (id, name, enabled) => window.qubiq.rust.plugins.setEnabled(id, name, enabled),
  updates: (id) => window.qubiq.rust.plugins.updates(id),
  update: (id, name) => window.qubiq.rust.plugins.update(id, name),
  removeLoader: (id) => window.qubiq.rust.plugins.removeOxide(id)
}

/** Piezas de interfaz de Rust. */
export const rustUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: t('tab.settings'),
        slot: 'first' as const,
        render: () => <RustSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'borrado',
        label: t('rust.tab.wipe'),
        slot: 'afterConnection' as const,
        render: () => <WipePanel state={state} mode={mode} onChanged={onRefresh} />
      },
      {
        id: 'moderacion',
        label: t('tab.moderation'),
        slot: 'afterConnection' as const,
        render: () => <ModerationPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'plugins',
        label: t('tab.plugins'),
        slot: 'afterConnection' as const,
        render: () => (
          <CatalogModsPanel
            state={state}
            onChanged={onRefresh}
            api={pluginsApi}
            loaderId="oxide"
            catalog={{ name: 'uMod', url: 'umod.org' }}
            kind="plugin"
            liveChanges
            unavailableLabel={t('rust.plugins.unavailable')}
            playersTitle={t('rust.plugins.playersTitle')}
            playersNote={
              <Rich
                k="rust.plugins.playersNote"
                values={{ modified: <strong>{t('rust.plugins.modified')}</strong> }}
              />
            }
            searchPlaceholder={t('common.forExample', {
              examples: 'kits, teleport, stack size, gather'
            })}
            extra={
              <div className="row" style={{ marginTop: 14 }}>
                <button onClick={() => void window.qubiq.rust.plugins.openFolder(state.manifest.id)}>
                  {t('rust.plugins.openFolder')}
                </button>
                {/* p.hint y no span: suelta en una tarjeta, una nota en
                    `span` sale a tamaño normal (lección de la fase 6). */}
                <p className="hint" style={{ margin: 0 }}>
                  <Rich k="rust.plugins.configNote" values={{ folder: <code>oxide/config</code> }} />
                </p>
              </div>
            }
          />
        )
      }
    ]
  },

  /**
   * Moderar en Rust va por la consola remota, así que tiene efecto al momento.
   * La lista enseña nombres, pero por dentro todo va por el SteamID: el
   * servicio lo busca en la lista de quien está dentro.
   */
  playerActions({ state, onRefresh }) {
    const id = state.manifest.id
    return [
      {
        id: 'admin',
        label: t('vh.action.admin'),
        help: t('rust.action.adminHelp'),
        run: async (player) => {
          await window.qubiq.rust.moderation.makeAdmin(id, player)
          onRefresh()
        }
      },
      {
        id: 'kick',
        label: t('fa.action.kick'),
        danger: true,
        help: t('fa.action.kickHelp'),
        run: async (player) => {
          await window.qubiq.rust.moderation.kick(id, player)
          onRefresh()
        }
      },
      {
        id: 'ban',
        label: t('vh.action.ban'),
        danger: true,
        help: t('rust.action.banHelp'),
        run: async (player) => {
          await window.qubiq.rust.moderation.ban(id, player, '')
          onRefresh()
        }
      }
    ]
  },

  Notices: WipeNotice,

  detailRows(manifest) {
    if (manifest.game !== 'rust') return []
    const { data } = manifest
    const tocados = Object.keys(changedSettings(data.settings)).length

    return [
      { label: t('rust.details.map'), value: worldSizeLabel(data.worldSize) },
      { label: t('fa.create.seed'), value: String(data.seed) },
      { label: t('en.summary.slots'), value: String(data.maxPlayers) },
      {
        label: t('rust.details.ports'),
        value:
          t('rust.details.portsValue', { game: manifest.port, query: queryPortFor(manifest.port) }) +
          (data.rustPlus ? ` · Rust+ ${rustPlusPortFor(manifest.port)} (TCP)` : '')
      },
      {
        label: t('rust.details.rcon'),
        value: t('rust.details.rconValue', { port: rconPortFor(manifest.port) })
      },
      {
        label: t('rust.details.changed'),
        value: tocados === 0 ? t('rust.details.noneChanged') : String(tocados)
      },
      {
        label: t('rust.details.wipe'),
        value: data.wipe.auto ? t('rust.details.wipeAuto') : t('rust.details.wipeManual')
      },
      { label: t('en.details.listed'), value: t('rust.details.listedAlways') },
      { label: t('rust.details.netVersion'), value: data.gameVersion ?? t('details.knownAtStart') },
      { label: t('details.steamBuild'), value: data.buildId ?? t('details.unknown') },
      {
        label: 'Oxide',
        value: data.oxide
          ? `${data.oxide.version}${data.oxide.pending ? ` · ${t('rust.details.oxidePending')}` : ''}`
          : t('rust.details.oxideNone')
      }
    ]
  },

  get routerSafetyNote() {
    return (
      <Rich
        k="rust.routerSafety"
        values={{ two: <strong>{t('rust.routerSafety.two')}</strong> }}
      />
    )
  },

  async describeLoss(manifest) {
    if (manifest.game !== 'rust') return t('rust.loss.map')
    try {
      const map = await window.qubiq.rust.map.get(manifest.id)
      const plugins = manifest.data.plugins?.length ?? 0
      const base = map.current
        ? t('rust.loss.sized', { size: map.current.size })
        : t('rust.loss.notGenerated')
      return plugins > 0 ? t('rust.loss.withPlugins', { base, count: plugins }) : base
    } catch {
      return t('rust.loss.built')
    }
  }
}
