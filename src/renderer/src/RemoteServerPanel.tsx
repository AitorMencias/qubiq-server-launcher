import { useCallback, useEffect, useRef, useState } from 'react'
import {
  REMOTE_JOURNAL_PAGE,
  type RemoteConsoleLine,
  type RemoteConsoleResult,
  type RemoteJournalResult,
  type RemoteLink,
  type RemoteServerSummary
} from '@shared/remote'
import type { JournalEntry } from '@shared/journal'
import type { MessageKey } from '@shared/i18n'
import { gameInfo } from '@shared/games'
import { GameIcon } from './GameIcon'
import { JournalList } from './JournalList'
import { linkErrorText, linkReachable, usePolling } from './RemoteLinkParts'
import { formatDate, formatList, t } from './i18n'

/**
 * Un servidor de otro QubiQ. Es la pantalla de un servidor reducida a las
 * órdenes: arrancar, parar y reiniciar (si el otro equipo lo permite), los
 * jugadores, la consola (con lo que deje escribir su nivel) y el historial.
 * Sin configuración, copias ni moderación: no son órdenes.
 *
 * Sin conexión con su equipo se dice así, y no «caído»: el servidor puede
 * seguir en marcha perfectamente.
 */

const CONSOLE_EVERY_MS = 1_500
const CONSOLE_KEEP = 1_000
const JOURNAL_EVERY_MS = 5_000

type Tab = 'players' | 'console' | 'journal'

interface Props {
  link: RemoteLink
  server: RemoteServerSummary
}

export function RemoteServerPanel({ link, server }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('console')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<'stop' | 'restart' | null>(null)
  const [working, setWorking] = useState(false)
  const reachable = linkReachable(link)
  const permissions = link.list?.permissions
  const canControl = permissions?.control ?? false
  const status = reachable ? server.status : null
  const running = status === 'running' || status === 'starting'
  const busy = status === 'installing' || status === 'stopping'

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  async function control(kind: 'start' | 'stop' | 'restart'): Promise<void> {
    setPending(null)
    setError(null)
    setWorking(true)
    const result = await window.qubiq.remoteLinks.order(link.id, kind, { server: server.id })
    setWorking(false)
    if (result.ok) setNotice(t('remote.web.sent'))
    else setError(linkErrorText(result.error, result.detail))
  }

  const total = !reachable || server.status !== 'running' ? null : server.playerIds ? server.players.length : server.playerCount

  return (
    <>
      <div className="topbar">
        <GameIcon game={server.game} size={24} />
        <h2>{server.name}</h2>
        <span className="badge muted">{t('link.server.on', { host: link.host })}</span>
        <span className="status">
          <span className={`dot ${status ?? 'unknown'}`} />
          {status ? t(`status.${status}` as MessageKey) : t('link.statusUnknown')}
        </span>
      </div>

      <div className="link-server-head">
        {!reachable && (
          <div className="alert warn">
            <p>{t('link.offline.text', { host: link.host })}</p>
            {link.lastContact && <p>{t('link.lastContact', { date: formatDate(link.lastContact) })}</p>}
          </div>
        )}
        {error && (
          <div className="alert error">
            <strong>{t('panel.actionFailed')}</strong>
            <p>{error}</p>
          </div>
        )}
        {notice && <p className="hint">{notice}</p>}

        {canControl ? (
          pending ? (
            <div className="row">
              <span className="grow">
                {pending === 'stop'
                  ? t('remote.web.confirmStop', { name: server.name })
                  : t('remote.web.confirmRestart', { name: server.name })}
              </span>
              <button onClick={() => setPending(null)}>{t('common.cancel')}</button>
              <button className="danger" onClick={() => void control(pending)}>
                {t('remote.web.confirm')}
              </button>
            </div>
          ) : (
            <div className="row">
              {!running && (
                <button className="primary" disabled={!reachable || busy || working} onClick={() => void control('start')}>
                  {t('remote.order.start')}
                </button>
              )}
              {running && (
                <button disabled={!reachable || working} onClick={() => setPending('stop')}>
                  {t('remote.order.stop')}
                </button>
              )}
              {running && (
                <button disabled={!reachable || working} onClick={() => setPending('restart')}>
                  {t('remote.order.restart')}
                </button>
              )}
              <span className="hint grow">{gameInfo(server.game).name}</span>
            </div>
          )
        ) : (
          permissions && <p className="hint">{t('link.server.noControl', { host: link.host })}</p>
        )}
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')}>
          {t('panel.tab.players')} {total ? `(${total})` : ''}
        </button>
        <button className={`tab ${tab === 'console' ? 'active' : ''}`} onClick={() => setTab('console')}>
          {t('panel.tab.console')}
        </button>
        <button className={`tab ${tab === 'journal' ? 'active' : ''}`} onClick={() => setTab('journal')}>
          {t('panel.tab.journal')}
        </button>
      </div>

      {tab === 'players' && <PlayersTab server={server} reachable={reachable} total={total} />}
      {/* Escondida y no desmontada: al volver conserva lo leído. */}
      <RemoteConsole link={link} server={server} hidden={tab !== 'console'} reachable={reachable} />
      {tab === 'journal' && <JournalTab link={link} server={server} reachable={reachable} />}
    </>
  )
}

