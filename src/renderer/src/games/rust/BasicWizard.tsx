import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import {
  DEFAULT_WORLD_SIZE,
  WORLD_SIZES,
  nextForcedWipe,
  worldSizeInfo,
  worldSizeLabel
} from '@shared/games/rust/types'
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
import { formatNumber, t } from '../../i18n'
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

// Las opciones se construyen al pintar, para que salgan en el idioma de ese momento.

function connections(): Option<ExposureMode>[] {
  return [
    { value: 'local', title: t('wizard.connection.local'), sub: t('wizard.connection.local.sub') },
    { value: 'router', title: t('wizard.connection.router'), sub: t('rust.wizard.routerSub') },
    { value: 'tunnel', title: t('wizard.connection.tunnel'), sub: t('en.wizard.tunnelSub') }
  ]
}

/** «para 2 a 4» empieza la frase: su primera letra, en mayúscula. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function maps(): Option<string>[] {
  return WORLD_SIZES.map((w) => ({
    value: String(w.size),
    title: `${w.label} (${w.size} m)`,
    sub: t('rust.wizard.mapSub', {
      players: capitalize(w.players),
      gb: formatNumber(w.memoryGb),
      first: w.firstStart
    })
  }))
}

function playerChoices(): Option<string>[] {
  return (['4', '10', '25'] as const).map((value) => ({
    value,
    title: t(`rust.wizard.players.${value}`),
    sub: t(`rust.wizard.players.${value}.sub`)
  }))
}

type Mode = 'pvp' | 'pve'

function modes(): Option<Mode>[] {
  return [
    { value: 'pvp', title: t('rust.wizard.pvp'), sub: t('rust.wizard.pvp.sub') },
    { value: 'pve', title: t('rust.set.server.pve.label'), sub: t('rust.wizard.pve.sub') }
  ]
}

type WipeChoice = 'aviso' | 'auto'

function wipes(): Option<WipeChoice>[] {
  return [
    { value: 'aviso', title: t('rust.wizard.wipeNotify'), sub: t('rust.wizard.wipeNotify.sub') },
    { value: 'auto', title: t('rust.wizard.wipeAuto'), sub: t('rust.wizard.wipeAuto.sub') }
  ]
}

export function BasicWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('nombre')
  /** true si se ha vuelto a un paso desde el resumen: al terminar, se regresa a él. */
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState(() => t('rust.wizard.defaultName'))
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
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">
              {t('rust.wizard.preparingHint', { first: mapa?.firstStart ?? t('rust.wizard.someMinutes') })}
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
  const MAPS = maps()
  const MODES = modes()
  const WIPES = wipes()

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
            title={t('rust.wizard.map.title')}
            help={t('rust.wizard.map.help')}
          >
            <Choices options={MAPS} value={worldSize} onChange={setWorldSize} columns={1} />
            <MemoryNotice worldSize={Number(worldSize)} />
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

        {stage === 'partida' && (
          <StepFrame
            title={t('mc.wizard.pvp.title')}
            help={t('rust.wizard.pvpHelp', { path: `${t('panel.configuration')} → ${t('tab.settings')}` })}
          >
            <Choices options={MODES} value={mode} onChange={setMode} columns={1} />
          </StepFrame>
        )}

        {stage === 'borrado' && (
          <StepFrame
            title={t('rust.wizard.wipe.title')}
            help={t('rust.wizard.wipe.next', { date: wipeDateLabel(nextForcedWipe(new Date()).toISOString()) })}
          >
            <div className="alert info" style={{ textAlign: 'left' }}>
              <WipeExplainer />
            </div>
            <Choices options={WIPES} value={wipe} onChange={setWipe} columns={1} />
            <div className="help" style={{ textAlign: 'left', marginTop: 12 }}>
              {t('rust.wizard.wipe.change', { path: `${t('panel.configuration')} → ${t('rust.tab.wipe')}` })}
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
              <strong>{t('rust.wizard.publicTitle')}</strong>
              <p>{t('rust.wizard.publicText')}</p>
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
                label={t('fa.summary.map')}
                value={worldSizeLabel(Number(worldSize))}
                onEdit={() => edit('mapa')}
              />
              <SummaryRow label={t('en.summary.slots')} value={players} onEdit={() => edit('gente')} />
              <SummaryRow
                label={t('sf.wizard.summary.session')}
                value={labelOf(MODES, mode)}
                onEdit={() => edit('partida')}
              />
              <SummaryRow
                label={t('rust.summary.wipe')}
                value={labelOf(WIPES, wipe)}
                onEdit={() => edit('borrado')}
              />
              <SummaryRow
                label={t('wizard.summary.connect')}
                value={labelOf(CONNECTIONS, connection)}
                onEdit={() => edit('conexion')}
              />
              <SummaryRow
                label={t('help.router.port')}
                value={`${defaultPortFor('rust')} (UDP)`}
                autoNote={t('pz.summary.portNote')}
              />
              <SummaryRow
                label={t('fa.create.seed')}
                value={t('fa.details.random')}
                autoNote={t('rust.summary.seedNote')}
              />
              <SummaryRow
                label={t('version.title')}
                value={t('wizard.summary.latestSteam')}
                autoNote={t('rust.summary.versionNote')}
                last
              />
            </div>

            <div className="alert info" style={{ textAlign: 'left' }}>
              <strong>{t('rust.wizard.download.title')}</strong>
              <p>
                {t('rust.wizard.download.text', {
                  first: mapa?.firstStart ?? t('rust.wizard.someMinutes'),
                  gb: formatNumber(mapa?.memoryGb ?? 5)
                })}
              </p>
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
            <button className="primary" disabled={!agreed} onClick={() => void create()}>
              {t('wizard.create')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
