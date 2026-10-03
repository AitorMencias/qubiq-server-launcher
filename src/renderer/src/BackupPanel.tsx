import { useCallback, useEffect, useState } from 'react'
import { D20Loader } from './D20Loader'
import type { BackupEstimate, BackupInfo, InstanceState, UiMode } from '@shared/types'
import { gameInfo, type SaveKind } from '@shared/games'
import {
  MAX_BACKUP_KEEP,
  MIN_BACKUP_MINUTES,
  RECOMMENDED_HISTORY_MINUTES,
  backupReasonLabel,
  formatMinutes,
  formatSpan,
  gameSaveMinutes,
  intervalMinutes as intervalMinutesOf,
  intervalProblem,
  keepForRecommendedHistory,
  minutesToHours,
  recommendedInterval,
  type IntervalRecommendation
} from '@shared/backup'
import { Rich, formatBytes, formatDate as formatDateTime, t } from './i18n'

type IntervalUnit = 'minutes' | 'hours'

/**
 * Copias de seguridad (§12).
 *
 * Con el servidor arrancado, crear una copia es seguro: el núcleo hace
 * save-off / save-all flush / esperar / copiar / save-on. Restaurar, en cambio,
 * exige el servidor parado.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  progressDetail: string | null
  onManifestChanged: () => void
}

export function BackupPanel({
  state,
  mode,
  progressDetail,
  onManifestChanged
}: Props): React.JSX.Element {
  const { manifest, status } = state
  const game = gameInfo(manifest.game)
  const running = status !== 'stopped' && status !== 'crashed'
  const basic = mode === 'basic'

  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [estimate, setEstimate] = useState<BackupEstimate | null>(null)
  const [busy, setBusy] = useState<'creando' | 'restaurando' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Ajustes editables, con guardado inmediato: son tres controles sueltos y
  // obligar a pulsar "Guardar" para cada uno sería fricción sin motivo.
  const [enabled, setEnabled] = useState(manifest.backup.enabled)
  const [intervalMinutes, setIntervalMinutes] = useState(intervalMinutesOf(manifest.backup))
  const [keep, setKeep] = useState(manifest.backup.keep)
  const saveEvery = gameSaveMinutes(manifest)
  // Lo que de verdad separa dos copias: en los juegos que guardan a su ritmo,
  // la copia espera a ese guardado aunque se haya pedido antes.
  const effectiveMinutes = Math.max(intervalMinutes, saveEvery ?? 0)

  const refresh = useCallback(async () => {
    try {
      const [list, size] = await Promise.all([
        window.qubiq.backups.list(manifest.id),
        window.qubiq.backups.estimate(manifest.id)
      ])
      setBackups(list)
      setEstimate(size)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setEnabled(manifest.backup.enabled)
    setIntervalMinutes(intervalMinutesOf(manifest.backup))
    setKeep(manifest.backup.keep)
  }, [manifest.backup.enabled, manifest.backup.intervalHours, manifest.backup.keep])

  async function saveSettings(
    changes: Partial<{ enabled: boolean; intervalMinutes: number; keep: number }>
  ): Promise<void> {
    const next = { enabled, intervalMinutes, keep, ...changes }
    setEnabled(next.enabled)
    setIntervalMinutes(next.intervalMinutes)
    setKeep(next.keep)
    try {
      await window.qubiq.instances.update(manifest.id, {
        backup: {
          enabled: next.enabled,
          intervalHours: minutesToHours(next.intervalMinutes),
          keep: next.keep
        }
      })
      onManifestChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function create(): Promise<void> {
    setBusy('creando')
    setError(null)
    setNotice(null)
    try {
      // El motivo se guarda en español dentro de la copia: es un dato, y así lo
      // reconoce `backupReasonLabel` para enseñarlo en cualquier idioma.
      const info = await window.qubiq.backups.create(manifest.id, 'Copia manual')
      setNotice(t('backup.created', { size: formatSize(info.sizeBytes) }))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function restore(backup: BackupInfo): Promise<void> {
    const ok = window.confirm(t('backup.confirmRestore', { date: formatDate(backup.createdAt) }))
    if (!ok) return

    setBusy('restaurando')
    setError(null)
    setNotice(null)
    try {
      await window.qubiq.backups.restore(manifest.id, backup.fileName)
      setNotice(t(`backup.restored.${game.save}`))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove(backup: BackupInfo): Promise<void> {
    const ok = window.confirm(t('backup.confirmDelete', { date: formatDate(backup.createdAt) }))
    if (!ok) return
    try {
      await window.qubiq.backups.remove(manifest.id, backup.fileName)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('backup.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      {notice && !busy && (
        <div className="alert info">
          <strong>{t('backup.done')}</strong>
          <p>{notice}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('backup.title')}</h3>
        <p className="hint">{game.backupScope}</p>

        {busy ? (
          // Antes había una barra fija al 45 %: un progreso inventado. Una copia
          // no sabe cuánto le falta, así que se indica actividad y el paso real.
          <div className="row" style={{ gap: 12 }}>
            <D20Loader size={44} />
            <p style={{ fontSize: 13, margin: 0 }}>
              {progressDetail ?? (busy === 'creando' ? t('backup.creating') : t('backup.restoring'))}
            </p>
          </div>
        ) : (
          <div className="row">
            <button className="primary" onClick={() => void create()}>
              {t('backup.createNow')}
            </button>
            {running && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('backup.runningHint')}</span>
            )}
          </div>
        )}
      </div>

      {basic ? (
        <div className="card">
          <h3>{t('backup.auto.title')}</h3>
          <p className="hint" style={{ marginBottom: 0 }}>
            {manifest.backup.enabled
              ? t('backup.auto.basicOn', {
                  interval: formatMinutes(intervalMinutesOf(manifest.backup)),
                  count: manifest.backup.keep
                })
              : t('backup.auto.basicOff')}
          </p>
        </div>
      ) : (
      <div className="card">
        <h3>{t('backup.auto.title')}</h3>
        <p className="hint">{t('backup.auto.hint')}</p>

        <div className="field">
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => void saveSettings({ enabled: e.target.checked })}
              style={{ width: 16, height: 16, flexShrink: 0 }}
            />
            <span>{t('backup.auto.enable')}</span>
          </label>
        </div>

        {enabled && (
          <>
            <IntervalField
              minutes={intervalMinutes}
              recommendation={
                estimate ? recommendedInterval(manifest, estimate.worldBytes) : null
              }
              gameSaveMinutes={saveEvery}
              onChange={(minutes) => void saveSettings({ intervalMinutes: minutes })}
            />

            <div className="field">
              <label>{t('backup.keep', { keep })}</label>
              <input
                type="range"
                min={1}
                max={MAX_BACKUP_KEEP}
                step={1}
                value={keep}
                onChange={(e) => setKeep(Number(e.target.value))}
                onMouseUp={() => void saveSettings({ keep })}
                onKeyUp={() => void saveSettings({ keep })}
              />
              <div className="help">
                <Rich
                  k="backup.keepHelp"
                  values={{ span: <strong>{formatSpan(keep * effectiveMinutes)}</strong> }}
                />
              </div>
            </div>

            <HistoryAdvice
              intervalMinutes={effectiveMinutes}
              keep={keep}
              onKeep={(value) => void saveSettings({ keep: value })}
            />

            <StorageEstimate estimate={estimate} keep={keep} save={game.save} />
          </>
        )}
      </div>
      )}

      <div className="card">
        <h3>{t('backup.history')}</h3>
        {backups.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {t('backup.empty')}
          </p>
        ) : (
          <div className="player-list">
            {backups.map((backup) => (
              <div className="player" key={backup.fileName}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{formatDate(backup.createdAt)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {formatSize(backup.sizeBytes)} · {backup.version}
                    {backup.automatic && ` · ${t('backup.automatic')}`}
                    {backup.reason && ` · ${backupReasonLabel(backup.reason)}`}
                  </div>
                </div>
                <button
                  disabled={running || busy !== null}
                  title={running ? t('backup.stopToRestore') : undefined}
                  onClick={() => void restore(backup)}
                >
                  {t('backup.restore')}
                </button>
                <button className="danger" disabled={busy !== null} onClick={() => void remove(backup)}>
                  {t('backup.delete')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface IntervalFieldProps {
  minutes: number
  recommendation: IntervalRecommendation | null
  /** Cada cuánto guarda el propio juego, si no se le puede pedir antes. */
  gameSaveMinutes: number | null
  onChange: (minutes: number) => void
}

