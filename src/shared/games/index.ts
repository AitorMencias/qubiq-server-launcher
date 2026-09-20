import type { AgreementId, GameId, InstanceManifest } from '../types'
import { DISTRIBUTION_LABELS, contentKindFor } from './minecraft/types'
import {
  DEFAULT_GAME_PORT,
  MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB,
  RELIABLE_PORT
} from './satisfactory/types'
import {
  DEFAULT_GAME_PORT as FACTORIO_DEFAULT_PORT,
  DEFAULT_MAX_PLAYERS as FACTORIO_MAX_PLAYERS,
  MEMORY_MIN_GB as FACTORIO_MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB as FACTORIO_MEMORY_RECOMMENDED_GB
} from './factorio/types'
import {
  DEFAULT_GAME_PORT as ZOMBOID_DEFAULT_PORT,
  DEFAULT_MAX_PLAYERS as ZOMBOID_MAX_PLAYERS,
  MEMORY_MIN_GB as ZOMBOID_MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB as ZOMBOID_MEMORY_RECOMMENDED_GB,
  presetInfo as zomboidPresetInfo,
  udpPortFor
} from './zomboid/types'
import {
  DEFAULT_GAME_PORT as VALHEIM_DEFAULT_PORT,
  MAX_PLAYERS as VALHEIM_MAX_PLAYERS,
  MEMORY_MIN_GB as VALHEIM_MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB as VALHEIM_MEMORY_RECOMMENDED_GB,
  queryPortFor
} from './valheim/types'

/**
 * Catálogo de juegos visible desde los dos lados (núcleo e interfaz).
 *
 * Solo datos: nombres, condiciones y capacidades. Cómo se instala o se para
 * cada juego vive en el núcleo (`main/core/games/<id>/adapter.ts`), que no
 * puede llegar al renderer.
 */

/**
 * Qué sabe hacer un servidor de un juego. Decide qué pestañas y controles
 * aparecen: un juego sin plugins no enseña la pestaña, igual que Vanilla no
 * enseña «Plugins».
 */
export interface GameCapabilities {
  /** Varios mundos en el mismo servidor (Minecraft: `level-name`). */
  worlds: boolean
  /** Plugins o mods que el usuario añade a mano. */
  content: boolean
  /** Plugins oficiales que viajan con la app. */
  officialPlugins: boolean
  /** Memoria asignable desde la app. */
  memory: boolean
  /** Ajustes del servidor editables con formulario. */
  settings: boolean
  /** Reinstalar el servidor desde la app. */
  reinstall: boolean
  /**
   * La app sabe qué versión es la última y puede cambiarla. No en un servidor
   * a medida de Minecraft: lo montó el usuario y su versión la decide su
   * modpack, no un catálogo.
   */
  versions: boolean
  /** Consola con entrada de comandos. */
  commands: boolean
  /**
   * El juego dice QUIÉN está conectado, aunque sea con un identificador en vez
   * de un nombre. Satisfactory solo da el número, así que su pantalla de
   * jugadores cuenta en vez de listar.
   */
  playerIds: boolean
  /**
   * Y además ese «quién» es un nombre que el usuario reconoce. Valheim solo da
   * el identificador de Steam: se puede listar y moderar, pero la pantalla
   * tiene que explicar qué es ese número en vez de hacerlo pasar por un nombre.
   */
  playerNames: boolean
  /**
   * Expulsar, banear o dar permisos desde la app. Cómo se hace es cosa de cada
   * juego (Minecraft por la consola, Valheim escribiendo en sus listas): lo
   * declara aquí y aporta los botones en `GameUi.playerActions`.
   */
  moderation: boolean
  /**
   * Se puede comprobar desde internet si se llega al servidor. Hace falta un
   * servicio de fuera que hable el protocolo del juego; Minecraft lo tiene y
   * Satisfactory no, y decirlo vale más que un botón que no prueba nada.
   */
  externalCheck: boolean
  /**
   * El juego trae su propia forma de jugar desde fuera sin abrir puertos
   * (Valheim: crossplay con código de 6 dígitos). Solo entonces se ofrece ese
   * modo de exposición, porque en los demás juegos no existe.
   */
  crossplay: boolean
}

