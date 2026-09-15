import type { AgreementId, GameId, InstanceManifest } from '../types'
import { DISTRIBUTION_LABELS, contentKindFor } from './minecraft/types'

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
}

export interface AgreementInfo {
  id: AgreementId
  /** Cómo se nombra en una frase: «Hay que aceptar {label}». */
  label: string
  url: string
}

export interface GameInfo {
  id: GameId
  name: string
  agreements: AgreementInfo[]
  /** Aviso de producto no oficial, exigido por las normas de marca de cada juego. */
  disclaimer: string
  /** Dónde se pone la dirección dentro del juego, dicho en una frase. */
  joinHint: string
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
  }
}

/** «Servidores de Minecraft» mientras sea el único juego; genérico después. */
export function appSubtitle(): string {
  return GAME_IDS.length === 1
    ? `Servidores de ${GAMES[GAME_IDS[0]].name}, sin complicaciones`
    : 'Servidores de juegos, sin complicaciones'
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
        commands: true
      }
    }
  }
}

/** «Minecraft 26.2»: la versión que tienen que usar los jugadores para entrar. */
export function versionLabel(manifest: InstanceManifest): string {
  switch (manifest.game) {
    case 'minecraft':
      return `Minecraft ${manifest.data.minecraftVersion}`
  }
}

/** Una línea corta para la lista de servidores: «Plugins (Bukkit/Spigot) · 26.2». */
export function summaryLabel(manifest: InstanceManifest): string {
  switch (manifest.game) {
    case 'minecraft':
      return `${DISTRIBUTION_LABELS[manifest.data.distribution].name} · ${manifest.data.minecraftVersion}`
  }
}
