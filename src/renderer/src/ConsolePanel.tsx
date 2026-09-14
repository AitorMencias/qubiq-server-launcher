import { useEffect, useRef, useState } from 'react'
import type { InstanceState, LogLine } from '@shared/types'

/** Consola en vivo con entrada de comandos. La comparten los dos modos. */

interface Props {
  state: InstanceState
  logs: LogLine[]
  onRun: (action: () => Promise<void>) => void
}

export function ConsolePanel({ state, logs, onRun }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
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
          <div style={{ color: 'var(--muted)' }}>
            Sin actividad todavía. Arranca el servidor para ver el registro.
          </div>
        )}
        {logs.map((line, i) => (
          <div key={i} className={`line ${line.level}`}>
            {line.text}
          </div>
        ))}
      </div>
      <div className="console-input">
        <input
          className="grow"
          placeholder={running ? 'Escribe un comando y pulsa Enter' : 'El servidor no está arrancado'}
          disabled={!running}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
          }}
        />
        <button disabled={!running} onClick={send}>
          Enviar
        </button>
      </div>
    </>
  )
}