function PlayersTab({
  server,
  reachable,
  total
}: {
  server: RemoteServerSummary
  reachable: boolean
  total: number | null
}): React.JSX.Element {
  return (
    <div className="panel">
      {!reachable ? (
        <p className="hint">{t('link.statusUnknown')}</p>
      ) : server.status !== 'running' ? (
        <p className="hint">{t('remote.web.playersStopped')}</p>
      ) : !total ? (
        <p className="hint">{t('remote.web.playersNone')}</p>
      ) : !server.playerIds ? (
        <p className="hint">
          {t('remote.web.players', { count: total })}. {t('remote.web.playersCountOnly')}
        </p>
      ) : (
        <>
          <div className="player-list">
            {server.players.map((player) => (
              <div key={player} className="player">
                <span className={`pname ${server.playerNames ? '' : 'mono'}`}>{player}</span>
              </div>
            ))}
          </div>
          {!server.playerNames && <p className="hint">{t('remote.web.playersIds')}</p>}
        </>
      )}
    </div>
  )
}

function RemoteConsole({
  link,
  server,
  hidden,
  reachable
}: {
  link: RemoteLink
  server: RemoteServerSummary
  hidden: boolean
  reachable: boolean
}): React.JSX.Element {
  const [lines, setLines] = useState<RemoteConsoleLine[]>([])
  const [command, setCommand] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const fetchLines = useCallback(async () => {
    const result = await window.qubiq.remoteLinks.order<RemoteConsoleResult>(link.id, 'console', {
      server: server.id,
      after: next.current
    })
    if (!result.ok) return
    // El contador del otro equipo vuelve a cero si se reabre su app.
    const restarted = result.data.next < next.current
    next.current = result.data.next
    if (result.data.lines.length > 0 || restarted) {
      setLines((old) => (restarted ? result.data.lines : [...old, ...result.data.lines]).slice(-CONSOLE_KEEP))
    }
  }, [link.id, server.id])

  // Sin conexión no se insiste aquí: ya lo hace la lista, y cuando vuelva se sigue.
  usePolling(fetchLines, CONSOLE_EVERY_MS, reachable || link.state === 'connecting')

  useEffect(() => {
    const element = box.current
    if (element && stick.current) element.scrollTop = element.scrollHeight
  }, [lines, hidden])

  const level = link.list?.permissions.console ?? 1
  const allowed = link.list?.allowedCommands[server.game] ?? []
  const canType = server.commands && level >= 2
  const running = reachable && (server.status === 'running' || server.status === 'starting')

  async function send(): Promise<void> {
    const text = command.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    const result = await window.qubiq.remoteLinks.order(link.id, 'send', { server: server.id, command: text })
    setSending(false)
    if (!result.ok) return setError(linkErrorText(result.error, result.detail))
    setCommand('')
    void fetchLines()
  }

  if (hidden) return <div hidden />

  return (
    <>
      <div
        className="console"
        ref={box}
        onScroll={(e) => {
          const element = e.currentTarget
          stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
        }}
      >
        {lines.length === 0 && <div style={{ color: 'var(--muted)' }}>{t('remote.web.consoleEmpty')}</div>}
        {lines.map((line) => (
          <div key={line.seq} className={`line ${line.level}`}>
            {line.text}
          </div>
        ))}
      </div>
      <div className="console-input">
        {!server.commands ? (
          <span className="hint">{t('remote.web.noCommands')}</span>
        ) : !canType ? (
          <span className="hint">{t('remote.web.consoleReadOnly')}</span>
        ) : (
          <>
            <input
              className="grow"
              maxLength={500}
              spellCheck={false}
              placeholder={running ? t('console.placeholder') : t('players.notRunning')}
              title={level === 2 ? t('remote.web.consoleAllowed', { commands: formatList(allowed) }) : undefined}
              disabled={!running || sending}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send()
              }}
            />
            <button disabled={!running || sending || command.trim().length === 0} onClick={() => void send()}>
              {t('console.send')}
            </button>
          </>
        )}
      </div>
      {canType && (level === 2 || error) && (
        <div className="link-console-note">
          {error ? (
            <span className="error-text">{error}</span>
          ) : (
            <span className="hint">{t('remote.web.consoleAllowed', { commands: allowed.join(', ') })}</span>
          )}
        </div>
      )}
    </>
  )
}

function JournalTab({
  link,
  server,
  reachable
}: {
  link: RemoteLink
  server: RemoteServerSummary
  reachable: boolean
}): React.JSX.Element {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  const fetchEntries = useCallback(async () => {
    const result = await window.qubiq.remoteLinks.order<RemoteJournalResult>(link.id, 'journal', { server: server.id })
    if (result.ok) {
      loaded.current = true
      setEntries(result.data.entries)
      setError(null)
    } else if (!loaded.current) {
      // Con algo ya en pantalla se deja: el aviso de arriba ya dice si no contesta.
      setEntries([])
      setError(linkErrorText(result.error, result.detail))
    }
  }, [link.id, server.id])

  usePolling(fetchEntries, JOURNAL_EVERY_MS, reachable || !loaded.current)

  return (
    <div className="panel">
      <JournalList
        entries={entries}
        error={error}
        commands={server.commands}
        moderation={server.moderation}
        limit={REMOTE_JOURNAL_PAGE}
      />
    </div>
  )
}
