import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import type { Distribution } from '@shared/games/minecraft/types'
import { DISTRIBUTIONS, DISTRIBUTION_LABELS } from '@shared/games/minecraft/types'
import { D20Loader } from '../../D20Loader'
import { Choices, StepDots, StepFrame, SummaryRow, labelOf, type Option } from '../../WizardParts'

/**
 * Asistente en modo básico (§3).
 *
 * Es un recorrido por TODO lo que hace falta decidir, no solo por lo mínimo para
 * que arranque: al terminar, el servidor está listo para jugar tal y como el
 * usuario lo quiere —modo de juego, dificultad, tipo de mundo, reglas y cómo se
 * conectarán sus amigos—, sin tener que ir después a Ajustes.
 *
 * Una pregunta por pantalla y siempre con una opción ya marcada, para que quien
 * no tenga preferencia pueda avanzar pulsando "Siguiente". Versión, memoria y
 * puerto no se preguntan: se deciden solos y se informan en el resumen.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

type GameMode = 'survival' | 'creative' | 'adventure' | 'hardcore'
type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard'
type LevelType = 'minecraft:normal' | 'minecraft:flat' | 'minecraft:large_biomes' | 'minecraft:amplified'

type Step =
  | 'nombre'
  | 'tipo'
  | 'jugadores'
  | 'modo'
  | 'dificultad'
  | 'mundo'
  | 'pvp'
  | 'conexion'
type Stage = Step | 'resumen'

const GAME_MODES: Option<GameMode>[] = [
  {
    value: 'survival',
    title: 'Supervivencia',
    sub: 'Consigue recursos, construye y sobrevive a los monstruos. Lo clásico.'
  },
  {
    value: 'creative',
    title: 'Creativo',
    sub: 'Bloques infinitos, vuelo y sin peligro. Para construir sin límites.'
  },
  {
    value: 'adventure',
    title: 'Aventura',
    sub: 'No se pueden romper ni poner bloques libremente. Para mapas hechos por otros.'
  },
  {
    value: 'hardcore',
    title: 'Extremo',
    sub: 'Supervivencia en Difícil y una sola vida: quien muere ya no vuelve a jugar en ese mundo.'
  }
]

const DIFFICULTIES: Option<Difficulty>[] = [
  { value: 'peaceful', title: 'Pacífico', sub: 'Sin monstruos que ataquen. Ideal para construir tranquilos.' },
  { value: 'easy', title: 'Fácil', sub: 'Hay monstruos, pero hacen poco daño.' },
  { value: 'normal', title: 'Normal', sub: 'La experiencia estándar de Minecraft.' },
  { value: 'hard', title: 'Difícil', sub: 'Monstruos más duros y el hambre puede llegar a matar.' }
]

const LEVEL_TYPES: Option<LevelType>[] = [
  { value: 'minecraft:normal', title: 'Normal', sub: 'Montañas, océanos, cuevas… el mundo de siempre.' },
  { value: 'minecraft:flat', title: 'Superplano', sub: 'Todo llano, sin relieve. Perfecto para construir en creativo.' },
  {
    value: 'minecraft:large_biomes',
    title: 'Biomas grandes',
    sub: 'Como el normal, pero cada bioma ocupa mucho más terreno.'
  },
  {
    value: 'minecraft:amplified',
    title: 'Amplificado',
    sub: 'Montañas enormes y paisajes exagerados. Exige más al ordenador.'
  }
]

const PVP: Option<'true' | 'false'>[] = [
  { value: 'true', title: 'Sí, se puede luchar', sub: 'Los jugadores pueden hacerse daño entre ellos.' },
  { value: 'false', title: 'No, somos un equipo', sub: 'Nadie puede herir a otro jugador, ni sin querer.' }
]

const CONNECTIONS: Option<ExposureMode>[] = [
  {
    value: 'local',
    title: 'Solo desde mi casa',
    sub: 'Quien esté en tu mismo wifi o router. No hay que tocar nada más.'
  },
  {
    value: 'router',
    title: 'Desde cualquier sitio, abriendo el router',
    sub: 'El mejor ping. Hay que crear una regla en el router y no funciona si tu compañía usa CGNAT.'
  },
  {
    value: 'tunnel',
    title: 'Desde cualquier sitio, con playit.gg',
    sub: 'Sin tocar el router y funciona casi siempre, a cambio de algo más de ping.'
  }
]

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)
  /** Si se entró a editar el modo estando en Extremo: al salir de él, falta la dificultad. */
  const [editedFromHardcore, setEditedFromHardcore] = useState(false)

  const [name, setName] = useState('Mi servidor')
  const [distribution, setDistribution] = useState<Distribution>('paper')
  const [expectedPlayers, setExpectedPlayers] = useState(8)
  const [gameMode, setGameMode] = useState<GameMode>('survival')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [levelType, setLevelType] = useState<LevelType>('minecraft:normal')
  const [pvp, setPvp] = useState<'true' | 'false'>('true')
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [version, setVersion] = useState<string | null>(null)
  const [memoryMb, setMemoryMb] = useState<number | null>(null)
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hardcore = gameMode === 'hardcore'

  useEffect(() => {
    let cancelled = false
    setVersion(null)
    setError(null)
    window.qubiq.minecraft.catalog
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
    window.qubiq.minecraft.catalog
      .recommendMemory(expectedPlayers, distribution)
      .then((value) => {
        if (!cancelled) setMemoryMb(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [expectedPlayers, distribution])

  // La dificultad no se pregunta en modo extremo: el juego la fija en Difícil,
  // y preguntarla sería ofrecer una elección que luego no se respeta.
  const steps: Step[] = [
    'nombre',
    'tipo',
    'jugadores',
    'modo',
    ...(hardcore ? [] : (['dificultad'] as Step[])),
    'mundo',
    'pvp',
    'conexion'
  ]
  const stepIndex = steps.indexOf(stage as Step)
  const onStep = stepIndex !== -1

  function next(): void {
    if (!onStep) return
    // Salir de Extremo desde el resumen hace aparecer una pregunta que nunca se
    // contestó: se hace antes de volver, en vez de dejar la dificultad por defecto.
    if (editing && stage === 'modo' && editedFromHardcore && !hardcore) {
      setEditedFromHardcore(false)
      setStage('dificultad')
      return
    }
    if (editing || stepIndex === steps.length - 1) {
      setEditing(false)
      setStage('resumen')
      return
    }
    setStage(steps[stepIndex + 1]!)
  }

  function back(): void {
    if (stage === 'resumen') {
      setStage(steps[steps.length - 1]!)
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
    setStage(steps[stepIndex - 1]!)
  }

  const canContinue = stage !== 'nombre' || name.trim().length > 0

  async function create(): Promise<void> {
    if (!version || !memoryMb) return
    setBusy(true)
    setError(null)
    try {
      // El puerto no se pregunta: se coge el primero libre desde el estándar,
      // para que tener ya otro servidor abierto no haga fallar el arranque (§7).
      const port = await window.qubiq.network.freePort(25565)

      const manifest = await window.qubiq.instances.create({
        game: 'minecraft',
        name,
        expectedPlayers,
        port,
        agreements: eula ? ['minecraft-eula'] : [],
        exposure: { mode: connection },
        options: {
          distribution,
          minecraftVersion: version,
          memoryMb,
          // Hardcore NO es un valor de `gamemode` (§8): es supervivencia más la
          // clave `hardcore`, y el juego fuerza la dificultad a Difícil.
          properties: {
            gamemode: hardcore ? 'survival' : gameMode,
            hardcore: String(hardcore),
            difficulty: hardcore ? 'hard' : difficulty,
            'level-type': levelType,
            pvp
          }
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
              Estamos descargando todo lo necesario. La primera vez tarda unos minutos porque hay
              que bajar bastantes megas; las siguientes irá mucho más rápido.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>{progress?.detail ?? 'Trabajando...'}</p>
            {/* Solo con un porcentaje real: si no lo hay, el dado ya dice que
                se está trabajando sin inventarse cuánto falta. */}
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
        <StepDots total={steps.length} current={onStep ? stepIndex : steps.length} />

        {error && (
          <div className="alert error">
            <strong>Algo ha fallado</strong>
            <p>{error}</p>
          </div>
        )}

        {stage === 'nombre' && (
          <StepFrame
            title="¿Cómo se va a llamar?"
            help="Es el nombre que verán tus amigos en su lista de servidores. Puedes cambiarlo luego."
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

        {stage === 'modo' && (
          <StepFrame
            title="¿A qué vais a jugar?"
            help="Es el modo con el que entra todo el mundo. Se puede cambiar más adelante."
          >
            <Choices options={GAME_MODES} value={gameMode} onChange={setGameMode} />
            {hardcore && (
              <div className="alert error" style={{ textAlign: 'left', marginTop: 14, marginBottom: 0 }}>
                <strong>Sin segundas oportunidades</strong>
                <p>
                  Al morir, el jugador pasa a espectador y no puede seguir jugando en ese mundo. La
                  dificultad será siempre Difícil, así que nos saltamos esa pregunta.
                </p>
              </div>
            )}
          </StepFrame>
        )}

        {stage === 'dificultad' && (
          <StepFrame
            title="¿Qué dificultad queréis?"
            help="Decide cuánto daño hacen los monstruos y si aparecen siquiera."
          >
            <Choices options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />
          </StepFrame>
        )}

        {stage === 'mundo' && (
          <StepFrame
            title="¿Cómo queréis que sea el mundo?"
            help="Solo se elige al crearlo: el terreno ya generado no cambia después."
          >
            <Choices options={LEVEL_TYPES} value={levelType} onChange={setLevelType} />
          </StepFrame>
        )}

        {stage === 'pvp' && (
          <StepFrame
            title="¿Os podéis pelear entre vosotros?"
            help="Los monstruos atacan igual; esto solo decide si un jugador puede herir a otro."
          >
            <Choices options={PVP} value={pvp} onChange={setPvp} />
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
                Cuando termines tendrás una guía paso a paso en{' '}
                <strong>Configuración → Conexión</strong> para dejarlo funcionando.
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
                label="Tipo"
                value={DISTRIBUTION_LABELS[distribution].name}
                onEdit={() => edit('tipo')}
              />
              <SummaryRow
                label="Jugadores a la vez"
                value={String(expectedPlayers)}
                onEdit={() => edit('jugadores')}
              />
              <SummaryRow
                label="Modo de juego"
                value={labelOf(GAME_MODES, gameMode)}
                onEdit={() => edit('modo')}
              />
              {hardcore ? (
                <SummaryRow label="Dificultad" value="Difícil" autoNote="la fija el modo extremo" />
              ) : (
                <SummaryRow
                  label="Dificultad"
                  value={labelOf(DIFFICULTIES, difficulty)}
                  onEdit={() => edit('dificultad')}
                />
              )}
              <SummaryRow
                label="Mundo"
                value={labelOf(LEVEL_TYPES, levelType)}
                onEdit={() => edit('mundo')}
              />
              <SummaryRow
                label="Peleas entre jugadores"
                value={pvp === 'true' ? 'Permitidas' : 'Desactivadas'}
                onEdit={() => edit('pvp')}
              />
              <SummaryRow
                label="Se conectan"
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label="Versión de Minecraft"
                value={version ?? 'consultando...'}
                autoNote="elegida por nosotros"
              />
              <SummaryRow
                label="Memoria"
                value={memoryMb ? `${(memoryMb / 1024).toFixed(1)} GB` : 'calculando...'}
                autoNote="elegida por nosotros"
                last
              />
            </div>

            <div className="help" style={{ textAlign: 'left', marginTop: -6, marginBottom: 16 }}>
              Tus amigos tendrán que abrir Minecraft con la versión{' '}
              <strong>{version ?? '...'}</strong> para poder entrar.
            </div>

            <div className="card" style={{ textAlign: 'left', marginBottom: 0 }}>
              <h3>Condiciones de Minecraft</h3>
              <p className="hint">
                Mojang exige aceptar su EULA para ejecutar un servidor. Solo hay que hacerlo una vez
                por servidor.
              </p>
              <label className="row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={eula}
                  onChange={(e) => setEula(e.target.checked)}
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

  function edit(target: Step): void {
    setEditing(true)
    setEditedFromHardcore(target === 'modo' && hardcore)
    setStage(target)
  }
}
