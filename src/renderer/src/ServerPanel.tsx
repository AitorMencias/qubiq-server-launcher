import { useState } from 'react'
import type { Diagnosis, InstanceState, LogLine, UiMode } from '@shared/types'
import { DISTRIBUTION_LABELS, contentKindFor } from '@shared/types'
import { ConnectionCard } from './ConnectionCard'
import { ConfigPanel } from './ConfigPanel'
import { BackupPanel } from './BackupPanel'
import { WorldsPanel } from './WorldsPanel'
import { ConfirmDelete } from './ConfirmDelete'
import { ContentPanel } from './ContentPanel'
import { PlayersPanel } from './PlayersPanel'
import { ConsolePanel } from './ConsolePanel'
import { BasicServerView, formatUptime, statusLabel } from './BasicServerView'

/**
 * Panel de un servidor.
 *
 * En modo básico se delega en `BasicServerView`: botón de encendido, jugadores
 * y consola, con la configuración aparte. Aquí queda el modo avanzado, con
 * todas las pestañas a la vista y la ficha técnica.
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

export function ServerPanel(props: Props): React.JSX.Element {
  if (props.mode === 'basic') {
    return (
      <BasicServerView
        state={props.state}
        logs={props.logs}
        players={props.players}
        diagnosis={props.diagnosis}
        progress={props.progress}
        onRefresh={props.onRefresh}
      />
    )
  }
  return <AdvancedServerPanel {...props} />
}

function AdvancedServerPanel({
  state,
  logs,
  players,
  diagnosis,
  progress,
  mode,
  onRefresh
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('estado')
  const contentKind = contentKindFor(state.manifest.distribution)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { manifest, status } = state
  const running = status === 'running'
  const busy = status === 'starting' || status === 'stopping' || status === 'installing'

  function run(action: () => Promise<void>): void {
    setError(null)
    void action()
      .then(onRefresh)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const tabButton = (id: Tab, label: string): React.JSX.Element => (
    <button className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
      {label}
    </button>
  )

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
            onClick={() => run(() => window.qubiq.server.stop(manifest.id))}
          >
            Parar
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(() => window.qubiq.server.start(manifest.id))}
          >
            Iniciar
          </button>
        )}
      </div>

      <div className="tabs">
        {tabButton('estado', 'Estado')}
        {tabButton('consola', 'Consola')}
        {tabButton('jugadores', `Jugadores${players.length > 0 ? ` (${players.length})` : ''}`)}
        {tabButton('mundos', 'Mundos')}
        {/* Vanilla no admite plugins ni mods: la pestaña ni aparece. */}
        {contentKind !== null && tabButton('contenido', contentKind === 'mods' ? 'Mods' : 'Plugins')}
        {tabButton('ajustes', 'Ajustes')}
        {tabButton('copias', 'Copias')}
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

      {tab === 'consola' && <ConsolePanel state={state} logs={logs} onRun={run} />}

      {tab === 'jugadores' && <PlayersPanel state={state} players={players} onRun={run} />}

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
                      progress.progress != null ? `${Math.round(progress.progress * 100)}%` : '35%'
                  }}
                />
              </div>
            </div>
          )}

          <ConnectionCard state={state} onManifestChanged={onRefresh} />

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

          <div className="card">
            <h3>Mantenimiento</h3>
            <p className="hint">La carpeta contiene el mundo, la configuración y los registros.</p>
            <div className="row">
              <button onClick={() => void window.qubiq.instances.openFolder(manifest.id)}>
                Abrir carpeta
              </button>
              <button
                disabled={running || busy}
                onClick={() => run(() => window.qubiq.instances.reinstall(manifest.id))}
              >
                Reinstalar servidor
              </button>
            </div>
          </div>

          <div className="card danger-zone">
            <h3>Borrar este servidor</h3>
            <p className="hint">Se elimina para siempre, con su mundo y sus copias de seguridad.</p>
            <button className="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>
              Borrar servidor
            </button>
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
    </>
  )
}
