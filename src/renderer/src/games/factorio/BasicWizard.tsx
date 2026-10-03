import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import { MIN_PASSWORD_LENGTH, PRESETS, type FactorioPreset } from '@shared/games/factorio/types'
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

/** Se construyen al pintar, para que salgan en el idioma de ese momento. */
function connections(): Option<ExposureMode>[] {
  return [
    { value: 'local', title: t('wizard.connection.local'), sub: t('wizard.connection.local.sub') },
    { value: 'router', title: t('wizard.connection.router'), sub: t('fa.wizard.routerSub') },
    { value: 'tunnel', title: t('wizard.connection.tunnel'), sub: t('fa.wizard.tunnelSub') }
  ]
}

function contenidoOptions(): Option<'space-age' | 'base'>[] {
  return [
    { value: 'space-age', title: t('fa.wizard.spaceAge'), sub: t('fa.wizard.spaceAge.sub') },
    { value: 'base', title: t('fa.wizard.base'), sub: t('fa.wizard.base.sub') }
  ]
}

/** Los cuatro de siempre delante; el resto están en el modo avanzado. */
function simplePresets(): Option<FactorioPreset>[] {
  return PRESETS.filter((p) =>
    ['default', 'rich-resources', 'rail-world', 'death-world'].includes(p.id)
  ).map((p) => ({ value: p.id, title: p.name, sub: p.description }))
}

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('juego')
  const [editing, setEditing] = useState(false)

  const [source, setSource] = useState<GameSourceChoice | null>(null)
  const [name, setName] = useState(() => t('sf.wizard.defaultName'))
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
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">
              {source?.source === 'steamcmd'
                ? t('fa.wizard.preparingSteam')
                : t('fa.wizard.preparingLocal')}
            </p>
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
  const CONTENIDO = contenidoOptions()
  const SIMPLE_PRESETS = simplePresets()

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

        {stage === 'juego' && (
          <StepFrame
            title={t('fa.wizard.source.title')}
            help={t('fa.wizard.source.help')}
          >
            <GameSource value={source} onChange={setSource} />
          </StepFrame>
        )}

        {stage === 'nombre' && (
          <StepFrame
            title={t('wizard.name.title')}
            help={t('fa.wizard.name.help')}
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
            title={t('vh.wizard.password.title')}
            help={t('fa.wizard.password.help')}
          >
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('vh.password.min', { min: MIN_PASSWORD_LENGTH })}
              autoFocus
            />
            {password.length > 0 && !passwordOk && (
              <p className="hint">{t('fa.wizard.password.short', { min: MIN_PASSWORD_LENGTH })}</p>
            )}
            {passwordOk && passwordInName && (
              <p className="hint">{t('fa.wizard.password.inName')}</p>
            )}
          </StepFrame>
        )}

        {stage === 'contenido' && (
          <StepFrame
            title={t('fa.wizard.content.title')}
            help={
              source?.spaceAge === null
                ? t('fa.wizard.content.helpUnknown')
                : t('fa.wizard.content.help')
            }
          >
            <Choices options={CONTENIDO} value={contenido} onChange={setContenido} columns={1} />
          </StepFrame>
        )}

        {stage === 'mapa' && (
          <StepFrame
            title={t('fa.wizard.map.title')}
            help={t('fa.wizard.map.help')}
          >
            <Choices options={SIMPLE_PRESETS} value={preset} onChange={setPreset} />
          </StepFrame>
        )}

        {stage === 'conexion' && (
          <StepFrame
            title={t('share.whoCanJoin')}
            help={t('fa.wizard.connection.help')}
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
            title={t('wizard.summary.title')}
            help={t('wizard.summary.help', { change: t('wizard.change') })}
          >
            {/* Igual que en los demás juegos: las filas van dentro de una tarjeta y
                alineadas a la izquierda, aunque el paso centre su texto. */}
            <div className="card" style={{ textAlign: 'left' }}>
              <SummaryRow
                label={t('chooser.col.game')}
                value={source?.source === 'local' ? t('fa.summary.copied') : t('fa.summary.downloaded')}
                onEdit={() => edit('juego')}
              />
              <SummaryRow label={t('wizard.summary.name')} value={name} onEdit={() => edit('nombre')} />
              <SummaryRow label={t('vh.summary.password')} value={password.trim()} onEdit={() => edit('clave')} />
              {!spaceAgeImposible && (
                <SummaryRow
                  label={t('fa.summary.content')}
                  value={labelOf(CONTENIDO, contenido)}
                  onEdit={() => edit('contenido')}
                />
              )}
              <SummaryRow
                label={t('fa.summary.map')}
                value={labelOf(SIMPLE_PRESETS, preset)}
                onEdit={() => edit('mapa')}
              />
              <SummaryRow
                label={t('panel.tab.connection')}
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label={t('fa.summary.verify')}
                value={t('fa.summary.verifyValue')}
                autoNote={t('fa.summary.verifyNote')}
              />
              <SummaryRow
                label={t('version.title')}
                value={source?.source === 'local' ? t('fa.summary.versionLocal') : t('fa.summary.versionSteam')}
                autoNote={t('fa.summary.versionNote')}
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>
                {source?.source === 'local' ? t('fa.summary.copyTitle') : t('fa.summary.downloadTitle')}
              </strong>
              <p>
                {source?.source === 'local' ? t('fa.summary.copyText') : t('fa.summary.downloadText')}
              </p>
            </div>

            <SteamAgreement
              basic
              agreed={agreed}
              onChange={setAgreed}
              hint={t('fa.wizard.steamHint')}
            />
          </StepFrame>
        )}

        {/* Los mismos botones y los mismos textos que los demás juegos: crear un
            servidor tiene que sentirse igual sea del juego que sea. */}
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
              disabled={!agreed || !claveOk}
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