export interface AgreementInfo {
  id: AgreementId
  /** Cómo se nombra en una frase: «Hay que aceptar {label}». */
  label: string
  url: string
}

/**
 * Lo que distingue a un juego de otro en la pantalla de elegir juego: no se
 * elige por el nombre, sino por cuánta gente entra, qué pide al equipo y qué
 * tiene de raro. Lo que cambia la decisión va a la vista, no escondido dentro
 * del asistente.
 */
export interface GameCard {
  /** Qué es el juego, en una frase. */
  tagline: string
  /** Cuánta gente aguanta: «Hasta 4». */
  players: string
  /** Memoria del equipo, en GB: mínima para que arranque y la cómoda. */
  memoryGb: { min: number; recommended: number }
  /** Lo que ocupa la descarga. */
  download: string
  /** true si el tamaño está medido instalándolo, no estimado. */
  downloadMeasured: boolean
  /** Lo que conviene saber antes de elegirlo. */
  highlights: { text: string; tone: 'neutral' | 'good' | 'warn' }[]
}

export interface GameInfo {
  id: GameId
  name: string
  card: GameCard
  agreements: AgreementInfo[]
  /** Aviso de producto no oficial, exigido por las normas de marca de cada juego. */
  disclaimer: string
  /** Dónde se pone la dirección dentro del juego, dicho en una frase. */
  joinHint: string
  /**
   * Los pasos exactos para entrar, cuando no basta con «pega la dirección».
   *
   * Satisfactory rechaza la conexión directa por IP: el cliente necesita un
   * token que solo consigue añadiendo el servidor por el menú del juego, y si
   * no, el error que da (**Encryption token missing**) no dice qué hacer.
   */
  joinSteps?: string[]
  /**
   * Los pasos cuando se entra por el crossplay del juego, que no son los
   * mismos: no hay dirección que pegar, sino un código que escribir. Solo
   * tienen sentido en los juegos con la capacidad `crossplay`.
   */
  joinStepsCrossplay?: string[]
  /** El fallo típico al entrar mal, dicho antes de que ocurra. */
  joinWarning?: string
  /** Ejemplo de dirección que da playit.gg para este juego, para reconocerla. */
  tunnelAddressExample: string
  /**
   * Cómo se llama lo que se guarda: «mundo» en Minecraft y Valheim, «partida»
   * en Satisfactory. Los textos comunes lo usan en vez de decir «mundo» a fuego.
   */
  save: SaveNoun
  /** Qué entra en una copia de seguridad, en una o dos frases. */
  backupScope: string
  /**
   * Qué se puede moderar y dónde, en los juegos que no dan los nombres de
   * quien está dentro. Lo dice la pantalla de jugadores en vez de enseñar
   * botones que no funcionarían; cambia mucho de un juego a otro (Satisfactory
   * no deja nada desde fuera, Valheim deja listas pero no expulsar en caliente).
   */
  moderationHint?: string
}

export interface SaveNoun {
  singular: string
  plural: string
  feminine: boolean
}

/** «el mundo» / «la partida». */
export function theSave(noun: SaveNoun): string {
  return `${noun.feminine ? 'la' : 'el'} ${noun.singular}`
}

/** «Mundo restaurado» / «Partida restaurada». */
export function saveParticiple(noun: SaveNoun, participle: string): string {
  const word = noun.singular.charAt(0).toUpperCase() + noun.singular.slice(1)
  return `${word} ${participle.replace(/o$/, noun.feminine ? 'a' : 'o')}`
}

