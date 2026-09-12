import { useEffect, useRef, useState } from 'react'
import type { Diagnosis, InstanceState, LogLine, UiMode } from '@shared/types'
import { DISTRIBUTION_LABELS, contentKindFor } from '@shared/types'
import { ConnectionCard } from './ConnectionCard'
import { ConfigPanel } from './ConfigPanel'
import { BackupPanel } from './BackupPanel'
import { WorldsPanel } from './WorldsPanel'
import { BasicConnection } from './BasicConnection'
import { ConfirmDelete } from './ConfirmDelete'
import { ContentPanel } from './ContentPanel'

/**
 * Panel de un servidor: estado, consola, jugadores, ajustes y copias.
 * La pantalla principal NO es la consola (§7): es el estado y cómo conectarse.
 */

type Tab = 'estado' | 'consola' | 'jugadores' | 'mundos' | 'contenido' | 'ajustes' | 'copias'

interface Props {
  state: InstanceState
  logs: LogLine[]
  players: string[]
  diagnosis: Diagnosis | null
  progress: { phase: string; progress: number | null; detail?: string } | null
  mode: UiMode
  onRefresh: () => void
}

export function ServerPanel({
  state,
  logs,
  players,
  diagnosis,
  progress,
  mode,
  onRefresh
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('estado')
  const basic = mode === 'basic'
  const contentKind = contentKindFor(state.manifest.distribution)
  const [command, setCommand] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)

  const { manifest, status } = state
  const running = status === 'running'
  const busy = status === 'starting' || status === 'stopping' || status === 'installing'

  useEffect(() => {
    // Autoscroll de la consola.
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs, tab])

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null)
    try {
      await action()
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function sendCommand(): void {
    const text = command.trim()
    if (text.length === 0) return
    setCommand('')
    void run(() => window.qubiq.server.command(manifest.id, text))
  }

  return (
    <>
      <div className="topbar">
        <h2>{manifest.name}</h2>
        <span className="status">
          <span className={`dot ${status}`} />
          {statusLabel(status)}
          {state.uptimeSeconds !== null && ` · ${formatUptime(state.uptimeSeconds)}`}
        </span>
        {running || status === 'stopping' ? (
          <button
            disabled={status === 'stopping'}
            onClick={() => void run(() => window.qubiq.server.stop(manifest.id))}
          >
            Parar
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(() => window.qubiq.server.start(manifest.id))}
          >
            Iniciar
          </button>
        )}
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'estado' ? 'active' : ''}`} onClick={() => setTab('estado')}>
          Estado
        </button>
        {/* La consola es lo más técnico de la app: no aparece en modo básico. */}
        {!basic && (
          <button
            className={`tab ${tab === 'consola' ? 'active' : ''}`}
            onClick={() => setTab('consola')}
          >
            Consola
          </button>
        )}
        <button
          className={`tab ${tab === 'jugadores' ? 'active' : ''}`}
          onClick={() => setTab('jugadores')}
        >
          Jugadores {players.length > 0 && `(${players.length})`}
        </button>
        <button
          className={`tab ${tab === 'mundos' ? 'active' : ''}`}
          onClick={() => setTab('mundos')}
        >
          Mundos
        </button>
        {/* Vanilla no admite plugins ni mods: la pestaña ni aparece. */}
        {contentKind !== null && (
          <button
            className={`tab ${tab === 'contenido' ? 'active' : ''}`}
            onClick={() => setTab('contenido')}
          >
            {contentKind === 'mods' ? 'Mods' : 'Plugins'}
          </button>
        )}
        <button
          className={`tab ${tab === 'ajustes' ? 'active' : ''}`}
          onClick={() => setTab('ajustes')}
        >
          Ajustes
        </button>
        <button className={`tab ${tab === 'copias' ? 'active' : ''}`} onClick={() => setTab('copias')}>
          Copias
        </button>
      </div>

      {tab === 'mundos' && <WorldsPanel state={state} mode={mode} onChanged={onRefresh} />}

      {tab === 'contenido' && contentKind !== null && <ContentPanel state={state} mode={mode} />}

      {tab === 'ajustes' && <ConfigPanel state={state} mode={mode} onSaved={onRefresh} />}

      {tab === 'copias' && (
        <BackupPanel
          state={state}
          mode={mode}
          onManifestChanged={onRefresh}
          progressDetail={
            progress && (progress.phase === 'backup' || progress.phase === 'restore')
              ? (progress.detail ?? null)
              : null
          }
        />
      )}

      {tab === 'estado' && (
        <div className="panel">
          {error && (
            <div className="alert error">
              <strong>No se pudo completar la acción</strong>
              <p>{error}</p>
            </div>
          )}

          {diagnosis && (
            <div className="alert error">
              <strong>{diagnosis.title}</strong>
              <p>{diagnosis.detail}</p>
            </div>
          )}

          {progress && status === 'installing' && (
            <div className="card">
              <h3>Preparando el servidor</h3>
              <p className="hint">{progress.detail ?? 'Trabajando...'}</p>
              <div className="progress">
                <div
                  style={{
                    width:
                      progress.progress != null
                        ? `${Math.round(progress.progress * 100)}%`
                        : '35%'
                  }}
                />
              </div>
            </div>
          )}

          {basic ? (
            <BasicConnection state={state} onManifestChanged={onRefresh} />
          ) : (
            <ConnectionCard state={state} onManifestChanged={onRefresh} />
          )}

          {/* Versión de Java, build y memoria no significan nada para quien
              solo quiere jugar: la ficha técnica es cosa del modo avanzado. */}
          {!basic && (
          <div className="card">
            <h3>Detalles</h3>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--muted)' }}>Tipo</span>
              <span>{DISTRIBUTION_LABELS[manifest.distribution].name}</span>
            </div>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--muted)' }}>Versión de Minecraft</span>
              <span>{manifest.minecraftVersion}</span>
            </div>
            {manifest.build && (
              <div className="row between" style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)' }}>Build</span>
                <span>{manifest.build}</span>
              </div>
            )}
            <div className="row between" style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--muted)' }}>Java</span>
              <span>{manifest.javaMajor}</span>
            </div>
            <div className="row between">
              <span style={{ color: 'var(--muted)' }}>Memoria</span>
              <span>{(manifest.memoryMb / 1024).toFixed(1)} GB</span>
            </div>
          </div>
          )}

          {!basic && (
          <div className="card">
            <h3>Mantenimiento</h3>
            <p className="hint">
              La carpeta contiene el mundo, la configuración y los registros.
            </p>
            <div className="row">
              <button onClick={() => void window.qubiq.instances.openFolder(manifest.id)}>
                Abrir carpeta
              </button>
              <button
                disabled={running || busy}
                onClick={() => void run(() => window.qubiq.instances.reinstall(manifest.id))}
              >
                Reinstalar servidor
              </button>
            </div>
          </div>
          )}

          {/* Borrar está en los dos modos: querer deshacerse de un servidor es
              tan básico como crearlo. Lo que cambia es el aviso, no el acceso. */}
          <div className="card danger-zone">
            <h3>Borrar este servidor</h3>
            <p className="hint">
              Se elimina para siempre, con su mundo y sus copias de seguridad.
              {basic && ' Si solo quieres dejar de jugar un tiempo, basta con pararlo.'}
            </p>
            <div className="row">
              <button className="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>
                Borrar servidor
              </button>
              {basic && (
                <button onClick={() => void window.qubiq.instances.openFolder(manifest.id)}>
                  Abrir carpeta
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDelete
          state={state}
          onCancel={() => setConfirmingDelete(false)}
          onDeleted={() => {
            setConfirmingDelete(false)
            onRefresh()
          }}
        />
      )}

      {tab === 'consola' && (
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
                if (e.key === 'Enter') sendCommand()
              }}
            />
            <button disabled={!running} onClick={sendCommand}>
              Enviar
            </button>
          </div>
        </>
      )}

      {tab === 'jugadores' && (
        <div className="panel">
          {!running && (
            <div className="alert info">
              <strong>El servidor no está arrancado</strong>
              <p>Arráncalo para ver quién está conectado y poder moderar.</p>
            </div>
          )}
          {running && players.length === 0 && (
            <div className="alert info">
              <strong>No hay nadie conectado</strong>
              <p>Cuando entre alguien aparecerá aquí con sus acciones de moderación.</p>
            </div>
          )}
          <div className="player-list">
            {players.map((player) => (
              <div className="player" key={player}>
                <span className="pname">{player}</span>
                <button
                  onClick={() =>
                    void run(() =>
                      window.qubiq.server.command(manifest.id, `kick ${player} Expulsado`)
                    )
                  }
                >
                  Expulsar
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    void run(() =>
                      window.qubiq.server.command(manifest.id, `ban ${player} Baneado`)
                    )
                  }
                >
                  Banear
                </button>
                <button
                  onClick={() =>
                    void run(() => window.qubiq.server.command(manifest.id, `op ${player}`))
                  }
                >
                  Dar OP
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function statusLabel(status: InstanceState['status']): string {
  switch (status) {
    case 'running':
      return 'En marcha'
    case 'starting':
      return 'Arrancando...'
    case 'stopping':
      return 'Cerrando...'
    case 'installing':
      return 'Instalando...'
    case 'crashed':
      return 'Se ha cerrado solo'
    case 'stopped':
      return 'Parado'
  }
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}
