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

/** Piezas de interfaz de Project Zomboid. */
export const zomboidUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    const tabs = [
      {
        id: 'ajustes',
        label: 'Ajustes',
        slot: 'first' as const,
        render: () => <ZomboidSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'partida',
        label: 'Partida',
        slot: 'afterConnection' as const,
        render: () => <SandboxPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'mods',
        label: 'Mods',
        slot: 'afterConnection' as const,
        render: () => <ModsPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'moderacion',
        label: 'Moderación',
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
        label: 'Todos los ajustes',
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
        label: 'Hacer administrador',
        help: 'Podrá usar los comandos del juego. Le vale ya, sin salir y volver a entrar.',
        run: async (player) => {
          await window.qubiq.zomboid.accounts.setRole(id, player, 'admin')
          onRefresh()
        }
      },
      {
        id: 'kick',
        label: 'Echar',
        danger: true,
        help: 'Lo saca del servidor. Puede volver a entrar cuando quiera.',
        run: async (player) => {
          await window.qubiq.zomboid.accounts.kick(id, player)
          onRefresh()
        }
      },
      {
        id: 'ban',
        label: 'Vetar',
        danger: true,
        help: 'Lo echa al momento y su cuenta deja de poder entrar.',
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
      { label: 'Dificultad', value: presetInfo(data.preset).name },
      { label: 'Contraseña de admin', value: data.adminPassword },
      {
        label: 'Contraseña del servidor',
        value: data.password.length > 0 ? data.password : 'sin contraseña'
      },
      { label: 'Jugadores como mucho', value: String(data.maxPlayers) },
      { label: 'PvP', value: data.pvp ? 'sí' : 'no' },
      {
        label: 'Cuentas nuevas',
        value: data.openToNewPlayers ? 'cualquiera puede crearse la suya' : 'solo por invitación'
      },
      { label: 'Memoria', value: `${(data.memoryMb / 1024).toFixed(1)} GB` },
      {
        label: 'Puerto',
        value: data.useSteam
          ? `${manifest.port} y ${udpPortFor(manifest.port)} (UDP)`
          : `${manifest.port} (UDP)`
      },
      {
        label: 'Steam',
        value: data.useSteam
          ? 'encendido · sale en la lista de Steam'
          : 'apagado · no se anuncia en ningún sitio'
      },
      {
        label: 'Consola remota',
        value: `puerto ${data.rconPort} · la usa la app, con contraseña propia`
      },
      { label: 'Versión del juego', value: data.gameVersion ?? 'se sabrá al arrancarlo' },
      { label: 'Build de Steam', value: data.buildId ?? 'desconocida' }
    ]
  },

  /**
   * Zomboid es el único juego con su propio buscador: sus ajustes son más de
   * cuatrocientos y están repartidos entre dos pestañas, así que sin él hay que
   * saber de antemano dónde vive cada cosa.
   */
  ConfigSearch: ZomboidConfigSearch,

  routerSafetyNote: (
    <>
      Abrir el puerto expone este ordenador a internet. Zomboid necesita <strong>un</strong> puerto
      UDP (dos si enciendes Steam). Antes de abrirlo, ponle <strong>contraseña</strong> al servidor:
      sin ella, cualquiera que sepa la dirección se crea una cuenta y entra.
    </>
  ),

  async describeLoss(manifest) {
    if (manifest.game !== 'zomboid') return 'Su partida'
    try {
      const cuentas = await window.qubiq.zomboid.accounts.list(manifest.id)
      if (cuentas.length <= 1) return 'Su partida, con todo lo construido y todos los personajes'
      return `Su partida, con todo lo construido, y las ${cuentas.length} cuentas de quienes juegan`
    } catch {
      return 'Su partida, con todo lo construido y todos los personajes'
    }
  }
}
