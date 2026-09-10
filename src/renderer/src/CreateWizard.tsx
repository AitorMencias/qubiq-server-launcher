import { useEffect, useState } from 'react'
import type { Distribution, DistributionVersion } from '@shared/types'
import { DISTRIBUTIONS, DISTRIBUTION_LABELS } from '@shared/types'
import type { MemoryInfo } from '@shared/ipc'

/**
 * Asistente de creación (§3, recorrido 1): tres pasos y a jugar.
 * Todo lo que no sea imprescindible tiene un valor por defecto sensato.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState('Mi servidor')
  const [distribution, setDistribution] = useState<Distribution>('paper')
  const [versions, setVersions] = useState<DistributionVersion[]>([])
  const [version, setVersion] = useState('')
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [memoryMb, setMemoryMb] = useState(4096)
  const [expectedPlayers, setExpectedPlayers] = useState(8)
  const [recommendedMb, setRecommendedMb] = useState<number | null>(null)
  /**
   * Mientras el usuario no toque la memoria a mano, sigue a la recomendación.
   * En cuanto la mueve, deja de moverse sola: sobrescribir una decisión
   * explícita del usuario es de las cosas que más molestan de una interfaz.
   */
  const [memoryTouched, setMemoryTouched] = useState(false)
  const [port, setPort] = useState(25565)
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(true)

  useEffect(() => {
    void window.qubiq.catalog.memory().then(setMemory)
  }, [])

  // La recomendación depende de cuánta gente se espera y del tipo de servidor:
  // los mods pagan un coste fijo mucho mayor que un Paper con plugins.
  useEffect(() => {
    let cancelled = false
    void window.qubiq.catalog
      .recommendMemory(expectedPlayers, distribution)
      .then((value) => {
        if (cancelled) return
        setRecommendedMb(value)
        if (!memoryTouched) setMemoryMb(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [expectedPlayers, distribution, memoryTouched])

  useEffect(() => {
    let cancelled = false
    setLoadingVersions(true)
    setError(null)

    window.qubiq.catalog
      .versions(distribution)
      .then((list) => {
        if (cancelled) return
        setVersions(list)
        // Por defecto, la más reciente estable de esa distribución.
        setVersion(list[0]?.minecraftVersion ?? '')
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`No se pudo cargar el catálogo: ${err.message}`)
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false)
      })

    return () => {
      cancelled = true
    }
  }, [distribution])

  const overMemory = memory !== null && memoryMb > memory.warningThresholdMb

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        name,
        distribution,
        minecraftVersion: version,
        memoryMb,
        expectedPlayers,
        port,
        eulaAccepted: eula
      })
      onCreated(manifest.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (busy) {
    return (
      <div className="panel">
        <div className="card">
          <h3>Preparando tu servidor</h3>
          <p className="hint">
            Estamos descargando Java y el servidor. La primera vez tarda más porque hay
            que bajar bastantes megas.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13 }}>
            {progress?.detail ?? 'Trabajando...'}
          </p>
          <div className="progress">
            <div
              style={{
                width:
                  progress?.progress != null
                    ? `${Math.round(progress.progress * 100)}%`
                    : '35%'
              }}
            />
          </div>
          {error && (
            <div className="alert error" style={{ marginTop: 16 }}>
              <strong>No se pudo preparar el servidor</strong>
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>1. ¿Cómo se va a llamar?</h3>
        <p className="hint">Es el nombre que verás tú en la lista. Puedes cambiarlo luego.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </div>

      <div className="card">
        <h3>2. ¿Qué tipo de servidor quieres?</h3>
        <p className="hint">Si dudas, deja la opción recomendada.</p>
        <div className="choice-grid">
          {DISTRIBUTIONS.map((d) => (
            <button
              key={d}
              className={`choice ${distribution === d ? 'selected' : ''}`}
              onClick={() => setDistribution(d)}
            >
              <div className="title">{DISTRIBUTION_LABELS[d].name}</div>
              <div className="sub">{DISTRIBUTION_LABELS[d].hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>3. Versión y ajustes</h3>
        <p className="hint">
          Tus amigos tendrán que usar esta misma versión de Minecraft para poder entrar.
        </p>

        <div className="field">
          <label>Versión de Minecraft</label>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={loadingVersions}
          >
            {loadingVersions && <option>Cargando versiones...</option>}
            {versions.map((v) => (
              <option key={v.minecraftVersion} value={v.minecraftVersion}>
                {v.minecraftVersion}
                {v.recommended ? '  (la más reciente)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>¿Cuánta gente vais a ser? {expectedPlayers} jugadores</label>
          <input
            type="range"
            min={2}
            max={50}
            step={1}
            value={expectedPlayers}
            onChange={(e) => setExpectedPlayers(Number(e.target.value))}
          />
          <div className="help">
            Cuenta las personas que estarán conectadas a la vez, no el total de amigos. Con esto
            ajustamos la memoria y el límite de jugadores del servidor.
          </div>
        </div>

        <div className="field">
          <label>
            Memoria asignada: {(memoryMb / 1024).toFixed(1)} GB
            {!memoryTouched && recommendedMb !== null && (
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · recomendada</span>
            )}
          </label>
          <input
            type="range"
            min={2048}
            max={memory ? Math.max(4096, memory.totalMb - 2048) : 8192}
            step={512}
            value={memoryMb}
            onChange={(e) => {
              setMemoryTouched(true)
              setMemoryMb(Number(e.target.value))
            }}
          />
          <div className="help">
            {overMemory ? (
              'Cuidado: estás asignando casi toda la memoria del equipo. Si además juegas en este PC, se puede quedar sin respuesta.'
            ) : (
              <>
                Para {expectedPlayers} jugadores con{' '}
                {DISTRIBUTION_LABELS[distribution].name.toLowerCase()} recomendamos{' '}
                {recommendedMb !== null ? `${(recommendedMb / 1024).toFixed(1)} GB` : '...'}. Tu
                equipo tiene {memory ? (memory.totalMb / 1024).toFixed(0) : '?'} GB.
                {memoryTouched && recommendedMb !== null && memoryMb !== recommendedMb && (
                  <>
                    {' '}
                    <button
                      onClick={() => {
                        setMemoryTouched(false)
                        setMemoryMb(recommendedMb)
                      }}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        borderRadius: 6,
                        marginTop: 4
                      }}
                    >
                      Volver a la recomendada
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="field">
          <label>Puerto</label>
          <input
            type="number"
            value={port}
            min={1024}
            max={65535}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">Déjalo en 25565 salvo que ya tengas otro servidor usándolo.</div>
        </div>
      </div>

      <div className="card">
        <h3>Condiciones de Minecraft</h3>
        <p className="hint">
          Mojang exige aceptar su EULA para poder ejecutar un servidor. Solo hay que hacerlo
          una vez por servidor.
        </p>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={eula}
            onChange={(e) => setEula(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span>
            He leído y acepto el{' '}
            <a
              href="https://aka.ms/MinecraftEULA"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              EULA de Minecraft
            </a>
          </span>
        </label>
      </div>

      <div className="row between">
        <button onClick={onCancel}>Cancelar</button>
        <button
          className="primary"
          disabled={!eula || !version || loadingVersions || name.trim().length === 0}
          onClick={() => void create()}
        >
          Crear servidor
        </button>
      </div>
    </div>
  )
}
