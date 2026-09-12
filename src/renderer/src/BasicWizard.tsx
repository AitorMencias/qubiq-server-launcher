import { useEffect, useState } from 'react'
import type { Distribution } from '@shared/types'
import { DISTRIBUTIONS, DISTRIBUTION_LABELS } from '@shared/types'

/**
 * Asistente en modo básico (§3).
 *
 * Va **paso a paso**: una pregunta por pantalla, para que nadie se encuentre un
 * formulario entero y tenga que decidir por dónde empezar. Al terminar los pasos
 * se muestra un resumen editable, que es donde se acepta el EULA y se crea.
 *
 * Solo se preguntan tres cosas: nombre, tipo y cuánta gente. Versión, memoria y
 * puerto se deciden solos con valores sensatos y se informan en el resumen: son
 * datos que el usuario necesita conocer —sus amigos deben usar la misma
 * versión— pero no decisiones que sepa tomar.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

/** Los pasos de configuración. El resumen va aparte porque no pregunta nada. */
const STEPS = ['nombre', 'tipo', 'jugadores'] as const
type Step = (typeof STEPS)[number]
type Stage = Step | 'resumen'

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')

  const [name, setName] = useState('Mi servidor')
  const [distribution, setDistribution] = useState<Distribution>('paper')
  const [expectedPlayers, setExpectedPlayers] = useState(8)

  const [version, setVersion] = useState<string | null>(null)
  const [memoryMb, setMemoryMb] = useState<number | null>(null)
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setVersion(null)
    setError(null)
    window.qubiq.catalog
      .defaultVersion(distribution)
      .then((value) => {
        if (!cancelled) setVersion(value)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`No se pudo consultar la última versión: ${err.message}`)
      })
    return () => {
      cancelled = true
    }
  }, [distribution])

  useEffect(() => {
    let cancelled = false
    window.qubiq.catalog
      .recommendMemory(expectedPlayers, distribution)
      .then((value) => {
        if (!cancelled) setMemoryMb(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [expectedPlayers, distribution])

  const stepIndex = STEPS.indexOf(stage as Step)
  const onStep = stepIndex !== -1

  function next(): void {
    if (!onStep) return
    setStage(stepIndex === STEPS.length - 1 ? 'resumen' : STEPS[stepIndex + 1]!)
  }

  function back(): void {
    if (stage === 'resumen') {
      setStage(STEPS[STEPS.length - 1]!)
      return
    }
    if (stepIndex <= 0) {
      onCancel()
      return
    }
    setStage(STEPS[stepIndex - 1]!)
  }

  const canContinue = stage !== 'nombre' || name.trim().length > 0

  async function create(): Promise<void> {
    if (!version || !memoryMb) return
    setBusy(true)
    setError(null)
    try {
      // El puerto tampoco se pregunta: se coge el primero libre desde el
      // estándar, para que tener ya otro servidor abierto no haga fallar el
      // arranque con un error que el usuario no sabría interpretar (§7).
      const port = await window.qubiq.network.freePort(25565)

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
        <div className="card" style={{ maxWidth: 620, margin: '40px auto 0' }}>
          <h3>Preparando tu servidor</h3>
          <p className="hint">
            Estamos descargando todo lo necesario. La primera vez tarda unos minutos porque hay que
            bajar bastantes megas; las siguientes irá mucho más rápido.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13 }}>{progress?.detail ?? 'Trabajando...'}</p>
          <div className="progress">
            <div
              style={{
                width:
                  progress?.progress != null ? `${Math.round(progress.progress * 100)}%` : '35%'
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
      <div className="wizard">
        <StepDots total={STEPS.length} current={onStep ? stepIndex : STEPS.length} />

        {error && (
          <div className="alert error">
            <strong>Algo ha fallado</strong>
            <p>{error}</p>
          </div>
        )}

        {stage === 'nombre' && (
          <StepFrame
            title="¿Cómo se va a llamar?"
            help="Es el nombre que verás tú en la lista. Puedes cambiarlo luego."
          >
            <input
              value={name}
              maxLength={40}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
          </StepFrame>
        )}

        {stage === 'tipo' && (
          <StepFrame
            title="¿Qué quieres poder hacer?"
            help="Si no lo tienes claro, deja la primera opción: sirve para casi todo."
          >
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
          </StepFrame>
        )}

        {stage === 'jugadores' && (
          <StepFrame
            title="¿Cuánta gente vais a ser?"
            help="Cuenta a quienes estaréis conectados a la vez, no el total de amigos."
          >
            <div className="big-number">{expectedPlayers}</div>
            <input
              type="range"
              min={2}
              max={50}
              step={1}
              value={expectedPlayers}
              onChange={(e) => setExpectedPlayers(Number(e.target.value))}
            />
            <div className="help" style={{ textAlign: 'center', marginTop: 10 }}>
              Con esto ajustamos la memoria del servidor y el límite de jugadores.
            </div>
          </StepFrame>
        )}

        {stage === 'resumen' && (
          <Summary
            name={name}
            distribution={distribution}
            expectedPlayers={expectedPlayers}
            version={version}
            memoryMb={memoryMb}
            eula={eula}
            onEula={setEula}
            onEdit={(target) => setStage(target)}
          />
        )}

        <div className="row between wizard-nav">
          <button onClick={back}>{stepIndex <= 0 && onStep ? 'Cancelar' : 'Atrás'}</button>

          {onStep ? (
            <button className="primary" disabled={!canContinue} onClick={next}>
              Siguiente →
            </button>
          ) : (
            <button
              className="primary"
              disabled={!eula || !version || !memoryMb}
              onClick={() => void create()}
            >
              Crear servidor
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepDots({ total, current }: { total: number; current: number }): React.JSX.Element {
  return (
    <div className="step-dots">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`step-dot ${i < current ? 'done' : i === current ? 'now' : ''}`} />
      ))}
      <span className="step-label">
        {current >= total ? 'Todo listo' : `Paso ${current + 1} de ${total}`}
      </span>
    </div>
  )
}

interface StepFrameProps {
  title: string
  help: string
  children: React.ReactNode
}

function StepFrame({ title, help, children }: StepFrameProps): React.JSX.Element {
  return (
    <div className="step-frame">
      <h2>{title}</h2>
      <p className="step-help">{help}</p>
      {children}
    </div>
  )
}

interface SummaryProps {
  name: string
  distribution: Distribution
  expectedPlayers: number
  version: string | null
  memoryMb: number | null
  eula: boolean
  onEula: (value: boolean) => void
  onEdit: (target: Step) => void
}

/**
 * Resumen final: la pantalla de configuración básica de siempre, pero de solo
 * lectura y con un enlace para volver al paso correspondiente. Se revisa antes
 * de crear en lugar de descubrir después que algo estaba mal.
 */
function Summary({
  name,
  distribution,
  expectedPlayers,
  version,
  memoryMb,
  eula,
  onEula,
  onEdit
}: SummaryProps): React.JSX.Element {
  return (
    <div className="step-frame">
      <h2>Todo listo, revísalo</h2>
      <p className="step-help">
        Esto es lo que vamos a crear. Si algo no cuadra, toca en &quot;cambiar&quot;.
      </p>

      <div className="card" style={{ textAlign: 'left' }}>
        <SummaryRow label="Nombre" value={name} onEdit={() => onEdit('nombre')} />
        <SummaryRow
          label="Tipo"
          value={DISTRIBUTION_LABELS[distribution].name}
          onEdit={() => onEdit('tipo')}
        />
        <SummaryRow
          label="Jugadores a la vez"
          value={String(expectedPlayers)}
          onEdit={() => onEdit('jugadores')}
        />
        <SummaryRow label="Versión de Minecraft" value={version ?? 'consultando...'} chosen />
        <SummaryRow
          label="Memoria"
          value={memoryMb ? `${(memoryMb / 1024).toFixed(1)} GB` : 'calculando...'}
          chosen
          last
        />
      </div>

      <div className="help" style={{ textAlign: 'left', marginTop: -6, marginBottom: 16 }}>
        Tus amigos tendrán que abrir Minecraft con la versión <strong>{version ?? '...'}</strong>{' '}
        para poder entrar.
      </div>

      <div className="card" style={{ textAlign: 'left', marginBottom: 0 }}>
        <h3>Condiciones de Minecraft</h3>
        <p className="hint">
          Mojang exige aceptar su EULA para ejecutar un servidor. Solo hay que hacerlo una vez por
          servidor.
        </p>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={eula}
            onChange={(e) => onEula(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
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
    </div>
  )
}

interface SummaryRowProps {
  label: string
  value: string
  onEdit?: () => void
  /** true si lo hemos elegido nosotros y no hay nada que cambiar aquí. */
  chosen?: boolean
  last?: boolean
}

function SummaryRow({ label, value, onEdit, chosen, last }: SummaryRowProps): React.JSX.Element {
  return (
    <div className={`summary-row ${last ? 'last' : ''}`}>
      <span className="summary-label">{label}</span>
      <span className="summary-value">{value}</span>
      {onEdit ? (
        <button className="link" onClick={onEdit}>
          cambiar
        </button>
      ) : (
        <span className="summary-auto">{chosen ? 'elegido por nosotros' : ''}</span>
      )}
    </div>
  )
}
