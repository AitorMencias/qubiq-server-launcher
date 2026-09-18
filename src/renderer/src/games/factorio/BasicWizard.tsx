import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import { MIN_PASSWORD_LENGTH, PRESETS, type FactorioPreset } from '@shared/games/factorio/types'
import { D20Loader } from '../../D20Loader'
import { Choices, StepDots, StepFrame, SummaryRow, labelOf, type Option } from '../../WizardParts'
import { GameSource, type GameSourceChoice } from './GameSource'

/**
 * Asistente en modo básico de Factorio.
 *
 * Una pregunta por pantalla, como en los demás juegos, pero con una que no
 * tienen los otros y que va primero: **de dónde sale el juego**. Sin resolver
 * eso no hay servidor, así que no tiene sentido preguntar nada más antes.
 *
 * Lo que no se pregunta: puerto (el primero libre desde el 34197), memoria (no
 * se reserva), RCON (lo pone la app sola, atado a este equipo, porque es la
 * única forma de parar el servidor) y versión (la estable de Steam).
 *
 * Space Age solo se ofrece cuando se sabe que está: si se copia de una
 * instalación, mirando si trae la carpeta; si se descarga, no se sabe hasta
 * bajarlo, así que se pregunta avisando.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

type Step = 'juego' | 'nombre' | 'clave' | 'contenido' | 'mapa' | 'conexion'
type Stage = Step | 'resumen'

const STEPS: Step[] = ['juego', 'nombre', 'clave', 'contenido', 'mapa', 'conexion']

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
    sub: 'Sin tocar el router, dependiendo de un servicio de fuera. Funciona con CGNAT.'
  }
]

const CONTENIDO: Option<'space-age' | 'base'>[] = [
  {
    value: 'space-age',
    title: 'Con Space Age',
    sub: 'La expansión: más planetas, calidad y raíles elevados. Todos los que entren la necesitan.'
  },
  {
    value: 'base',
    title: 'El Factorio de siempre',
    sub: 'Solo el juego base. Entra cualquiera que tenga Factorio, con expansión o sin ella.'
  }
]

/** Los cuatro de siempre delante; el resto están en el modo avanzado. */
const SIMPLE_PRESETS = PRESETS.filter((p) =>
  ['default', 'rich-resources', 'rail-world', 'death-world'].includes(p.id)
).map((p) => ({ value: p.id, title: p.name, sub: p.description }))

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('juego')
  const [editing, setEditing] = useState(false)

  const [source, setSource] = useState<GameSourceChoice | null>(null)
  const [name, setName] = useState('Mi fábrica')
  const [password, setPassword] = useState('')
  const [contenido, setContenido] = useState<'space-age' | 'base'>('space-age')
  const [preset, setPreset] = useState<FactorioPreset>('default')
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(stage as Step)
  const onStep = stepIndex !== -1

  const passwordOk = password.trim().length >= MIN_PASSWORD_LENGTH
  const passwordInName = name.toLowerCase().includes(password.trim().toLowerCase())
  const claveOk = passwordOk && !passwordInName

  // Si se copia de una instalación sin Space Age, no hay nada que elegir.
  const spaceAgeImposible = source?.spaceAge === false
  const canContinue =
    (stage !== 'juego' || source !== null) &&
    (stage !== 'nombre' || name.trim().length > 0) &&
    (stage !== 'clave' || claveOk)

  function next(): void {
    if (!onStep) return
    if (editing || stepIndex === STEPS.length - 1) {
      setEditing(false)
      setStage('resumen')
      return
    }
    // La pregunta del contenido no se hace si el juego no puede traerlo.
    const siguiente = STEPS[stepIndex + 1]!
    if (siguiente === 'contenido' && spaceAgeImposible) {
      setContenido('base')
      setStage(STEPS[stepIndex + 2]!)
      return
    }
    setStage(siguiente)
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
    const anterior = STEPS[stepIndex - 1]!
    if (anterior === 'contenido' && spaceAgeImposible) {
      setStage(STEPS[stepIndex - 2]!)
      return
    }
    setStage(anterior)
  }

  function edit(target: Step): void {
    setEditing(true)
    setStage(target)
  }

  async function create(): Promise<void> {
    if (!source) return
    setBusy(true)
    setError(null)
    try {
      const port = await window.qubiq.network.freePort(defaultPortFor('factorio'), 'udp')
      const manifest = await window.qubiq.instances.create({
        game: 'factorio',
        name,
        port,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          source: source.source,
          ...(source.sourcePath ? { sourcePath: source.sourcePath } : {}),
          ...(source.steamUser ? { steamUser: source.steamUser } : {}),
          password: password.trim(),
          preset,
          spaceAge: contenido === 'space-age'
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
              {source?.source === 'steamcmd'
                ? 'Factorio son unos 5 GB de descarga. Luego se queda en unos 250 MB, porque un servidor no necesita ni las imágenes ni los sonidos.'
                : 'Se copia tu Factorio y se le quita lo que un servidor no dibuja: queda en unos 250 MB. Tu instalación no se toca.'}
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              {progress?.detail ?? 'Trabajando...'}
            </p>
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

        {stage === 'juego' && (
          <StepFrame
            title="¿De dónde sacamos Factorio?"
            help="Factorio no tiene servidor aparte: el servidor es el propio juego, así que hace falta tenerlo."
          >
            <GameSource value={source} onChange={setSource} />
          </StepFrame>
        )}

        {stage === 'nombre' && (
          <StepFrame
            title="¿Cómo se va a llamar?"
            help="Es el nombre que verán tus amigos al conectarse."
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoFocus
            />
          </StepFrame>
        )}

        {stage === 'clave' && (
          <StepFrame
            title="Ponle una contraseña"
            help="Sin ella, cualquiera que sepa la dirección puede entrar y tocar tu fábrica."
          >
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`Al menos ${MIN_PASSWORD_LENGTH} caracteres`}
              autoFocus
            />
            {password.length > 0 && !passwordOk && (
              <p className="hint">Hacen falta al menos {MIN_PASSWORD_LENGTH} caracteres.</p>
            )}
            {passwordOk && passwordInName && (
              <p className="hint">
                Esa contraseña está dentro del nombre del servidor, que todos ven. Pon otra.
              </p>
            )}
          </StepFrame>
        )}

        {stage === 'contenido' && (
          <StepFrame
            title="¿Con Space Age?"
            help={
              source?.spaceAge === null
                ? 'Si tu cuenta de Steam no tiene la expansión, se descargará sin ella y habrá que crear el servidor de nuevo sin Space Age.'
                : 'Esto se decide ahora y no se puede cambiar luego: el mapa se genera con la expansión o sin ella.'
            }
          >
            <Choices options={CONTENIDO} value={contenido} onChange={setContenido} columns={1} />
          </StepFrame>
        )}

        {stage === 'mapa' && (
          <StepFrame
            title="¿Cómo quieres el mapa?"
            help="Son los mismos ajustes que ofrece el juego al empezar una partida."
          >
            <Choices options={SIMPLE_PRESETS} value={preset} onChange={setPreset} />
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame
            title="¿Quién va a entrar?"
            help="Factorio necesita un solo puerto UDP. Esto se puede cambiar después."
          >
            <Choices
              options={CONNECTIONS}
              value={connection}
              onChange={setConnection}
              columns={1}
            />
          </StepFrame>
        )}

        {stage === 'resumen' && (
          <StepFrame
            title="Todo listo, revísalo"
            help="Así va a quedar tu servidor. Si algo no cuadra, toca en «cambiar»."
          >
            {/* Igual que en los demás juegos: las filas van dentro de una tarjeta y
                alineadas a la izquierda, aunque el paso centre su texto. */}
            <div className="card" style={{ textAlign: 'left' }}>
              <SummaryRow
                label="Juego"
                value={
                  source?.source === 'local' ? 'Copiado del que ya tienes' : 'Descargado de Steam'
                }
                onEdit={() => edit('juego')}
              />
              <SummaryRow label="Nombre" value={name} onEdit={() => edit('nombre')} />
              <SummaryRow label="Contraseña" value={password.trim()} onEdit={() => edit('clave')} />
              {!spaceAgeImposible && (
                <SummaryRow
                  label="Contenido"
                  value={labelOf(CONTENIDO, contenido)}
                  onEdit={() => edit('contenido')}
                />
              )}
              <SummaryRow
                label="Mapa"
                value={labelOf(SIMPLE_PRESETS, preset)}
                onEdit={() => edit('mapa')}
              />
              <SummaryRow
                label="Conexión"
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label="Verificar cuentas"
                value="sí, con factorio.com"
                autoNote="como hace el juego"
              />
              <SummaryRow
                label="Versión"
                value={source?.source === 'local' ? 'la de tu instalación' : 'la estable de Steam'}
                autoNote="la tienen que tener tus amigos"
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>
                {source?.source === 'local'
                  ? 'Se copia tu Factorio, sin tocarlo'
                  : 'Son unos 5 GB de descarga'}
              </strong>
              <p>
                {source?.source === 'local'
                  ? 'Se le quitan las imágenes y los sonidos, que un servidor no necesita, y queda en unos 250 MB. Tu instalación sigue igual.'
                  : 'Luego se le quitan las imágenes y los sonidos, que un servidor no necesita, y queda en unos 250 MB. La descarga no se guarda.'}
              </p>
            </div>

            <div className="card" style={{ textAlign: 'left', marginBottom: 0 }}>
              <h3>Condiciones</h3>
              <p className="hint">
                El juego viene de Steam, y Steam pide aceptar su acuerdo para usar sus descargas.
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
                    href={GAMES.factorio.agreements[0]!.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)' }}
                  >
                    Acuerdo de Suscriptor de Steam
                  </a>
                </span>
              </label>
            </div>
          </StepFrame>
        )}

        {/* Los mismos botones y los mismos textos que los demás juegos: crear un
            servidor tiene que sentirse igual sea del juego que sea. */}
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
              disabled={!agreed || !claveOk}
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
