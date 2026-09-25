import {
  GLOBAL_KEYS,
  MODIFIERS,
  PRESETS,
  queryPortFor,
  type ValheimModifierKey
} from '@shared/games/valheim/types'
import type { GameUi } from '../types'
import { BasicWizard } from './BasicWizard'
import { CreateWizard } from './CreateWizard'
import { ValheimSettingsPanel } from './SettingsPanel'
import { WorldsPanel } from './WorldsPanel'
import { ModerationPanel } from './ModerationPanel'
import { CatalogModsPanel } from '../../CatalogModsPanel'
import icon from './icon.svg'

/** Piezas de interfaz de Valheim. */
export const valheimUi: GameUi = {
  icon,
  BasicWizard,
  AdvancedWizard: CreateWizard,

  configTabs({ state, mode, onRefresh }) {
    return [
      {
        id: 'ajustes',
        label: 'Ajustes',
        slot: 'first' as const,
        render: () => <ValheimSettingsPanel state={state} mode={mode} onSaved={onRefresh} />
      },
      {
        id: 'mundos',
        label: 'Mundos',
        slot: 'afterConnection' as const,
        render: () => <WorldsPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'moderacion',
        label: 'Moderación',
        slot: 'afterConnection' as const,
        render: () => <ModerationPanel state={state} onChanged={onRefresh} />
      },
      {
        id: 'mods',
        label: 'Mods',
        slot: 'afterConnection' as const,
        render: () => (
          <CatalogModsPanel
            state={state}
            onChanged={onRefresh}
            api={window.qubiq.valheim.mods}
            loaderId="denikson-BepInExPack_Valheim"
            catalog={{ name: 'Thunderstore', url: 'thunderstore.io' }}
            playersNote={
              <>
                Valheim deja entrar igual a quien no tenga los mods, pero el juego se le portará
                mal: le faltarán objetos y construcciones. Cada jugador se los instala en el suyo
                con r2modman o el Thunderstore Mod Manager, poniendo los mismos y en la misma
                versión.
              </>
            }
            searchPlaceholder="Por ejemplo: Plant Everything, Epic Loot, Jotunn…"
          />
        )
      }
    ]
  },

  /**
   * Moderar en Valheim es escribir en sus listas de texto, no mandar una orden:
   * no hay consola. Lo que sí hace el servidor es releerlas al vuelo, así que
   * **vetar a alguien que está dentro lo echa al momento** (comprobado con un
   * jugador real).
   */
  playerActions({ state, onRefresh }) {
    const id = state.manifest.id
    const add = async (kind: 'admin' | 'banned' | 'permitted', player: string): Promise<void> => {
      await window.qubiq.valheim.moderation.add(id, kind, player)
      onRefresh()
    }
    return [
      {
        id: 'admin',
        label: 'Hacer administrador',
        run: (player) => add('admin', player)
      },
      {
        id: 'permitted',
        label: 'Invitar',
        help: 'Añadido a la lista de invitados. Ojo: con esa lista puesta, solo entra quien esté en ella.',
        run: (player) => add('permitted', player)
      },
      {
        id: 'banned',
        label: 'Vetar',
        danger: true,
        help: 'Vetado: el servidor lo echa y no podrá volver a entrar.',
        run: (player) => add('banned', player)
      }
    ]
  },

  /** El juego solo da el identificador de Steam, así que se dice que lo es. */
  playerLabel(player) {
    return `Steam ${player}`
  },

  detailRows(manifest) {
    if (manifest.game !== 'valheim') return []
    const { data } = manifest

    // Solo los modificadores que se han tocado: los que están en `default` son
    // «lo que diga la dificultad», y listarlos todos sería ruido.
    const tweaked = MODIFIERS.filter(
      (m) => data.modifiers[m.key] && data.modifiers[m.key] !== 'default'
    ).map((m) => {
      const value = data.modifiers[m.key as ValheimModifierKey]!
      return `${m.label}: ${m.options.find((o) => o.value === value)?.label ?? value}`
    })

    return [
      { label: 'Mundo', value: data.worldName },
      { label: 'Contraseña', value: data.password.length > 0 ? data.password : 'sin contraseña' },
      {
        label: 'Dificultad',
        value: PRESETS.find((p) => p.value === data.preset)?.label ?? data.preset
      },
      { label: 'Ajustes cambiados', value: tweaked.length > 0 ? tweaked.join(' · ') : 'ninguno' },
      {
        label: 'Reglas del mundo',
        value:
          data.globalKeys.length > 0
            ? data.globalKeys
                .map((key) => GLOBAL_KEYS.find((r) => r.key === key)?.label ?? key)
                .join(' · ')
            : 'ninguna'
      },
      { label: 'Puertos', value: `${manifest.port} y ${queryPortFor(manifest.port)} (UDP)` },
      { label: 'En la lista de Steam', value: data.listed ? 'sí' : 'no' },
      {
        label: 'Guarda el mundo cada',
        value: `${Math.round(data.saveIntervalSeconds / 60)} min`
      },
      { label: 'Versión del juego', value: data.gameVersion ?? 'se sabrá al arrancarlo' },
      { label: 'Build de Steam', value: data.buildId ?? 'desconocida' }
    ]
  },

  routerSafetyNote: (
    <>
      Abrir puertos expone este ordenador a internet. Valheim necesita <strong>dos</strong> UDP
      seguidos: el del juego y el siguiente. Antes de abrirlos, asegúrate de que el servidor tiene{' '}
      <strong>contraseña</strong>. Y si lo que quieres es que entren tus amigos y ya está, el{' '}
      <strong>crossplay</strong> hace lo mismo sin abrir nada.
    </>
  ),

  async describeLoss(manifest) {
    if (manifest.game !== 'valheim') return 'Sus mundos'
    try {
      const worlds = await window.qubiq.valheim.worlds.list(manifest.id)
      const generated = worlds.filter((w) => w.savedAt !== null)
      if (generated.length === 0) return 'Su mundo, que todavía no se ha llegado a generar'
      if (generated.length === 1) {
        return `Su mundo «${generated[0]!.name}», con todo lo construido`
      }
      return `Sus ${generated.length} mundos, con todo lo construido`
    } catch {
      return `Su mundo «${manifest.data.worldName}», con todo lo construido`
    }
  }
}