export const GAMES: Record<GameId, GameInfo> = {
  minecraft: {
    id: 'minecraft',
    name: 'Minecraft',
    card: {
      tagline: 'Construir y sobrevivir. El de siempre, con plugins o mods.',
      players: 'Hasta ~20',
      memoryGb: { min: 2, recommended: 4 },
      download: '≈ 1 GB',
      downloadMeasured: false,
      highlights: [{ text: 'Plugins y mods', tone: 'neutral' }]
    },
    agreements: [
      { id: 'minecraft-eula', label: 'el EULA de Minecraft', url: 'https://aka.ms/MinecraftEULA' }
    ],
    disclaimer:
      'NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
    joinHint: 'En Minecraft: Multijugador → Añadir servidor.',
    tunnelAddressExample: 'algo.joinmc.link',
    save: { singular: 'mundo', plural: 'mundos', feminine: false },
    backupScope:
      'Se guarda el mundo y la configuración. Los jars no hacen falta: se pueden volver a descargar.'
  },

  satisfactory: {
    id: 'satisfactory',
    name: 'Satisfactory',
    card: {
      tagline: 'Fábricas enormes montadas en equipo.',
      players: 'Hasta 4 (ampliable)',
      memoryGb: { min: MEMORY_MIN_GB, recommended: MEMORY_RECOMMENDED_GB },
      download: '15,5 GB',
      downloadMeasured: true,
      highlights: [
        { text: 'Se configura sin abrir el juego', tone: 'good' },
        { text: 'Solo uno a la vez', tone: 'warn' }
      ]
    },
    // El servidor se descarga de Steam de forma anónima: lo que se acepta es el
    // acuerdo de Steam, no un EULA del juego.
    agreements: [
      {
        id: 'steam-subscriber',
        label: 'el Acuerdo de Suscriptor de Steam',
        url: 'https://store.steampowered.com/subscriber_agreement/'
      }
    ],
    disclaimer:
      'Herramienta no oficial. No está asociada a Coffee Stain Studios ni a Satisfactory.',
    joinHint: 'En Satisfactory: Servidores → Añadir servidor, con esta dirección.',
    joinSteps: [
      'Abre Satisfactory y entra en «Servidores» desde el menú principal.',
      'Pulsa «Añadir servidor» y pega ahí la dirección.',
      'Te pedirá la contraseña de administrador (la que pusiste al crear el servidor) para poder gestionarlo.',
      'El servidor queda en tu lista: pulsa «Unirse» y, si le pusiste contraseña para entrar, escríbela.'
    ],
    joinWarning:
      'No vale la conexión directa por IP: el juego exige un permiso que solo se consigue añadiendo ' +
      'el servidor así. Si lo intentas por las bravas, Satisfactory contesta «Encryption token missing».',
    tunnelAddressExample: 'algo.gl.at.ply.gg',
    save: { singular: 'partida', plural: 'partidas', feminine: true },
    backupScope:
      'Se guardan las partidas y los ajustes del servidor. El juego no hace falta: se vuelve a descargar de Steam.',
    moderationHint:
      'Este juego no deja expulsar ni banear desde fuera. Entra tú a la partida con tu contraseña ' +
      'de administrador y hazlo desde el menú del propio juego. Si hace falta cortar de raíz, para ' +
      'el servidor o ponle una contraseña para entrar desde Ajustes.'
  },

  valheim: {
    id: 'valheim',
    name: 'Valheim',
    card: {
      tagline: 'Sobrevivir, construir y matar jefes en un mundo vikingo.',
      players: `Hasta ${VALHEIM_MAX_PLAYERS}`,
      memoryGb: { min: VALHEIM_MEMORY_MIN_GB, recommended: VALHEIM_MEMORY_RECOMMENDED_GB },
      download: '2 GB',
      downloadMeasured: true,
      highlights: [
        { text: 'Se juega desde fuera sin abrir puertos', tone: 'good' },
        { text: 'El más ligero de todos', tone: 'good' },
        { text: 'No se modera en caliente', tone: 'warn' }
      ]
    },
    // Igual que Satisfactory: el servidor se baja de Steam de forma anónima, y
    // lo que se acepta es el acuerdo de Steam.
    agreements: [
      {
        id: 'steam-subscriber',
        label: 'el Acuerdo de Suscriptor de Steam',
        url: 'https://store.steampowered.com/subscriber_agreement/'
      }
    ],
    disclaimer: 'Herramienta no oficial. No está asociada a Iron Gate ni a Valheim.',
    joinHint: 'En Valheim: Unirse a partida → Añadir servidor, con esta dirección.',
    joinSteps: [
      'Abre Valheim, elige tu personaje y entra en «Unirse a partida».',
      'Pulsa «Añadir servidor» y pega ahí la dirección, con el puerto incluido.',
      'Escribe la contraseña del servidor cuando te la pida.',
      'El servidor queda en tu lista de favoritos: la próxima vez basta con pulsar «Conectar».'
    ],
    joinStepsCrossplay: [
      'Abre Valheim, elige tu personaje y entra en «Unirse a partida».',
      'Pulsa «Unirse con código» y escribe el código de 6 dígitos que da la app.',
      'Escribe la contraseña del servidor cuando te la pida.',
      'El código cambia cada vez que se arranca el servidor: habrá que pasarlo de nuevo.'
    ],
    tunnelAddressExample: 'algo.gl.at.ply.gg',
    save: { singular: 'mundo', plural: 'mundos', feminine: false },
    backupScope:
      'Se guardan los mundos y las listas de moderación. El juego no hace falta: se vuelve a descargar de Steam.',
    moderationHint:
      'En Valheim se modera por identificador de Steam, no por nombre: el juego no dice cómo se ' +
      'llama el personaje de nadie. Vetar a alguien lo echa al momento, y las listas completas ' +
      '(administradores, vetados e invitados) están en Configuración → Moderación.'
  },

  factorio: {
    id: 'factorio',
    name: 'Factorio',
    card: {
      tagline: 'Montar una fábrica enorme entre varios, y defenderla.',
      players: `Hasta ${FACTORIO_MAX_PLAYERS} cómodamente`,
      memoryGb: { min: FACTORIO_MEMORY_MIN_GB, recommended: FACTORIO_MEMORY_RECOMMENDED_GB },
      // Medido en la fase 4: la descarga son 5 GB, pero el servidor se queda en
      // 246 MB porque no necesita ni imágenes ni sonidos.
      download: '5 GB → 250 MB',
      downloadMeasured: true,
      // Como en los demás juegos: primero lo bueno y el aviso al final.
      highlights: [
        { text: 'Arranca en un segundo', tone: 'good' },
        { text: 'Con mods y con Space Age', tone: 'neutral' },
        { text: 'Hace falta tener el juego', tone: 'warn' }
      ]
    },
    // El juego se descarga de Steam con la cuenta del usuario (no hay servidor
    // dedicado anónimo), así que lo que se acepta sigue siendo el acuerdo de Steam.
    agreements: [
      {
        id: 'steam-subscriber',
        label: 'el Acuerdo de Suscriptor de Steam',
        url: 'https://store.steampowered.com/subscriber_agreement/'
      }
    ],
    disclaimer: 'Herramienta no oficial. No está asociada a Wube Software ni a Factorio.',
    joinHint: 'En Factorio: Multijugador → Conectar a la dirección.',
    joinSteps: [
      'Abre Factorio y entra en «Multijugador» desde el menú principal.',
      'Pulsa «Conectar a la dirección» y pega ahí la dirección, con el puerto incluido.',
      'Escribe la contraseña del servidor cuando te la pida.',
      'Tenéis que tener todos la misma versión del juego y los mismos mods que el servidor.'
    ],
    joinWarning:
      'Si te saltas la contraseña, Factorio corta la conexión sin decir por qué (en el servidor ' +
      'queda como «PasswordMissing»). Y si tu juego no está en la misma versión que el servidor, ' +
      'no te dejará entrar: mira la versión en la ficha del servidor.',
    tunnelAddressExample: 'algo.gl.at.ply.gg',
    save: { singular: 'partida', plural: 'partidas', feminine: true },
    backupScope:
      'Se guardan las partidas, los mods y las listas de moderación. El juego no hace falta: se ' +
      'vuelve a descargar de Steam.',
    moderationHint:
      'En Factorio se modera por nombre de cuenta de Factorio, que es el que se ve en el chat. ' +
      'Vetar a alguien lo echa al momento.'
  },

  zomboid: {
    id: 'zomboid',
    name: 'Project Zomboid',
    card: {
      tagline: 'Sobrevivir a la epidemia zombi todo lo que se pueda.',
      players: `Hasta ${ZOMBOID_MAX_PLAYERS} cómodamente`,
      memoryGb: { min: ZOMBOID_MEMORY_MIN_GB, recommended: ZOMBOID_MEMORY_RECOMMENDED_GB },
      download: '6,7 GB',
      downloadMeasured: true,
      highlights: [
        { text: 'Se modera y se manda como en Minecraft', tone: 'good' },
        { text: 'Cientos de reglas de partida', tone: 'neutral' },
        { text: 'Tarda un minuto largo en arrancar', tone: 'warn' }
      ]
    },
    // Como Valheim y Satisfactory: el servidor se baja de Steam de forma
    // anónima, así que lo que se acepta es el acuerdo de Steam.
    agreements: [
      {
        id: 'steam-subscriber',
        label: 'el Acuerdo de Suscriptor de Steam',
        url: 'https://store.steampowered.com/subscriber_agreement/'
      }
    ],
    disclaimer: 'Herramienta no oficial. No está asociada a The Indie Stone ni a Project Zomboid.',
    joinHint: 'En Project Zomboid: Unirse → Favoritos → Añadir servidor, con esta dirección.',
    joinSteps: [
      'Abre Project Zomboid y entra en «Unirse» desde el menú principal.',
      'Ve a la pestaña «Favoritos» y pulsa «Añadir servidor» con esta dirección y su puerto.',
      'Escribe el nombre de usuario y la contraseña que quieras: la primera vez se te crea la cuenta sola.',
      'Si el servidor tiene contraseña, va en el campo «Contraseña del servidor», que es distinto al de tu cuenta.'
    ],
    joinWarning:
      'Tu usuario y tu contraseña son de este servidor, no de Steam: te los inventas tú la primera ' +
      'vez y con ellos vuelves a tu mismo personaje. Si te equivocas al escribirlos, el servidor te ' +
      'dice que la contraseña no es válida en vez de crearte otra cuenta.',
    tunnelAddressExample: 'algo.gl.at.ply.gg',
    save: { singular: 'partida', plural: 'partidas', feminine: true },
    backupScope:
      'Se guardan la partida, los ajustes y la base de datos de cuentas (quién es administrador y ' +
      'quién está vetado). El juego no hace falta: se vuelve a descargar de Steam.',
    moderationHint:
      'En Zomboid se modera por nombre de cuenta del servidor, no por Steam. Las órdenes viajan ' +
      'por la consola remota, así que hay que tener el servidor arrancado: con él parado se ve ' +
      'quién es quién, pero no se puede cambiar.'
  }
}

