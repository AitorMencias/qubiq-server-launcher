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

/** Piezas de interfaz de Enshrouded. */
export const enshroudedUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: 'Ajustes',
        slot: 'first' as const,
        render: () => <EnshroudedSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'roles',
        label: 'Roles',
        slot: 'first' as const,
        render: () => <RolesPanel state={state} onSaved={onRefresh} />
      },
      {
        id: 'mundos',
        label: 'Mundos',
        slot: 'afterConnection' as const,
        render: () => <WorldsPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'vetados',
        label: 'Vetados',
        slot: 'afterConnection' as const,
        render: () => <ModerationPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'mods',
        label: 'Mods',
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
      { label: 'Mundo', value: data.worldName },
      { label: 'Dificultad', value: presetInfo(data.preset).label },
      {
        label: 'Roles',
        value: abierto
          ? `${conClave} con contraseña · ${roleLabel(abierto.name)} abierto a cualquiera`
          : `${conClave} con contraseña`
      },
      { label: 'Contraseña de admin', value: passwordOf(data.roles, 'Admin') },
      { label: 'Contraseña de amigo', value: passwordOf(data.roles, 'Friend') },
      { label: 'Plazas', value: `${manifest.expectedPlayers ?? 4} de ${MAX_PLAYERS}` },
      { label: 'Puerto', value: `${manifest.port} (UDP)` },
      { label: 'Chat de texto', value: data.enableTextChat ? 'sí' : 'no' },
      { label: 'En la lista del juego', value: 'siempre (no se puede evitar)' },
      { label: 'Versión del juego', value: data.gameVersion ?? 'se sabrá al arrancarlo' },
      { label: 'Build de Steam', value: data.buildId ?? 'desconocida' },
      {
        label: 'Cargador de mods',
        value: data.loaderVersion ? `Shroudtopia ${data.loaderVersion}` : 'sin poner'
      }
    ]
  },

  routerSafetyNote: (
    <>
      Abrir el puerto expone este ordenador a internet. Enshrouded necesita{' '}
      <strong>uno solo</strong>, por UDP. Antes de abrirlo, comprueba en{' '}
      <strong>Configuración → Roles</strong> que ningún rol se ha quedado sin contraseña: ese sería
      el que le tocaría a cualquiera que entrase sin escribir ninguna, y este juego sale siempre en
      su lista pública.
    </>
  ),

  async describeLoss(manifest) {
    if (manifest.game !== 'enshrouded') return 'Sus mundos'
    try {
      const worlds = await window.qubiq.enshrouded.worlds.list(manifest.id)
      const empezados = worlds.filter((w) => w.savedAt !== null)
      if (empezados.length === 0) return 'Su mundo, que todavía no se ha llegado a empezar'
      if (empezados.length === 1) {
        return `Su mundo «${empezados[0]!.name}», con todo lo construido`
      }
      return `Sus ${empezados.length} mundos, con todo lo construido`
    } catch {
      return `Su mundo «${manifest.data.worldName}», con todo lo construido`
    }
  }
}

/** La contraseña de un rol, para la ficha técnica del modo avanzado. */
function passwordOf(roles: EnshroudedRole[], name: string): string {
  const role = roles.find((r) => r.name === name)
  if (!role) return 'ese rol ya no existe'
  return role.password.length > 0 ? role.password : 'sin contraseña'
}
