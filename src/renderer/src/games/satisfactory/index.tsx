import { RELIABLE_PORT } from '@shared/games/satisfactory/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { SettingsPanel } from './SettingsPanel'
import { SavesPanel } from './SavesPanel'
import { CatalogModsPanel } from '../../CatalogModsPanel'
import icon from './icon.svg'

/** Piezas de interfaz de Satisfactory. */
export const satisfactoryUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: 'Ajustes',
        slot: 'first' as const,
        render: () => <SettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'partidas',
        label: 'Partidas',
        slot: 'afterConnection' as const,
        render: () => <SavesPanel state={state} mode={mode} onChanged={onRefresh} />
      },
      {
        id: 'mods',
        label: 'Mods',
        slot: 'afterConnection' as const,
        render: () => (
          <CatalogModsPanel
            state={state}
            onChanged={onRefresh}
            api={window.qubiq.satisfactory.mods}
            loaderId="SML"
            catalog={{ name: 'ficsit.app', url: 'ficsit.app' }}
            playersNote={
              <>
                Satisfactory comprueba los mods al entrar: quien no tenga los mismos que el
                servidor se queda fuera. Cada jugador se los instala en su juego con el
                Satisfactory Mod Manager, que es la herramienta de ficsit.app.
              </>
            }
            searchPlaceholder="Por ejemplo: Refined Power, SnapOn, Infinite Zoop…"
          />
        )
      }
    ]
  },

  detailRows(manifest) {
    if (manifest.game !== 'satisfactory') return []
    const { data } = manifest
    return [
      { label: 'Partida', value: data.sessionName },
      { label: 'Jugadores como mucho', value: String(data.maxPlayers) },
      { label: 'Versión del juego', value: data.gameVersion ?? 'se sabrá al arrancarlo' },
      { label: 'Build de Steam', value: data.buildId ?? 'desconocida' },
      { label: 'Contraseña de administrador', value: data.adminPassword },
      {
        label: 'Contraseña para entrar',
        value: data.clientPassword.length > 0 ? data.clientPassword : 'sin contraseña'
      }
    ]
  },

  routerSafetyNote: (
    <>
      Abrir puertos expone este ordenador a internet. Satisfactory necesita{' '}
      <strong>dos</strong>: el del juego y el <strong>{RELIABLE_PORT}</strong> de su mensajería.
      Pon una <strong>contraseña para entrar</strong> en Ajustes: sin ella, cualquiera que dé con tu
      dirección puede meterse en la partida.
    </>
  ),

  async describeLoss(manifest) {
    if (manifest.game !== 'satisfactory') return 'Sus partidas'
    // Preguntar al servidor exigiría tenerlo arrancado, y borrar se hace con él
    // parado: se dice lo que se sabe sin inventar un número de partidas.
    return `Su partida «${manifest.data.sessionName}» y el resto de guardados del servidor, con todo lo construido`
  }
}