/** «Servidores de Minecraft» mientras sea el único juego; genérico después. */
export function appSubtitle(): string {
  return GAME_IDS.length === 1
    ? `Servidores de ${GAMES[GAME_IDS[0]].name}, sin complicaciones`
    : 'Servidores de juegos, sin complicaciones'
}

/**
 * Avisos de producto no oficial para la barra lateral.
 *
 * Con un solo juego se enseña el suyo. Con más, uno genérico, porque siete
 * avisos no los lee nadie; el de Minecraft se mantiene aparte y literal porque
 * sus normas de marca exigen ese texto exacto (ANALISIS.md §13.1).
 */
export function disclaimerLines(): string[] {
  if (GAME_IDS.length === 1) return [GAMES[GAME_IDS[0]!].disclaimer]
  return [
    GAMES.minecraft.disclaimer,
    'QubiQ no es un producto oficial de ninguno de los juegos que gestiona ni está asociado a sus estudios.'
  ]
}

/**
 * ¿Hay versión nueva del servidor? En los juegos de Steam es obligatorio
 * seguirla: un cliente actualizado no entra en un servidor viejo (en Rust,
 * además, cada mes).
 */
export interface UpdateCheck {
  available: boolean
  installed: string | null
  latest: string | null
}

/**
 * Una versión que se puede instalar en un servidor que ya existe.
 *
 * Unifica dos cosas que por dentro se parecen poco: en Minecraft es una versión
 * del juego (`26.2`), y en los juegos de Steam es una **rama** publicada por el
 * estudio (`public`, `experimental`, `default_preal`). Lo que tienen en común es
 * lo único que le importa a quien elige: cómo se llama, si es más nueva o más
 * vieja que la instalada, y si está terminada.
 */