/**
 * Cada cuánto se hace la copia: un número libre y la unidad al lado.
 *
 * Se guarda al salir del campo o al cambiar la unidad, no con cada tecla: a
 * medio escribir «30» pasa por «3», que no vale, y no se debe avisar de nada
 * ni reprogramar el temporizador por eso.
 */
function IntervalField({
  minutes,
  recommendation,
  gameSaveMinutes,
  onChange
}: IntervalFieldProps): React.JSX.Element {
  const [unit, setUnit] = useState<IntervalUnit>(unitFor(minutes))
  const [amount, setAmount] = useState(amountIn(minutes, unitFor(minutes)))
  const [problem, setProblem] = useState<string | null>(null)

  // Refleja los cambios que llegan de fuera, como «Usar la recomendada».
  useEffect(() => {
    const next = unitFor(minutes)
    setUnit(next)
    setAmount(amountIn(minutes, next))
    setProblem(null)
  }, [minutes])

  function commit(text: string, inUnit: IntervalUnit): void {
    const value = Number(text.trim().replace(',', '.'))
    const total = Math.round(value * (inUnit === 'hours' ? 60 : 1))
    const invalid =
      text.trim() === '' || !Number.isFinite(value) ? t('backup.writeNumber') : intervalProblem(total)
    setProblem(invalid)
    if (!invalid && total !== minutes) onChange(total)
  }

  return (
    <div className="field">
      <label>{t('backup.every')}</label>
      <div className="row">
        <input
          type="number"
          min={inUnitMin(unit)}
          step={unit === 'hours' ? 0.5 : 1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => commit(amount, unit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(amount, unit)
          }}
          style={{ width: 110 }}
        />
        <select
          value={unit}
          onChange={(e) => {
            const next = e.target.value as IntervalUnit
            setUnit(next)
            commit(amount, next)
          }}
          style={{ width: 130 }}
        >
          <option value="minutes">{t('backup.unit.minutes')}</option>
          <option value="hours">{t('backup.unit.hours')}</option>
        </select>
      </div>
      {problem && (
        <div className="help" style={{ color: '#ff8b83' }}>
          {problem}
        </div>
      )}
      <div className="help">{t('backup.minimum', { min: MIN_BACKUP_MINUTES })}</div>

      {gameSaveMinutes !== null && minutes < gameSaveMinutes && (
        <div className="alert warn" style={{ marginTop: 10, marginBottom: 0 }}>
          <strong>
            {t('backup.gameSaves.title', { interval: formatMinutes(gameSaveMinutes) })}
          </strong>
          <p>{t('backup.gameSaves.text', { interval: formatMinutes(gameSaveMinutes) })}</p>
        </div>
      )}

      {recommendation && (
        <div className="alert info" style={{ marginTop: 10, marginBottom: 0 }}>
          <div className="row between">
            <strong style={{ marginBottom: 0 }}>
              {t('backup.recommended', { interval: formatMinutes(recommendation.minutes) })}
            </strong>
            {recommendation.minutes !== minutes && (
              <button onClick={() => onChange(recommendation.minutes)}>{t('backup.useThis')}</button>
            )}
          </div>
          <p style={{ marginTop: 6 }}>{recommendation.reason}</p>
        </div>
      )}
    </div>
  )
}

