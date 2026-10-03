import { useMemo, useState } from 'react'
import { JOURNAL_FILTERS, journalFilterOf, type JournalEntry, type JournalFilter } from '@shared/journal'
import { Rich, formatDateOnly, formatNumber, formatTime, t } from './i18n'

/**
 * El historial de un servidor pintado: filtros, buscador y entradas por días.
 *
 * No sabe de dónde salen las entradas. Lo usan la pestaña de la app
 * (`JournalPanel`, por IPC) y la página remota (por la orden `journal`), así
 * que aquí no puede haber nada de `window.qubiq` ni de las piezas de cada
 * juego: lo que cambia (los filtros que tienen sentido, cómo se enseña un
 * jugador) llega por props.
 */

interface Props {
  /** null mientras se cargan. */
  entries: JournalEntry[] | null
  error?: string | null
  /** El juego tiene consola: si no, sobra el filtro de órdenes. */
  commands: boolean
  /** El juego deja moderar: si no, sobra el filtro de moderación. */
  moderation: boolean
  /** Cómo se enseña un jugador («Steam 7656…» en Valheim). */
  playerLabel?: (player: string) => string
  /** Cuántas entradas se piden como mucho, para avisar de que hay más. */
  limit: number
}

export function JournalList({
  entries,
  error,
  commands,
  moderation,
  playerLabel,
  limit
}: Props): React.JSX.Element {
  const [filter, setFilter] = useState<JournalFilter>('all')
  const [search, setSearch] = useState('')

  const filters = JOURNAL_FILTERS.filter(
    (f) => (f !== 'commands' || commands) && (f !== 'moderation' || moderation)
  )
  const player = (name: string): string => playerLabel?.(name) ?? name

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (entries ?? []).filter((entry) => {
      if (filter !== 'all' && journalFilterOf(entry.kind) !== filter) return false
      if (needle.length === 0) return true
      return searchableText(entry).toLowerCase().includes(needle)
    })
  }, [entries, filter, search])

  const days = groupByDay(visible)

  return (
    <>
      <div className="journal-tools">
        <div className="chips">
          {filters.map((f) => (
            <button
              key={f}
              className={`chip journal-filter ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`journal.filter.${f}`)}
            </button>
          ))}
        </div>
        <input
          className="journal-search"
          placeholder={t('journal.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="alert error">
          <strong>{t('journal.loadFailed')}</strong>
          <p>{error}</p>
        </div>
      )}

      {entries === null && !error && <p className="hint">{t('journal.loading')}</p>}

      {entries !== null && entries.length === 0 && !error && (
        <div className="alert info">
          <strong>{t('journal.empty')}</strong>
          <p>{t('journal.emptyHint')}</p>
        </div>
      )}

      {entries !== null && entries.length > 0 && visible.length === 0 && (
        <p className="hint">{t('journal.noMatches')}</p>
      )}

      {days.map((day) => (
        <div className="journal-day" key={day.key}>
          <h4>{dayLabel(day.ts)}</h4>
          {day.entries.map((entry, index) => (
            <div
              className={`journal-entry ${journalFilterOf(entry.kind)} ${tone(entry)}`}
              key={`${entry.ts}-${index}`}
            >
              <span className="journal-time">{formatTime(entry.ts, { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="journal-text">
                <EntryText entry={entry} player={player} />
              </span>
            </div>
          ))}
        </div>
      ))}

      {entries !== null && entries.length >= limit && (
        <p className="hint">{t('journal.limit', { count: formatNumber(limit) })}</p>
      )}
    </>
  )
}

function EntryText({
  entry,
  player
}: {
  entry: JournalEntry
  player: (name: string) => string
}): React.JSX.Element {
  switch (entry.kind) {
    case 'join':
    case 'leave': {
      const online = entry.online === 0 ? t('journal.online.none') : t('journal.online', { count: entry.online })
      const text = entry.player
        ? t(`journal.${entry.kind}`, { player: player(entry.player) })
        : t(`journal.${entry.kind}.someone`)
      return (
        <>
          {text} <span className="journal-extra">· {online}</span>
        </>
      )
    }
    case 'save':
      return <>{t('journal.save')}</>
    case 'backup':
      return <>{entry.automatic ? t('journal.backup.auto') : t('journal.backup.manual')}</>
    case 'restore':
      return <Rich k="journal.restore" values={{ file: <code>{entry.file}</code> }} />
    case 'moderation': {
      const text =
        entry.action === 'role'
          ? t('journal.mod.role', { player: player(entry.player), role: entry.role ?? '' })
          : t(`journal.mod.${entry.action}`, { player: player(entry.player) })
      return (
        <>
          {text}
          {entry.by && <span className="journal-extra"> · {t('journal.byPlayer', { player: entry.by })}</span>}
          {entry.reason && <span className="journal-extra"> · {t('journal.reason', { reason: entry.reason })}</span>}
        </>
      )
    }
    case 'command':
      return (
        <>
          <Rich k="journal.command" values={{ command: <code>{entry.command}</code> }} />
          {entry.by && <span className="journal-extra"> · {t('journal.fromDevice', { device: entry.by })}</span>}
        </>
      )
    case 'start':
    case 'stop':
      return (
        <>
          {t(`journal.${entry.kind}`)}
          {entry.by && <span className="journal-extra"> · {t('journal.fromDevice', { device: entry.by })}</span>}
        </>
      )
    case 'crash':
      return <>{entry.code === null ? t('journal.crash') : t('journal.crashCode', { code: entry.code })}</>
  }
}

/** Color de la marca de la izquierda: lo que conviene ver de un vistazo. */
function tone(entry: JournalEntry): string {
  if (entry.kind === 'crash') return 'bad'
  if (entry.kind === 'moderation' && (entry.action === 'ban' || entry.action === 'kick')) return 'bad'
  return ''
}

/** Lo que encuentra el buscador: nombres, órdenes, motivos y dispositivos. */
function searchableText(entry: JournalEntry): string {
  switch (entry.kind) {
    case 'join':
    case 'leave':
      return entry.player ?? ''
    case 'moderation':
      return [entry.player, entry.by, entry.reason, entry.role].filter(Boolean).join(' ')
    case 'command':
      return `${entry.command} ${entry.by ?? ''}`
    case 'restore':
      return entry.file
    case 'start':
    case 'stop':
      return entry.by ?? ''
    default:
      return ''
  }
}

/** Un día del historial: la clave es la fecha local, no la UTC. */
function groupByDay(entries: JournalEntry[]): { key: string; ts: number; entries: JournalEntry[] }[] {
  const days: { key: string; ts: number; entries: JournalEntry[] }[] = []
  for (const entry of entries) {
    const date = new Date(entry.ts)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const last = days[days.length - 1]
    if (last && last.key === key) last.entries.push(entry)
    else days.push({ key, ts: entry.ts, entries: [entry] })
  }
  return days
}

function dayLabel(ts: number): string {
  const date = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (sameDay(date, today)) return t('journal.today')
  if (sameDay(date, yesterday)) return t('journal.yesterday')
  return formatDateOnly(ts, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
  })
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