export interface InstallableVersion {
  /** Con lo que se pide instalarla: versión de Minecraft o nombre de la rama. */
  id: string
  /** Cómo se enseña: «26.2», «Estable», «Anterior a Ashlands». */
  label: string
  /** Lo que dice el estudio de esa rama, cuando lo dice. */
  description?: string
  /** No terminada: build alpha de Paper, rama experimental de Steam. */
  experimental?: boolean
  /** La que la app propone si no hay motivo para otra cosa. */
  recommended?: boolean
  /** La que está instalada ahora mismo. */
  installed?: boolean
  /**
   * Respecto a la instalada. `unknown` cuando no se puede saber de verdad, que
   * vale más que adivinarlo: bajar de versión puede costar la partida.
   */
  relation: 'newer' | 'same' | 'older' | 'unknown'
}

export type PortProtocol = 'tcp' | 'udp' | 'tcp+udp'

/**
 * Un puerto que el servidor necesita accesible. Minecraft usa uno solo (TCP);
 * los juegos de Steam suelen usar varios, casi siempre UDP.
 */
export interface ServerPort {
  port: number
  protocol: PortProtocol
  /** Para qué es, si hay más de uno («Juego», «Consulta de Steam»). */
  label: string
  /** Tipo de túnel que hay que elegir en playit.gg. */
  tunnelType: string
}

