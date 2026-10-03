/**
 * Historial de un servidor: lo que ha pasado en él, apuntado para poder mirarlo
 * después (quién entró y cuándo, cuándo guardó, a quién se echó, qué se mandó
 * por la consola).
 *
 * No es la consola. La consola es el registro del juego tal cual, se pierde al
 * cerrar la app y está lleno de ruido; esto son los hechos que importan, uno
 * por línea, y queda en disco (`instances/<id>/journal.jsonl`).
 *
 * Cada entrada lleva datos, no frases: la interfaz las monta en el idioma del
 * momento (README, «Idiomas»). Por eso no hay textos en español aquí.
 */

/** Qué se le ha hecho a alguien. */
export type JournalModeration =
  | 'kick'
  | 'ban'
  | 'unban'
  | 'admin'
  | 'unadmin'
  | 'whitelist'
  | 'unwhitelist'
  /** Otro nivel de acceso (Zomboid: moderador, observador…); va en `role`. */
  | 'role'

/**
 * Qué moderación es entrar en una lista o salir de ella, en los juegos que
 * moderan con listas (Valheim, Factorio).
 */
export function listModeration(list: 'admin' | 'banned' | 'permitted', added: boolean): JournalModeration {
  switch (list) {
    case 'admin':
      return added ? 'admin' : 'unadmin'
    case 'banned':
      return added ? 'ban' : 'unban'
    case 'permitted':
      return added ? 'whitelist' : 'unwhitelist'
  }
}

export type JournalEntry = { ts: number } & (
  | {
      /**
       * Alguien entra o sale. `player` falta en los juegos que solo dicen
       * cuántos hay (Satisfactory); `online` es cuántos quedan dentro después.
       */
      kind: 'join' | 'leave'
      player?: string
      online: number
    }
  /** El juego ha guardado la partida (automático, pedido o al cerrar). */
  | { kind: 'save' }
  /** Copia de seguridad hecha por la app. */
  | { kind: 'backup'; automatic: boolean }
  /** Se ha restaurado una copia. */
  | { kind: 'restore'; file: string }
  | {
      kind: 'moderation'
      action: JournalModeration
      player: string
      /** El nivel de acceso nuevo, cuando `action` es `role`. */
      role?: string
      /** Quién lo hizo, si no fue desde la app (un administrador dentro del juego). */
      by?: string
      reason?: string
    }
  | {
      /** Una orden escrita en la consola. */
      kind: 'command'
      command: string
      /** El dispositivo del control remoto que la mandó; sin él, desde esta app. */
      by?: string
    }
  /** Arranque y parada pedidos. `by` como en `command`. */
  | { kind: 'start' | 'stop'; by?: string }
  /** El servidor se ha cerrado solo. */
  | { kind: 'crash'; code: number | null }
)

/** Lo que se apunta: la hora la pone quien lo guarda. */
export type JournalInput = WithoutTs<JournalEntry>

/** `Omit` caso a caso: sobre la unión entera se quedaría solo con lo común. */
type WithoutTs<T> = T extends unknown ? Omit<T, 'ts'> : never

export type JournalKind = JournalEntry['kind']

/** Los grupos por los que se filtra en la pantalla. */
export type JournalFilter = 'all' | 'players' | 'saves' | 'moderation' | 'commands' | 'server'

export const JOURNAL_FILTERS: readonly JournalFilter[] = [
  'all',
  'players',
  'saves',
  'moderation',
  'commands',
  'server'
]

export function journalFilterOf(kind: JournalKind): Exclude<JournalFilter, 'all'> {
  switch (kind) {
    case 'join':
    case 'leave':
      return 'players'
    case 'save':
    case 'backup':
    case 'restore':
      return 'saves'
    case 'moderation':
      return 'moderation'
    case 'command':
      return 'commands'
    case 'start':
    case 'stop':
    case 'crash':
      return 'server'
  }
}

/** Cuántas entradas se piden de una vez para la pantalla. */
export const JOURNAL_PAGE = 1000
