import { GAME_IDS } from '@shared/games'
import type { GameId, LogLevel, ServerStatus } from '@shared/types'
import type { JournalEntry, JournalModeration } from '@shared/journal'
import {
  LEVEL2_COMMANDS,
  cleanServerList,
  isConsoleLevel,
  type RemoteConsoleLine,
  type RemoteConsoleResult,
  type RemoteJournalResult,
  type RemoteListResult,
  type RemoteServerSummary
} from '@shared/remote'

/**
 * Lo que contesta otro QubiQ, comprobado antes de pasarlo a la interfaz.
 *
 * El anfitrión es de confianza a medias: lo ha emparejado el usuario, pero
 * puede ser una versión más nueva (con un juego que esta no conoce) o estar
 * roto. Lo que no encaja se descarta campo a campo, en vez de dejar que una
 * respuesta rara tumbe la pantalla. Los textos solo se recortan: React ya
 * los pinta como texto, nunca como HTML.
 */

const STATUSES: readonly ServerStatus[] = ['stopped', 'installing', 'starting', 'running', 'stopping', 'crashed']
const LEVELS: readonly LogLevel[] = ['info', 'warn', 'error', 'chat', 'system']
const MAX_TEXT = 2_000

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown, max = 200): string | null {
  return typeof value === 'string' ? value.slice(0, max) : null
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function strings(value: unknown, max = 500): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, max).map((v) => v.slice(0, 200)) : []
}

function isGame(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as string[]).includes(value)
}

/**
 * `list`. Null si no se parece a una lista. Un servidor de un juego que esta
 * versión no conoce se salta: no habría icono ni nombre con que pintarlo.
 */
export function cleanList(value: unknown): RemoteListResult | null {
  const data = record(value)
  const permissions = record(data?.['permissions'])
  if (!data || !permissions || !Array.isArray(data['servers'])) return null

  const servers: RemoteServerSummary[] = []
  for (const item of data['servers'].slice(0, 500)) {
    const server = record(item)
    const id = text(server?.['id'], 100)
    const name = text(server?.['name'])
    const status = server?.['status']
    if (!server || !id || name === null || !isGame(server['game'])) continue
    if (!STATUSES.includes(status as ServerStatus)) continue
    servers.push({
      id,
      name,
      game: server['game'],
      status: status as ServerStatus,
      players: strings(server['players']),
      playerCount: count(server['playerCount']),
      playerIds: server['playerIds'] === true,
      playerNames: server['playerNames'] === true,
      commands: server['commands'] === true,
      moderation: server['moderation'] === true
    })
  }

  const allowed = record(data['allowedCommands'])
  const allowedCommands: RemoteListResult['allowedCommands'] = {}
  for (const game of GAME_IDS) {
    const list = allowed ? strings(allowed[game], 50) : (LEVEL2_COMMANDS[game] ?? [])
    if (list.length > 0) allowedCommands[game] = list
  }

  return {
    host: text(data['host'], 100) ?? '',
    device: text(data['device'], 100) ?? '',
    permissions: {
      control: permissions['control'] === true,
      console: isConsoleLevel(permissions['console']) ? permissions['console'] : 1,
      servers: cleanServerList(permissions['servers'])
    },
    allowedCommands,
    servers
  }
}

export function cleanConsole(value: unknown): RemoteConsoleResult | null {
  const data = record(value)
  const next = count(data?.['next'])
  if (!data || next === null || !Array.isArray(data['lines'])) return null
  const lines: RemoteConsoleLine[] = []
  for (const item of data['lines'].slice(0, 1_000)) {
    const line = record(item)
    const seq = count(line?.['seq'])
    const ts = count(line?.['ts'])
    const body = text(line?.['text'], MAX_TEXT)
    if (!line || seq === null || ts === null || body === null) continue
    const level = LEVELS.includes(line['level'] as LogLevel) ? (line['level'] as LogLevel) : 'info'
    lines.push({ seq, ts, level, text: body })
  }
  return { lines, next }
}

const MODERATIONS: readonly JournalModeration[] = [
  'kick',
  'ban',
  'unban',
  'admin',
  'unadmin',
  'whitelist',
  'unwhitelist',
  'role'
]

/** Una entrada del historial con los campos que pinta `JournalList`, o null. */
function cleanEntry(value: unknown): JournalEntry | null {
  const entry = record(value)
  const ts = count(entry?.['ts'])
  if (!entry || ts === null) return null
  const by = text(entry['by'], 100) ?? undefined
  switch (entry['kind']) {
    case 'join':
    case 'leave': {
      const player = text(entry['player']) ?? undefined
      return { ts, kind: entry['kind'], online: count(entry['online']) ?? 0, ...(player !== undefined ? { player } : {}) }
    }
    case 'save':
      return { ts, kind: 'save' }
    case 'backup':
      return { ts, kind: 'backup', automatic: entry['automatic'] === true }
    case 'restore':
      return { ts, kind: 'restore', file: text(entry['file']) ?? '' }
    case 'moderation': {
      const player = text(entry['player'])
      if (player === null || !MODERATIONS.includes(entry['action'] as JournalModeration)) return null
      const role = text(entry['role'], 100) ?? undefined
      const reason = text(entry['reason'], MAX_TEXT) ?? undefined
      return {
        ts,
        kind: 'moderation',
        action: entry['action'] as JournalModeration,
        player,
        ...(role !== undefined ? { role } : {}),
        ...(by !== undefined ? { by } : {}),
        ...(reason !== undefined ? { reason } : {})
      }
    }
    case 'command': {
      const command = text(entry['command'], MAX_TEXT)
      if (command === null) return null
      return { ts, kind: 'command', command, ...(by !== undefined ? { by } : {}) }
    }
    case 'start':
    case 'stop':
      return { ts, kind: entry['kind'], ...(by !== undefined ? { by } : {}) }
    case 'crash':
      return { ts, kind: 'crash', code: typeof entry['code'] === 'number' ? entry['code'] : null }
    default:
      // Una clase de entrada de una versión más nueva: se salta.
      return null
  }
}

export function cleanJournal(value: unknown): RemoteJournalResult | null {
  const data = record(value)
  if (!data || !Array.isArray(data['entries'])) return null
  const entries = data['entries']
    .slice(0, 1_000)
    .map(cleanEntry)
    .filter((entry): entry is JournalEntry => entry !== null)
  return { entries }
}
