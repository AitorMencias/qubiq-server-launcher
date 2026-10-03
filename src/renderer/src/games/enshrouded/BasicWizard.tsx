import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import {
  MIN_PASSWORD_LENGTH,
  PRESETS,
  presetInfo,
  type EnshroudedPreset,
  type EnshroudedRole
} from '@shared/games/enshrouded/types'
import { D20Loader } from '../../D20Loader'
import {
  Choices,
  StepDots,
  StepFrame,
  SteamAgreement,
  SummaryRow,
  labelOf,
  type Option
} from '../../WizardParts'
import { t } from '../../i18n'
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

/** Se construyen al pintar, para que salgan en el idioma de ese momento. */
function connections(): Option<ExposureMode>[] {
  return [
    { value: 'local', title: t('wizard.connection.local'), sub: t('wizard.connection.local.sub') },
    { value: 'router', title: t('wizard.connection.router'), sub: t('fa.wizard.routerSub') },
    { value: 'tunnel', title: t('wizard.connection.tunnel'), sub: t('en.wizard.tunnelSub') }
  ]
}

/** Los tres de siempre delante; «A mi manera» se deja para el modo avanzado. */
const SIMPLE_PRESETS = PRESETS.filter((p) => p.value !== 'Custom')

function playerChoices(): Option<string>[] {
  return (['4', '8', '16'] as const).map((value) => ({
    value,
    title: t(`en.wizard.players.${value}`),
    sub: t(`en.wizard.players.${value}.sub`)
  }))
}

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState(() => t('en.wizard.defaultName'))
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
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">{t('en.wizard.preparingHint')}</p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              {progress?.detail ?? t('panel.working')}
            </p>
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

  const CONNECTIONS = connections()

  return (
    <div className="panel">
      <div className="wizard">
        <StepDots total={STEPS.length} current={onStep ? stepIndex : STEPS.length} />

        {error && (
          <div className="alert error">
            <strong>{t('catalog.error')}</strong>
            <p>{error}</p>
          </div>
        )}

        {stage === 'nombre' && (
          <StepFrame
            title={t('wizard.name.title')}
            help={t('en.wizard.name.help')}
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
            title={t('vh.wizard.world.title')}
            help={t('en.wizard.world.help')}
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
              {t('vh.wizard.world.more')}
            </div>
          </StepFrame>
        )}

        {stage === 'gente' && (
          <StepFrame
            title={t('wizard.players.title')}
            help={t('en.wizard.players.help')}
          >
            <Choices options={playerChoices()} value={players} onChange={setPlayers} columns={1} />
          </StepFrame>
        )}

        {stage === 'claves' && (
          <StepFrame
            title={t('en.wizard.passwords.title')}
            help={t('en.wizard.passwords.help')}
          >
            <div className="field" style={{ textAlign: 'left' }}>
              <label>{t('en.wizard.adminLabel')}</label>
              <input
                type="text"
                value={adminPassword}
                maxLength={40}
                autoFocus
                onChange={(e) => setAdminPassword(e.target.value)}
              />
              <div className="help">{t('en.wizard.adminHelp')}</div>
            </div>

            <div className="field" style={{ textAlign: 'left' }}>
              <label>{t('en.wizard.friendLabel')}</label>
              <input
                type="text"
                value={friendPassword}
                maxLength={40}
                onChange={(e) => setFriendPassword(e.target.value)}
              />
              <div className="help">{t('en.wizard.friendHelp')}</div>
            </div>

            {(adminPassword.trim().length > 0 || friendPassword.trim().length > 0) &&
              (!adminOk || !friendOk) && (
                <div className="alert error" style={{ textAlign: 'left' }}>
                  <strong>{t('en.wizard.tooShort')}</strong>
                  <p>{t('en.wizard.tooShortText', { min: MIN_PASSWORD_LENGTH })}</p>
                </div>
              )}
            {!distintas && (
              <div className="alert error" style={{ textAlign: 'left' }}>
                <strong>{t('en.wizard.same')}</strong>
                <p>{t('en.wizard.sameText')}</p>
              </div>
            )}
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              {t('en.wizard.visible', {
                guest: t('en.role.Guest'),
                visitor: t('en.role.Visitor')
              })}
            </div>
          </StepFrame>
        )}

        {stage === 'dificultad' && (
          <StepFrame
            title={t('vh.wizard.difficulty.title')}
            help={t('vh.wizard.difficulty.help', { section: t('panel.configuration') })}
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
              {t('en.wizard.difficultyMore')}
            </div>
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame
            title={t('wizard.connection.title')}
            help={t('en.wizard.connection.help')}
          >
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            <div className="alert warn" style={{ textAlign: 'left', marginTop: 14 }}>
              <strong>{t('en.wizard.publicTitle')}</strong>
              <p>{t('en.wizard.publicText')}</p>
            </div>
          </StepFrame>
        )}

        {stage === 'resumen' && (
          <div className="step-frame">
            <h2>{t('wizard.summary.title')}</h2>
            <p className="step-help">{t('wizard.summary.help', { change: t('wizard.change') })}</p>

            <div className="card" style={{ textAlign: 'left' }}>
              <SummaryRow label={t('wizard.summary.name')} value={name} onEdit={() => edit('nombre')} />
              <SummaryRow label={t('vh.summary.world')} value={world} onEdit={() => edit('mundo')} />
              <SummaryRow label={t('en.summary.slots')} value={players} onEdit={() => edit('gente')} />
              <SummaryRow
                label={t('pz.summary.admin')}
                value={adminPassword}
                onEdit={() => edit('claves')}
              />
              <SummaryRow
                label={t('en.summary.friend')}
                value={friendPassword}
                onEdit={() => edit('claves')}
              />
              <SummaryRow
                label={t('mc.wizard.summary.difficulty')}
                value={presetInfo(preset).label}
                onEdit={() => edit('dificultad')}
              />
              <SummaryRow
                label={t('wizard.summary.connect')}
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label={t('help.router.port')}
                value={`${defaultPortFor('enshrouded')} (UDP)`}
                autoNote={t('pz.summary.portNote')}
              />
              <SummaryRow
                label={t('version.title')}
                value={t('wizard.summary.latestSteam')}
                autoNote={t('wizard.summary.gameChooses')}
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>{t('en.wizard.download.title')}</strong>
              <p>{t('en.wizard.download.text')}</p>
            </div>

            <SteamAgreement basic agreed={agreed} onChange={setAgreed} />
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
              disabled={!agreed || !clavesOk}
              onClick={() => void create()}
            >
              {t('wizard.create')}
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
