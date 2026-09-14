import { useState } from 'react'
import type { Diagnosis, InstanceState, LogLine } from '@shared/types'
import { contentKindFor } from '@shared/types'
import { useShareAddress, BasicConnection } from './BasicConnection'
import { PlayersPanel } from './PlayersPanel'
import { ConsolePanel } from './ConsolePanel'
import { ConfigPanel } from './ConfigPanel'
import { WorldsPanel } from './WorldsPanel'
import { ContentPanel } from './ContentPanel'
import { BackupPanel } from './BackupPanel'
import { ConfirmDelete } from './ConfirmDelete'

/**
 * Servidor en modo básico.
 *
 * El día a día se reduce a tres cosas: encenderlo o apagarlo, ver quién está y
 * mirar la consola. Todo lo demás ya se decidió en el asistente de creación, así
 * que vive aparte, detrás de "Configuración", en vez de competir por la atención
 * cada vez que se abre la app.
 */

type MainTab = 'jugadores' | 'consola'
type ConfigTab = 'ajustes' | 'conexion' | 'mundos' | 'contenido' | 'copias' | 'servidor'

interface Props {
  state: InstanceState
  logs: LogLine[]
  players: string[]
  diagnosis: Diagnosis | null
  progress: { phase: string; progress: number | null; detail?: string } | null
  onRefresh: () => void
}

export function BasicServerView({
  state,
  logs,
  players,
  diagnosis,
  progress,
  onRefresh
}: Props): React.JSX.Element {
  const { manifest, status } = state
  const [configuring, setConfiguring] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('jugadores')
  const [configTab, setConfigTab] = useState<ConfigTab>('ajustes')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const contentKind = contentKindFor(manifest.distribution)

  const busy = status === 'starting' || status === 'stopping' || status === 'installing'

  function run(action: () => Promise<void>): void {
    setError(null)
    void action()
      .then(onRefresh)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const topbar = (
    <div className="topbar">
      <h2>{manifest.name}</h2>
      <span className="status">
        <span className={`dot ${status}`} />
        {statusLabel(status)}
        {state.uptimeSeconds !== null && ` · ${formatUptime(state.uptimeSeconds)}`}
      </span>
      {configuring ? (
        <button className="primary" onClick={() => setConfiguring(false)}>
          ← Volver al servidor
        </button>
      ) : (
        <button onClick={() => setConfiguring(true)}>⚙ Configuración</button>
      )}
    </div>
  )

  if (configuring) {
    const tabs: { id: ConfigTab; label: string }[] = [
      { id: 'ajustes', label: 'Ajustes' },
      { id: 'conexion', label: 'Conexión' },
      { id: 'mundos', label: 'Mundos' },
      ...(contentKind !== null
        ? [{ id: 'contenido' as const, label: contentKind === 'mods' ? 'Mods' : 'Plugins' }]
        : []),
      { id: 'copias', label: 'Copias' },
      { id: 'servidor', label: 'Servidor' }
    ]

    return (
      <>
        {topbar}
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${configTab === t.id ? 'active' : ''}`}
              onClick={() => setConfigTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {configTab === 'ajustes' && <ConfigPanel state={state} mode="basic" onSaved={onRefresh} />}
        {configTab === 'conexion' && (
          <div className="panel">
            <BasicConnection state={state} onManifestChanged={onRefresh} />
          </div>
        )}
        {configTab === 'mundos' && <WorldsPanel state={state} mode="basic" onChanged={onRefresh} />}
        {configTab === 'contenido' && contentKind !== null && (
          <ContentPanel state={state} mode="basic" />
        )}
        {configTab === 'copias' && (
          <BackupPanel
            state={state}
            mode="basic"
            onManifestChanged={onRefresh}
            progressDetail={
              progress && (progress.phase === 'backup' || progress.phase === 'restore')
                ? (progress.detail ?? null)
                : null
            }
          />
        )}
        {configTab === 'servidor' && (
          <div className="panel">
            <div className="card">
              <h3>Carpeta del servidor</h3>
              <p className="hint">Ahí están el mundo, la configuración y los registros.</p>
              <button onClick={() => void window.qubiq.instances.openFolder(manifest.id)}>
                Abrir carpeta
              </button>
            </div>
            <div className="card danger-zone">
              <h3>Borrar este servidor</h3>
              <p className="hint">
                Se elimina para siempre, con su mundo y sus copias de seguridad. Si solo quieres
                dejar de jugar un tiempo, basta con pararlo.
              </p>
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

  return (
    <>
      {topbar}

      <PowerCard state={state} diagnosis={diagnosis} progress={progress} error={error} onRun={run} />

      <div className="tabs">
        <button
          className={`tab ${mainTab === 'jugadores' ? 'active' : ''}`}
          onClick={() => setMainTab('jugadores')}
        >
          Jugadores {players.length > 0 && `(${players.length})`}
        </button>
        <button
          className={`tab ${mainTab === 'consola' ? 'active' : ''}`}
          onClick={() => setMainTab('consola')}
        >
          Consola
        </button>
      </div>

      {mainTab === 'jugadores' && <PlayersPanel state={state} players={players} onRun={run} />}
      {mainTab === 'consola' && <ConsolePanel state={state} logs={logs} onRun={run} />}
    </>
  )
}

interface PowerCardProps {
  state: InstanceState
  diagnosis: Diagnosis | null
  progress: { phase: string; progress: number | null; detail?: string } | null
  error: string | null
  onRun: (action: () => Promise<void>) => void
}

/**
 * El botón grande. Debajo, lo mínimo para usarlo: por qué no arranca si falla,
 * cómo va la instalación y la dirección que hay que pasar a los amigos, que
 * es lo siguiente que hace cualquiera nada más encenderlo.
 */
function PowerCard({ state, diagnosis, progress, error, onRun }: PowerCardProps): React.JSX.Element {
  const { manifest, status } = state
  const { address, note, missing } = useShareAddress(state)
  const [copied, setCopied] = useState(false)

  const on = status === 'running' || status === 'starting'
  const busy = status === 'starting' || status === 'stopping' || status === 'installing'

  const label = (() => {
    switch (status) {
      case 'running':
        return 'PARAR'
      case 'starting':
        return 'ARRANCANDO…'
      case 'stopping':
        return 'PARANDO…'
      case 'installing':
        return 'INSTALANDO…'
      default:
        return 'INICIAR'
    }
  })()

  async function copy(): Promise<void> {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="power-area">
      <button
        className={`power-button ${on ? 'on' : 'off'}`}
        disabled={busy}
        onClick={() =>
          onRun(() =>
            status === 'running'
              ? window.qubiq.server.stop(manifest.id)
              : window.qubiq.server.start(manifest.id)
          )
        }
      >
        {label}
      </button>

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
        <div className="power-progress">
          <p className="hint">{progress.detail ?? 'Trabajando...'}</p>
          <div className="progress">
            <div
              style={{
                width: progress.progress != null ? `${Math.round(progress.progress * 100)}%` : '35%'
              }}
            />
          </div>
        </div>
      )}

      <div className="share-line">
        {address ? (
          <>
            <span className="share-label">Dirección para tus amigos</span>
            <code className="share-address" title={note}>
              {address}
            </code>
            <button onClick={() => void copy()}>{copied ? 'Copiada' : 'Copiar'}</button>
          </>
        ) : (
          <span className="share-label">{missing}</span>
        )}
      </div>
      <div className="share-note">
        {address && `${note} `}Minecraft {manifest.minecraftVersion}.
      </div>
    </div>
  )
}

export function statusLabel(status: InstanceState['status']): string {
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

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}
