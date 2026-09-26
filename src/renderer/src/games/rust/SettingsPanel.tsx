import { useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import {
  MAX_PLAYERS,
  RUST_SETTINGS,
  RUST_SETTING_GROUPS,
  rustPlusPortFor,
  type RustConfigView,
  type RustSettingInfo,
  type RustSettingValue,
  type RustSettings
} from '@shared/games/rust/types'
import { CheckRow } from '../../CheckRow'

/**
 * Ajustes de un servidor de Rust.
 *
 * Al revés que en Enshrouded, **se pueden guardar con el servidor en marcha**:
 * todo va en la línea de órdenes con la que se arranca, así que vale desde el
 * siguiente arranque y nada que escriba el servidor mientras tanto lo pisa. Se
 * dice en pantalla para que nadie espere verlo cambiar al momento.
 *
 * Son pocos a propósito: Rust tiene cientos de variables, casi todas de ajuste
 * fino del motor. Estas son las que cambian cómo se juega, y cada una está
 * comprobada contra el servidor real.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

export function RustSettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const running = status === 'running' || status === 'starting'

  const [view, setView] = useState<RustConfigView | null>(null)
  const [settings, setSettings] = useState<RustSettings>({})
  const [description, setDescription] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [rustPlus, setRustPlus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.qubiq.rust.config
      .get(manifest.id)
      .then((config) => {
        if (!alive) return
        setView(config)
        setSettings(config.settings)
        setDescription(config.description)
        setMaxPlayers(config.maxPlayers)
        setRustPlus(config.rustPlus)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [manifest.id])

  if (!view) {
    return (
      <div className="panel">
        {error ? (
          <div className="alert error">
            <strong>No se pudo leer la configuración</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className="hint">Leyendo la configuración…</p>
        )}
      </div>
    )
  }

  const changed =
    JSON.stringify({ settings, description, maxPlayers, rustPlus }) !==
    JSON.stringify({
      settings: view.settings,
      description: view.description,
      maxPlayers: view.maxPlayers,
      rustPlus: view.rustPlus
    })

  function setValue(key: string, value: RustSettingValue): void {
    setNotice(null)
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const saved = await window.qubiq.rust.config.set(manifest.id, {
        settings,
        description,
        maxPlayers,
        rustPlus
      })
      setView(saved)
      setSettings(saved.settings)
      setNotice(
        running
          ? 'Guardado. El servidor está en marcha: los cambios valen desde el próximo arranque.'
          : 'Guardado. Se aplica al arrancar el servidor.'
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const visibles = advanced ? RUST_SETTINGS : RUST_SETTINGS.filter((s) => s.basic)

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>No se pudo guardar</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {running && (
        <div className="alert info">
          <strong>Se puede guardar con el servidor en marcha</strong>
          <p>
            Los ajustes se le pasan a Rust al arrancar, así que lo que cambies aquí vale desde el
            próximo arranque.
          </p>
        </div>
      )}

      <div className="card">
        <h3>El servidor</h3>
        <div className="field">
          <label>Plazas</label>
          <input
            type="number"
            min={1}
            max={MAX_PLAYERS}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          />
          <div className="help">Cuánta gente puede estar dentro a la vez, entre 1 y {MAX_PLAYERS}.</div>
        </div>
        <div className="field">
          <label>Descripción</label>
          <input
            value={description}
            maxLength={200}
            placeholder="Sale en la ficha del servidor dentro del juego"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {advanced && (
          <CheckRow
            label="Rust+ (la app del móvil)"
            help={`Deja ver el mapa y recibir avisos de la base en el móvil. Desde fuera de casa necesita abrir un puerto TCP más, el ${rustPlusPortFor(manifest.port)}, que sale en Configuración → Conexión en cuanto lo enciendes.`}
            checked={rustPlus}
            onChange={setRustPlus}
          />
        )}
      </div>

      {RUST_SETTING_GROUPS.map((group) => {
        const items = visibles.filter((s) => s.group === group.id)
        if (items.length === 0) return null
        return (
          <div className="card" key={group.id}>
            <h3>{group.label}</h3>
            {items.map((info) => (
              <SettingField
                key={info.key}
                info={info}
                value={settings[info.key] ?? info.default}
                onChange={(value) => setValue(info.key, value)}
              />
            ))}
          </div>
        )
      })}

      {!advanced && (
        <p className="hint">
          En modo avanzado hay más: radiación, fabricar al instante, equipos, la imagen de la ficha
          del servidor…
        </p>
      )}

      <div className="row between">
        <span className="hint" style={{ margin: 0 }}>
          {changed ? 'Hay cambios sin guardar.' : 'Sin cambios.'}
        </span>
        <button className="primary" disabled={!changed || busy} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function SettingField({
  info,
  value,
  onChange
}: {
  info: RustSettingInfo
  value: RustSettingValue
  onChange: (value: RustSettingValue) => void
}): React.JSX.Element {
  const kind = info.kind
  if (kind.type === 'switch') {
    return (
      <CheckRow label={info.label} help={info.help} checked={Boolean(value)} onChange={onChange} />
    )
  }

  if (kind.type === 'text') {
    return (
      <div className="field">
        <label>{info.label}</label>
        <input
          value={String(value)}
          placeholder={kind.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="help">{info.help}</div>
      </div>
    )
  }

  // Los tiempos se guardan en segundos, que es como los entiende Rust, y se
  // enseñan en minutos, que es como los piensa cualquiera.
  const minutes = kind.type === 'minutes'
  const shown = minutes ? Math.round(Number(value) / 60) : Number(value)
  return (
    <div className="field">
      <label>{info.label}</label>
      <div className="row" style={{ gap: 10 }}>
        <input
          type="number"
          min={kind.min}
          max={kind.max}
          step={kind.type === 'number' ? (kind.step ?? 1) : 1}
          value={shown}
          onChange={(e) => onChange(minutes ? Number(e.target.value) * 60 : Number(e.target.value))}
          style={{ width: 140, flex: 'none' }}
        />
        {/* Con estilo propio: un `.hint` suelto en una fila sale a tamaño
            normal (la lección de la fase 6). */}
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {minutes ? 'minutos' : kind.type === 'number' ? (kind.unit ?? '') : ''}
        </span>
      </div>
      <div className="help">
        {info.help} De serie: {minutes ? `${Math.round(Number(info.default) / 60)} minutos` : String(info.default)}.
      </div>
    </div>
  )
}
