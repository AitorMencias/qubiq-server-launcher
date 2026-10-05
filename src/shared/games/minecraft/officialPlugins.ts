import type { Distribution } from './types'
import { t, type MessageKey } from '../../i18n'

/**
 * Catálogo de plugins y mods propios que la aplicación sabe instalar y
 * configurar sin salir de ella (§4.8).
 *
 * Son "oficiales" en un sentido concreto: los mantenemos nosotros, viajan
 * dentro de la aplicación y conocemos su configuración, así que podemos
 * ofrecer un formulario en lugar de mandar al usuario a editar un YAML. Para
 * todo lo demás está la pestaña de siempre, que lleva a Modrinth y compañía.
 *
 * La estructura contempla `distributions` desde el principio para que añadir un
 * mod de Fabric o Forge más adelante no obligue a rehacer nada.
 */

export type OfficialPluginId = 'hardcore-utility'

export interface OfficialPluginRole {
  value: string
  label: string
  description: string
  /**
   * El rol solo tiene sentido en modo extremo. La interfaz avisa antes de
   * instalar y, si se acepta, activa `hardcore` en el servidor.
   */
  requiresHardcore?: boolean
}

export interface OfficialPluginField {
  /** Ruta con puntos dentro de config.yml, p. ej. `game.api-port`. */
  path: string
  label: string
  help: string
  type: 'text' | 'number' | 'boolean'
  placeholder?: string
  /** Si se indica, el campo solo aparece con ese rol seleccionado. */
  onlyForRole?: string
}

export interface OfficialPlugin {
  id: OfficialPluginId
  name: string
  summary: string
  description: string
  /**
   * Inicio del nombre del jar (`HardcoreUtility-1.0.0.jar`), para reconocer
   * cualquier versión instalada. La versión y el nombre exacto no están aquí:
   * los deja `npm run plugins` en `resources/minecraft/plugins/<id>/plugin.json`
   * al traer la última release del plugin.
   */
  jarPrefix: string
  /**
   * Repositorio del plugin, con su código y sus releases. Tiene que coincidir
   * con `scripts/official-plugins.mjs` (lo comprueba el smoke).
   */
  repository: string
  /** Tipos de servidor compatibles. */
  distributions: Distribution[]
  /** Carpeta que el plugin crea dentro de `plugins/`. */
  configFolder: string
  configFileName: string
  /**
   * Ajustes de `server.properties` que el plugin necesita para funcionar y que
   * se aplican al instalarlo, en cualquiera de sus papeles.
   *
   * Toda clave que se ponga aquí tiene que existir en `PROPERTY_CATALOG`: el
   * usuario debe poder verla y cambiarla en Ajustes. Un valor impuesto desde
   * fuera que no aparezca en ninguna pantalla es un ajuste embrujado.
   */
  serverProperties?: Record<string, string>
  /** Por qué hacen falta, en lenguaje llano. La interfaz lo enseña al instalar. */
  serverPropertiesNote?: string
  /** Clave del config.yml que decide el papel del servidor. */
  roleKey?: string
  roles?: OfficialPluginRole[]
  fields: OfficialPluginField[]
  /** Aviso que se muestra antes de instalar, si hace falta. */
  setupNote?: string
}

/**
 * Un campo del formulario, con su etiqueta y su ayuda traducidas al leerlas.
 * La clave del diccionario sale de la ruta dentro de config.yml.
 */
function field(
  path: string,
  type: OfficialPluginField['type'],
  extra: { placeholder?: string; onlyForRole?: string } = {}
): OfficialPluginField {
  return {
    path,
    type,
    ...extra,
    get label() {
      return t(`mc.official.hu.${path}.label` as MessageKey)
    },
    get help() {
      return t(`mc.official.hu.${path}.help` as MessageKey)
    }
  }
}

