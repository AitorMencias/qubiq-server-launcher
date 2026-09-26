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
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
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
        running
          ? 'Hecho. El servidor ha vuelto a arrancar y está generando el mapa nuevo.'
          : 'Hecho. El mapa nuevo se generará la próxima vez que arranques el servidor.'
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
            <strong>No se pudo leer el mapa</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className="hint">Mirando el mapa…</p>
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
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      <div className="card">
        <h3>El borrado de cada mes</h3>
        <div className="row between" style={{ marginBottom: 10 }}>
          <span style={{ color: 'var(--muted)' }}>
            {view.moment === 'hoy' ? 'El de este mes' : 'El próximo'}
          </span>
          <span>
            {wipeDateLabel(view.nextForcedWipe)}
            {view.doneThisMonth && ' · hecho'}
          </span>
        </div>
        <div className="hint">
          <WipeExplainer />
        </div>
      </div>

      <div className="card">
        <h3>El mapa de ahora</h3>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)' }}>Tamaño</span>
          <span>{worldSizeLabel(view.worldSize)}</span>
        </div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)' }}>Semilla</span>
          <span>{view.seed}</span>
        </div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)' }}>Empezó</span>
          <span>{sinceLabel(view.current?.bornAt ?? null)}</span>
        </div>
        <div className="row between">
          <span style={{ color: 'var(--muted)' }}>Ocupa</span>
          <span>{view.current ? mb(view.current.bytes) : '—'}</span>
        </div>
        {antiguos.length > 0 && (
          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Hay {antiguos.length === 1 ? 'otro mapa' : `${antiguos.length} mapas más`} de antes
            ocupando {mb(bytesAntiguos)}: el juego ya no los carga. El próximo borrado se los lleva.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Qué hace la app cuando llega</h3>
        <CheckRow
          label="Hacerlo sola en cuanto salga la actualización"
          help="Guarda una copia, actualiza Rust, borra el mapa y vuelve a arrancar. Con la app cerrada, lo hace al abrirla. Apagado, en la pantalla del servidor sale un aviso con un botón."
          checked={view.plan.auto}
          onChange={(auto) => void setPlan({ auto })}
        />
        <CheckRow
          label="Mapa con otra forma cada mes"
          help="Una semilla nueva en cada borrado. Apagado, el terreno se repite y solo se pierde lo construido."
          checked={view.plan.newSeed}
          onChange={(value) => void setPlan({ newSeed: value })}
        />
        <CheckRow
          label="Borrar también los planos aprendidos"
          help="Todo el mundo vuelve a aprender a fabricar desde cero. Facepunch lo hace él mismo algunos meses, se marque o no."
          checked={view.plan.blueprints}
          onChange={(value) => void setPlan({ blueprints: value })}
        />
      </div>

      <div className="card danger-zone">
        <h3>Empezar un mapa nuevo ahora</h3>
        <p className="hint">
          Se pierde lo construido en el mapa de ahora. Antes se guarda una copia, que se puede
          restaurar desde Configuración → Copias.
          {running && ' El servidor se para, avisando a quien esté dentro, y vuelve a arrancar solo.'}
        </p>

        {!confirming ? (
          <button className="danger" disabled={busy} onClick={() => setConfirming(true)}>
            Empezar un mapa nuevo…
          </button>
        ) : (
          <>
            <CheckRow
              label="Actualizar Rust antes, si hay versión nueva"
              help="Es el borrado del mes: sin actualizar, a partir del primer jueves nadie con el juego al día puede entrar."
              checked={update}
              onChange={setUpdate}
            />
            <CheckRow label="Con otra forma (semilla nueva)" checked={newSeed} onChange={setNewSeed} />
            <CheckRow label="Borrar también los planos" checked={blueprints} onChange={setBlueprints} />
            {advanced && (
              <div className="field">
                <label>Tamaño del mapa nuevo</label>
                <select
                  value={worldSize ?? view.worldSize}
                  onChange={(e) => setWorldSize(Number(e.target.value))}
                >
                  {!WORLD_SIZES.some((w) => w.size === view.worldSize) && (
                    <option value={view.worldSize}>{view.worldSize} m (el de ahora)</option>
                  )}
                  {WORLD_SIZES.map((w) => (
                    <option key={w.size} value={w.size}>
                      {w.label} ({w.size} m){w.size === view.worldSize ? ' — el de ahora' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="hint">
              {preview.length === 0
                ? 'No hay ningún mapa en disco todavía: no se borra nada.'
                : `Se borran ${preview.length} ficheros del mapa${blueprints ? ' y de los planos' : ''}.`}
            </p>
            {busy ? (
              <div className="row" style={{ gap: 10, color: 'var(--muted)' }}>
                <D20Loader size={22} />
                <span>Trabajando… si hay que actualizar Rust, tarda un poco.</span>
              </div>
            ) : (
              <div className="row">
                <button onClick={() => setConfirming(false)}>Cancelar</button>
                <button className="danger" onClick={() => void wipeNow()}>
                  Sí, empezar un mapa nuevo
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
        {hoy ? 'Toca el borrado mensual de Rust' : `Se acerca el borrado mensual: ${wipeDateLabel(view.nextForcedWipe)}`}
      </strong>
      <p>
        {hoy
          ? 'Desde que Facepunch publica la actualización (hacia las 20:00 del primer jueves), quien tenga el juego al día no puede entrar en un servidor sin actualizar. Actualizar empieza un mapa nuevo.'
          : 'Ese día sale una actualización de Rust que obliga a actualizar el servidor, y el servidor actualizado empieza un mapa nuevo.'}
        {view.plan.auto && ' Lo tienes programado: la app lo hará sola en cuanto salga.'}
      </p>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        {hoy && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(() => window.qubiq.rust.map.wipe(id, { update: true }))}
          >
            {busy ? 'Trabajando…' : 'Hacerlo ahora'}
          </button>
        )}
        {!view.plan.auto && (
          <button disabled={busy} onClick={() => void run(() => window.qubiq.rust.map.setPlan(id, { auto: true }))}>
            Que la app lo haga sola cada mes
          </button>
        )}
        <button disabled={busy} onClick={() => void run(() => window.qubiq.rust.map.dismiss(id))}>
          Ahora no
        </button>
      </div>
    </div>
  )
}
