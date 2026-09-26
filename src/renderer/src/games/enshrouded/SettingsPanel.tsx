import { useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import {
  PRESETS,
  SETTINGS,
  SETTING_GROUPS,
  TAGS,
  factorLabel,
  minutesToNanos,
  nanosToMinutes,
  presetInfo,
  presetSettings,
  type EnshroudedPreset,
  type EnshroudedSettingValue,
  type EnshroudedSettings,
  type SettingInfo
} from '@shared/games/enshrouded/types'
import { CheckRow } from './CheckRow'

/**
 * Ajustes de un servidor de Enshrouded.
 *
 * **Todo con el servidor parado**, y por partida doble: el servidor lee su
 * configuración al arrancar y además reescribe el fichero al cerrarse, así que
 * lo cambiado en caliente no solo no se aplicaría, es que se perdería.
 *
 * Y aquí está la trampa de este juego, dicha en pantalla en vez de escondida:
 * **con un preajuste que no sea «A mi manera», el servidor ignora todos los
 * ajustes de abajo**. Comprobado arrancándolo con `playerHealthFactor: 2` y el
 * preajuste «Normal»: aplica 1 y no dice nada. Por eso, en cuanto se toca algo,
 * el preajuste pasa solo a «A mi manera».
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

interface ConfigView {
  preset: string
  effectivePreset: string
  settings: EnshroudedSettings
  changed: string[]
  tags: string[]
  enableTextChat: boolean
  enableVoiceChat: boolean
  voiceChatMode: 'Proximity' | 'Global'
}

export function EnshroudedSettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const running = status === 'running'

  const [view, setView] = useState<ConfigView | null>(null)
  const [preset, setPreset] = useState<EnshroudedPreset>('Default')
  const [settings, setSettings] = useState<EnshroudedSettings>({})
  const [tags, setTags] = useState<string[]>([])
  const [textChat, setTextChat] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.qubiq.enshrouded.config
      .get(manifest.id)
      .then((config) => {
        if (!alive) return
        setView(config as ConfigView)
        setPreset(config.preset as EnshroudedPreset)
        setSettings(config.settings)
        setTags(config.tags)
        setTextChat(config.enableTextChat)
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

  /** El preajuste que se aplicaría de verdad con lo que hay en pantalla. */
  const wouldBeCustom =
    preset === 'Custom' ||
    Object.keys(presetSettings(preset)).some(
      (key) => key in settings && settings[key] !== presetSettings(preset)[key]
    )

  const changed =
    JSON.stringify({ preset, settings, tags, textChat }) !==
    JSON.stringify({
      preset: view.preset,
      settings: view.settings,
      tags: view.tags,
      textChat: view.enableTextChat
    })

  function setValue(key: string, value: EnshroudedSettingValue): void {
    setNotice(null)
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function changePreset(next: EnshroudedPreset): void {
    setNotice(null)
    setPreset(next)
    // Cambiar de preajuste trae sus valores medidos: si no, los controles de
    // abajo seguirían enseñando los del anterior y al pasar a «A mi manera» la
    // partida cambiaría de golpe sin que nadie lo hubiera pedido.
    if (next !== 'Custom') setSettings(presetSettings(next))
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const saved = await window.qubiq.enshrouded.config.set(manifest.id, {
        preset,
        settings,
        tags,
        enableTextChat: textChat
      })
      setView(saved as ConfigView)
      setPreset(saved.preset as EnshroudedPreset)
      setSettings(saved.settings)
      setNotice(
        saved.preset === 'Custom' && preset !== 'Custom'
          ? 'Guardado. Como has cambiado algún ajuste, la dificultad ha pasado a «A mi manera»: es la única con la que el servidor los mira.'
          : 'Guardado.'
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const visibles = advanced ? SETTINGS : SETTINGS.filter((s) => s.basic)

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
          <strong>El servidor está arrancado</strong>
          <p>
            Enshrouded lee su configuración al arrancar y reescribe el fichero al cerrarse, así que
            ahora mismo no se puede guardar. Para el servidor y vuelve aquí.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Dificultad</h3>
        <div className="field">
          <label>Preajuste</label>
          <select
            value={preset}
            disabled={running}
            onChange={(e) => changePreset(e.target.value as EnshroudedPreset)}
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="help">{presetInfo(preset).help}</div>
        </div>

        {wouldBeCustom && preset !== 'Custom' && (
          <div className="alert warn">
            <strong>Va a quedar como «A mi manera»</strong>
            <p>
              Has cambiado algún ajuste, y Enshrouded solo los mira con ese preajuste. Con cualquier
              otro los ignora sin avisar, así que al guardar se cambia solo.
            </p>
          </div>
        )}
      </div>

      {SETTING_GROUPS.map((group) => {
        const delGrupo = visibles.filter((s) => s.group === group.id)
        if (delGrupo.length === 0) return null
        return (
          <div className="card" key={group.id}>
            <h3>{group.label}</h3>
            {delGrupo.map((setting) => (
              <SettingField
                key={setting.key}
                setting={setting}
                value={settings[setting.key]}
                disabled={running}
                onChange={(value) => setValue(setting.key, value)}
              />
            ))}
          </div>
        )
      })}

      {advanced && (
        <div className="card">
          <h3>En la lista de servidores</h3>
          <p className="hint">
            Enshrouded sale siempre en su lista pública. Las etiquetas solo sirven para que la gente
            pueda filtrar y encontraros.
          </p>
          <div className="field">
            {TAGS.slice(0, 5).map((tag) => (
              <CheckRow
                key={tag.value}
                label={tag.label}
                checked={tags.includes(tag.value)}
                disabled={running}
                onChange={(on) =>
                  setTags((prev) =>
                    on ? [...prev, tag.value] : prev.filter((t) => t !== tag.value)
                  )
                }
              />
            ))}
          </div>

          <CheckRow
            label="Chat de texto"
            help="Enshrouded lo trae apagado de serie."
            checked={textChat}
            disabled={running}
            onChange={setTextChat}
          />
        </div>
      )}

      <div className="row between">
        <span className="hint">
          {changed ? 'Hay cambios sin guardar.' : 'Todo guardado.'}
        </span>
        <button className="primary" disabled={!changed || busy || running} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

interface FieldProps {
  setting: SettingInfo
  value: EnshroudedSettingValue | undefined
  disabled: boolean
  onChange: (value: EnshroudedSettingValue) => void
}

function SettingField({ setting, value, disabled, onChange }: FieldProps): React.JSX.Element {
  const { kind } = setting

  if (kind.type === 'switch') {
    return (
      <CheckRow
        label={setting.label}
        help={setting.help}
        checked={value === true}
        disabled={disabled}
        onChange={onChange}
      />
    )
  }

  if (kind.type === 'choice') {
    return (
      <div className="field">
        <label>{setting.label}</label>
        <select
          value={String(value ?? kind.options[0]!.value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {kind.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="help">{setting.help}</div>
      </div>
    )
  }

  if (kind.type === 'minutes') {
    const minutos = nanosToMinutes(Number(value ?? 0))
    return (
      <div className="field">
        <label>
          {setting.label}: {minutos} min
        </label>
        <input
          type="range"
          min={kind.min}
          max={kind.max}
          step={1}
          value={minutos}
          disabled={disabled}
          onChange={(e) => onChange(minutesToNanos(Number(e.target.value)))}
        />
        <div className="help">
          {setting.help} Entre {kind.min} y {kind.max} minutos.
        </div>
      </div>
    )
  }

  const numero = Number(value ?? 1)
  return (
    <div className="field">
      <label>
        {setting.label}: {factorLabel(numero)}
      </label>
      <input
        type="range"
        min={kind.min}
        max={kind.max}
        step={0.05}
        value={numero}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="help">
        {setting.help} Entre {factorLabel(kind.min)} y {factorLabel(kind.max)}.
      </div>
    </div>
  )
}