/** Horas si es un número redondo de horas; si no, minutos. */
function unitFor(minutes: number): IntervalUnit {
  return minutes >= 60 && minutes % 60 === 0 ? 'hours' : 'minutes'
}

function amountIn(minutes: number, unit: IntervalUnit): string {
  return String(unit === 'hours' ? minutes / 60 : minutes)
}

function inUnitMin(unit: IntervalUnit): number {
  return unit === 'hours' ? 0.5 : MIN_BACKUP_MINUTES
}

interface HistoryAdviceProps {
  intervalMinutes: number
  keep: number
  onKeep: (keep: number) => void
}

/**
 * Hasta cuándo se puede volver atrás. Con copias frecuentes y pocas
 * conservadas, el historial se queda en minutos: un problema que se note tarde
 * (un griefing, un mod que corrompe) ya estaría en todas las copias.
 */
function HistoryAdvice({ intervalMinutes, keep, onKeep }: HistoryAdviceProps): React.JSX.Element {
  const covered = intervalMinutes * keep
  const short = covered < RECOMMENDED_HISTORY_MINUTES
  const suggested = keepForRecommendedHistory(intervalMinutes)

  const explanation = short
    ? t('backup.adviceShort', {
        span: formatSpan(RECOMMENDED_HISTORY_MINUTES),
        interval: formatMinutes(intervalMinutes),
        count: suggested
      })
    : t('backup.advice', { span: formatSpan(RECOMMENDED_HISTORY_MINUTES) })

  if (!short) return <p className="hint">{explanation}</p>

  return (
    <div className="alert warn">
      <strong>{t('backup.onlyBack', { span: formatSpan(covered) })}</strong>
      <p>{explanation}</p>
      {suggested > keep && (
        <button style={{ marginTop: 10 }} onClick={() => onKeep(suggested)}>
          {t('backup.keepN', { count: suggested })}
        </button>
      )}
    </div>
  )
}

