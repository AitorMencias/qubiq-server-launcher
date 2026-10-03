import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CODE_LENGTH,
  formatCode,
  normalizeCode,
  REMOTE_JOURNAL_PAGE,
  type RemoteConsoleLine,
  type RemoteConsoleResult,
  type RemoteJournalResult,
  type RemoteListResult,
  type RemoteServerSummary
} from '@shared/remote'
import type { GameId, ServerStatus } from '@shared/types'
import { gameInfo } from '@shared/games'
import { formatList, formatTime, t, type MessageKey } from '@shared/i18n'
import type { JournalEntry } from '@shared/journal'
import { RemoteFailure, order, pair } from './api'
import { JournalList } from '../JournalList'
import { cryptoAvailable, forgetDevice, loadDevice, saveDevice, storageWorks, type DeviceRecord } from './keys'
import minecraftIcon from '../games/minecraft/icon.svg'
import satisfactoryIcon from '../games/satisfactory/icon.svg'
import valheimIcon from '../games/valheim/icon.svg'
import factorioIcon from '../games/factorio/icon.svg'
import zomboidIcon from '../games/zomboid/icon.svg'
import enshroudedIcon from '../games/enshrouded/icon.svg'
import rustIcon from '../games/rust/icon.svg'

/**
 * La página remota entera: emparejar, la lista de servidores y la consola de
 * uno. Pequeña a propósito: solo hace lo que permiten las órdenes.
 */

const ICONS: Record<GameId, string> = {
  minecraft: minecraftIcon,
  satisfactory: satisfactoryIcon,
  valheim: valheimIcon,
  factorio: factorioIcon,
  zomboid: zomboidIcon,
  enshrouded: enshroudedIcon,
  rust: rustIcon
}

const LIST_EVERY_MS = 3_000
const CONSOLE_EVERY_MS = 1_500
const CONSOLE_KEEP = 1_000
/** El historial cambia poco: no hace falta pedirlo tan a menudo como la consola. */
const JOURNAL_EVERY_MS = 5_000

type Screen =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'no-storage' }
  | { kind: 'pair'; notice?: string }
  | { kind: 'main'; device: DeviceRecord }

function errorText(err: unknown): string {
  if (err instanceof RemoteFailure) {
    if (err.code === 'offline') return t('remote.web.offline')
    const text = t(`remote.error.${err.code}` as MessageKey)
    return err.detail ? `${text} ${err.detail}` : text
  }
  return err instanceof Error ? err.message : String(err)
}

export function RemoteApp(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })

  useEffect(() => {
    void (async () => {
      if (!cryptoAvailable()) return setScreen({ kind: 'unsupported' })
      if (!(await storageWorks())) return setScreen({ kind: 'no-storage' })
      const device = await loadDevice().catch(() => null)
      setScreen(device ? { kind: 'main', device } : { kind: 'pair' })
    })()
  }, [])

  const revoked = useCallback(() => {
    void forgetDevice().catch(() => undefined)
    setScreen({ kind: 'pair', notice: t('remote.web.revoked') })
  }, [])

  switch (screen.kind) {
    case 'loading':
      return <div className="r-center" />
    case 'unsupported':
      return <Message text={t('remote.web.unsupported')} />
    case 'no-storage':
      return <Message text={t('remote.web.storageFailed')} />
    case 'pair':
      return <PairScreen notice={screen.notice} onPaired={(device) => setScreen({ kind: 'main', device })} />
    case 'main':
      return (
        <Dashboard
          device={screen.device}
          onRevoked={revoked}
          onForget={async () => {
            // Primero que el equipo lo borre de su lista (`forget`); si no
            // contesta, se olvida aquí igual y allí se quita a mano.
            await order(screen.device, 'forget').catch(() => undefined)
            await forgetDevice().catch(() => undefined)
            setScreen({ kind: 'pair' })
          }}
        />
      )
  }
}