export const OFFICIAL_PLUGINS: OfficialPlugin[] = [
  {
    id: 'hardcore-utility',
    name: 'HardcoreUtility',
    get summary() {
      return t('mc.official.hu.summary')
    },
    get description() {
      return t('mc.official.hu.description')
    },
    jarPrefix: 'HardcoreUtility',
    repository: 'https://github.com/AitorMencias/hardcore-utility-tool',
    distributions: ['paper'],
    configFolder: 'HardcoreUtility',
    configFileName: 'config.yml',
    // El lobby manda a los jugadores a la partida y la partida los devuelve al
    // lobby, las dos veces con el paquete de transferencia. Un servidor que no
    // acepte transferencias rechaza al que llega, así que hace falta en ambos.
    serverProperties: { 'accepts-transfers': 'true' },
    get serverPropertiesNote() {
      return t('mc.official.hu.serverPropertiesNote')
    },
    roleKey: 'mode',
    roles: [
      {
        value: 'game',
        get label() {
          return t('mc.official.hu.role.game.label')
        },
        get description() {
          return t('mc.official.hu.role.game.description')
        },
        requiresHardcore: true
      },
      {
        value: 'lobby',
        get label() {
          return t('mc.official.hu.role.lobby.label')
        },
        get description() {
          return t('mc.official.hu.role.lobby.description')
        }
      }
    ],
    get setupNote() {
      return t('mc.official.hu.setupNote')
    },
    fields: [
      field('api-token', 'text', { placeholder: 'inventa-una-clave-larga' }),

      // --- Partida ---------------------------------------------------------
      field('game.lobby-host', 'text', { placeholder: 'localhost', onlyForRole: 'game' }),
      field('game.lobby-port', 'number', { onlyForRole: 'game' }),
      field('game.lobby-local-host', 'text', { placeholder: '192.168.1.50', onlyForRole: 'game' }),
      field('game.lobby-local-port', 'number', { onlyForRole: 'game' }),
      field('game.api-port', 'number', { onlyForRole: 'game' }),
      field('game.return-delay-seconds', 'number', { onlyForRole: 'game' }),
      field('game.require-transfer', 'boolean', { onlyForRole: 'game' }),
      field('game.archive-old-worlds', 'boolean', { onlyForRole: 'game' }),
      field('game.pregeneration.enabled', 'boolean', { onlyForRole: 'game' }),
      field('game.pregeneration.radius', 'number', { onlyForRole: 'game' }),

      // --- Lobby -----------------------------------------------------------
      field('lobby.game-host', 'text', { placeholder: 'localhost', onlyForRole: 'lobby' }),
      field('lobby.game-port', 'number', { onlyForRole: 'lobby' }),
      field('lobby.game-local-host', 'text', { placeholder: '192.168.1.50', onlyForRole: 'lobby' }),
      field('lobby.game-local-port', 'number', { onlyForRole: 'lobby' }),
      field('lobby.api-url', 'text', { placeholder: 'http://127.0.0.1:25580', onlyForRole: 'lobby' }),
      field('lobby.min-players', 'number', { onlyForRole: 'lobby' }),
      field('lobby.countdown-seconds', 'number', { onlyForRole: 'lobby' })
    ]
  }
]

/** Estado de un plugin oficial en un servidor concreto. */
export interface OfficialPluginStatus {
  id: string
  installed: boolean
  /** false si está instalado pero desactivado (renombrado a .disabled). */
  enabled: boolean
  installedFileName: string | null
  /** Versión que trae la aplicación, por si la instalada fuera más antigua. */
  bundledVersion: string
  /** Licencia del plugin, como la declara su repositorio (`GPL-3.0`). */
  license: string | null
  /**
   * false si el jar instalado no es el que trae la aplicación.
   *
   * Se compara el contenido, no el número de versión: un plugin en desarrollo
   * cambia muchas veces sin cambiar de versión, y entonces el número no
   * distingue nada.
   */
  upToDate: boolean
  hasConfig: boolean
  /** Papel elegido (`mode` en HardcoreUtility), si el plugin tiene roles. */
  role: string | null
  /** Valores actuales de los campos que expone el catálogo. */
  config: Record<string, string>
}

/**
 * `plugin.json` de un plugin oficial: lo que `npm run plugins` sabe de la
 * release que ha traído. Lo lee el núcleo; la interfaz recibe lo que necesita
 * dentro de `OfficialPluginStatus`.
 */
export interface BundledOfficialPlugin {
  version: string
  jarFileName: string
  sha256: string
  license: string | null
  repository: string
  release: string
}

export function officialPluginsFor(distribution: Distribution): OfficialPlugin[] {
  return OFFICIAL_PLUGINS.filter((p) => p.distributions.includes(distribution))
}

export function officialPluginById(id: string): OfficialPlugin | null {
  return OFFICIAL_PLUGINS.find((p) => p.id === id) ?? null
}

/**
 * Ajustes de `server.properties` que hay que aplicar al instalar un plugin con
 * un papel concreto.
 *
 * Vive aquí, en compartido, para que la pantalla enseñe exactamente lo mismo
 * que el proceso principal va a escribir. Si la lista se calculara dos veces,
 * una de las dos acabaría mintiendo.
 */
export function serverPropertiesFor(
  plugin: OfficialPlugin,
  role?: string
): Record<string, string> {
  const chosen = plugin.roles?.find((r) => r.value === role)
  const values: Record<string, string> = { ...plugin.serverProperties }
  if (chosen?.requiresHardcore) {
    values['hardcore'] = 'true'
    values['gamemode'] = 'survival'
    values['difficulty'] = 'hard'
  }
  return values
}
