import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
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
import {
  Choices,
  StepDots,
  StepFrame,
  SteamAgreement,
  SummaryRow,
  labelOf,
  type Option
} from '../../WizardParts'
import { Rich, formatList, formatSize, quote, t } from '../../i18n'

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

/** Se construyen al pintar, para que salgan en el idioma de ese momento. */
function connections(): Option<ExposureMode>[] {
  return [
    { value: 'local', title: t('wizard.connection.local'), sub: t('wizard.connection.local.sub') },
    { value: 'router', title: t('wizard.connection.router'), sub: t('fa.wizard.routerSub') },
    { value: 'tunnel', title: t('wizard.connection.tunnel'), sub: t('pz.wizard.tunnelSub') }
  ]
}

/** La primera pregunta de dificultad: los tres que cubren a casi todo el mundo. */
const SIMPLE_PRESETS = PRESETS.filter((p) => ['rising', 'survivor', 'apocalypse'].includes(p.id))

/** La única regla de partida que se pregunta aparte: la que más se nota. */
const ZOMBIES = BASIC_SANDBOX.find((s) => s.key === 'Zombies')!

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState(() => t('pz.wizard.defaultName'))
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
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">{t('pz.wizard.preparingHint')}</p>
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
            help={t('pz.wizard.name.help')}
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
            title={t('pz.wizard.admin.title')}
            help={t('pz.wizard.admin.help')}
          >
            <input
              type="text"
              value={adminPassword}
              maxLength={40}
              autoFocus
              placeholder={t('pz.password.placeholder', { min: MIN_PASSWORD_LENGTH })}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
            {adminPassword.trim().length > 0 && !claveOk && (
              <div className="alert error" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>{t('pz.password.invalid')}</strong>
                <p>{t('pz.password.invalidText', { min: MIN_PASSWORD_LENGTH })}</p>
              </div>
            )}
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              <Rich k="pz.wizard.admin.user" values={{ admin: <strong>admin</strong> }} />
            </div>
          </StepFrame>
        )}

        {stage === 'dificultad' && (
          <StepFrame
            title={t('pz.wizard.difficulty.title')}
            help={t('pz.wizard.difficulty.help')}
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
              {t('pz.wizard.difficulty.more', {
                list: formatList([presetInfo('outbreak').name, presetInfo('sixmonths').name, presetInfo('extinction').name])
              })}
            </div>
          </StepFrame>
        )}

        {stage === 'zombis' && (
          <StepFrame
            title={t('pz.wizard.zombies.title')}
            help={t('pz.wizard.zombies.help')}
          >
            <Choices
              options={[
                {
                  value: 'preset',
                  title: t('pz.wizard.zombies.preset', { name: quote(presetInfo(preset).name) }),
                  sub: t('pz.wizard.zombies.presetSub')
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
            title={t('wizard.connection.title')}
            help={t('pz.wizard.connection.help')}
          >
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              <Rich
                k="pz.wizard.onePort"
                values={{
                  port: <strong>{t('pz.wizard.onePortBold')}</strong>,
                  path: (
                    <strong>
                      {t('panel.configuration')} → {t('panel.tab.connection')}
                    </strong>
                  )
                }}
              />
            </div>
          </StepFrame>
        )}

        {stage === 'resumen' && (
          <div className="step-frame">
            <h2>{t('wizard.summary.title')}</h2>
            <p className="step-help">{t('wizard.summary.help', { change: t('wizard.change') })}</p>

            <div className="card" style={{ textAlign: 'left' }}>
              <SummaryRow label={t('wizard.summary.name')} value={name} onEdit={() => edit('nombre')} />
              <SummaryRow
                label={t('pz.summary.admin')}
                value={adminPassword}
                onEdit={() => edit('clave')}
              />
              <SummaryRow
                label={t('mc.wizard.summary.difficulty')}
                value={presetInfo(preset).name}
                onEdit={() => edit('dificultad')}
              />
              <SummaryRow
                label={t('pz.summary.zombies')}
                value={
                  zombies === null
                    ? t('pz.summary.zombiesPreset', { name: quote(presetInfo(preset).name) })
                    : (ZOMBIES.options.find((o) => o.value === zombies)?.label ?? String(zombies))
                }
                onEdit={() => edit('zombis')}
              />
              <SummaryRow
                label={t('wizard.summary.connect')}
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label={t('help.router.port')}
                value={`${defaultPortFor('zomboid')} (UDP)`}
                autoNote={t('pz.summary.portNote')}
              />
              <SummaryRow
                label={t('chooser.memory')}
                value={formatSize(Math.round(DEFAULT_MEMORY_MB / 1024), 'GB')}
                autoNote={t('pz.summary.memoryNote')}
              />
              <SummaryRow
                label={t('version.title')}
                value={t('wizard.summary.latestSteam')}
                autoNote={t('wizard.summary.gameChooses')}
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>{t('pz.wizard.download.title')}</strong>
              <p>{t('pz.wizard.download.text', { gb: MEMORY_RECOMMENDED_GB })}</p>
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
            <button className="primary" disabled={!agreed || !claveOk} onClick={() => void create()}>
              {t('wizard.create')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
