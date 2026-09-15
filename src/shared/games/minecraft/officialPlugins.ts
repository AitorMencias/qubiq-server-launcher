import type { Distribution } from './types'

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
  version: string
  /** Jar que viaja con la aplicación, en `resources/minecraft/plugins/`. */
  jarFileName: string
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

export const OFFICIAL_PLUGINS: OfficialPlugin[] = [
  {
    id: 'hardcore-utility',
    name: 'HardcoreUtility',
    summary: 'Series hardcore con reinicio automático del mundo y lobby de espera.',
    description:
      'Lleva la cuenta de muertes y del tiempo de cada partida, y cuando alguien muere prepara ' +
      'un mundo nuevo con otra semilla y reinicia el servidor solo. Se monta con dos servidores: ' +
      'uno de lobby, donde esperáis, y otro donde se juega.',
    version: '0.1.0',
    jarFileName: 'HardcoreUtility-0.1.0.jar',
    distributions: ['paper'],
    configFolder: 'HardcoreUtility',
    configFileName: 'config.yml',
    // El lobby manda a los jugadores a la partida y la partida los devuelve al
    // lobby, las dos veces con el paquete de transferencia. Un servidor que no
    // acepte transferencias rechaza al que llega, así que hace falta en ambos.
    serverProperties: { 'accepts-transfers': 'true' },
    serverPropertiesNote:
      'Se activará «Aceptar jugadores enviados desde otro servidor», que puedes ver en Ajustes. ' +
      'El lobby y la partida se pasan a los jugadores entre sí; si el servidor no acepta ' +
      'transferencias, rechaza a quien llegue desde el otro y se queda fuera con un error.',
    roleKey: 'mode',
    roles: [
      {
        value: 'game',
        label: 'Servidor de la partida',
        description: 'Donde se juega. Aquí es donde el mundo se reinicia al morir alguien.',
        requiresHardcore: true
      },
      {
        value: 'lobby',
        label: 'Servidor de lobby',
        description: 'La sala de espera donde os reunís y votáis con /listo para empezar.'
      }
    ],
    setupNote:
      'Necesitas DOS servidores Paper: uno con el papel de lobby y otro con el de partida. ' +
      'Instala el plugin en los dos y pon la misma clave compartida.',
    fields: [
      {
        path: 'api-token',
        label: 'Clave compartida',
        help: 'Tiene que ser exactamente la misma en el lobby y en la partida.',
        type: 'text',
        placeholder: 'inventa-una-clave-larga'
      },

      // --- Partida ---------------------------------------------------------
      {
        path: 'game.lobby-host',
        label: 'Dirección del lobby',
        help: 'Con la que tus jugadores entran al lobby. Se usa para devolverlos al terminar.',
        type: 'text',
        placeholder: 'localhost',
        onlyForRole: 'game'
      },
      {
        path: 'game.lobby-port',
        label: 'Puerto del lobby',
        help: 'El puerto del otro servidor, el de espera.',
        type: 'number',
        onlyForRole: 'game'
      },
      {
        path: 'game.lobby-local-host',
        label: 'Dirección del lobby dentro de casa',
        help:
          'Para quien juegue desde este mismo PC o desde tu red (wifi de casa). Casi ningún ' +
          'router deja salir a internet y volver a entrar a su propia red, así que a esos ' +
          'jugadores hay que darles la dirección local. Déjalo vacío para usar la de arriba.',
        type: 'text',
        placeholder: '192.168.1.50',
        onlyForRole: 'game'
      },
      {
        path: 'game.lobby-local-port',
        label: 'Puerto del lobby dentro de casa',
        help: 'Normalmente el mismo de arriba. Déjalo en 0 para usarlo.',
        type: 'number',
        onlyForRole: 'game'
      },
      {
        path: 'game.api-port',
        label: 'Puerto interno',
        help: 'Por aquí se comunican los dos servidores. No hace falta abrirlo en el router.',
        type: 'number',
        onlyForRole: 'game'
      },
      {
        path: 'game.return-delay-seconds',
        label: 'Segundos antes de volver al lobby',
        help: 'Margen tras la muerte para que dé tiempo a ver qué ha pasado.',
        type: 'number',
        onlyForRole: 'game'
      },
      {
        path: 'game.require-transfer',
        label: 'Obligar a pasar por el lobby',
        help: 'Expulsa a quien entre directo a la partida. Los operadores siempre pueden entrar.',
        type: 'boolean',
        onlyForRole: 'game'
      },
      {
        path: 'game.archive-old-worlds',
        label: 'Guardar los mundos terminados',
        help: 'En vez de borrarlos, los mueve a una carpeta. Ocupan espacio, pero puedes volver a verlos.',
        type: 'boolean',
        onlyForRole: 'game'
      },
      {
        path: 'game.pregeneration.enabled',
        label: 'Pregenerar el mundo nuevo',
        help: 'Prepara el terreno antes de empezar para que vaya fino. Necesita el plugin Chunky.',
        type: 'boolean',
        onlyForRole: 'game'
      },
      {
        path: 'game.pregeneration.radius',
        label: 'Radio a pregenerar (bloques)',
        help: 'Cuanto más grande, más tarda en estar lista la partida.',
        type: 'number',
        onlyForRole: 'game'
      },

      // --- Lobby -----------------------------------------------------------
      {
        path: 'lobby.game-host',
        label: 'Dirección de la partida',
        help: 'Con la que tus jugadores entran a la partida. Tiene que ser accesible para ellos.',
        type: 'text',
        placeholder: 'localhost',
        onlyForRole: 'lobby'
      },
      {
        path: 'lobby.game-port',
        label: 'Puerto de la partida',
        help: 'El puerto del servidor donde se juega.',
        type: 'number',
        onlyForRole: 'lobby'
      },
      {
        path: 'lobby.game-local-host',
        label: 'Dirección de la partida dentro de casa',
        help:
          'Para quien juegue desde este mismo PC o desde tu red (wifi de casa). Casi ningún ' +
          'router deja salir a internet y volver a entrar a su propia red, así que a esos ' +
          'jugadores hay que darles la dirección local. Déjalo vacío para usar la de arriba.',
        type: 'text',
        placeholder: '192.168.1.50',
        onlyForRole: 'lobby'
      },
      {
        path: 'lobby.game-local-port',
        label: 'Puerto de la partida dentro de casa',
        help: 'Normalmente el mismo de arriba. Déjalo en 0 para usarlo.',
        type: 'number',
        onlyForRole: 'lobby'
      },
      {
        path: 'lobby.api-url',
        label: 'Dirección interna de la partida',
        help: 'Para consultar su estado. Si los dos servidores están en este PC, déjalo como está.',
        type: 'text',
        placeholder: 'http://127.0.0.1:25580',
        onlyForRole: 'lobby'
      },
      {
        path: 'lobby.min-players',
        label: 'Jugadores mínimos para empezar',
        help: 'Todos tienen que escribir /listo.',
        type: 'number',
        onlyForRole: 'lobby'
      },
      {
        path: 'lobby.countdown-seconds',
        label: 'Cuenta atrás (segundos)',
        help: 'Lo que se espera desde que todos están listos hasta empezar.',
        type: 'number',
        onlyForRole: 'lobby'
      }
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
