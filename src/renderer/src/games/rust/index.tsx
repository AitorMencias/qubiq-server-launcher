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
        label: 'Ajustes',
        slot: 'first' as const,
        render: () => <RustSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'borrado',
        label: 'Borrado',
        slot: 'afterConnection' as const,
        render: () => <WipePanel state={state} mode={mode} onChanged={onRefresh} />
      },
      {
        id: 'moderacion',
        label: 'Moderación',
        slot: 'afterConnection' as const,
        render: () => <ModerationPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'plugins',
        label: 'Plugins',
        slot: 'afterConnection' as const,
        render: () => (
          <CatalogModsPanel
            state={state}
            onChanged={onRefresh}
            api={pluginsApi}
            loaderId="oxide"
            catalog={{ name: 'uMod', url: 'umod.org' }}
            noun={{ one: 'plugin', many: 'plugins' }}
            liveChanges
            unavailableLabel="No disponible"
            playersTitle="Los jugadores no tienen que instalar nada"
            playersNote={
              <>
                Los plugins de Oxide solo corren en el servidor: tus amigos entran con su Rust de
                siempre. Eso sí, con Oxide puesto el servidor sale marcado como{' '}
                <strong>modificado</strong> en la lista del juego (medido en su consulta de Steam),
                y cada actualización de Rust lo quita hasta que sale su versión nueva, que suele
                tardar unas horas tras el parche del mes.
              </>
            }
            searchPlaceholder="Por ejemplo: kits, teleport, stack size, gather"
            extra={
              <div className="row" style={{ marginTop: 14 }}>
                <button onClick={() => void window.qubiq.rust.plugins.openFolder(state.manifest.id)}>
                  Abrir la carpeta de plugins
                </button>
                {/* p.hint y no span: suelta en una tarjeta, una nota en
                    `span` sale a tamaño normal (lección de la fase 6). */}
                <p className="hint" style={{ margin: 0 }}>
                  La configuración de cada plugin es un fichero en <code>oxide/config</code>.
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
        label: 'Hacer administrador',
        help: 'Podrá usar la consola del juego (F1) para moderar. Le vale al momento.',
        run: async (player) => {
          await window.qubiq.rust.moderation.makeAdmin(id, player)
          onRefresh()
        }
      },
      {
        id: 'kick',
        label: 'Echar',
        danger: true,
        help: 'Lo saca del servidor. Puede volver a entrar cuando quiera.',
        run: async (player) => {
          await window.qubiq.rust.moderation.kick(id, player)
          onRefresh()
        }
      },
      {
        id: 'ban',
        label: 'Vetar',
        danger: true,
        help: 'Lo echa al momento y ya no puede volver a entrar con esa cuenta de Steam.',
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
      { label: 'Mapa', value: worldSizeLabel(data.worldSize) },
      { label: 'Semilla', value: String(data.seed) },
      { label: 'Plazas', value: String(data.maxPlayers) },
      {
        label: 'Puertos',
        value: `${manifest.port} y ${queryPortFor(manifest.port)} (UDP)${data.rustPlus ? ` · Rust+ ${rustPlusPortFor(manifest.port)} (TCP)` : ''}`
      },
      {
        label: 'Consola remota',
        value: `puerto ${rconPortFor(manifest.port)} (TCP), solo en este equipo · la usa la app`
      },
      { label: 'Ajustes cambiados', value: tocados === 0 ? 'ninguno, todo de serie' : String(tocados) },
      {
        label: 'Borrado mensual',
        value: data.wipe.auto ? 'lo hace la app sola' : 'con aviso, lo haces tú'
      },
      { label: 'En la lista del juego', value: 'siempre (no se puede evitar)' },
      { label: 'Versión de red', value: data.gameVersion ?? 'se sabrá al arrancarlo' },
      { label: 'Build de Steam', value: data.buildId ?? 'desconocida' },
      {
        label: 'Oxide',
        value: data.oxide
          ? `${data.oxide.version}${data.oxide.pending ? ' · esperando la versión de este mes' : ''}`
          : 'sin poner'
      }
    ]
  },

  routerSafetyNote: (
    <>
      Abrir los puertos expone este ordenador a internet. Rust necesita <strong>dos</strong>, los
      dos por UDP (y uno TCP más si enciendes Rust+). La consola remota no se abre nunca: la app la
      deja solo dentro de este equipo. Y recuerda que Rust sale siempre en su lista pública, así que
      tener a mano la pestaña de Moderación no está de más.
    </>
  ),

  async describeLoss(manifest) {
    if (manifest.game !== 'rust') return 'Su mapa'
    try {
      const map = await window.qubiq.rust.map.get(manifest.id)
      const plugins = manifest.data.plugins?.length ?? 0
      const base = map.current
        ? `Su mapa de ${map.current.size} m, con todo lo construido`
        : 'Su mapa, que todavía no se ha llegado a generar'
      return plugins > 0 ? `${base}, y sus ${plugins} plugins con su configuración` : base
    } catch {
      return 'Su mapa, con todo lo construido'
    }
  }
}
