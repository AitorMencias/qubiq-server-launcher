import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  DEFAULT_WORLD_SIZE,
  WORLD_SIZES,
  nextForcedWipe,
  worldSizeInfo,
  worldSizeLabel
} from '@shared/games/rust/types'
import { D20Loader } from '../../D20Loader'
import { Choices, StepDots, StepFrame, SummaryRow, labelOf, type Option } from '../../WizardParts'
import { MemoryNotice } from './MemoryNotice'
import { WipeExplainer, wipeDateLabel } from './wipeText'

/**
 * Asistente en modo básico de Rust.
 *
 * Una pregunta por pantalla, siempre con algo ya elegido. Lo que tiene de raro
 * este juego se pregunta a la vista en vez de esconderlo:
 *
 * - **El tamaño del mapa** decide la memoria y lo que tarda el primer arranque,
 *   con las cifras medidas contra el servidor real.
 * - **El borrado mensual**: se explica y se decide aquí si lo hace la app sola.
 * - **Rust siempre sale en su lista de servidores**, como Enshrouded: se dice
 *   antes de crear nada.
 *
 * Lo que no se pregunta: puerto (el primero libre desde el 28015), semilla (una
 * al azar) y versión (siempre la última de Steam, que es la única que vale).
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

type Step = 'nombre' | 'mapa' | 'gente' | 'partida' | 'borrado' | 'conexion'
type Stage = Step | 'resumen'

const STEPS: Step[] = ['nombre', 'mapa', 'gente', 'partida', 'borrado', 'conexion']

const CONNECTIONS: Option<ExposureMode>[] = [
  {
    value: 'local',
    title: 'Solo desde mi casa',
    sub: 'Quien esté en tu mismo wifi o router. No hay que tocar nada más.'
  },
  {
    value: 'router',
    title: 'Desde cualquier sitio, abriendo el router',
    sub: 'El mejor ping. Hay que abrir dos puertos UDP y no funciona si tu compañía usa CGNAT.'
  },
  {
    value: 'tunnel',
    title: 'Desde cualquier sitio, con playit.gg',
    sub: 'Sin tocar el router, pero dependiendo de un servicio de fuera y con algo más de retardo.'
  }
]

const MAPS: Option<string>[] = WORLD_SIZES.map((w) => ({
  value: String(w.size),
  title: `${w.label} (${w.size} m)`,
  sub: `${w.players[0]!.toUpperCase()}${w.players.slice(1)}. Usa unos ${w.memoryGb.toLocaleString('es-ES')} GB de memoria y la primera vez tarda ${w.firstStart} en generarse.`
}))

const PLAYER_CHOICES: Option<string>[] = [
  { value: '4', title: 'Hasta cuatro', sub: 'Un grupo pequeño de amigos.' },
  { value: '10', title: 'Hasta diez', sub: 'Un grupo grande. Con un mapa mediano va bien.' },
  { value: '25', title: 'Hasta veinticinco', sub: 'Una comunidad. Pide un equipo y una conexión con holgura.' }
]

type Mode = 'pvp' | 'pve'

const MODES: Option<Mode>[] = [
  {
    value: 'pvp',
    title: 'Todos contra todos',
    sub: 'El Rust de siempre: se puede atacar a cualquiera y asaltar su base.'
  },
  {
    value: 'pve',
    title: 'Sin peleas entre jugadores',
    sub: 'Cooperativo: los jugadores no se hacen daño entre ellos. Los animales y los científicos, sí.'
  }
]

type WipeChoice = 'aviso' | 'auto'

const WIPES: Option<WipeChoice>[] = [
  {
    value: 'aviso',
    title: 'Avísame y lo hago yo',
    sub: 'Cuando llegue el día sale un aviso con un botón que lo hace todo. Tú decides cuándo.'
  },
  {
    value: 'auto',
    title: 'Que lo haga la app sola',
    sub: 'En cuanto sale la actualización, la app guarda una copia, actualiza y empieza el mapa nuevo. Si a esa hora está cerrada, lo hace en cuanto la abras.'
  }
]

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState('Mi Rust')
  const [worldSize, setWorldSize] = useState(String(DEFAULT_WORLD_SIZE))
  const [players, setPlayers] = useState('4')
  const [mode, setMode] = useState<Mode>('pvp')
  const [wipe, setWipe] = useState<WipeChoice>('aviso')
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(stage as Step)
  const onStep = stepIndex !== -1
  const canContinue = stage !== 'nombre' || name.trim().length > 0
  const mapa = worldSizeInfo(Number(worldSize))

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
      const port = await window.qubiq.network.freePort(defaultPortFor('rust'), 'udp')
      const manifest = await window.qubiq.instances.create({
        game: 'rust',
        name,
        port,
        expectedPlayers: Number(players),
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          worldSize: Number(worldSize),
          maxPlayers: Number(players),
          settings: mode === 'pve' ? { 'server.pve': true } : {},
          wipe: { auto: wipe === 'auto' }
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
              Rust ocupa 5,5 GB. Cuando termine, la primera vez que lo arranques generará el mapa, y
              eso tarda {mapa?.firstStart ?? 'unos minutos'}: las siguientes veces arranca en segundos.
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
              maxLength={60}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
          </StepFrame>
        )}

        {stage === 'mapa' && (
          <StepFrame
            title="¿Cómo de grande es el mapa?"
            help="Es lo que más pide al equipo. Cada mes, con el borrado, se puede elegir otro."
          >
            <Choices options={MAPS} value={worldSize} onChange={setWorldSize} columns={1} />
            <MemoryNotice worldSize={Number(worldSize)} />
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

        {stage === 'partida' && (
          <StepFrame
            title="¿Os vais a pelear entre vosotros?"
            help="Se puede cambiar después en Configuración → Ajustes."
          >
            <Choices options={MODES} value={mode} onChange={setMode} columns={1} />
          </StepFrame>
        )}

        {stage === 'borrado' && (
          <StepFrame
            title="Cada mes, mapa nuevo"
            help={`El próximo es el ${wipeDateLabel(nextForcedWipe(new Date()).toISOString())}.`}
          >
            <div className="alert info" style={{ textAlign: 'left' }}>
              <WipeExplainer />
            </div>
            <Choices options={WIPES} value={wipe} onChange={setWipe} columns={1} />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              Se puede cambiar cuando quieras en Configuración → Borrado, y también desde el propio
              aviso cuando llegue el día.
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
              <strong>Rust siempre sale en su lista de servidores</strong>
              <p>
                El juego no tiene forma de crear un servidor privado: en cuanto arranca se anuncia
                con la dirección de tu casa, elijas lo que elijas aquí. Cualquiera que lo encuentre
                puede entrar; si alguien molesta, se le echa y se le veta desde la app.
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
              <SummaryRow
                label="Mapa"
                value={worldSizeLabel(Number(worldSize))}
                onEdit={() => edit('mapa')}
              />
              <SummaryRow label="Plazas" value={players} onEdit={() => edit('gente')} />
              <SummaryRow label="Partida" value={labelOf(MODES, mode)} onEdit={() => edit('partida')} />
              <SummaryRow
                label="Borrado mensual"
                value={labelOf(WIPES, wipe)}
                onEdit={() => edit('borrado')}
              />
              <SummaryRow
                label="Se conectan"
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label="Puerto"
                value={`${defaultPortFor('rust')} (UDP)`}
                autoNote="o el primero libre"
              />
              <SummaryRow label="Semilla" value="al azar" autoNote="decide la forma del mapa" />
              <SummaryRow
                label="Versión"
                value="la última de Steam"
                autoNote="la única con la que se puede entrar"
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>Son 5,5 GB de descarga, y el primer arranque tarda</strong>
              <p>
                Es lo que ocupa el servidor de Rust. La primera vez que lo arranques generará el
                mapa: {mapa?.firstStart ?? 'unos minutos'} con este tamaño. Mientras está en marcha
                usa unos {(mapa?.memoryGb ?? 5).toLocaleString('es-ES')} GB de memoria, más lo que
                sumen los jugadores.
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
                    href={GAMES.rust.agreements[0]!.url}
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
            <button className="primary" disabled={!agreed} onClick={() => void create()}>
              Crear servidor
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