export const PROTOCOL_LABELS: Record<PortProtocol, string> = {
  tcp: 'TCP',
  udp: 'UDP',
  'tcp+udp': 'TCP y UDP'
}

/** Puertos que hay que abrir en el router (o tunelizar) para este servidor. */
export function serverPorts(manifest: InstanceManifest): ServerPort[] {
  switch (manifest.game) {
    case 'minecraft':
      return [{ port: manifest.port, protocol: 'tcp', label: 'Juego', tunnelType: 'Minecraft Java' }]
    case 'satisfactory':
      // El de juego lleva las dos cosas: por UDP se juega y por TCP va la API
      // con la que la propia app configura el servidor. El de mensajería no
      // sigue al del juego: es siempre el 8888 (comprobado en la fase 2).
      return [
        { port: manifest.port, protocol: 'tcp+udp', label: 'Juego', tunnelType: 'UDP y TCP' },
        { port: RELIABLE_PORT, protocol: 'tcp', label: 'Mensajería del juego', tunnelType: 'TCP' }
      ]
    case 'factorio':
      // Uno solo, y por UDP. El de RCON no se lista a propósito: la app lo abre
      // solo en 127.0.0.1 para poder parar y moderar el servidor, y abrirlo
      // fuera del equipo sería dar la consola remota a quien pase por ahí.
      return [{ port: manifest.port, protocol: 'udp', label: 'Juego', tunnelType: 'UDP' }]
    case 'zomboid':
      // Medido con netstat: **sin Steam el servidor abre solo el de juego**. El
      // segundo (`UDPPort`) está en su configuración y en todas las guías, pero
      // solo llega a usarse con Steam encendido, así que solo entonces se pide
      // abrirlo. El de RCON no se lista nunca: es la consola de la app.
      return manifest.data.useSteam
        ? [
            { port: manifest.port, protocol: 'udp', label: 'Juego', tunnelType: 'UDP' },
            {
              port: udpPortFor(manifest.port),
              protocol: 'udp',
              label: 'Datos de jugador',
              tunnelType: 'UDP'
            }
          ]
        : [{ port: manifest.port, protocol: 'udp', label: 'Juego', tunnelType: 'UDP' }]
    case 'valheim':
      // Todo por UDP, y el de consulta es siempre el siguiente al de juego.
      // Con crossplay no hace falta abrir ninguno, pero se siguen listando:
      // son los que el servidor usa, y quien elija abrir el router los necesita.
      return [
        { port: manifest.port, protocol: 'udp', label: 'Juego', tunnelType: 'UDP' },
        {
          port: queryPortFor(manifest.port),
          protocol: 'udp',
          label: 'Consulta de Steam',
          tunnelType: 'UDP'
        }
      ]
  }
}