interface StorageEstimateProps {
  estimate: BackupEstimate | null
  keep: number
  save: SaveKind
}

/**
 * Cuánto va a ocupar la retención elegida.
 *
 * Se distingue de forma explícita entre medido y estimado: con copias reales
 * la cifra es fiable; sin ellas es una aproximación a partir del mundo, y decir
 * lo contrario sería engañar sobre algo que ocupa gigas en el disco del usuario.
 */
function StorageEstimate({ estimate, keep, save }: StorageEstimateProps): React.JSX.Element | null {
  if (!estimate) return null

  const total = estimate.perBackupBytes * keep
  const measured = estimate.sampleCount > 0
  const free = estimate.freeDiskBytes

  if (estimate.perBackupBytes === 0) {
    return (
      <div className="help">{t(`backup.noEstimate.${save}`)}</div>
    )
  }

  const noRoom = free !== null && total > free
  const tight = free !== null && !noRoom && total > free * 0.25

  return (
    <div
      className={noRoom ? 'alert error' : 'alert info'}
      style={{ marginBottom: 0, marginTop: 4 }}
    >
      <strong>{t('backup.wouldTake', { count: keep, size: formatSize(total) })}</strong>
      <p>
        {measured
          ? t('backup.measured', {
              count: estimate.sampleCount,
              size: formatSize(estimate.perBackupBytes)
            })
          : t(`backup.estimated.${save}`, {
              world: formatSize(estimate.worldBytes),
              size: formatSize(estimate.perBackupBytes)
            })}
        {free !== null && ` ${t('backup.free', { size: formatSize(free) })}`}
        {noRoom && ` ${t('backup.noRoom')}`}
        {tight && ` ${t('backup.tight')}`}
        {!measured && ` ${t(`backup.grows.${save}`)}`}
      </p>
    </div>
  )
}

function formatSize(bytes: number): string {
  return formatBytes(bytes)
}

function formatDate(iso: string): string {
  return formatDateTime(iso, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
