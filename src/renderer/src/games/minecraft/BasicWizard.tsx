import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import type { Distribution } from '@shared/games/minecraft/types'
import { DISTRIBUTIONS, DISTRIBUTION_LABELS } from '@shared/games/minecraft/types'
import { D20Loader } from '../../D20Loader'
import { ImportWizard } from './ImportWizard'
import { Choices, StepDots, StepFrame, SummaryRow, labelOf, type Option } from '../../WizardParts'
import { Rich, formatSize, t } from '../../i18n'

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

// Las opciones se construyen al pintar: en constantes de módulo se quedarían
// en el idioma con el que arrancó la app.

function gameModes(): Option<GameMode>[] {
  return (['survival', 'creative', 'adventure', 'hardcore'] as const).map((value) => ({
    value,
    title: t(`mc.wizard.mode.${value}`),
    sub: t(`mc.wizard.mode.${value}.sub`)
  }))
}

function difficulties(): Option<Difficulty>[] {
  return (['peaceful', 'easy', 'normal', 'hard'] as const).map((value) => ({
    value,
    title: t(`mc.wizard.difficulty.${value}`),
    sub: t(`mc.wizard.difficulty.${value}.sub`)
  }))
}

function levelTypes(): Option<LevelType>[] {
  return (['normal', 'flat', 'large_biomes', 'amplified'] as const).map((id) => ({
    value: `minecraft:${id}` as LevelType,
    title: t(`mc.level.${id}.label`),
    sub: t(`mc.wizard.level.${id}.sub`)
  }))
}

function pvpOptions(): Option<'true' | 'false'>[] {
  return [
    { value: 'true', title: t('mc.wizard.pvp.yes'), sub: t('mc.wizard.pvp.yes.sub') },
    { value: 'false', title: t('mc.wizard.pvp.no'), sub: t('mc.wizard.pvp.no.sub') }
  ]
}

