import { useCallback, useEffect, useState } from 'react'
import type { BackupEstimate, BackupInfo, InstanceState, UiMode } from '@shared/types'

/** Intervalos ofrecidos, en horas. Más fino que esto no aporta nada. */
const INTERVALS = [1, 2, 3, 6, 12, 24]

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
  const [intervalHours, setIntervalHours] = useState(manifest.backup.intervalHours)
  const [keep, setKeep] = useState(manifest.backup.keep)

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
    setIntervalHours(manifest.backup.intervalHours)
    setKeep(manifest.backup.keep)
  }, [manifest.backup.enabled, manifest.backup.intervalHours, manifest.backup.keep])

  async function saveSettings(changes: Partial<typeof manifest.backup>): Promise<void> {
    const next = { enabled, intervalHours, keep, ...changes }
    setEnabled(next.enabled)
    setIntervalHours(next.intervalHours)
    setKeep(next.keep)
    try {
      await window.qubiq.instances.update(manifest.id, { backup: next })
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
      setNotice('Mundo restaurado. Ya puedes arrancar el servidor.')
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
        <p className="hint">
          Se guarda el mundo y la configuración. Los jars no hacen falta: se pueden volver a
          descargar.
        </p>

        {busy ? (
          <>
            <p style={{ fontSize: 13, margin: '0 0 4px' }}>
              {progressDetail ?? (busy === 'creando' ? 'Creando la copia...' : 'Restaurando...')}
            </p>
            <div className="progress">
              <div style={{ width: '45%' }} />
            </div>
          </>
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
              ? `Se guarda una copia sola cada ${manifest.backup.intervalHours} horas mientras juegas, y siempre antes de cualquier cambio importante. Se conservan las ${manifest.backup.keep} últimas.`
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
            <div className="field">
              <label>Cada cuánto</label>
              <select
                value={intervalHours}
                onChange={(e) => void saveSettings({ intervalHours: Number(e.target.value) })}
              >
                {INTERVALS.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours === 1 ? 'Cada hora' : `Cada ${hours} horas`}
                  </option>
                ))}
              </select>
              <div className="help">
                El temporizador corre solo con el servidor arrancado; si lo tienes parado no se
                acumulan copias.
              </div>
            </div>

            <div className="field">
              <label>Cuántas conservar: {keep}</label>
              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={keep}
                onChange={(e) => setKeep(Number(e.target.value))}
                onMouseUp={() => void saveSettings({ keep })}
                onKeyUp={() => void saveSettings({ keep })}
              />
              <div className="help">
                Al superar este número se borra la más antigua. Cubrirías{' '}
                <strong>{formatSpan(keep * intervalHours)}</strong> de historial.
              </div>
            </div>

            <StorageEstimate estimate={estimate} keep={keep} />
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
                    {formatSize(backup.sizeBytes)} · {backup.minecraftVersion}
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

interface StorageEstimateProps {
  estimate: BackupEstimate | null
  keep: number
}

/**
 * Cuánto va a ocupar la retención elegida.
 *
 * Se distingue de forma explícita entre medido y estimado: con copias reales
 * la cifra es fiable; sin ellas es una aproximación a partir del mundo, y decir
 * lo contrario sería engañar sobre algo que ocupa gigas en el disco del usuario.
 */
function StorageEstimate({ estimate, keep }: StorageEstimateProps): React.JSX.Element | null {
  if (!estimate) return null

  const total = estimate.perBackupBytes * keep
  const measured = estimate.sampleCount > 0
  const free = estimate.freeDiskBytes

  if (estimate.perBackupBytes === 0) {
    return (
      <div className="help">
        Todavía no se puede estimar el espacio: el mundo aún no se ha generado.
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
          : `Estimado a partir del mundo actual (${formatSize(
              estimate.worldBytes
            )} sin comprimir): unos ${formatSize(estimate.perBackupBytes)} por copia.`}
        {free !== null && ` Tienes ${formatSize(free)} libres.`}
        {noRoom && ' No hay espacio suficiente: reduce el número de copias.'}
        {tight && ' Se te va una parte notable del disco libre.'}
        {!measured && ' El mundo crece según lo exploréis, así que esto subirá con el tiempo.'}
      </p>
    </div>
  )
}

/** Horas a un texto legible: 72 -> "3 días". */
function formatSpan(hours: number): string {
  if (hours < 24) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'día' : 'días'}`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`
  const months = Math.round(days / 30)
  return `${months} ${months === 1 ? 'mes' : 'meses'}`
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
