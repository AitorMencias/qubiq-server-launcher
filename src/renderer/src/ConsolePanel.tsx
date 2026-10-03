import { useEffect, useRef, useState } from 'react'
import type { InstanceState, LogLine } from '@shared/types'
import { capabilitiesFor, gameInfo } from '@shared/games'
import { t } from './i18n'

/**
 * Consola en vivo. La comparten los dos modos.
 *
 * La entrada de órdenes solo aparece si el juego las acepta: Satisfactory no
 * lee nada por la consola —todo lo suyo va por su API, y eso ya son botones de
 * la app—, así que en vez de una caja de texto que no haría nada se dice por qué.
 */

interface Props {
  state: InstanceState
  logs: LogLine[]
  onRun: (action: () => Promise<void>) => void
}

export function ConsolePanel({ state, logs, onRun }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const acceptsCommands = capabilitiesFor(manifest).commands
  const [command, setCommand] = useState('')
  const consoleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Autoscroll al llegar líneas nuevas.
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  function send(): void {
    const text = command.trim()
    if (text.length === 0) return
    setCommand('')
    onRun(() => window.qubiq.server.command(manifest.id, text))
  }

  return (
    <>
      <div className="console" ref={consoleRef}>
        {logs.length === 0 && (
          <div style={{ color: 'var(--muted)' }}>{t('console.empty')}</div>
        )}
        {logs.map((line, i) => (
          <div key={i} className={`line ${line.level}`}>
            {line.text}
          </div>
        ))}
      </div>
      {acceptsCommands ? (
        <div className="console-input">
          <input
            className="grow"
            placeholder={running ? t('console.placeholder') : t('players.notRunning')}
            disabled={!running}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
          />
          <button disabled={!running} onClick={send}>
            {t('console.send')}
          </button>
        </div>
      ) : (
        <div className="console-input">
          <span className="hint">
            {t('console.noCommands', {
              game: gameInfo(manifest.game).name,
              section: t('panel.configuration')
            })}
          </span>
        </div>
      )}
    </>
  )
}
