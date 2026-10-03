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
import { CheckRow } from '../../CheckRow'
import { t } from '../../i18n'

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
            <strong>{t('en.settings.readFailed')}</strong>
            <p>{error}</p>
          </div>
        ) : (
          <p className="hint">{t('pz.search.reading')}</p>
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
          ? t('en.settings.savedCustom', { custom: presetInfo('Custom').label })
          : t('vh.settings.saved')
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
          <strong>{t('common.saveFailed')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {running && (
        <div className="alert info">
          <strong>{t('vh.settings.running')}</strong>
          <p>{t('en.settings.runningText')}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('mc.wizard.summary.difficulty')}</h3>
        <div className="field">
          <label>{t('vh.create.preset')}</label>
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
            <strong>{t('en.settings.willBeCustom', { custom: presetInfo('Custom').label })}</strong>
            <p>{t('en.settings.willBeCustomText')}</p>
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
          <h3>{t('en.create.list')}</h3>
          <p className="hint">{t('en.settings.tagsHint')}</p>
          <div className="field">
            {TAGS.slice(0, 5).map((tag) => (
              <CheckRow
                key={tag.value}
                label={tag.label}
                checked={tags.includes(tag.value)}
                disabled={running}
                onChange={(on) =>
                  setTags((prev) =>
                    on ? [...prev, tag.value] : prev.filter((other) => other !== tag.value)
                  )
                }
              />
            ))}
          </div>

          <CheckRow
            label={t('en.create.textChat')}
            help={t('en.settings.textChatHelp')}
            checked={textChat}
            disabled={running}
            onChange={setTextChat}
          />
        </div>
      )}

      <div className="row between">
        <span className="hint">
          {changed ? t('en.settings.unsaved') : t('en.settings.allSaved')}
        </span>
        <button className="primary" disabled={!changed || busy || running} onClick={() => void save()}>
          {busy ? t('common.saving') : t('cfg.save')}
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
          {setting.label}: {t('panel.uptime.minutes', { m: minutos })}
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
          {setting.help} {t('en.settings.betweenMinutes', { min: kind.min, max: kind.max })}
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
        {setting.help} {t('en.settings.between', { min: factorLabel(kind.min), max: factorLabel(kind.max) })}
      </div>
    </div>
  )
}