function Message({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="r-center">
      <div className="r-card">
        <h1>{t('remote.web.title')}</h1>
        <p className="r-error">{text}</p>
      </div>
    </div>
  )
}

// --- Emparejar -------------------------------------------------------------------

function PairScreen({
  notice,
  onPaired
}: {
  notice?: string
  onPaired: (device: DeviceRecord) => void
}): React.JSX.Element {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = normalizeCode(code).length === CODE_LENGTH && name.trim().length > 0

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!ready || working) return
    setWorking(true)
    setError(null)
    try {
      const device = await pair(code, name.trim())
      await saveDevice(device)
      onPaired(device)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="r-center">
      <form className="r-card" onSubmit={(e) => void submit(e)}>
        <h1>{t('remote.web.pair.title')}</h1>
        {notice && <p className="r-warn">{notice}</p>}
        <p className="r-muted">{t('remote.web.pair.hint')}</p>

        <label htmlFor="r-code">{t('remote.web.pair.code')}</label>
        <input
          id="r-code"
          className="r-code-input"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          placeholder="XXXX-XXXX"
          onChange={(e) => setCode(formatCode(e.target.value).slice(0, CODE_LENGTH + 1))}
        />

        <label htmlFor="r-name">{t('remote.web.pair.name')}</label>
        <input
          id="r-name"
          maxLength={60}
          value={name}
          placeholder={t('remote.web.pair.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />

        {error && <p className="r-error">{error}</p>}

        <button type="submit" className="r-primary" disabled={!ready || working}>
          {working ? t('remote.web.pair.working') : t('remote.web.pair.submit')}
        </button>
      </form>
    </div>
  )
}

// --- Lista de servidores ------------------------------------------------------------

type Pending = { kind: 'stop' | 'restart'; server: RemoteServerSummary } | null

function Dashboard({
  device,
  onRevoked,
  onForget
}: {
  device: DeviceRecord
  onRevoked: () => void
  onForget: () => Promise<void>
}): React.JSX.Element {
  const [list, setList] = useState<RemoteListResult | null>(null)
  const [offline, setOffline] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null)
  const [forgetting, setForgetting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setList(await order<RemoteListResult>(device, 'list'))
      setOffline(false)
    } catch (err) {
      if (err instanceof RemoteFailure && err.code === 'unknown-client') return onRevoked()
      setOffline(true)
    }
  }, [device, onRevoked])

  usePolling(refresh, LIST_EVERY_MS)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  async function control(kind: 'start' | 'stop' | 'restart', server: RemoteServerSummary): Promise<void> {
    setPending(null)
    try {
      await order(device, kind, { server: server.id })
      setToast({ text: t('remote.web.sent'), bad: false })
    } catch (err) {
      setToast({ text: errorText(err), bad: true })
    }
    void refresh()
  }

  const selected = list?.servers.find((server) => server.id === open) ?? null
  const canControl = list?.permissions.control ?? false

  return (
    <div className="r-page">
      <header className="r-header">
        {selected ? (
          <button className="r-link" onClick={() => setOpen(null)}>
            ← {t('remote.web.back')}
          </button>
        ) : (
          <strong>{t('remote.web.title')}</strong>
        )}
        <span className="r-muted r-ellipsis">
          {list ? t('remote.web.connectedTo', { host: list.host, device: list.device }) : device.host}
        </span>
      </header>

      {offline && <div className="r-banner">{t('remote.web.offline')}</div>}

      {list && !selected && (
        <main className="r-list">
          {list.servers.length === 0 && <p className="r-muted">{t('remote.web.noServers')}</p>}
          {!canControl && list.servers.length > 0 && <p className="r-muted">{t('remote.web.noControl')}</p>}
          {list.servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              canControl={canControl}
              onOpen={() => setOpen(server.id)}
              onStart={() => void control('start', server)}
              onStop={() => setPending({ kind: 'stop', server })}
              onRestart={() => setPending({ kind: 'restart', server })}
            />
          ))}
          <div className="r-footer">
            {forgetting ? (
              <div className="r-card r-confirm">
                <p>{t('remote.web.forgetConfirm')}</p>
                <div className="r-row">
                  <button onClick={() => setForgetting(false)}>{t('common.cancel')}</button>
                  <button className="r-danger" onClick={() => void onForget()}>
                    {t('remote.web.forget')}
                  </button>
                </div>
              </div>
            ) : (
              <button className="r-link" onClick={() => setForgetting(true)}>
                {t('remote.web.forget')}
              </button>
            )}
          </div>
        </main>
      )}

      {list && selected && (
        <ServerView
          device={device}
          server={selected}
          list={list}
          canControl={canControl}
          onStart={() => void control('start', selected)}
          onStop={() => setPending({ kind: 'stop', server: selected })}
          onRestart={() => setPending({ kind: 'restart', server: selected })}
          onToast={(text, bad) => setToast({ text, bad })}
        />
      )}

      {pending && (
        <div className="r-modal" role="dialog" aria-modal="true">
          <div className="r-card">
            <p>
              {pending.kind === 'stop'
                ? t('remote.web.confirmStop', { name: pending.server.name })
                : t('remote.web.confirmRestart', { name: pending.server.name })}
            </p>
            <div className="r-row">
              <button onClick={() => setPending(null)}>{t('common.cancel')}</button>
              <button className="r-danger" onClick={() => void control(pending.kind, pending.server)}>
                {t('remote.web.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`r-toast ${toast.bad ? 'bad' : ''}`}>{toast.text}</div>}
    </div>
  )
}

function statusClass(status: ServerStatus): string {
  if (status === 'running') return 'good'
  if (status === 'crashed') return 'bad'
  if (status === 'stopped') return ''
  return 'warn'
}

/** Cuántos hay conectados, o null si el servidor no está en marcha o no se sabe. */
function playerTotal(server: RemoteServerSummary): number | null {
  if (server.status !== 'running') return null
  if (server.playerIds) return server.players.length
  return server.playerCount
}

/** Resumen para la tarjeta de la lista: «3 jugadores: Steve, Alex y Notch». */
function playersText(server: RemoteServerSummary): string | null {
  const total = playerTotal(server)
  if (total === null) return null
  const count = t('remote.web.players', { count: total })
  // Los nombres solo si son nombres (no identificadores de Steam) y caben.
  if (!server.playerNames || total === 0 || total > 5) return count
  return `${count}: ${formatList(server.players)}`
}

/** La lista de jugadores de un servidor, con lo que el juego deja saber. */
function PlayersSection({ server }: { server: RemoteServerSummary }): React.JSX.Element {
  const total = playerTotal(server)
  const running = server.status === 'running'
  return (
    <section className="r-card r-players-card">
      <h2>
        {t('remote.web.playersTitle')}
        {total !== null && <span className="r-muted"> · {total}</span>}
      </h2>
      {!running ? (
        <p className="r-muted">{t('remote.web.playersStopped')}</p>
      ) : total === 0 || total === null ? (
        <p className="r-muted">{t('remote.web.playersNone')}</p>
      ) : !server.playerIds ? (
        <p className="r-muted">{t('remote.web.playersCountOnly')}</p>
      ) : (
        <>
          <ul className="r-player-list">
            {server.players.map((player) => (
              <li key={player} className={server.playerNames ? '' : 'r-mono'}>
                {player}
              </li>
            ))}
          </ul>
          {!server.playerNames && <p className="r-muted">{t('remote.web.playersIds')}</p>}
        </>
      )}
    </section>
  )
}

function ControlButtons({
  server,
  onStart,
  onStop,
  onRestart
}: {
  server: RemoteServerSummary
  onStart: () => void
  onStop: () => void
  onRestart: () => void
}): React.JSX.Element {
  const running = server.status === 'running' || server.status === 'starting'
  const busy = server.status === 'installing' || server.status === 'stopping'
  return (
    <>
      {!running && (
        <button className="r-primary" disabled={busy} onClick={onStart}>
          {t('remote.order.start')}
        </button>
      )}
      {running && <button onClick={onStop}>{t('remote.order.stop')}</button>}
      {running && <button onClick={onRestart}>{t('remote.order.restart')}</button>}
    </>
  )
}

function ServerCard({
  server,
  canControl,
  onOpen,
  onStart,
  onStop,
  onRestart
}: {
  server: RemoteServerSummary
  canControl: boolean
  onOpen: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
}): React.JSX.Element {
  const players = playersText(server)
  return (
    <section className="r-card r-server">
      <div className="r-server-head">
        <img src={ICONS[server.game]} width={36} height={36} alt="" />
        <div className="r-server-title">
          <strong className="r-ellipsis">{server.name}</strong>
          <span className="r-muted">{gameInfo(server.game).name}</span>
        </div>
        <span className={`r-chip ${statusClass(server.status)}`}>{t(`status.${server.status}` as MessageKey)}</span>
      </div>
      {players && <p className="r-players">{players}</p>}
      <div className="r-row">
        {canControl && <ControlButtons server={server} onStart={onStart} onStop={onStop} onRestart={onRestart} />}
        <button onClick={onOpen}>{t('remote.web.console')}</button>
      </div>
    </section>
  )
}

// --- Historial de un servidor ---------------------------------------------------------

/**
 * El historial del servidor (orden `journal`, solo lectura). Se pinta con el
 * mismo `JournalList` que la pestaña de la app y se vuelve a pedir cada pocos
 * segundos mientras está a la vista.
 */
function JournalSection({ device, server }: { device: DeviceRecord; server: RemoteServerSummary }): React.JSX.Element {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  const fetchEntries = useCallback(async () => {
    try {
      const result = await order<RemoteJournalResult>(device, 'journal', { server: server.id })
      loaded.current = true
      setEntries(result.entries)
      setError(null)
    } catch (err) {
      // Con algo ya en pantalla se deja como está: la lista ya enseña si el
      // equipo no responde. Solo se dice si no se ha podido leer nunca.
      if (!loaded.current) {
        setEntries([])
        setError(errorText(err))
      }
    }
  }, [device, server.id])

  usePolling(fetchEntries, JOURNAL_EVERY_MS)

  return (
    <div className="r-journal">
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

// --- Consola de un servidor -----------------------------------------------------------

function ServerView({
  device,
  server,
  list,
  canControl,
  onStart,
  onStop,
  onRestart,
  onToast
}: {
  device: DeviceRecord
  server: RemoteServerSummary
  list: RemoteListResult
  canControl: boolean
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onToast: (text: string, bad: boolean) => void
}): React.JSX.Element {
  const [lines, setLines] = useState<RemoteConsoleLine[]>([])
  const [command, setCommand] = useState('')
  const [sending, setSending] = useState(false)
  const [view, setView] = useState<'console' | 'journal'>('console')
  const next = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const fetchLines = useCallback(async () => {
    try {
      const result = await order<RemoteConsoleResult>(device, 'console', { server: server.id, after: next.current })
      // El contador del anfitrión vuelve a cero si se reabre la app: entonces
      // lo que llega es todo nuevo y lo de antes ya no encaja.
      const restarted = result.next < next.current
      next.current = result.next
      if (result.lines.length > 0 || restarted) {
        setLines((old) => (restarted ? result.lines : [...old, ...result.lines]).slice(-CONSOLE_KEEP))
      }
    } catch {
      // La lista ya enseña si el equipo no responde.
    }
  }, [device, server.id])

  // La consola se sigue pidiendo mientras se mira el historial: al volver
  // tiene que estar al día, y lo que se pide es solo lo nuevo.
  usePolling(fetchLines, CONSOLE_EVERY_MS)

  useEffect(() => {
    const element = box.current
    if (element && stick.current) element.scrollTop = element.scrollHeight
  }, [lines, view])

  const level = list.permissions.console
  const allowed = list.allowedCommands[server.game] ?? []
  const canType = server.commands && level >= 2

  async function send(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const text = command.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await order(device, 'send', { server: server.id, command: text })
      setCommand('')
      void fetchLines()
    } catch (err) {
      onToast(errorText(err), true)
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="r-console-page">
      <section className="r-card r-server">
        <div className="r-server-head">
          <img src={ICONS[server.game]} width={36} height={36} alt="" />
          <div className="r-server-title">
            <strong className="r-ellipsis">{server.name}</strong>
            <span className="r-muted">{gameInfo(server.game).name}</span>
          </div>
          <span className={`r-chip ${statusClass(server.status)}`}>{t(`status.${server.status}` as MessageKey)}</span>
        </div>
        {canControl && (
          <div className="r-row">
            <ControlButtons server={server} onStart={onStart} onStop={onStop} onRestart={onRestart} />
          </div>
        )}
      </section>

      <PlayersSection server={server} />

      <div className="r-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={view === 'console'}
          className={view === 'console' ? 'active' : ''}
          onClick={() => setView('console')}
        >
          {t('remote.web.console')}
        </button>
        <button
          role="tab"
          aria-selected={view === 'journal'}
          className={view === 'journal' ? 'active' : ''}
          onClick={() => setView('journal')}
        >
          {t('panel.tab.journal')}
        </button>
      </div>

      {view === 'journal' && <JournalSection device={device} server={server} />}

      {/* Escondida y no desmontada: al volver conserva lo leído y el scroll. */}
      <div
        className="r-console"
        hidden={view !== 'console'}
        ref={box}
        onScroll={(e) => {
          const element = e.currentTarget
          stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
        }}
      >
        {lines.length === 0 ? (
          <p className="r-muted">{t('remote.web.consoleEmpty')}</p>
        ) : (
          lines.map((line) => (
            <div key={line.seq} className={`r-line ${line.level}`}>
              <span className="r-time">{formatTime(line.ts, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              {line.text}
            </div>
          ))
        )}
      </div>

      {view !== 'console' ? null : !server.commands ? (
        <p className="r-muted">{t('remote.web.noCommands')}</p>
      ) : !canType ? (
        <p className="r-muted">{t('remote.web.consoleReadOnly')}</p>
      ) : (
        <>
          {level === 2 && allowed.length > 0 && (
            <p className="r-muted">{t('remote.web.consoleAllowed', { commands: allowed.join(', ') })}</p>
          )}
          <form className="r-send" onSubmit={(e) => void send(e)}>
            <input
              value={command}
              maxLength={500}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('remote.web.commandPlaceholder')}
              onChange={(e) => setCommand(e.target.value)}
            />
            <button type="submit" className="r-primary" disabled={sending || command.trim().length === 0}>
              {t('remote.web.send')}
            </button>
          </form>
        </>
      )}
    </main>
  )
}

/**
 * Llama a `work` ahora y cada `everyMs`, sin solaparse y solo con la página a
 * la vista: un móvil con la pestaña en segundo plano no gasta batería ni datos.
 */
function usePolling(work: () => Promise<void>, everyMs: number): void {
  useEffect(() => {
    let stopped = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async (): Promise<void> => {
      // Volver a la pestaña llama aquí también: si ya hay una vuelta en
      // marcha, ella programará la siguiente.
      if (stopped || running) return
      running = true
      clearTimeout(timer)
      try {
        if (document.visibilityState === 'visible') await work()
      } finally {
        running = false
      }
      if (!stopped) timer = setTimeout(() => void tick(), everyMs)
    }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void tick()
    }
    void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [work, everyMs])
}