/** Todos los juegos disponibles, en el orden en que se ofrecen. */
export const GAME_IDS = Object.keys(GAMES) as GameId[]

/**
 * Condiciones que exige un juego. Vacío si el juego no está en el catálogo
 * compartido (p. ej. el juego falso de las pruebas, que solo existe en el núcleo).
 */
export function requiredAgreements(id: GameId | string): AgreementInfo[] {
  return (GAMES as Record<string, GameInfo | undefined>)[id]?.agreements ?? []
}

export function gameInfo(id: GameId): GameInfo {
  const info = GAMES[id]
  if (!info) throw new Error(`Juego desconocido: ${id}`)
  return info
}

/**
 * Capacidades de un servidor concreto. Dependen del manifiesto y no solo del
 * juego: en Minecraft, Vanilla no admite plugins pero Paper sí.
 */
export function capabilitiesFor(manifest: InstanceManifest): GameCapabilities {
  switch (manifest.game) {
    case 'minecraft': {
      const kind = contentKindFor(manifest.data.distribution)
      const custom = manifest.data.custom
      return {
        worlds: true,
        content: kind !== null,
        officialPlugins: kind === 'plugins',
        // En uno a medida, solo si la memoria no la fija su propio script.
        memory: custom ? custom.memory !== 'script' : true,
        settings: true,
        // Reinstalar uno a medida solo sirve para terminar de traerlo si se
        // quedó a medias; una vez traído no hay nada que la app sepa instalar.
        reinstall: custom ? custom.importFrom !== undefined : true,
        versions: !custom,
        commands: true,
        playerIds: true,
        playerNames: true,
        moderation: true,
        externalCheck: true,
        crossplay: false
      }
    }
    case 'satisfactory':
      // Las partidas tienen su propia pestaña (la aporta el juego), no son
      // «mundos» del núcleo. Y el servidor no lee órdenes por la consola: todo
      // lo que se puede mandar va por su API.
      return {
        worlds: false,
        content: false,
        officialPlugins: false,
        memory: false,
        settings: true,
        reinstall: true,
        versions: true,
        commands: false,
        playerIds: false,
        playerNames: false,
        moderation: false,
        externalCheck: false,
        crossplay: false
      }
    case 'factorio':
      // Las partidas y la moderación las aporta el juego con sus pestañas. Lo
      // que lo distingue de Valheim: aquí el registro SÍ dice el nombre de
      // quien entra y de quien habla ([JOIN] / [CHAT] / [LEAVE], comprobado con
      // un cliente real), y hay consola de comandos, aunque por dentro no sea
      // una consola sino RCON: el ejecutable no lee la entrada estándar.
      return {
        worlds: false,
        content: true,
        officialPlugins: false,
        memory: false,
        settings: true,
        reinstall: true,
        versions: true,
        commands: true,
        playerIds: true,
        playerNames: true,
        moderation: true,
        // No hay nadie fuera que sepa hablar el protocolo de Factorio salvo su
        // propia lista pública, y salir en ella exige publicar la IP del
        // usuario. Sin eso, un botón de «comprobar desde internet» mentiría.
        externalCheck: false,
        crossplay: false
      }
    case 'zomboid':
      // El más parecido a Minecraft: consola de verdad (la lee por su entrada
      // estándar), RCON, nombres de jugador, moderación completa y mods del
      // taller de Steam. Lo único que no tiene son mundos intercambiables.
      return {
        worlds: false,
        content: true,
        officialPlugins: false,
        memory: true,
        settings: true,
        reinstall: true,
        versions: true,
        commands: true,
        playerIds: true,
        playerNames: true,
        moderation: true,
        // Sin Steam el servidor no contesta a nadie de fuera, y con Steam la
        // única comprobación honesta exigiría publicar la IP del usuario.
        externalCheck: false,
        crossplay: false
      }
    case 'valheim':
      // Los mundos y la moderación los aporta el juego con sus propias pestañas
      // (las listas son ficheros de texto, no comandos). El servidor no lee
      // órdenes por la consola y solo dice el SteamID de quien entra, no su
      // nombre, así que ni `commands` ni `playerNames`.
      return {
        worlds: false,
        content: false,
        officialPlugins: false,
        memory: false,
        settings: true,
        reinstall: true,
        versions: true,
        commands: false,
        // El registro dice QUIÉN entra, pero con su identificador de Steam, no
        // con el nombre de su personaje. Se puede listar y moderar; lo que hay
        // que explicar es qué es ese número.
        playerIds: true,
        playerNames: false,
        moderation: true,
        externalCheck: true,
        crossplay: true
      }
  }
}

