import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import { D20Loader } from '../../D20Loader'
import { Choices, StepDots, StepFrame, SummaryRow, labelOf, type Option } from '../../WizardParts'
import { MemoryNotice } from './MemoryNotice'

/**
 * Asistente en modo básico de Satisfactory.
 *
 * Mismo trato que en Minecraft: una pregunta por pantalla, siempre con algo ya
 * elegido, y al terminar el servidor queda listo para jugar. Aquí «listo»
 * incluye algo que normalmente obliga a abrir el juego: la app **reclama el
 * servidor sola** y le crea la partida durante la instalación.
 *
 * Lo que no se pregunta: versión (siempre la última de Steam), memoria (la
 * gestiona el propio juego) y puerto (se coge el primero libre desde el 7777).
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

type Step = 'nombre' | 'jugadores' | 'clave-admin' | 'clave-jugadores' | 'conexion'
type Stage = Step | 'resumen'

const CONNECTIONS: Option<ExposureMode>[] = [
  {
    value: 'local',
    title: 'Solo desde mi casa',
    sub: 'Quien esté en tu mismo wifi o router. No hay que tocar nada más.'
  },
  {
    value: 'router',
    title: 'Desde cualquier sitio, abriendo el router',
    sub: 'El mejor ping. Hay que abrir dos puertos y no funciona si tu compañía usa CGNAT.'
  },
  {
    value: 'tunnel',
    title: 'Desde cualquier sitio, con playit.gg',
    sub: 'Sin tocar el router y funciona casi siempre, a cambio de algo más de ping.'
  }
]

const STEPS: Step[] = ['nombre', 'jugadores', 'clave-admin', 'clave-jugadores', 'conexion']

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState('Mi fábrica')
  const [expectedPlayers, setExpectedPlayers] = useState(4)
  const [adminPassword, setAdminPassword] = useState('')
  const [clientPassword, setClientPassword] = useState('')
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [totalMemoryMb, setTotalMemoryMb] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.qubiq.system
      .memory()
      .then((memory) => {
        if (!cancelled) setTotalMemoryMb(memory.totalMb)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const stepIndex = STEPS.indexOf(stage as Step)
  const onStep = stepIndex !== -1

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

  // La contraseña de administrador no puede quedarse vacía: es con la que la
  // app habla con el servidor y con la que el usuario manda dentro del juego.
  const adminOk = adminPassword.trim().length >= 4
  const canContinue =
    (stage !== 'nombre' || name.trim().length > 0) && (stage !== 'clave-admin' || adminOk)

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      // El 7777 lo usan el juego (UDP) y el panel del servidor (TCP): se busca
      // uno libre en los dos protocolos a la vez.
      const port = await window.qubiq.network.freePort(defaultPortFor('satisfactory'), 'tcp+udp')

      const manifest = await window.qubiq.instances.create({
        game: 'satisfactory',
        name,
        expectedPlayers,
        port,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          adminPassword: adminPassword.trim(),
          clientPassword: clientPassword.trim(),
          // La partida se llama como el servidor: es lo que verán al entrar, y
          // preguntarlo dos veces sería preguntar lo mismo.
          sessionName: name.trim()
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
              Satisfactory ocupa unos 15 GB, así que la primera vez tarda un buen rato. Después lo
              arrancamos una vez para ponerle nombre y contraseña y crear la partida: cuando
              termine, no tendrás que tocar nada dentro del juego.
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
            help="Es el nombre que verán tus amigos al añadir el servidor, y también el de la partida."
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

        {stage === 'jugadores' && (
          <StepFrame
            title="¿Cuánta gente vais a ser?"
            help="Satisfactory viene preparado para cuatro; se puede subir, pero cada jugador de más carga bastante al equipo."
          >
            <div className="big-number">{expectedPlayers}</div>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={expectedPlayers}
              onChange={(e) => setExpectedPlayers(Number(e.target.value))}
            />
            <div className="help" style={{ textAlign: 'center', marginTop: 10 }}>
              {expectedPlayers > 4
                ? 'Por encima de cuatro el propio estudio no lo garantiza: si notáis tirones, baja el número.'
                : 'Es el límite de gente conectada a la vez.'}
            </div>
            <MemoryNotice totalMemoryMb={totalMemoryMb} players={expectedPlayers} />
          </StepFrame>
        )}

        {stage === 'clave-admin' && (
          <StepFrame
            title="Ponle una contraseña de administrador"
            help="Con ella mandas tú en la partida desde el juego, y es la que usa esta app para hablar con el servidor. No es la que usarán tus amigos para entrar."
          >
            <input
              type="text"
              value={adminPassword}
              maxLength={40}
              autoFocus
              placeholder="Al menos 4 caracteres"
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              Se ve a propósito: es tuya y la vas a necesitar dentro del juego. Queda guardada en
              este ordenador, junto a los datos del servidor.
            </div>
          </StepFrame>
        )}

        {stage === 'clave-jugadores' && (
          <StepFrame
            title="¿Y una contraseña para entrar?"
            help="La que tendrán que escribir tus amigos. Si la dejas vacía, podrá entrar cualquiera que tenga la dirección."
          >
            <input
              type="text"
              value={clientPassword}
              maxLength={40}
              autoFocus
              placeholder="Vacío = sin contraseña"
              onChange={(e) => setClientPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') next()
              }}
            />
            {clientPassword.trim().length === 0 && connectionIsOpen(connection) && (
              <div className="alert warn" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>Sin contraseña y abierto a internet</strong>
                <p>
                  Cualquiera que dé con tu dirección podrá entrar en la partida. Si vas a abrirlo
                  fuera de casa, ponle una.
                </p>
              </div>
            )}
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame
            title="¿Desde dónde se van a conectar?"
            help="Si alguien jugará desde otra casa, elige una de las dos últimas."
          >
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            {connection !== 'local' && (
              <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
                Satisfactory necesita <strong>dos puertos</strong>, no uno. Cuando termines tendrás
                la guía con los dos en <strong>Configuración → Conexión</strong>.
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
              <SummaryRow
                label="Jugadores a la vez"
                value={String(expectedPlayers)}
                onEdit={() => edit('jugadores')}
              />
              <SummaryRow
                label="Contraseña de administrador"
                value={adminPassword}
                onEdit={() => edit('clave-admin')}
              />
              <SummaryRow
                label="Contraseña para entrar"
                value={clientPassword.trim().length > 0 ? clientPassword : 'sin contraseña'}
                onEdit={() => edit('clave-jugadores')}
              />
              <SummaryRow
                label="Se conectan"
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow label="Partida" value={name} autoNote="se llama como el servidor" />
              <SummaryRow
                label="Versión"
                value="la última de Steam"
                autoNote="la elige el juego"
                last
              />
            </div>

            <MemoryNotice totalMemoryMb={totalMemoryMb} players={expectedPlayers} />

            {/* Las dos cosas solo se saben juntas aquí: la contraseña se elige
                antes que la forma de conectarse. */}
            {clientPassword.trim().length === 0 && connectionIsOpen(connection) && (
              <div className="alert warn" style={{ textAlign: 'left' }}>
                <strong>Sin contraseña y abierto a internet</strong>
                <p>
                  Has elegido que se pueda entrar desde fuera de tu casa y la partida no pide
                  contraseña: cualquiera que dé con tu dirección podrá entrar. Puedes ponerle una
                  ahora o más tarde, en Configuración → Ajustes.
                </p>
              </div>
            )}

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>Son 15,5 GB de descarga</strong>
              <p>
                Es lo que ocupa el servidor de Satisfactory. Se descarga una vez por servidor y se
                queda en tu equipo; después, actualizarlo solo baja lo que cambie.
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
                    href={GAMES.satisfactory.agreements[0]!.url}
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
            <button className="primary" disabled={!agreed || !adminOk} onClick={() => void create()}>
              Crear servidor
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function connectionIsOpen(mode: ExposureMode): boolean {
  return mode !== 'local'
}
