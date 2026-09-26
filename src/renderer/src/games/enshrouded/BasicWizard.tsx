import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  MIN_PASSWORD_LENGTH,
  PRESETS,
  presetInfo,
  type EnshroudedPreset,
  type EnshroudedRole
} from '@shared/games/enshrouded/types'
import { D20Loader } from '../../D20Loader'
import { Choices, StepDots, StepFrame, SummaryRow, labelOf, type Option } from '../../WizardParts'
import { rolesFor } from './roles'

/**
 * Asistente en modo básico de Enshrouded.
 *
 * Una pregunta por pantalla, siempre con algo ya elegido. La pregunta rara de
 * este juego es la de las contraseñas: **en Enshrouded no hay una contraseña
 * del servidor, sino una por rol**, y la que usas al entrar decide lo que
 * puedes hacer dentro. Aquí se preguntan las dos que de verdad importan
 * (Administrador y Amigo), ya rellenas; las otras dos están en modo avanzado.
 *
 * Y hay un aviso que no se puede ahorrar: Enshrouded **no tiene forma de no
 * publicarse**. En cuanto arranca sale en la lista de servidores del juego con
 * la dirección de casa. Se dice antes de crear nada, no después.
 *
 * Lo que no se pregunta: puerto (el primero libre desde el 15637), memoria (no
 * se reserva) y versión (siempre la última de Steam).
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

type Step = 'nombre' | 'mundo' | 'gente' | 'claves' | 'dificultad' | 'conexion'
type Stage = Step | 'resumen'

const STEPS: Step[] = ['nombre', 'mundo', 'gente', 'claves', 'dificultad', 'conexion']

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
    sub: 'Sin tocar el router, pero dependiendo de un servicio de fuera y con algo más de retardo.'
  }
]

/** Los tres de siempre delante; «A mi manera» se deja para el modo avanzado. */
const SIMPLE_PRESETS = PRESETS.filter((p) => p.value !== 'Custom')

