import { useCallback, useEffect, useState } from 'react'
import type { Diagnosis, InstanceState, LogLine, ProgressUpdate, UiMode } from '@shared/types'
import { DISTRIBUTION_LABELS } from '@shared/types'
import { CreateWizard } from './CreateWizard'
import { BasicWizard } from './BasicWizard'
import { ModeChooser } from './ModeChooser'
import { ServerPanel } from './ServerPanel'

/** Límite de líneas en memoria: la consola no puede crecer sin fin. */
const MAX_LOG_LINES = 2000

export function App(): React.JSX.Element {
  const [instances, setInstances] = useState<InstanceState[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * Flujo de creación: primero se elige el modo (como Vibe/Spec en Kiro) y
   * después se entra al asistente correspondiente.
   */
  const [creating, setCreating] = useState<null | 'choosing' | UiMode>(null)
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({})
  const [players, setPlayers] = useState<Record<string, string[]>>({})
  const [progress, setProgress] = useState<ProgressUpdate | null>(null)
  const [diagnoses, setDiagnoses] = useState<Record<string, Diagnosis>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  // Se arranca en básico hasta saber qué prefiere el usuario: es el valor por
  // defecto del núcleo y evita un parpadeo a avanzado en el primer render.
  const [mode, setMode] = useState<UiMode>('basic')

  const refresh = useCallback(async () => {
    try {
      const list = await window.qubiq.instances.list()
      setInstances(list)
      setLoadError(null)
      setSelectedId((current) => {
        if (current && list.some((i) => i.manifest.id === current)) return current
        return list[0]?.manifest.id ?? null
      })
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void window.qubiq.settings
      .get()
      .then((settings) => setMode(settings.uiMode))
      .catch(() => undefined)
  }, [])

  function changeMode(next: UiMode): void {
    setMode(next)
    void window.qubiq.settings.update({ uiMode: next }).catch(() => undefined)
  }

  function onInstanceCreated(id: string): void {
    setCreating(null)
    setSelectedId(id)
    void refresh()
  }

  // Suscripción a los eventos del núcleo.
  useEffect(() => {
    const offLog = window.qubiq.on.log((id, line) => {
      setLogs((prev) => {
        const next = [...(prev[id] ?? []), line]
        if (next.length > MAX_LOG_LINES) next.splice(0, next.length - MAX_LOG_LINES)
        return { ...prev, [id]: next }
      })
    })

    const offStatus = window.qubiq.on.status((id, status) => {
      setInstances((prev) =>
        prev.map((i) => (i.manifest.id === id ? { ...i, status } : i))
      )
      // Un arranque correcto invalida el diagnóstico anterior.
      if (status === 'running') {
        setDiagnoses((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    })

    const offPlayers = window.qubiq.on.players((id, list) => {
      setPlayers((prev) => ({ ...prev, [id]: list }))
    })

    const offProgress = window.qubiq.on.progress((update) => setProgress(update))

    const offDiagnosis = window.qubiq.on.diagnosis((id, diagnosis) => {
      setDiagnoses((prev) => ({ ...prev, [id]: diagnosis }))
    })

    return () => {
      offLog()
      offStatus()
      offPlayers()
      offProgress()
      offDiagnosis()
    }
  }, [])

  // Refresco del contador de tiempo en marcha.
  useEffect(() => {
    const timer = setInterval(() => {
      setInstances((prev) =>
        prev.map((i) =>
          i.status === 'running' && i.uptimeSeconds !== null
            ? { ...i, uptimeSeconds: i.uptimeSeconds + 1 }
            : i
        )
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const selected = instances.find((i) => i.manifest.id === selectedId) ?? null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>QubiQ Server Launcher</h1>
          <p>Servidores de Minecraft, sin complicaciones</p>
        </div>

        <div className="instance-list">
          {instances.length === 0 && creating === null && (
            <p style={{ color: 'var(--muted)', fontSize: 12, padding: 12 }}>
              Todavía no tienes ningún servidor.
            </p>
          )}
          {instances.map((instance) => (
            <div
              key={instance.manifest.id}
              className={`instance-item ${
                instance.manifest.id === selectedId && creating === null ? 'active' : ''
              }`}
              onClick={() => {
                setSelectedId(instance.manifest.id)
                setCreating(null)
              }}
            >
              <div className="name">{instance.manifest.name}</div>
              <div className="meta">
                <span className={`dot ${instance.status}`} style={{ display: 'inline-block' }} />{' '}
                {DISTRIBUTION_LABELS[instance.manifest.distribution].name} ·{' '}
                {instance.manifest.minecraftVersion}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="primary" onClick={() => setCreating('choosing')}>
            + Crear servidor
          </button>

          <div className="mode-switch">
            <label htmlFor="ui-mode">Modo</label>
            <select
              id="ui-mode"
              value={mode}
              onChange={(e) => changeMode(e.target.value as UiMode)}
            >
              <option value="basic">Básico</option>
              <option value="advanced">Avanzado</option>
            </select>
          </div>
          <p className="mode-hint">
            {mode === 'basic'
              ? 'Lo esencial para jugar. Elegimos por ti lo técnico.'
              : 'La misma pantalla, con todos los ajustes desbloqueados.'}
          </p>
        </div>

        <div className="disclaimer">
          NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR
          MICROSOFT.
        </div>
      </aside>

      <main className="content">
        {loadError && (
          <div className="panel">
            <div className="alert error">
              <strong>No se pudieron cargar los servidores</strong>
              <p>{loadError}</p>
            </div>
          </div>
        )}

        {creating !== null && (
          <>
            <div className="topbar">
              <h2>Crear un servidor nuevo</h2>
              {creating !== 'choosing' && (
                <span className="status">
                  Modo {creating === 'basic' ? 'básico' : 'avanzado'}
                </span>
              )}
              {creating !== 'choosing' && (
                <button onClick={() => setCreating('choosing')}>Cambiar de modo</button>
              )}
            </div>

            {creating === 'choosing' && (
              <ModeChooser
                current={mode}
                onCancel={() => setCreating(null)}
                onChoose={(chosen) => {
                  // La elección aquí también fija el modo de la app: es la
                  // preferencia que el usuario acaba de expresar, y así el
                  // panel del servidor recién creado le habla igual.
                  changeMode(chosen)
                  setCreating(chosen)
                }}
              />
            )}

            {creating === 'basic' && (
              <BasicWizard
                progress={progress}
                onCancel={() => setCreating(null)}
                onCreated={onInstanceCreated}
              />
            )}

            {creating === 'advanced' && (
              <CreateWizard
                progress={progress}
                onCancel={() => setCreating(null)}
                onCreated={onInstanceCreated}
              />
            )}
          </>
        )}

        {creating === null && selected && (
          <ServerPanel
            // Cambiar de servidor vuelve a su pantalla principal, en vez de
            // arrastrar la pestaña o la configuración que tenía abiertas el otro.
            key={selected.manifest.id}
            state={selected}
            logs={logs[selected.manifest.id] ?? []}
            players={players[selected.manifest.id] ?? []}
            diagnosis={diagnoses[selected.manifest.id] ?? null}
            progress={progress?.instanceId === selected.manifest.id ? progress : null}
            mode={mode}
            onRefresh={() => void refresh()}
          />
        )}

        {creating === null && !selected && !loadError && (
          <div className="empty">
            <div style={{ fontSize: 44 }}>🧊</div>
            <div>
              <strong style={{ display: 'block', marginBottom: 6, color: 'var(--text)' }}>
                Aún no tienes servidores
              </strong>
              Crea el primero y estarás jugando en unos minutos.
            </div>
            <button className="primary" onClick={() => setCreating('choosing')}>
              Crear mi primer servidor
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
