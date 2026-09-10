import { useCallback, useEffect, useState } from 'react'
import type { Diagnosis, InstanceState, LogLine, ProgressUpdate } from '@shared/types'
import { DISTRIBUTION_LABELS } from '@shared/types'
import { CreateWizard } from './CreateWizard'
import { ServerPanel } from './ServerPanel'

/** Límite de líneas en memoria: la consola no puede crecer sin fin. */
const MAX_LOG_LINES = 2000

export function App(): React.JSX.Element {
  const [instances, setInstances] = useState<InstanceState[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({})
  const [players, setPlayers] = useState<Record<string, string[]>>({})
  const [progress, setProgress] = useState<ProgressUpdate | null>(null)
  const [diagnoses, setDiagnoses] = useState<Record<string, Diagnosis>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

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
          {instances.length === 0 && !creating && (
            <p style={{ color: 'var(--muted)', fontSize: 12, padding: 12 }}>
              Todavía no tienes ningún servidor.
            </p>
          )}
          {instances.map((instance) => (
            <div
              key={instance.manifest.id}
              className={`instance-item ${
                instance.manifest.id === selectedId && !creating ? 'active' : ''
              }`}
              onClick={() => {
                setSelectedId(instance.manifest.id)
                setCreating(false)
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
          <button className="primary" onClick={() => setCreating(true)}>
            + Crear servidor
          </button>
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

        {creating && (
          <>
            <div className="topbar">
              <h2>Crear un servidor nuevo</h2>
            </div>
            <CreateWizard
              progress={progress}
              onCancel={() => setCreating(false)}
              onCreated={(id) => {
                setCreating(false)
                setSelectedId(id)
                void refresh()
              }}
            />
          </>
        )}

        {!creating && selected && (
          <ServerPanel
            state={selected}
            logs={logs[selected.manifest.id] ?? []}
            players={players[selected.manifest.id] ?? []}
            diagnosis={diagnoses[selected.manifest.id] ?? null}
            progress={progress?.instanceId === selected.manifest.id ? progress : null}
            onRefresh={() => void refresh()}
          />
        )}

        {!creating && !selected && !loadError && (
          <div className="empty">
            <div style={{ fontSize: 44 }}>🧊</div>
            <div>
              <strong style={{ display: 'block', marginBottom: 6, color: 'var(--text)' }}>
                Aún no tienes servidores
              </strong>
              Crea el primero y estarás jugando en unos minutos.
            </div>
            <button className="primary" onClick={() => setCreating(true)}>
              Crear mi primer servidor
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
