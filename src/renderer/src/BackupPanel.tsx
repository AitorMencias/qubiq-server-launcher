import { useCallback, useEffect, useState } from 'react'
import { D20Loader } from './D20Loader'
import type { BackupEstimate, BackupInfo, InstanceState, UiMode } from '@shared/types'
import { gameInfo, saveParticiple, theSave, type SaveNoun } from '@shared/games'
import {
  MAX_BACKUP_KEEP,
  MIN_BACKUP_MINUTES,
  RECOMMENDED_HISTORY_MINUTES,
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
      const info = await window.qubiq.backups.create(manifest.id, 'Copia manual')
      setNotice(`Copia creada: ${formatSize(info.sizeBytes)}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function restore(backup: BackupInfo): Promise<void> {
    const ok = window.confirm(
      `Vas a volver al estado del ${formatDate(backup.createdAt)}.\n\n` +
        'Todo lo construido después se perderá. Antes de sobrescribir se guardará ' +
        'automáticamente una copia del estado actual, por si te arrepientes.\n\n¿Continuar?'
    )
    if (!ok) return

    setBusy('restaurando')
    setError(null)
    setNotice(null)
    try {
      await window.qubiq.backups.restore(manifest.id, backup.fileName)
      setNotice(`${saveParticiple(game.save, 'restaurado')}. Ya puedes arrancar el servidor.`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove(backup: BackupInfo): Promise<void> {
    const ok = window.confirm(
      `¿Borrar la copia del ${formatDate(backup.createdAt)}? No se puede deshacer.`
    )
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
          <strong>No se pudo completar la operación</strong>
          <p>{error}</p>
        </div>
      )}

      {notice && !busy && (
        <div className="alert info">
          <strong>Listo</strong>
          <p>{notice}</p>
        </div>
      )}

      <div className="card">
        <h3>Copias de seguridad</h3>
        <p className="hint">{game.backupScope}</p>

        {busy ? (
          // Antes había una barra fija al 45 %: un progreso inventado. Una copia
          // no sabe cuánto le falta, así que se indica actividad y el paso real.
          <div className="row" style={{ gap: 12 }}>
            <D20Loader size={44} />
            <p style={{ fontSize: 13, margin: 0 }}>
              {progressDetail ?? (busy === 'creando' ? 'Creando la copia...' : 'Restaurando...')}
            </p>
          </div>
        ) : (
          <div className="row">
            <button className="primary" onClick={() => void create()}>
              Crear copia ahora
            </button>
            {running && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Se puede hacer con el servidor en marcha: se le pide que guarde antes de copiar.
              </span>
            )}
          </div>
        )}
      </div>

      {basic ? (
        <div className="card">
          <h3>Copias automáticas</h3>
          <p className="hint" style={{ marginBottom: 0 }}>
            {manifest.backup.enabled
              ? `Se guarda una copia sola cada ${formatMinutes(intervalMinutesOf(manifest.backup))} mientras juegas, y siempre antes de cualquier cambio importante. Se conservan las ${manifest.backup.keep} últimas.`
              : 'Están desactivadas. Puedes activarlas desde el modo avanzado.'}
          </p>
        </div>
      ) : (
      <div className="card">
        <h3>Copias automáticas</h3>
        <p className="hint">
          Se hacen solas mientras el servidor está en marcha. Además siempre se guarda una copia
          antes de reinstalar o de restaurar, aunque tengas esto desactivado.
        </p>

        <div className="field">
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => void saveSettings({ enabled: e.target.checked })}
              style={{ width: 16, height: 16, flexShrink: 0 }}
            />
            <span>Hacer copias automáticas</span>
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
              <label>Cuántas conservar: {keep}</label>
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
                Al superar este número se borra la más antigua. Cubrirías{' '}
                <strong>{formatSpan(keep * effectiveMinutes)}</strong> de historial.
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
        <h3>Historial</h3>
        {backups.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Todavía no hay ninguna copia. Crea la primera cuando tengas algo que merezca la pena
            conservar.
          </p>
        ) : (
          <div className="player-list">
            {backups.map((backup) => (
              <div className="player" key={backup.fileName}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{formatDate(backup.createdAt)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {formatSize(backup.sizeBytes)} · {backup.version}
                    {backup.automatic && ' · automática'}
                    {backup.reason && ` · ${backup.reason}`}
                  </div>
                </div>
                <button
                  disabled={running || busy !== null}
                  title={running ? 'Para el servidor para poder restaurar' : undefined}
                  onClick={() => void restore(backup)}
                >
                  Restaurar
                </button>
                <button className="danger" disabled={busy !== null} onClick={() => void remove(backup)}>
                  Borrar
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
      text.trim() === '' || !Number.isFinite(value) ? 'Escribe un número.' : intervalProblem(total)
    setProblem(invalid)
    if (!invalid && total !== minutes) onChange(total)
  }

  return (
    <div className="field">
      <label>Cada cuánto</label>
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
          <option value="minutes">minutos</option>
          <option value="hours">horas</option>
        </select>
      </div>
      {problem && (
        <div className="help" style={{ color: '#ff8b83' }}>
          {problem}
        </div>
      )}
      <div className="help">
        Mínimo {MIN_BACKUP_MINUTES} minutos. El temporizador corre solo con el servidor arrancado;
        si lo tienes parado no se acumulan copias.
      </div>

      {gameSaveMinutes !== null && minutes < gameSaveMinutes && (
        <div className="alert warn" style={{ marginTop: 10, marginBottom: 0 }}>
          <strong>El servidor solo guarda la partida cada {formatMinutes(gameSaveMinutes)}</strong>
          <p>
            La copia espera a ese guardado para no llevarse la partida a medio escribir, así que
            en la práctica saldrá una cada {formatMinutes(gameSaveMinutes)}.
          </p>
        </div>
      )}

      {recommendation && (
        <div className="alert info" style={{ marginTop: 10, marginBottom: 0 }}>
          <div className="row between">
            <strong style={{ marginBottom: 0 }}>
              Recomendado para este servidor: cada {formatMinutes(recommendation.minutes)}
            </strong>
            {recommendation.minutes !== minutes && (
              <button onClick={() => onChange(recommendation.minutes)}>Usar esta</button>
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

  const explanation = (
    <>
      Cuanto más frecuentes sean las copias, menos tiempo atrás cubren las que se conservan: se
      pierde menos si algo falla, pero se puede retroceder menos. Se recomienda conservar al menos{' '}
      {formatSpan(RECOMMENDED_HISTORY_MINUTES)} de historial
      {short && `: con copias cada ${formatMinutes(intervalMinutes)} hacen falta ${suggested}`}.
    </>
  )

  if (!short) return <p className="hint">{explanation}</p>

  return (
    <div className="alert warn">
      <strong>Solo podrías volver hasta hace {formatSpan(covered)}</strong>
      <p>{explanation}</p>
      {suggested > keep && (
        <button style={{ marginTop: 10 }} onClick={() => onKeep(suggested)}>
          Conservar {suggested} copias
        </button>
      )}
    </div>
  )
}

interface StorageEstimateProps {
  estimate: BackupEstimate | null
  keep: number
  save: SaveNoun
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
      <div className="help">
        Todavía no se puede estimar el espacio: {theSave(save)} aún no se ha generado.
      </div>
    )
  }

  const noRoom = free !== null && total > free
  const tight = free !== null && !noRoom && total > free * 0.25

  return (
    <div
      className={noRoom ? 'alert error' : 'alert info'}
      style={{ marginBottom: 0, marginTop: 4 }}
    >
      <strong>
        {keep} copias ocuparían unos {formatSize(total)}
      </strong>
      <p>
        {measured
          ? `Calculado sobre ${estimate.sampleCount} ${
              estimate.sampleCount === 1 ? 'copia real' : 'copias reales'
            }: unos ${formatSize(estimate.perBackupBytes)} cada una.`
          : `Estimado a partir ${save.feminine ? 'de la' : 'del'} ${save.singular} actual (${formatSize(
              estimate.worldBytes
            )} sin comprimir): unos ${formatSize(estimate.perBackupBytes)} por copia.`}
        {free !== null && ` Tienes ${formatSize(free)} libres.`}
        {noRoom && ' No hay espacio suficiente: reduce el número de copias.'}
        {tight && ' Se te va una parte notable del disco libre.'}
        {!measured &&
          ` ${theSave(save).charAt(0).toUpperCase()}${theSave(save).slice(1)} crece según lo exploréis, así que esto subirá con el tiempo.`}
      </p>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
