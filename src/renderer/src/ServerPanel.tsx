import { useState } from 'react'
import type { Diagnosis, InstanceState, LogLine, UiMode } from '@shared/types'
import { DISTRIBUTION_LABELS, contentKindFor } from '@shared/types'
import { useShareAddress, BasicConnection } from './BasicConnection'
import { ConnectionCard } from './ConnectionCard'
import { PlayersPanel } from './PlayersPanel'
import { ConsolePanel } from './ConsolePanel'
import { ConfigPanel } from './ConfigPanel'
import { WorldsPanel } from './WorldsPanel'
import { ContentPanel } from './ContentPanel'
import { BackupPanel } from './BackupPanel'
import { ConfirmDelete } from './ConfirmDelete'

/**
 * Pantalla de un servidor, igual en los dos modos.
 *
 * El día a día se reduce a tres cosas: encenderlo o apagarlo, ver quién está y
 * mirar la consola. Todo lo demás vive aparte, detrás de "Configuración", en
 * vez de competir por la atención cada vez que se abre la app.
 *
 * El modo no cambia la pantalla, cambia lo que se desbloquea dentro de
 * Configuración: cada pestaña recibe `mode` y el avanzado añade sus opciones
 * (memoria, semillas, retención de copias, las tres direcciones, la ficha
 * técnica, reinstalar...).
 */

type MainTab = 'jugadores' | 'consola'
type ConfigTab = 'ajustes' | 'conexion' | 'mundos' | 'contenido' | 'copias' | 'servidor'

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
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const [configuring, setConfiguring] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('jugadores')
  const [configTab, setConfigTab] = useState<ConfigTab>('ajustes')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const contentKind = contentKindFor(manifest.distribution)

  const running = status === 'running'
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

        {configTab === 'ajustes' && <ConfigPanel state={state} mode={mode} onSaved={onRefresh} />}

        {configTab === 'conexion' && (
          <div className="panel">
            {/* Básico: una sola dirección, la que hay que pasar. Avanzado: las
                tres, con latencia y la comprobación desde internet. */}
            {advanced ? (
              <ConnectionCard state={state} onManifestChanged={onRefresh} />
            ) : (
              <BasicConnection state={state} onManifestChanged={onRefresh} />
            )}
          </div>
        )}

        {configTab === 'mundos' && <WorldsPanel state={state} mode={mode} onChanged={onRefresh} />}

        {configTab === 'contenido' && contentKind !== null && (
          <ContentPanel state={state} mode={mode} />
        )}

        {configTab === 'copias' && (
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

        {configTab === 'servidor' && (
          <div className="panel">
            {error && (
              <div className="alert error">
                <strong>No se pudo completar la acción</strong>
                <p>{error}</p>
              </div>
            )}

            {/* Versión de Java, build y memoria no significan nada para quien
                solo quiere jugar: la ficha técnica es cosa del modo avanzado. */}
            {advanced && (
              <div className="card">
                <h3>Detalles</h3>
                <DetailRow label="Tipo" value={DISTRIBUTION_LABELS[manifest.distribution].name} />
                <DetailRow label="Versión de Minecraft" value={manifest.minecraftVersion} />
                {manifest.build && <DetailRow label="Build" value={manifest.build} />}
                <DetailRow label="Java" value={String(manifest.javaMajor)} />
                <DetailRow label="Memoria" value={`${(manifest.memoryMb / 1024).toFixed(1)} GB`} last />
              </div>
            )}

            <div className="card">
              <h3>{advanced ? 'Mantenimiento' : 'Carpeta del servidor'}</h3>
              <p className="hint">Ahí están el mundo, la configuración y los registros.</p>
              <div className="row">
                <button onClick={() => void window.qubiq.instances.openFolder(manifest.id)}>
                  Abrir carpeta
                </button>
                {advanced && (
                  <button
                    disabled={running || busy}
                    onClick={() => run(() => window.qubiq.instances.reinstall(manifest.id))}
                  >
                    Reinstalar servidor
                  </button>
                )}
              </div>
            </div>

            {/* Borrar está en los dos modos: querer deshacerse de un servidor es
                tan básico como crearlo. Lo que cambia es el aviso, no el acceso. */}
            <div className="card danger-zone">
              <h3>Borrar este servidor</h3>
              <p className="hint">
                Se elimina para siempre, con su mundo y sus copias de seguridad.
                {!advanced && ' Si solo quieres dejar de jugar un tiempo, basta con pararlo.'}
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

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }): React.JSX.Element {
  return (
    <div className="row between" style={last ? undefined : { marginBottom: 8 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span>{value}</span>
    </div>
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
