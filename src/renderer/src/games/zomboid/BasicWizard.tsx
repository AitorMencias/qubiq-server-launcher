import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  BASIC_SANDBOX,
  DEFAULT_MEMORY_MB,
  MEMORY_RECOMMENDED_GB,
  MIN_PASSWORD_LENGTH,
  PRESETS,
  presetInfo,
  type ZomboidPreset
} from '@shared/games/zomboid/types'
import { D20Loader } from '../../D20Loader'
import { Choices, StepDots, StepFrame, SummaryRow, labelOf, type Option } from '../../WizardParts'

/**
 * Asistente en modo básico de Project Zomboid.
 *
 * Una pregunta por pantalla y siempre con algo elegido. La dificultad es la
 * pregunta que más pesa, y se resuelve con los preajustes del propio juego —los
 * mismos que salen al empezar una partida—, con el nombre y la explicación que
 * les da Zomboid. Las trescientas reglas sueltas están en Configuración, que es
 * donde alguien las va a buscar cuando las quiera.
 *
 * Lo que no se pregunta: puerto (el primero libre desde el 16261), memoria (4 GB,
 * que se cambia luego con una barra), versión (la última de Steam) y Steam, que
 * viene apagado para que crear un servidor no publique la dirección de nadie.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

type Step = 'nombre' | 'clave' | 'dificultad' | 'zombis' | 'conexion'
type Stage = Step | 'resumen'

const STEPS: Step[] = ['nombre', 'clave', 'dificultad', 'zombis', 'conexion']

const CONNECTIONS: Option<ExposureMode>[] = [
  {
    value: 'local',
    title: 'Solo desde mi casa',
    sub: 'Quien esté en tu mismo wifi o router. No hay que tocar nada más.'
  },
  {
    value: 'router',
    title: 'Desde cualquier sitio, abriendo el router',
    sub: 'El mejor ping. Hay que abrir un puerto UDP y no funciona si tu compañía usa CGNAT.'
  },
  {
    value: 'tunnel',
    title: 'Desde cualquier sitio, con playit.gg',
    sub: 'Sin tocar el router y funciona con CGNAT, a cambio de algo de latencia.'
  }
]

/** La primera pregunta de dificultad: los tres que cubren a casi todo el mundo. */
const SIMPLE_PRESETS = PRESETS.filter((p) => ['rising', 'survivor', 'apocalypse'].includes(p.id))

