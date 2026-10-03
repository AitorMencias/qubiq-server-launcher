import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
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
import { MemoryNotice } from './MemoryNotice'
import { Rich, t } from '../../i18n'

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

/** Se construyen al pintar, para que salgan en el idioma de ese momento. */
function connections(): Option<ExposureMode>[] {
  return [
    { value: 'local', title: t('wizard.connection.local'), sub: t('wizard.connection.local.sub') },
    { value: 'router', title: t('wizard.connection.router'), sub: t('sf.wizard.routerSub') },
    { value: 'tunnel', title: t('wizard.connection.tunnel'), sub: t('wizard.connection.tunnel.sub') }
  ]
}

const STEPS: Step[] = ['nombre', 'jugadores', 'clave-admin', 'clave-jugadores', 'conexion']

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState(() => t('sf.wizard.defaultName'))
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
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">{t('sf.wizard.preparingHint')}</p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>{progress?.detail ?? t('panel.working')}</p>
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
          <StepFrame title={t('wizard.name.title')} help={t('sf.wizard.name.help')}>
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
          <StepFrame title={t('wizard.players.title')} help={t('sf.wizard.players.help')}>
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
              {expectedPlayers > 4 ? t('sf.wizard.players.over4') : t('sf.wizard.players.limit')}
            </div>
            <MemoryNotice totalMemoryMb={totalMemoryMb} players={expectedPlayers} />
          </StepFrame>
        )}

        {stage === 'clave-admin' && (
          <StepFrame title={t('sf.wizard.admin.title')} help={t('sf.wizard.admin.help')}>
            <input
              type="text"
              value={adminPassword}
              maxLength={40}
              autoFocus
              placeholder={t('sf.wizard.admin.placeholder')}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
            />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              {t('sf.wizard.admin.visible')}
            </div>
          </StepFrame>
        )}

        {stage === 'clave-jugadores' && (
          <StepFrame title={t('sf.wizard.client.title')} help={t('sf.wizard.client.help')}>
            <input
              type="text"
              value={clientPassword}
              maxLength={40}
              autoFocus
              placeholder={t('wizard.password.emptyNone')}
              onChange={(e) => setClientPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') next()
              }}
            />
            {clientPassword.trim().length === 0 && connectionIsOpen(connection) && (
              <div className="alert warn" style={{ textAlign: 'left', marginTop: 14 }}>
                <strong>{t('wizard.password.openTitle')}</strong>
                <p>{t('sf.wizard.client.openText')}</p>
              </div>
            )}
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame title={t('wizard.connection.title')} help={t('wizard.connection.help')}>
            <Choices options={CONNECTIONS} value={connection} onChange={setConnection} columns={1} />
            {connection !== 'local' && (
              <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
                <Rich
                  k="sf.wizard.twoPorts"
                  values={{
                    two: <strong>{t('sf.wizard.twoPortsBold')}</strong>,
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
                label={t('wizard.summary.players')}
                value={String(expectedPlayers)}
                onEdit={() => edit('jugadores')}
              />
              <SummaryRow
                label={t('sf.wizard.summary.admin')}
                value={adminPassword}
                onEdit={() => edit('clave-admin')}
              />
              <SummaryRow
                label={t('wizard.summary.joinPassword')}
                value={clientPassword.trim().length > 0 ? clientPassword : t('wizard.summary.noPassword')}
                onEdit={() => edit('clave-jugadores')}
              />
              <SummaryRow
                label={t('wizard.summary.connect')}
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label={t('sf.wizard.summary.session')}
                value={name}
                autoNote={t('sf.wizard.summary.sessionNote')}
              />
              <SummaryRow
                label={t('version.title')}
                value={t('wizard.summary.latestSteam')}
                autoNote={t('wizard.summary.gameChooses')}
                last
              />
            </div>

            <MemoryNotice totalMemoryMb={totalMemoryMb} players={expectedPlayers} />

            {/* Las dos cosas solo se saben juntas aquí: la contraseña se elige
                antes que la forma de conectarse. */}
            {clientPassword.trim().length === 0 && connectionIsOpen(connection) && (
              <div className="alert warn" style={{ textAlign: 'left' }}>
                <strong>{t('wizard.password.openTitle')}</strong>
                <p>
                  {t('sf.wizard.summary.openText', {
                    path: `${t('panel.configuration')} → ${t('tab.settings')}`
                  })}
                </p>
              </div>
            )}

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>{t('sf.wizard.download.title')}</strong>
              <p>{t('sf.wizard.download.text')}</p>
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
            <button className="primary" disabled={!agreed || !adminOk} onClick={() => void create()}>
              {t('wizard.create')}
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
