import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import {
  GAME_RULES,
  SERVER_OPTIONS,
  type SatisfactoryOption
} from '@shared/games/satisfactory/types'
import { t } from '../../i18n'

/**
 * Ajustes de un servidor de Satisfactory.
 *
 * Aquí no hay ficheros que editar: todo se le pide al servidor por su API y se
 * aplica al momento. La consecuencia visible —y hay que decirla, no
 * esconderla— es que **con el servidor parado no se puede tocar nada**, justo
 * al revés que en Minecraft.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

export function SettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const advanced = mode === 'advanced'

  const [values, setValues] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Record<string, string>>({})
  const [rules, setRules] = useState<Record<string, string>>({})
  const [originalRules, setOriginalRules] = useState<Record<string, string>>({})
  const [clientPassword, setClientPassword] = useState(
    manifest.game === 'satisfactory' ? manifest.data.clientPassword : ''
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!running) return
    setError(null)
    try {
      const options = await window.qubiq.satisfactory.options.get(manifest.id)
      setValues(options.options)
      setOriginal(options.options)
      setPending(options.pending)
      if (advanced) {
        const gameRules = await window.qubiq.satisfactory.rules.get(manifest.id)
        setRules(gameRules.settings)
        setOriginalRules(gameRules.settings)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id, running, advanced])

  useEffect(() => {
    void load()
  }, [load])

  if (!running) {
    return (
      <div className="panel">
        <div className="alert info">
          <strong>{t('sf.settings.startFirst')}</strong>
          <p>{t('sf.settings.startFirstText')}</p>
        </div>
      </div>
    )
  }

  const visible = SERVER_OPTIONS.filter((option) => advanced || !option.advanced)
  const changed = Object.keys(values).filter((key) => values[key] !== original[key])

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      // Solo lo que ha cambiado: mandar el objeto entero pisaría con valores
      // viejos lo que alguien haya cambiado desde el juego mientras tanto.
      const updates = Object.fromEntries(changed.map((key) => [key, values[key]!]))
      const result = await window.qubiq.satisfactory.options.set(manifest.id, updates)
      setValues(result.options)
      setOriginal(result.options)
      setPending(result.pending)
      setNotice(t('sf.settings.saved'))
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function savePassword(): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await window.qubiq.satisfactory.setClientPassword(manifest.id, clientPassword.trim())
      setNotice(
        clientPassword.trim().length > 0 ? t('sf.settings.passwordChanged') : t('sf.settings.passwordRemoved')
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveRules(): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const updates = Object.fromEntries(
        Object.keys(rules)
          .filter((key) => rules[key] !== originalRules[key])
          .map((key) => [key, rules[key]!])
      )
      const result = await window.qubiq.satisfactory.rules.set(manifest.id, updates)
      setRules(result.settings)
      setOriginalRules(result.settings)
      setNotice(t('sf.settings.rulesApplied'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const rulesChanged = Object.keys(rules).some((key) => rules[key] !== originalRules[key])

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('panel.actionFailed')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div className="alert info">
          <p style={{ margin: 0 }}>{notice}</p>
        </div>
      )}

      {Object.keys(pending).length > 0 && (
        <div className="alert warn">
          <strong>{t('sf.settings.pendingTitle')}</strong>
          <p>
            {t('sf.settings.pending', {
              count: Object.keys(pending).length,
              list: Object.keys(pending).join(', ')
            })}
          </p>
        </div>
      )}

      <div className="card">
        <h3>{t('panel.tab.server')}</h3>
        <p className="hint">{t('sf.settings.serverHint')}</p>

        {visible.map((option) => (
          <OptionField
            key={option.key}
            option={option}
            value={values[option.key] ?? ''}
            onChange={(value) => setValues((prev) => ({ ...prev, [option.key]: value }))}
          />
        ))}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" disabled={busy || changed.length === 0} onClick={() => void save()}>
            {t('common.saveChanges')}
          </button>
          {changed.length > 0 && (
            <span className="hint">{t('cfg.unsaved', { count: changed.length })}</span>
          )}
        </div>
      </div>

      <div className="card">
        <h3>{t('wizard.summary.joinPassword')}</h3>
        <p className="hint">{t('sf.settings.passwordHint')}</p>
        <div className="field">
          <input
            type="text"
            value={clientPassword}
            maxLength={40}
            placeholder={t('sf.settings.noPassword')}
            onChange={(e) => setClientPassword(e.target.value)}
          />
        </div>
        <button disabled={busy} onClick={() => void savePassword()}>
          {t('sf.settings.changePassword')}
        </button>
      </div>

      {advanced && (
        <div className="card">
          <h3>{t('sf.settings.rules')}</h3>
          <div className="alert warn" style={{ textAlign: 'left' }}>
            <strong>{t('sf.settings.rulesWarning')}</strong>
            <p>{t('sf.settings.rulesWarningText')}</p>
          </div>

          {GAME_RULES.map((rule) => (
            <OptionField
              key={rule.key}
              option={rule}
              value={rules[rule.key] ?? 'False'}
              onChange={(value) => setRules((prev) => ({ ...prev, [rule.key]: value }))}
            />
          ))}

          <button className="primary" disabled={busy || !rulesChanged} onClick={() => void saveRules()}>
            {t('sf.settings.applyRules')}
          </button>
        </div>
      )}
    </div>
  )
}

interface FieldProps {
  option: SatisfactoryOption
  value: string
  onChange: (value: string) => void
}

/** Un ajuste del servidor, pintado según su tipo. */
function OptionField({ option, value, onChange }: FieldProps): React.JSX.Element {
  if (option.kind === 'toggle') {
    return (
      <div className="field">
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.toLowerCase() === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'True' : 'False')}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{option.label}</span>
        </label>
        <div className="help">{option.help}</div>
      </div>
    )
  }

  if (option.kind === 'choice') {
    return (
      <div className="field">
        <label>{option.label}</label>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {option.choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <div className="help">{option.help}</div>
      </div>
    )
  }

  // El juego cuenta los tiempos en segundos con decimales; la gente, en minutos.
  const minutes = Math.max(1, Math.round(Number(value || '0') / 60))
  return (
    <div className="field">
      <label>
        {t('sf.settings.every', { label: option.label, n: minutes })}
      </label>
      <input
        type="range"
        min={1}
        max={60}
        step={1}
        value={minutes}
        onChange={(e) => onChange(`${Number(e.target.value) * 60}.0`)}
      />
      <div className="help">{option.help}</div>
    </div>
  )
}