/** La única regla de partida que se pregunta aparte: la que más se nota. */
const ZOMBIES = BASIC_SANDBOX.find((s) => s.key === 'Zombies')!

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState('Mi Zomboid')
  const [adminPassword, setAdminPassword] = useState('')
  const [preset, setPreset] = useState<ZomboidPreset>('survivor')
  /** null = la que traiga la dificultad elegida. */
  const [zombies, setZombies] = useState<number | null>(null)
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(stage as Step)
  const onStep = stepIndex !== -1

  const claveOk = adminPassword.trim().length >= MIN_PASSWORD_LENGTH && !/["\s]/.test(adminPassword)

  const canContinue =
    (stage !== 'nombre' || name.trim().length > 0) && (stage !== 'clave' || claveOk)

  function next(): void {
    if (!onStep) return
    if (editing || stepIndex === STEPS.length - 1) {
      setEditing(false)
      setStage('resumen')
      return
    }
    setStage(STEPS[stepIndex + 1]!)
  }

  function back(): void {
    if (stage === 'resumen') {
      setStage(STEPS[STEPS.length - 1]!)
      return
    }
    if (editing) {
      setEditing(false)
      setStage('resumen')
      return
    }
    if (stepIndex <= 0) {
      onCancel()
      return
    }
    setStage(STEPS[stepIndex - 1]!)
  }

  function edit(target: Step): void {
    setEditing(true)
    setStage(target)
  }

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const port = await window.qubiq.network.freePort(defaultPortFor('zomboid'), 'udp')
      const manifest = await window.qubiq.instances.create({
        game: 'zomboid',
        name,
        port,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          adminPassword: adminPassword.trim(),
          preset,
          ...(zombies === null ? {} : { sandbox: { [ZOMBIES.key]: zombies } })
        }
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
        <div className="card loading-card" style={{ maxWidth: 620, margin: '40px auto 0' }}>
          <D20Loader size={84} />
          <div>
            <h3>Preparando tu servidor</h3>
            <p className="hint">
              Son 6,7 GB de descarga y, después, un primer arranque de un minuto y medio: es el
              propio Zomboid quien genera el mundo y escribe su configuración. Solo pasa esta vez.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>{progress?.detail ?? 'Trabajando...'}</p>
            {progress?.progress != null && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginTop: 16 }}>
                <strong>No se pudo preparar el servidor</strong>
                <p>{error}</p>
              </div>
            )}
          </div>
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
            help="Es el nombre que verán tus amigos al añadir el servidor a su lista."
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

        {stage === 'clave' && (
          <StepFrame
            title="Tu contraseña de administrador"
            help="Con ella mandas dentro de la partida: echar a alguien, invocar cosas, arreglar destrozos."
          >
            <input
              type="text"
              value={adminPassword}
              maxLength={40}
              autoFocus
              placeholder={`Al menos ${MIN_PASSWORD_LENGTH} caracteres, sin espacios`}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
            {adminPassword.trim().length > 0 && !claveOk && (
              <div className="alert error" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>No vale</strong>
                <p>
                  Tiene que tener al menos {MIN_PASSWORD_LENGTH} caracteres y no puede llevar
                  espacios ni comillas: el servidor la recibe en su línea de órdenes.
                </p>
              </div>
            )}
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              Entrarás al juego con el usuario <strong>admin</strong> y esta contraseña. Se ve a
              propósito y queda guardada en este ordenador.
            </div>
          </StepFrame>
        )}

        {stage === 'dificultad' && (
          <StepFrame
            title="¿Cómo queréis que sea la partida?"
            help="Son los mismos preajustes que trae el juego. Después se pueden afinar una a una las trescientas reglas."
          >
            <Choices
              options={SIMPLE_PRESETS.map((p) => ({
                value: p.id,
                title: p.name,
                sub: p.description
              }))}
              value={preset}
              onChange={setPreset}
              columns={1}
            />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              En modo avanzado están los otros tres: Brote, 6 meses después y Extinción.
            </div>
          </StepFrame>
        )}

        {stage === 'zombis' && (
          <StepFrame
            title="¿Cuántos zombis?"
            help="Es lo que más cambia la partida. Si no lo tienes claro, deja lo que traiga la dificultad."
          >
            <Choices
              options={[
                {
                  value: 'preset',
                  title: `Lo que traiga «${presetInfo(preset).name}»`,
                  sub: 'La cantidad que el juego considera parte de esa dificultad.'
                },
                ...ZOMBIES.options.map((o) => ({
                  value: String(o.value),
                  title: o.label,
                  sub: ''
                }))
              ]}
              value={zombies === null ? 'preset' : String(zombies)}
              onChange={(value) => setZombies(value === 'preset' ? null : Number(value))}
              columns={2}
            />
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame
            title="¿Desde dónde se van a conectar?"
            help="Si alguien jugará desde otra casa, hay que abrir un puerto o usar un túnel."
          >
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              Zomboid necesita <strong>un puerto UDP</strong>. Cuando termines tendrás la guía en{' '}
              <strong>Configuración → Conexión</strong>.
            </div>
          </StepFrame>
        )}

        {stage === 'resumen' && (
          <div className="step-frame">
            <h2>Todo listo, revísalo</h2>
            <p className="step-help">
              Así va a quedar tu servidor. Si algo no cuadra, toca en &quot;cambiar&quot;.
            </p>

            <div className="card" style={{ textAlign: 'left' }}>
              <SummaryRow label="Nombre" value={name} onEdit={() => edit('nombre')} />
              <SummaryRow
                label="Contraseña de admin"
                value={adminPassword}
                onEdit={() => edit('clave')}
              />
              <SummaryRow
                label="Dificultad"
                value={presetInfo(preset).name}
                onEdit={() => edit('dificultad')}
              />
              <SummaryRow
                label="Zombis"
                value={
                  zombies === null
                    ? `los de «${presetInfo(preset).name}»`
                    : (ZOMBIES.options.find((o) => o.value === zombies)?.label ?? String(zombies))
                }
                onEdit={() => edit('zombis')}
              />
              <SummaryRow
                label="Se conectan"
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label="Puerto"
                value={`${defaultPortFor('zomboid')} (UDP)`}
                autoNote="o el primero libre"
              />
              <SummaryRow
                label="Memoria"
                value={`${(DEFAULT_MEMORY_MB / 1024).toFixed(0)} GB`}
                autoNote="se cambia después"
              />
              <SummaryRow
                label="Versión"
                value="la última de Steam"
                autoNote="la elige el juego"
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>Son 6,7 GB y un rato de espera</strong>
              <p>
                Después de descargarlo, el servidor arranca una vez para generar el mundo y escribir
                su configuración: tarda alrededor de un minuto y medio y solo pasa esta vez. Y ten a
                mano {MEMORY_RECOMMENDED_GB} GB de memoria libre: la Build 42 pide bastante.
              </p>
            </div>

            <div className="card" style={{ textAlign: 'left', marginBottom: 0 }}>
              <h3>Condiciones</h3>
              <p className="hint">
                El servidor se descarga de Steam de forma anónima, sin cuenta ni contraseña. Steam
                pide aceptar su acuerdo para usar sus descargas.
              </p>
              <label className="row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <span>
                  He leído y acepto el{' '}
                  <a
                    href={GAMES.zomboid.agreements[0]!.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)' }}
                  >
                    Acuerdo de Suscriptor de Steam
                  </a>
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="row between wizard-nav">
          <button onClick={back}>
            {editing ? 'Volver al resumen' : stepIndex <= 0 && onStep ? 'Cancelar' : 'Atrás'}
          </button>

          {onStep ? (
            <button className="primary" disabled={!canContinue} onClick={next}>
              {editing ? 'Listo' : 'Siguiente →'}
            </button>
          ) : (
            <button className="primary" disabled={!agreed || !claveOk} onClick={() => void create()}>
              Crear servidor
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
