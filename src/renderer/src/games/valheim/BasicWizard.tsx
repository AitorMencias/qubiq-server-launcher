import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import {
  MIN_PASSWORD_LENGTH,
  PRESETS,
  queryPortFor,
  type ValheimPreset
} from '@shared/games/valheim/types'
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
import { Rich, t } from '../../i18n'

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

/** Se construyen al pintar, para que salgan en el idioma de ese momento. */
function connections(): Option<ExposureMode>[] {
  return [
    { value: 'local', title: t('wizard.connection.local'), sub: t('wizard.connection.local.sub') },
    { value: 'crossplay', title: t('vh.wizard.crossplay'), sub: t('vh.wizard.crossplay.sub') },
    { value: 'router', title: t('wizard.connection.router'), sub: t('sf.wizard.routerSub') },
    { value: 'tunnel', title: t('wizard.connection.tunnel'), sub: t('vh.wizard.tunnel.sub') }
  ]
}

/** Los tres de siempre delante; el resto, para quien los busque. */
const SIMPLE_PRESETS = PRESETS.filter((p) => ['casual', 'normal', 'hard'].includes(p.value))

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState(() => t('vh.wizard.defaultName'))
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
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">{t('vh.wizard.preparingHint')}</p>
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
            help={t('vh.wizard.name.help')}
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
            help={t('vh.wizard.world.help')}
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

        {stage === 'clave' && (
          <StepFrame
            title={t('vh.wizard.password.title')}
            help={t('vh.wizard.password.help')}
          >
            <input
              type="text"
              value={password}
              maxLength={40}
              autoFocus
              placeholder={t('vh.password.min', { min: MIN_PASSWORD_LENGTH })}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
            {password.trim().length > 0 && !passwordOk && (
              <div className="alert error" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>{t('vh.password.short')}</strong>
                <p>{t('vh.password.shortText', { min: MIN_PASSWORD_LENGTH })}</p>
              </div>
            )}
            {passwordInName && password.trim().length > 0 && (
              <div className="alert error" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>{t('vh.password.inName')}</strong>
                <p>{t('vh.password.inNameText')}</p>
              </div>
            )}
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              {t('vh.wizard.password.visible')}
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
              {t('vh.wizard.difficulty.more')}
            </div>
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame
            title={t('wizard.connection.title')}
            help={t('vh.wizard.connection.help')}
          >
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            {connection === 'crossplay' && (
              <div className="alert info" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>{t('vh.wizard.crossplayTitle')}</strong>
                <p>{t('vh.wizard.crossplayText')}</p>
              </div>
            )}
            {connection === 'router' && (
              <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
                <Rich
                  k="vh.wizard.twoPorts"
                  values={{
                    two: <strong>{t('vh.wizard.twoPortsBold')}</strong>,
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
              <SummaryRow label={t('vh.summary.world')} value={world} onEdit={() => edit('mundo')} />
              <SummaryRow label={t('vh.summary.password')} value={password} onEdit={() => edit('clave')} />
              <SummaryRow
                label={t('mc.wizard.summary.difficulty')}
                value={PRESETS.find((p) => p.value === preset)?.label ?? preset}
                onEdit={() => edit('dificultad')}
              />
              <SummaryRow
                label={t('wizard.summary.connect')}
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label={t('vh.summary.ports')}
                value={t('vh.summary.portsValue', {
                  a: defaultPortFor('valheim'),
                  b: queryPortFor(defaultPortFor('valheim'))
                })}
                autoNote={t('vh.summary.portsNote')}
              />
              <SummaryRow
                label={t('version.title')}
                value={t('wizard.summary.latestSteam')}
                autoNote={t('wizard.summary.gameChooses')}
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>{t('vh.wizard.download.title')}</strong>
              <p>{t('vh.wizard.download.text')}</p>
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
