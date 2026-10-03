import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import {
  WORLD_SIZES,
  worldSizeLabel,
  type RustMapView,
  type RustWipePlan
} from '@shared/games/rust/types'
import { CheckRow } from '../../CheckRow'
import { D20Loader } from '../../D20Loader'
import { WipeExplainer, sinceLabel, wipeDateLabel } from './wipeText'
import { formatSize, t } from '../../i18n'

/**
 * El borrado mensual (*wipe*): cuándo toca, qué mapa hay, qué hace la app y el
 * botón para hacerlo.
 *
 * El borrado del mes lo fuerza el propio juego: el parche del primer jueves
 * cambia la versión de guardado y el servidor actualizado ya no encuentra su
 * mapa. Lo que pone la app es lo que el juego no hace: avisar antes, guardar
 * una copia, actualizar, decidir la forma del mapa nuevo y si se van los
 * planos, y hacerlo todo de un botón —o sola, si se le pide—.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onChanged: () => void
}

function mb(bytes: number): string {
  return bytes >= 1024 ** 3
    ? formatSize(bytes / 1024 ** 3, 'GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : formatSize(Math.max(1, Math.round(bytes / 1024 ** 2)), 'MB')
}

export function WipePanel({ state, mode, onChanged }: Props): React.JSX.Element {
  const id = state.manifest.id
  const advanced = mode === 'advanced'
  const running = state.status === 'running'

  const [view, setView] = useState<RustMapView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Opciones del borrado de ahora, que parten del plan pero se pueden cambiar
  // solo para esta vez.
  const [newSeed, setNewSeed] = useState(true)
  const [blueprints, setBlueprints] = useState(false)
  const [update, setUpdate] = useState(true)
  const [worldSize, setWorldSize] = useState<number | null>(null)
  const [preview, setPreview] = useState<string[]>([])

  const reload = useCallback(async () => {
    try {
      const map = await window.qubiq.rust.map.get(id)
      setView(map)
      setNewSeed(map.plan.newSeed)
      setBlueprints(map.plan.blueprints)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload, state.status])

  useEffect(() => {
    if (!confirming) return
    void window.qubiq.rust.map
      .wipePreview(id, blueprints)
      .then(setPreview)
      .catch(() => setPreview([]))
  }, [confirming, blueprints, id])

  async function setPlan(plan: Partial<RustWipePlan>): Promise<void> {
    setError(null)
    try {
      setView(await window.qubiq.rust.map.setPlan(id, plan))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function wipeNow(): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const after = await window.qubiq.rust.map.wipe(id, {
        newSeed,
        blueprints,
        update,
        ...(worldSize !== null ? { worldSize } : {})
      })
      setView(after)
      setConfirming(false)
      setWorldSize(null)
      setNotice(
        running ? t('rust.wipePanel.doneRunning') : t('rust.wipePanel.doneStopped')
      )
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!view) {
    return (
      <div className="panel">
        {error ? (
          <div className="alert error">
            <strong>{t('rust.wipePanel.readError')}</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className="hint">{t('rust.wipePanel.reading')}</p>
        )}
      </div>
    )
  }

  const antiguos = view.maps.filter(
    (m) => !view.current || m.size !== view.current.size || m.seed !== view.current.seed || m.saveVersion !== view.current.saveVersion
  )
  const bytesAntiguos = antiguos.reduce((sum, m) => sum + m.bytes, 0)

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('rust.mod.failed')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      <div className="card">
        <h3>{t('rust.create.wipeTitle')}</h3>
        <div className="row between" style={{ marginBottom: 10 }}>
          <span style={{ color: 'var(--muted)' }}>
            {view.moment === 'hoy' ? t('rust.wipePanel.thisMonth') : t('rust.wipePanel.next')}
          </span>
          <span>
            {wipeDateLabel(view.nextForcedWipe)}
            {view.doneThisMonth && ` · ${t('rust.wipePanel.done')}`}
          </span>
        </div>
        <div className="hint">
          <WipeExplainer />
        </div>
      </div>

      <div className="card">
        <h3>{t('rust.wipePanel.currentMap')}</h3>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)' }}>{t('rust.create.size')}</span>
          <span>{worldSizeLabel(view.worldSize)}</span>
        </div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)' }}>{t('fa.create.seed')}</span>
          <span>{view.seed}</span>
        </div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)' }}>{t('rust.wipePanel.started')}</span>
          <span>{sinceLabel(view.current?.bornAt ?? null)}</span>
        </div>
        <div className="row between">
          <span style={{ color: 'var(--muted)' }}>{t('rust.wipePanel.size')}</span>
          <span>{view.current ? mb(view.current.bytes) : '—'}</span>
        </div>
        {antiguos.length > 0 && (
          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            {t('rust.wipePanel.oldMaps', { count: antiguos.length, size: mb(bytesAntiguos) })}
          </p>
        )}
      </div>

      <div className="card">
        <h3>{t('rust.wipePanel.whatApp')}</h3>
        <CheckRow
          label={t('rust.wipe.auto')}
          help={t('rust.wipePanel.autoHelp')}
          checked={view.plan.auto}
          onChange={(auto) => void setPlan({ auto })}
        />
        <CheckRow
          label={t('rust.wipe.newSeed')}
          help={t('rust.wipe.newSeedHelp')}
          checked={view.plan.newSeed}
          onChange={(value) => void setPlan({ newSeed: value })}
        />
        <CheckRow
          label={t('rust.wipe.blueprints')}
          help={t('rust.wipePanel.blueprintsHelp')}
          checked={view.plan.blueprints}
          onChange={(value) => void setPlan({ blueprints: value })}
        />
      </div>

      <div className="card danger-zone">
        <h3>{t('rust.wipePanel.nowTitle')}</h3>
        <p className="hint">
          {t('rust.wipePanel.nowText', {
            path: `${t('panel.configuration')} → ${t('panel.tab.backups')}`
          })}
          {running && ` ${t('rust.wipePanel.nowRunning')}`}
        </p>

        {!confirming ? (
          <button className="danger" disabled={busy} onClick={() => setConfirming(true)}>
            {t('rust.wipePanel.nowButton')}
          </button>
        ) : (
          <>
            <CheckRow
              label={t('rust.wipePanel.update')}
              help={t('rust.wipePanel.updateHelp')}
              checked={update}
              onChange={setUpdate}
            />
            <CheckRow label={t('rust.wipePanel.newSeed')} checked={newSeed} onChange={setNewSeed} />
            <CheckRow label={t('rust.wipePanel.blueprints')} checked={blueprints} onChange={setBlueprints} />
            {advanced && (
              <div className="field">
                <label>{t('rust.wipePanel.newSize')}</label>
                <select
                  value={worldSize ?? view.worldSize}
                  onChange={(e) => setWorldSize(Number(e.target.value))}
                >
                  {!WORLD_SIZES.some((w) => w.size === view.worldSize) && (
                    <option value={view.worldSize}>
                      {view.worldSize} m ({t('rust.wipePanel.current')})
                    </option>
                  )}
                  {WORLD_SIZES.map((w) => (
                    <option key={w.size} value={w.size}>
                      {w.label} ({w.size} m)
                      {w.size === view.worldSize ? ` — ${t('rust.wipePanel.current')}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="hint">
              {preview.length === 0
                ? t('rust.wipePanel.nothing')
                : blueprints
                  ? t('rust.wipePanel.filesWithBlueprints', { count: preview.length })
                  : t('rust.wipePanel.files', { count: preview.length })}
            </p>
            {busy ? (
              <div className="row" style={{ gap: 10, color: 'var(--muted)' }}>
                <D20Loader size={22} />
                <span>{t('rust.wipePanel.working')}</span>
              </div>
            ) : (
              <div className="row">
                <button onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
                <button className="danger" onClick={() => void wipeNow()}>
                  {t('rust.wipePanel.confirm')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * El aviso de la pantalla principal cuando se acerca o llega el borrado.
 *
 * Es donde se decide, si no se decidió al crear el servidor: hacerlo ya, que
 * la app lo haga sola a partir de ahora, o dejarlo para luego.
 */
