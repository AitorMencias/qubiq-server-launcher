import { useState } from 'react'
import type { InstanceState, ManifestChanges, UiMode } from '@shared/types'
import {
  DEFAULT_SAVE_INTERVAL_SECONDS,
  GLOBAL_KEYS,
  MIN_PASSWORD_LENGTH,
  MIN_SAVE_INTERVAL_SECONDS,
  MODIFIERS,
  PRESETS,
  type ValheimData,
  type ValheimGlobalKey,
  type ValheimPreset
} from '@shared/games/valheim/types'
import { Rich, t } from '../../i18n'

/**
 * Ajustes de un servidor de Valheim.
 *
 * Al revés que Satisfactory: aquí **todo se toca con el servidor parado**,
 * porque en Valheim no hay fichero de configuración ni consola. Cada ajuste es
 * un argumento de la línea de órdenes, así que se guarda en el manifiesto y se
 * aplica en el siguiente arranque. Eso se dice en pantalla, en vez de dejar que
 * el usuario cambie algo y no note nada.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

export function ValheimSettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const running = status === 'running'

  // El manifiesto es una unión por juego, así que hay que mirar de cuál es
  // antes de leer `data`. La comprobación va DESPUÉS de los hooks: salir antes
  // cambiaría cuántos hooks se ejecutan según el juego, que es justo lo que
  // React no permite.
  const original = manifest.game === 'valheim' ? manifest.data : null
  const [data, setData] = useState<ValheimData | null>(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!original || !data) return <div className="panel" />
  const changed = JSON.stringify(data) !== JSON.stringify(original)
  const passwordOk = data.password.length === 0 || data.password.length >= MIN_PASSWORD_LENGTH
  const passwordInName =
    data.password.length > 0 && manifest.name.toLowerCase().includes(data.password.toLowerCase())

  function set(changes: Partial<ValheimData>): void {
    setNotice(null)
    setData((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  function toggleKey(key: ValheimGlobalKey, on: boolean): void {
    setNotice(null)
    setData((prev) =>
      prev
        ? {
            ...prev,
            globalKeys: on ? [...prev.globalKeys, key] : prev.globalKeys.filter((k) => k !== key)
          }
        : prev
    )
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.instances.update(manifest.id, { data } as ManifestChanges)
      setNotice(running ? t('vh.settings.savedRunning') : t('vh.settings.saved'))
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

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
          <p>{t('vh.settings.runningText')}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('vh.settings.whoJoins')}</h3>

        <div className="field">
          <label>{t('vh.settings.password')}</label>
          <input
            type="text"
            value={data.password}
            maxLength={40}
            placeholder={t('wizard.password.emptyNone')}
            onChange={(e) => set({ password: e.target.value })}
          />
          <div className="help">{t('vh.settings.passwordHelp')}</div>
          {!passwordOk && (
            <div className="alert error" style={{ marginTop: 10 }}>
              <strong>{t('vh.settings.tooShort')}</strong>
              <p>{t('vh.settings.tooShortText', { min: MIN_PASSWORD_LENGTH })}</p>
            </div>
          )}
          {passwordInName && (
            <div className="alert error" style={{ marginTop: 10 }}>
              <strong>{t('vh.settings.inName')}</strong>
              <p>{t('vh.settings.inNameText')}</p>
            </div>
          )}
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 6 }}>
          <input
            type="checkbox"
            checked={data.listed}
            onChange={(e) => set({ listed: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{t('vh.create.listed')}</span>
        </label>
        <div className="help">
          <Rich
            k="vh.settings.listedHelp"
            values={{ noAnswer: <strong>{t('vh.settings.noAnswer')}</strong> }}
          />
        </div>
      </div>

      <div className="card">
        <h3>{t('mc.wizard.summary.difficulty')}</h3>
        <p className="hint">{t('vh.settings.difficultyHint')}</p>

        <div className="field">
          <label>{t('vh.create.preset')}</label>
          <select
            value={data.preset}
            onChange={(e) => set({ preset: e.target.value as ValheimPreset })}
          >
            {PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          <div className="help">{PRESETS.find((p) => p.value === data.preset)?.help}</div>
        </div>

        {advanced &&
          MODIFIERS.map((modifier) => (
            <div className="field" key={modifier.key}>
              <label>{modifier.label}</label>
              <select
                value={data.modifiers[modifier.key] ?? 'default'}
                onChange={(e) =>
                  set({ modifiers: { ...data.modifiers, [modifier.key]: e.target.value } })
                }
              >
                {modifier.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="help">{modifier.help}</div>
            </div>
          ))}
      </div>

      {advanced && (
        <div className="card">
          <h3>{t('vh.create.rules')}</h3>
          <p className="hint">{t('vh.settings.rulesHint')}</p>
          {GLOBAL_KEYS.map((rule) => (
            <label className="row" key={rule.key} style={{ cursor: 'pointer', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={data.globalKeys.includes(rule.key)}
                onChange={(e) => toggleKey(rule.key, e.target.checked)}
                style={{ width: 16, height: 16, flexShrink: 0 }}
              />
              <span>
                <strong>{rule.label}</strong>
                <div className="help" style={{ margin: 0 }}>
                  {rule.help}
                </div>
              </span>
            </label>
          ))}
        </div>
      )}

      {advanced && (
        <div className="card">
          <h3>{t('vh.settings.saving')}</h3>

          <div className="field">
            <label>{t('vh.settings.saveEvery')}</label>
            <select
              value={data.saveIntervalSeconds}
              onChange={(e) => set({ saveIntervalSeconds: Number(e.target.value) })}
            >
              {[MIN_SAVE_INTERVAL_SECONDS, 300, 600, DEFAULT_SAVE_INTERVAL_SECONDS, 3600].map(
                (seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`}
                  </option>
                )
              )}
            </select>
            <div className="help">{t('vh.settings.saveEveryHelp')}</div>
          </div>

          <div className="field">
            <label>{t('vh.settings.gameBackups')}</label>
            <input
              type="number"
              min={0}
              max={20}
              value={data.backups}
              onChange={(e) => set({ backups: Number(e.target.value) })}
            />
            <div className="help">{t('vh.settings.gameBackupsHelp')}</div>
          </div>
        </div>
      )}

      <div className="row">
        <button
          className="primary"
          disabled={busy || !changed || !passwordOk || passwordInName}
          onClick={() => void save()}
        >
          {busy ? t('common.saving') : t('common.saveChanges')}
        </button>
        {changed && (
          <button disabled={busy} onClick={() => setData(original)}>
            {t('cfg.discard')}
          </button>
        )}
      </div>
    </div>
  )
}
