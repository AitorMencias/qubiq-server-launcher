import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  MIN_PASSWORD_LENGTH,
  PRESETS,
  queryPortFor,
  type ValheimPreset
} from '@shared/games/valheim/types'
import { D20Loader } from '../../D20Loader'
import { Choices, StepDots, StepFrame, SummaryRow, labelOf, type Option } from '../../WizardParts'

/**
 * Asistente en modo básico de Valheim.
 *
 * Una pregunta por pantalla, siempre con algo ya elegido. Valheim se presta:
 * toda su configuración son cinco decisiones, y ninguna es técnica.
 *
 * Lo que no se pregunta: puerto (el primero libre desde el 2456, con el
 * siguiente también libre), memoria (no se reserva) y versión (siempre la
 * última de Steam).
 *
 * La pregunta de la conexión es distinta a la de los demás juegos, y a
 * propósito: en Valheim la respuesta recomendada para quien no puede abrir
 * puertos **no es playit.gg, sino el crossplay del propio juego**, que no
 * depende de nadie de fuera y funciona con CGNAT.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

type Step = 'nombre' | 'mundo' | 'clave' | 'dificultad' | 'conexion'
type Stage = Step | 'resumen'

const STEPS: Step[] = ['nombre', 'mundo', 'clave', 'dificultad', 'conexion']

const CONNECTIONS: Option<ExposureMode>[] = [
  {
    value: 'local',
    title: 'Solo desde mi casa',
    sub: 'Quien esté en tu mismo wifi o router. No hay que tocar nada más.'
  },
  {
    value: 'crossplay',
    title: 'Desde cualquier sitio, con el código del juego',
    sub: 'Lo trae Valheim: sin router, funciona casi siempre y tus amigos entran con un código de 6 dígitos.'
  },
  {
    value: 'router',
    title: 'Desde cualquier sitio, abriendo el router',
    sub: 'El mejor ping. Hay que abrir dos puertos y no funciona si tu compañía usa CGNAT.'
  },
  {
    value: 'tunnel',
    title: 'Desde cualquier sitio, con playit.gg',
    sub: 'Sin tocar el router, pero dependiendo de un servicio de fuera. Con Valheim casi nunca hace falta.'
  }
]

/** Los tres de siempre delante; el resto, para quien los busque. */
const SIMPLE_PRESETS = PRESETS.filter((p) => ['casual', 'normal', 'hard'].includes(p.value))

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState('Mi Valheim')
  const [worldName, setWorldName] = useState('')
  const [password, setPassword] = useState('')
  const [preset, setPreset] = useState<ValheimPreset>('normal')
  const [connection, setConnection] = useState<ExposureMode>('crossplay')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(stage as Step)
  const onStep = stepIndex !== -1
  const world = worldName.trim() || name.trim()

  const passwordOk = password.trim().length >= MIN_PASSWORD_LENGTH
  const passwordInName = name.toLowerCase().includes(password.trim().toLowerCase())
  const claveOk = passwordOk && !passwordInName

  const canContinue =
    (stage !== 'nombre' || name.trim().length > 0) &&
    (stage !== 'mundo' || world.length > 0) &&
    (stage !== 'clave' || claveOk)

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
      // Valheim usa el puerto y el siguiente, y el segundo no se puede mover
      // por separado: hay que buscar un hueco donde quepan los dos.
      const port = await window.qubiq.network.freePort(defaultPortFor('valheim'), 'udp')

      const manifest = await window.qubiq.instances.create({
        game: 'valheim',
        name,
        port,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          password: password.trim(),
          worldName: world,
          preset
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
              Valheim ocupa unos 2 GB, así que no tarda mucho. El mundo lo genera el servidor la
              primera vez que arranque, y eso sí lleva medio minuto.
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
            help="Es el nombre que verán tus amigos al añadir el servidor en su lista."
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

        {stage === 'mundo' && (
          <StepFrame
            title="¿Y el mundo?"
            help="El nombre decide cómo sale el terreno: dos mundos con el mismo nombre son idénticos. Si lo dejas vacío, se llama como el servidor."
          >
            <input
              value={worldName}
              maxLength={40}
              autoFocus
              placeholder={name}
              onChange={(e) => setWorldName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              Más adelante podrás crear otros mundos y cambiar de uno a otro sin perder este.
            </div>
          </StepFrame>
        )}

        {stage === 'clave' && (
          <StepFrame
            title="Ponle una contraseña"
            help="La que tendrán que escribir tus amigos para entrar. En Valheim es obligatoria salvo que te la juegues con el servidor abierto."
          >
            <input
              type="text"
              value={password}
              maxLength={40}
              autoFocus
              placeholder={`Al menos ${MIN_PASSWORD_LENGTH} caracteres`}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
            {password.trim().length > 0 && !passwordOk && (
              <div className="alert error" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>Se queda corta</strong>
                <p>Valheim pide al menos {MIN_PASSWORD_LENGTH} caracteres.</p>
              </div>
            )}
            {passwordInName && password.trim().length > 0 && (
              <div className="alert error" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>Está dentro del nombre del servidor</strong>
                <p>
                  El nombre lo ve cualquiera, así que la contraseña dejaría de serlo. Cambia una de
                  las dos.
                </p>
              </div>
            )}
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              Se ve a propósito: la vas a tener que repartir. Queda guardada en este ordenador.
            </div>
          </StepFrame>
        )}

        {stage === 'dificultad' && (
          <StepFrame
            title="¿Cómo de duro lo queréis?"
            help="Afecta a todo el mundo por igual. Se puede cambiar después desde Configuración."
          >
            <Choices
              options={SIMPLE_PRESETS.map((p) => ({
                value: p.value,
                title: p.label,
                sub: p.help
              }))}
              value={preset}
              onChange={setPreset}
              columns={1}
            />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              En modo avanzado hay más ajustes: sin mapa, construir gratis, sin portales…
            </div>
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame
            title="¿Desde dónde se van a conectar?"
            help="Si alguien jugará desde otra casa, el crossplay del propio juego es lo más sencillo."
          >
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            {connection === 'crossplay' && (
              <div className="alert info" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>Sin abrir nada en el router</strong>
                <p>
                  Al arrancar, el servidor da un código de 6 dígitos que verás en su pantalla. Tus
                  amigos entran con él. Cambia cada vez que lo arrancas.
                </p>
              </div>
            )}
            {connection === 'router' && (
              <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
                Valheim necesita <strong>dos puertos UDP</strong> seguidos, no uno. Cuando termines
                tendrás la guía con los dos en <strong>Configuración → Conexión</strong>.
              </div>
            )}
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
              <SummaryRow label="Mundo" value={world} onEdit={() => edit('mundo')} />
              <SummaryRow label="Contraseña" value={password} onEdit={() => edit('clave')} />
              <SummaryRow
                label="Dificultad"
                value={PRESETS.find((p) => p.value === preset)?.label ?? preset}
                onEdit={() => edit('dificultad')}
              />
              <SummaryRow
                label="Se conectan"
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label="Puertos"
                value={`${defaultPortFor('valheim')} y ${queryPortFor(defaultPortFor('valheim'))} (UDP)`}
                autoNote="o los primeros libres"
              />
              <SummaryRow
                label="Versión"
                value="la última de Steam"
                autoNote="la elige el juego"
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>Son 2 GB de descarga</strong>
              <p>
                Es lo que ocupa el servidor de Valheim, el más ligero de todos. Se descarga una vez
                por servidor y se queda en tu equipo.
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
                    href={GAMES.valheim.agreements[0]!.url}
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
