import { PRESETS } from '@shared/games/factorio/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { FactorioSettingsPanel } from './SettingsPanel'
import { SavesPanel } from './SavesPanel'
import { ModerationPanel } from './ModerationPanel'
import { ModsPanel } from './ModsPanel'
import icon from './icon.svg'

/** Piezas de interfaz de Factorio. */
export const factorioUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: 'Ajustes',
        slot: 'first' as const,
        render: () => <FactorioSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'partidas',
        label: 'Partidas',
        slot: 'afterConnection' as const,
        render: () => <SavesPanel state={state} onChanged={onRefresh} />
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
        label: 'Hacer administrador',
        help: 'Podrá usar los comandos del juego y pausar la partida. Al estar conectado, le vale ya.',
        run: async (player) => {
          await window.qubiq.factorio.moderation.add(id, 'admin', player)
          onRefresh()
        }
      },
      {
        id: 'kick',
        label: 'Echar',
        danger: true,
        help: 'Lo saca del servidor. Puede volver a entrar cuando quiera.',
        run: async (player) => {
          await window.qubiq.factorio.moderation.kick(id, player)
          onRefresh()
        }
      },
      {
        id: 'ban',
        label: 'Vetar',
        danger: true,
        help: 'Lo echa al momento y no podrá volver a entrar.',
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
      { label: 'Partida', value: data.saveName },
      {
        label: 'Contraseña',
        value: data.password.length > 0 ? data.password : 'sin contraseña'
      },
      {
        label: 'Contenido',
        value: data.spaceAge ? 'Con Space Age' : 'Juego base'
      },
      {
        label: 'Mapa',
        value: PRESETS.find((p) => p.id === data.preset)?.name ?? data.preset
      },
      { label: 'Semilla', value: data.seed ?? 'al azar' },
      { label: 'Jugadores como mucho', value: String(data.maxPlayers) },
      { label: 'Puerto', value: `${manifest.port} (UDP)` },
      {
        label: 'Consola remota',
        value: `127.0.0.1:${data.rconPort} · solo este equipo`
      },
      {
        label: 'Verifica las cuentas',
        value: data.verifyAccounts ? 'sí, con factorio.com' : 'no'
      },
      { label: 'Guarda solo cada', value: `${data.autosaveMinutes} min` },
      {
        label: 'De dónde salió el juego',
        value:
          data.source === 'local'
            ? `Copiado de ${data.sourcePath ?? 'una instalación del equipo'}`
            : `Descargado de Steam con la cuenta ${data.steamUser ?? ''}`.trim()
      },
      {
        label: 'Versión del juego',
        value: data.gameVersion ?? 'se sabrá al arrancarlo'
      },
      { label: 'Build de Steam', value: data.buildId ?? 'desconocida' }
    ]
  },

  routerSafetyNote: (
    <>
      Abrir el puerto expone este ordenador a internet. Factorio necesita <strong>un</strong> puerto
      UDP. Antes de abrirlo, asegúrate de que el servidor tiene <strong>contraseña</strong> y de
      dejar puesta la <strong>comprobación de cuentas</strong>, que es lo que impide que alguien
      entre haciéndose pasar por otro.
    </>
  ),

  async describeLoss(manifest) {
    if (manifest.game !== 'factorio') return 'Su partida'
    try {
      const saves = await window.qubiq.factorio.saves.list(manifest.id)
      const autos = saves.filter((s) => s.automatic).length
      if (autos === 0) return 'Su partida, con toda la fábrica construida'
      return `Su partida, con toda la fábrica construida, y sus ${autos} autoguardados`
    } catch {
      return 'Su partida, con toda la fábrica construida'
    }
  }
}