/** «Minecraft 26.2»: la versión que tienen que usar los jugadores para entrar. */
export function versionLabel(manifest: InstanceManifest): string {
  switch (manifest.game) {
    case 'minecraft':
      return `Minecraft ${manifest.data.minecraftVersion}`
    case 'satisfactory':
      // El servidor siempre está en la última versión publicada en Steam, así
      // que lo que importa no es cuál es, sino tener el juego al día.
      return manifest.data.gameVersion
        ? `Satisfactory ${manifest.data.gameVersion}`
        : 'Satisfactory'
    case 'valheim':
      return manifest.data.gameVersion ? `Valheim ${manifest.data.gameVersion}` : 'Valheim'
    case 'zomboid':
      return manifest.data.gameVersion
        ? `Project Zomboid ${manifest.data.gameVersion}`
        : 'Project Zomboid'
    case 'factorio':
      // En Factorio la versión no es un detalle: el cliente tiene que ir en la
      // misma, así que se enseña siempre que se sepa.
      return manifest.data.gameVersion ? `Factorio ${manifest.data.gameVersion}` : 'Factorio'
  }
}

/** Una línea corta para la lista de servidores: «Plugins (Bukkit/Spigot) · 26.2». */
export function summaryLabel(manifest: InstanceManifest): string {
  switch (manifest.game) {
    case 'minecraft': {
      const { data } = manifest
      const base = `${DISTRIBUTION_LABELS[data.distribution].name} · ${data.minecraftVersion}`
      return data.custom ? `${base} · a medida` : base
    }
    case 'satisfactory':
      return `Satisfactory · ${manifest.data.sessionName}`
    case 'valheim':
      return `Valheim · ${manifest.data.worldName}`
    case 'zomboid':
      return `Project Zomboid · ${zomboidPresetInfo(manifest.data.preset).name}`
    case 'factorio':
      return manifest.data.spaceAge
        ? `Factorio · ${manifest.data.saveName} · Space Age`
        : `Factorio · ${manifest.data.saveName}`
  }
}

/** Puerto que propone el asistente para un juego cuando el usuario no elige. */
export function defaultPortFor(game: GameId): number {
  switch (game) {
    case 'minecraft':
      return 25565
    case 'satisfactory':
      return DEFAULT_GAME_PORT
    case 'valheim':
      return VALHEIM_DEFAULT_PORT
    case 'factorio':
      return FACTORIO_DEFAULT_PORT
    case 'zomboid':
      return ZOMBOID_DEFAULT_PORT
  }
}