const PLAYER_CHOICES: Option<string>[] = [
  { value: '4', title: 'Cuatro', sub: 'Lo normal para jugar con amigos. Es lo que pide menos al equipo.' },
  { value: '8', title: 'Ocho', sub: 'Un grupo grande. Conviene tener 12 GB de memoria libres.' },
  { value: '16', title: 'Dieciséis', sub: 'El máximo que admite Enshrouded. Pide un equipo con holgura.' }
]

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState('Mi Enshrouded')
  const [worldName, setWorldName] = useState('')
  const [players, setPlayers] = useState('4')
  // Rellenas de partida: el servidor también las sortea, y así nadie se queda
  // con un servidor sin contraseña por no saber qué poner.
  const [adminPassword, setAdminPassword] = useState(() => suggestPassword())
  const [friendPassword, setFriendPassword] = useState(() => suggestPassword())
  const [preset, setPreset] = useState<EnshroudedPreset>('Default')
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(stage as Step)
  const onStep = stepIndex !== -1
  const world = worldName.trim() || name.trim()

  const adminOk = adminPassword.trim().length >= MIN_PASSWORD_LENGTH
  const friendOk = friendPassword.trim().length >= MIN_PASSWORD_LENGTH
  const distintas = adminPassword.trim() !== friendPassword.trim()
  const clavesOk = adminOk && friendOk && distintas

  const canContinue =
    (stage !== 'nombre' || name.trim().length > 0) &&
    (stage !== 'mundo' || world.length > 0) &&
    (stage !== 'claves' || clavesOk)

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
      const port = await window.qubiq.network.freePort(defaultPortFor('enshrouded'), 'udp')

      const roles: EnshroudedRole[] = rolesFor(adminPassword.trim(), friendPassword.trim())

      const manifest = await window.qubiq.instances.create({
        game: 'enshrouded',
        name,
        port,
        expectedPlayers: Number(players),
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: { worldName: world, preset, roles }
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
              Enshrouded ocupa 8,8 GB, así que la descarga da para un café. Arrancarlo después es lo
              de menos: el mundo se genera en unos segundos.
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
            help="Es el nombre con el que sale en la lista de servidores del juego."
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
            help="Es el nombre de la partida guardada. Si lo dejas vacío, se llama como el servidor."
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

        {stage === 'gente' && (
          <StepFrame
            title="¿Cuánta gente vais a ser?"
            help="Decide las plazas del servidor. Se puede cambiar después."
          >
            <Choices options={PLAYER_CHOICES} value={players} onChange={setPlayers} columns={1} />
          </StepFrame>
        )}

        {stage === 'claves' && (
          <StepFrame
            title="Las dos contraseñas"
            help="En Enshrouded no hay una contraseña del servidor: hay una por rol, y la que usas al entrar decide lo que puedes hacer dentro."
          >
            <div className="field" style={{ textAlign: 'left' }}>
              <label>Administrador — para ti</label>
              <input
                type="text"
                value={adminPassword}
                maxLength={40}
                autoFocus
                onChange={(e) => setAdminPassword(e.target.value)}
              />
              <div className="help">
                Con esta puedes construir donde quieras, abrir cualquier cofre y echar o vetar a
                alguien desde el propio juego.
              </div>
            </div>

            <div className="field" style={{ textAlign: 'left' }}>
              <label>Amigo — para los demás</label>
              <input
                type="text"
                value={friendPassword}
                maxLength={40}
                onChange={(e) => setFriendPassword(e.target.value)}
              />
              <div className="help">
                Pueden construir, picar y abrir cofres, pero no echar a nadie ni tocar los altares
                que marcan hasta dónde llega cada base.
              </div>
            </div>

            {(adminPassword.trim().length > 0 || friendPassword.trim().length > 0) &&
              (!adminOk || !friendOk) && (
                <div className="alert error" style={{ textAlign: 'left' }}>
                  <strong>Se quedan cortas</strong>
                  <p>Pon al menos {MIN_PASSWORD_LENGTH} caracteres en las dos.</p>
                </div>
              )}
            {!distintas && (
              <div className="alert error" style={{ textAlign: 'left' }}>
                <strong>Son la misma</strong>
                <p>
                  Si dos roles comparten contraseña, el servidor no sabe cuál de los dos darle a
                  quien entra, y ni siquiera arranca.
                </p>
              </div>
            )}
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              Se ven a propósito: las vas a tener que repartir. En modo avanzado hay dos roles más
              (Invitado y Visitante) para quien solo venga de visita.
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
              En modo avanzado se puede afinar cada cosa por separado: vida, hambre, cantidad de
              bichos, duración del día…
            </div>
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame
            title="¿Desde dónde se van a conectar?"
            help="Si alguien jugará desde otra casa, hay que abrir el router o usar un túnel."
          >
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            <div className="alert warn" style={{ textAlign: 'left', marginTop: 14 }}>
              <strong>Enshrouded siempre sale en su lista de servidores</strong>
              <p>
                El juego no tiene forma de crear un servidor privado: en cuanto arranca se anuncia
                con la dirección de tu casa, elijas lo que elijas aquí. Lo que sí impide que entre
                cualquiera son las contraseñas de los roles, que ya has puesto.
              </p>
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
              <SummaryRow label="Mundo" value={world} onEdit={() => edit('mundo')} />
              <SummaryRow label="Plazas" value={players} onEdit={() => edit('gente')} />
              <SummaryRow
                label="Contraseña de admin"
                value={adminPassword}
                onEdit={() => edit('claves')}
              />
              <SummaryRow
                label="Contraseña de amigo"
                value={friendPassword}
                onEdit={() => edit('claves')}
              />
              <SummaryRow
                label="Dificultad"
                value={presetInfo(preset).label}
                onEdit={() => edit('dificultad')}
              />
              <SummaryRow
                label="Se conectan"
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label="Puerto"
                value={`${defaultPortFor('enshrouded')} (UDP)`}
                autoNote="o el primero libre"
              />
              <SummaryRow
                label="Versión"
                value="la última de Steam"
                autoNote="la elige el juego"
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>Son 8,8 GB de descarga</strong>
              <p>
                Es lo que ocupa el servidor de Enshrouded. Se descarga una vez por servidor y se
                queda en tu equipo. Conviene tener 6 GB de memoria libres para que arranque, y 12
                para ir cómodo.
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
                    href={GAMES.enshrouded.agreements[0]!.url}
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
            <button
              className="primary"
              disabled={!agreed || !clavesOk}
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

/** Una contraseña que se pueda dictar por teléfono y no se adivine. */
export function suggestPassword(): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789'
  let salida = ''
  for (let i = 0; i < 10; i++) {
    salida += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  }
  return salida
}