export function WipeNotice({
  state,
  onRefresh
}: {
  state: InstanceState
  mode: UiMode
  onRefresh: () => void
}): React.JSX.Element | null {
  const id = state.manifest.id
  const [view, setView] = useState<RustMapView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.qubiq.rust.map
      .get(id)
      .then((map) => alive && setView(map))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [id, state.status])

  if (!view || view.moment === 'lejos' || view.doneThisMonth || view.dismissed) return null

  async function run(action: () => Promise<RustMapView>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setView(await action())
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const hoy = view.moment === 'hoy'
  return (
    <div className={`alert ${hoy ? 'warn' : 'info'}`}>
      <strong>
        {hoy
          ? t('rust.notice.today')
          : t('rust.notice.soon', { date: wipeDateLabel(view.nextForcedWipe) })}
      </strong>
      <p>
        {hoy ? t('rust.notice.todayText') : t('rust.notice.soonText')}
        {view.plan.auto && ` ${t('rust.notice.scheduled')}`}
      </p>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        {hoy && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(() => window.qubiq.rust.map.wipe(id, { update: true }))}
          >
            {busy ? t('rust.notice.working') : t('rust.notice.now')}
          </button>
        )}
        {!view.plan.auto && (
          <button disabled={busy} onClick={() => void run(() => window.qubiq.rust.map.setPlan(id, { auto: true }))}>
            {t('rust.notice.auto')}
          </button>
        )}
        <button disabled={busy} onClick={() => void run(() => window.qubiq.rust.map.dismiss(id))}>
          {t('rust.notice.notNow')}
        </button>
      </div>
    </div>
  )
}