function connections(): Option<ExposureMode>[] {
  return (['local', 'router', 'tunnel'] as const).map((value) => ({
    value,
    title: t(`wizard.connection.${value}`),
    sub: t(`wizard.connection.${value}.sub`)
  }))
}

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)
  /** Si se entró a editar el modo estando en Extremo: al salir de él, falta la dificultad. */
  const [editedFromHardcore, setEditedFromHardcore] = useState(false)

  const [name, setName] = useState(() => t('mc.wizard.defaultName'))
  const [distribution, setDistribution] = useState<Distribution>('paper')
  const [expectedPlayers, setExpectedPlayers] = useState(8)
  const [gameMode, setGameMode] = useState<GameMode>('survival')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [levelType, setLevelType] = useState<LevelType>('minecraft:normal')
  const [pvp, setPvp] = useState<'true' | 'false'>('true')
  const [connection, setConnection] = useState<ExposureMode>('local')

  /** La última versión con servidor terminado para la distribución elegida. */
  const [stableVersion, setStableVersion] = useState<string | null>(null)
  /** Una más nueva que todavía solo tiene compilaciones de prueba, si la hay. */
  const [testingVersion, setTestingVersion] = useState<string | null>(null)
  /** El usuario pidió expresamente la de pruebas desde el resumen. */
  const [useTesting, setUseTesting] = useState(false)
  const [memoryMb, setMemoryMb] = useState<number | null>(null)
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Ha elegido traer un servidor que ya tiene en vez de crear uno. */
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hardcore = gameMode === 'hardcore'
  const version = useTesting && testingVersion ? testingVersion : stableVersion

  useEffect(() => {
    let cancelled = false
    setStableVersion(null)
    setTestingVersion(null)
    setUseTesting(false)
    setError(null)
    window.qubiq.minecraft.catalog
      .versions(distribution)
      .then((list) => {
        if (cancelled) return
        setStableVersion((list.find((v) => v.recommended) ?? list[0])?.minecraftVersion ?? null)
        // Solo se ofrece la más nueva de las que están en pruebas: dar a elegir
        // entre varias alphas en el asistente sencillo sería pedirle al usuario
        // que decida algo que no puede valorar.
        setTestingVersion(list.find((v) => v.experimental)?.minecraftVersion ?? null)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(t('mc.wizard.versionFailed', { error: err.message }))
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
          ...(useTesting && testingVersion ? { allowExperimental: true } : {}),
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

  if (importing) {
    return (
      <ImportWizard
        mode="basic"
        initialName={name}
        onBack={() => setImporting(false)}
        onCancel={onCancel}
        onCreated={onCreated}
        progress={progress}
      />
    )
  }

  if (busy) {
    return (
      <div className="panel">
        <div className="card loading-card" style={{ maxWidth: 620, margin: '40px auto 0' }}>
          <D20Loader size={84} />
          <div>
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">{t('mc.wizard.preparingHint')}</p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              {progress?.detail ?? t('panel.working')}
            </p>
            {/* Solo con un porcentaje real: si no lo hay, el dado ya dice que
                se está trabajando sin inventarse cuánto falta. */}
            {progress?.progress != null && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginTop: 16 }}>
                <strong>{t('wizard.prepareFailed')}</strong>
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const GAME_MODES = gameModes()
  const DIFFICULTIES = difficulties()
  const LEVEL_TYPES = levelTypes()
  const CONNECTIONS = connections()
  const byUs = t('wizard.chosenByUs')

  return (
    <div className="panel">
      <div className="wizard">
        <StepDots total={steps.length} current={onStep ? stepIndex : steps.length} />

        {error && (
          <div className="alert error">
            <strong>{t('catalog.error')}</strong>
            <p>{error}</p>
          </div>
        )}

        {stage === 'nombre' && (
          <StepFrame title={t('wizard.name.title')} help={t('mc.wizard.name.help')}>
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
          <StepFrame title={t('mc.wizard.type.title')} help={t('mc.wizard.type.help')}>
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
              {/* No es un tipo más: abre otro recorrido, el de traer una carpeta. */}
              <button className="choice" onClick={() => setImporting(true)}>
                <div className="title">{t('mc.wizard.type.custom')}</div>
                <div className="sub">{t('mc.wizard.type.custom.sub')}</div>
              </button>
            </div>
          </StepFrame>
        )}

        {stage === 'jugadores' && (
          <StepFrame title={t('wizard.players.title')} help={t('wizard.players.help')}>
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
              {t('mc.wizard.players.note')}
            </div>
          </StepFrame>
        )}

        {stage === 'modo' && (
          <StepFrame title={t('mc.wizard.mode.title')} help={t('mc.wizard.mode.help')}>
            <Choices options={GAME_MODES} value={gameMode} onChange={setGameMode} />
            {hardcore && (
              <div className="alert error" style={{ textAlign: 'left', marginTop: 14, marginBottom: 0 }}>
                <strong>{t('mc.wizard.hardcore.title')}</strong>
                <p>{t('mc.wizard.hardcore.text')}</p>
              </div>
            )}
          </StepFrame>
        )}

        {stage === 'dificultad' && (
          <StepFrame title={t('mc.wizard.difficulty.title')} help={t('mc.wizard.difficulty.help')}>
            <Choices options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />
          </StepFrame>
        )}

        {stage === 'mundo' && (
          <StepFrame title={t('mc.wizard.world.title')} help={t('mc.wizard.world.help')}>
            <Choices options={LEVEL_TYPES} value={levelType} onChange={setLevelType} />
          </StepFrame>
        )}

        {stage === 'pvp' && (
          <StepFrame title={t('mc.wizard.pvp.title')} help={t('mc.wizard.pvp.help')}>
            <Choices options={pvpOptions()} value={pvp} onChange={setPvp} />
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame title={t('wizard.connection.title')} help={t('wizard.connection.help')}>
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            {connection !== 'local' && (
              <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
                <Rich
                  k="wizard.connection.guide"
                  values={{
                    path: (
                      <strong>
                        {t('panel.configuration')} → {t('panel.tab.connection')}
                      </strong>
                    )
                  }}
                />
              </div>
            )}
          </StepFrame>
        )}

        {stage === 'resumen' && (
          <div className="step-frame">
            <h2>{t('wizard.summary.title')}</h2>
            <p className="step-help">{t('wizard.summary.help', { change: t('wizard.change') })}</p>

            <div className="card" style={{ textAlign: 'left' }}>
              <SummaryRow label={t('wizard.summary.name')} value={name} onEdit={() => edit('nombre')} />
              <SummaryRow
                label={t('mc.wizard.summary.type')}
                value={DISTRIBUTION_LABELS[distribution].name}
                onEdit={() => edit('tipo')}
              />
              <SummaryRow
                label={t('wizard.summary.players')}
                value={String(expectedPlayers)}
                onEdit={() => edit('jugadores')}
              />
              <SummaryRow
                label={t('mc.wizard.summary.mode')}
                value={labelOf(GAME_MODES, gameMode)}
                onEdit={() => edit('modo')}
              />
              {hardcore ? (
                <SummaryRow
                  label={t('mc.wizard.summary.difficulty')}
                  value={t('mc.wizard.difficulty.hard')}
                  autoNote={t('mc.wizard.summary.hardcoreSets')}
                />
              ) : (
                <SummaryRow
                  label={t('mc.wizard.summary.difficulty')}
                  value={labelOf(DIFFICULTIES, difficulty)}
                  onEdit={() => edit('dificultad')}
                />
              )}
              <SummaryRow
                label={t('mc.wizard.summary.world')}
                value={labelOf(LEVEL_TYPES, levelType)}
                onEdit={() => edit('mundo')}
              />
              <SummaryRow
                label={t('mc.wizard.summary.pvp')}
                value={pvp === 'true' ? t('mc.wizard.summary.pvpOn') : t('mc.wizard.summary.pvpOff')}
                onEdit={() => edit('pvp')}
              />
              <SummaryRow
                label={t('wizard.summary.connect')}
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label={t('mc.wizard.summary.version')}
                value={
                  version
                    ? `${version}${useTesting ? ` ${t('mc.wizard.summary.testing')}` : ''}`
                    : t('wizard.summary.checking')
                }
                autoNote={byUs}
              />
              <SummaryRow
                label={t('chooser.memory')}
                value={
                  memoryMb
                    ? formatSize(memoryMb / 1024, 'GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                    : t('wizard.summary.calculating')
                }
                autoNote={byUs}
                last
              />
            </div>

            <div className="help" style={{ textAlign: 'left', marginTop: -6, marginBottom: 16 }}>
              <Rich k="mc.wizard.summary.friendsVersion" values={{ version: <strong>{version ?? '...'}</strong> }} />
            </div>

            {/*
              Cuando sale una versión de Minecraft, el servidor con plugins tarda
              días en estar terminado. Antes la app simplemente no la ofrecía y no
              había manera de jugarla; ahora se puede elegir, con el aviso delante.
            */}
            {testingVersion && (
              <div className="alert warn" style={{ textAlign: 'left' }}>
                <strong>
                  {useTesting
                    ? t('mc.wizard.testing.using', { version: testingVersion })
                    : t('mc.wizard.testing.out', { version: testingVersion })}
                </strong>
                <p>
                  {t('mc.wizard.testing.text', {
                    version: testingVersion,
                    stable: stableVersion ?? ''
                  })}
                </p>
                <button style={{ marginTop: 10 }} onClick={() => setUseTesting(!useTesting)}>
                  {useTesting
                    ? t('mc.wizard.testing.backToStable', { version: stableVersion ?? '' })
                    : t('mc.wizard.testing.useAnyway', { version: testingVersion })}
                </button>
              </div>
            )}

            <div className="card" style={{ textAlign: 'left', marginBottom: 0 }}>
              <h3>{t('mc.wizard.eula.title')}</h3>
              <p className="hint">{t('mc.wizard.eula.hint')}</p>
              <label className="row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={eula}
                  onChange={(e) => setEula(e.target.checked)}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <span>
                  <Rich
                    k="mc.wizard.eula.accept"
                    values={{
                      link: (
                        <a
                          href="https://aka.ms/MinecraftEULA"
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent)' }}
                        >
                          {t('mc.wizard.eula.link')}
                        </a>
                      )
                    }}
                  />
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="row between wizard-nav">
          <button onClick={back}>
            {editing
              ? t('wizard.backToSummary')
              : stepIndex <= 0 && onStep
                ? t('common.cancel')
                : t('wizard.back')}
          </button>

          {onStep ? (
            <button className="primary" disabled={!canContinue} onClick={next}>
              {editing ? t('wizard.done') : t('wizard.next')}
            </button>
          ) : (
            <button
              className="primary"
              disabled={!eula || !version || !memoryMb}
              onClick={() => void create()}
            >
              {t('wizard.create')}
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
