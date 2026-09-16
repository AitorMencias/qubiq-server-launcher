import type { AgreementId, GameId, InstanceManifest } from '../types'
import { DISTRIBUTION_LABELS, contentKindFor } from './minecraft/types'
import {
  DEFAULT_GAME_PORT,
  MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB,
  RELIABLE_PORT
} from './satisfactory/types'

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
  /** Consola con entrada de comandos. */
  commands: boolean
  /**
   * El juego dice QUIÉN está conectado, no solo cuántos. Satisfactory solo da
   * el número, así que su pantalla de jugadores cuenta en vez de listar.
   */
  playerNames: boolean
  /** Expulsar, banear o dar permisos desde la app. */
  moderation: boolean
  /**
   * Se puede comprobar desde internet si se llega al servidor. Hace falta un
   * servicio de fuera que hable el protocolo del juego; Minecraft lo tiene y
   * Satisfactory no, y decirlo vale más que un botón que no prueba nada.
   */
  externalCheck: boolean
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
      'Se guardan las partidas y los ajustes del servidor. El juego no hace falta: se vuelve a descargar de Steam.'
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
      return {
        worlds: true,
        content: kind !== null,
        officialPlugins: kind === 'plugins',
        memory: true,
        settings: true,
        reinstall: true,
        commands: true,
        playerNames: true,
        moderation: true,
        externalCheck: true
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
        commands: false,
        playerNames: false,
        moderation: false,
        externalCheck: false
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
  }
}

/** Una línea corta para la lista de servidores: «Plugins (Bukkit/Spigot) · 26.2». */
export function summaryLabel(manifest: InstanceManifest): string {
  switch (manifest.game) {
    case 'minecraft':
      return `${DISTRIBUTION_LABELS[manifest.data.distribution].name} · ${manifest.data.minecraftVersion}`
    case 'satisfactory':
      return `Satisfactory · ${manifest.data.sessionName}`
  }
}

/** Puerto que propone el asistente para un juego cuando el usuario no elige. */
export function defaultPortFor(game: GameId): number {
  switch (game) {
    case 'minecraft':
      return 25565
    case 'satisfactory':
      return DEFAULT_GAME_PORT
  }
}
