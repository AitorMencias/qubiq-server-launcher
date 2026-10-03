import { useState } from 'react'
import type { InstanceState, ManifestChanges, UiMode } from '@shared/types'
import {
  MIN_PASSWORD_LENGTH,
  presetInfo,
  type AllowCommands,
  type FactorioData
} from '@shared/games/factorio/types'
import { Rich, quote, t } from '../../i18n'

/**
 * Ajustes de un servidor de Factorio.
 *
 * Todo lo de aquí acaba en `server-settings.json`, que la app reescribe en cada
 * arranque: **los cambios llegan al reiniciar**, no al vuelo. Y hay dos cosas
 * que no se tocan desde aquí porque ya no se pueden cambiar —Space Age y el
 * mapa—: se grabaron dentro de la partida al generarla, y se dice.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

/** Cada cuánto puede guardar solo el servidor, en minutos. */
const AUTOSAVE_OPTIONS = [5, 10, 15, 30, 60]

export function FactorioSettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const running = status === 'running'

  // La comprobación del juego va DESPUÉS de los hooks: salir antes cambiaría
  // cuántos hooks se ejecutan según el juego, que es lo que React no permite.
  const original = manifest.game === 'factorio' ? manifest.data : null
  const [data, setData] = useState<FactorioData | null>(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!original || !data) return <div className="panel" />
  const changed = JSON.stringify(data) !== JSON.stringify(original)
  const passwordOk = data.password.length === 0 || data.password.length >= MIN_PASSWORD_LENGTH
  const passwordInName =
    data.password.length > 0 && manifest.name.toLowerCase().includes(data.password.toLowerCase())

  function set(changes: Partial<FactorioData>): void {
    setNotice(null)
    setData((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.instances.update(manifest.id, {
        data
      } as ManifestChanges)
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
          <p>{t('fa.settings.runningText')}</p>
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
              <p>{t('fa.create.passwordShort', { min: MIN_PASSWORD_LENGTH })}</p>
            </div>
          )}
          {passwordInName && (
            <div className="alert error" style={{ marginTop: 10 }}>
              <strong>{t('vh.settings.inName')}</strong>
              <p>{t('fa.settings.inNameText')}</p>
            </div>
          )}
        </div>

        <div className="field">
          <label>{t('details.maxPlayers')}</label>
          <input
            type="number"
            min={1}
            max={64}
            value={data.maxPlayers}
            onChange={(e) => set({ maxPlayers: Number(e.target.value) })}
          />
          <div className="help">{t('fa.settings.maxPlayersHelp')}</div>
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 6 }}>
          <input
            type="checkbox"
            checked={data.verifyAccounts}
            onChange={(e) => set({ verifyAccounts: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            <strong>{t('fa.create.verify')}</strong>
            <div className="help" style={{ margin: 0 }}>
              <Rich k="fa.settings.verifyHelp" values={{ host: <code>auth.factorio.com</code> }} />
            </div>
          </span>
        </label>
      </div>

      <div className="card">
        <h3>{t('fa.settings.game')}</h3>

        <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={data.autoPause}
            onChange={(e) => set({ autoPause: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            <strong>{t('fa.settings.autoPause')}</strong>
            <div className="help" style={{ margin: 0 }}>
              {t('fa.settings.autoPauseHelp')}
            </div>
          </span>
        </label>

        <div className="field">
          <label>{t('fa.settings.autosave')}</label>
          <select
            value={data.autosaveMinutes}
            onChange={(e) => set({ autosaveMinutes: Number(e.target.value) })}
          >
            {[...new Set([...AUTOSAVE_OPTIONS, data.autosaveMinutes])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t('panel.uptime.minutes', { m: minutes })}
                </option>
              ))}
          </select>
          <div className="help">{t('fa.settings.autosaveHelp')}</div>
        </div>

        {advanced && (
          <div className="field">
            <label>{t('fa.settings.slots')}</label>
            <input
              type="number"
              min={1}
              max={20}
              value={data.autosaveSlots}
              onChange={(e) => set({ autosaveSlots: Number(e.target.value) })}
            />
            <div className="help">{t('fa.settings.slotsHelp', { tab: t('tab.saves') })}</div>
          </div>
        )}
      </div>

      {advanced && (
        <div className="card">
          <h3>{t('fa.settings.commandsTitle')}</h3>

          <div className="field">
            <label>{t('fa.settings.commands')}</label>
            <select
              value={data.allowCommands}
              onChange={(e) => set({ allowCommands: e.target.value as AllowCommands })}
            >
              <option value="admins-only">{t('fa.settings.commands.admins')}</option>
              <option value="true">{t('fa.settings.commands.anyone')}</option>
              <option value="false">{t('fa.settings.commands.nobody')}</option>
            </select>
            <div className="help">
              {t('fa.settings.commandsHelp', { anyone: t('fa.settings.commands.anyone') })}
            </div>
          </div>

          <div className="field">
            <label>{t('fa.create.description')}</label>
            <input
              type="text"
              value={data.description}
              maxLength={200}
              onChange={(e) => set({ description: e.target.value })}
            />
            <div className="help">{t('fa.settings.descriptionHelp')}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>{t('fa.settings.fixedTitle')}</h3>
        <p className="hint">
          {data.spaceAge ? t('fa.wizard.spaceAge') : t('fa.settings.noSpaceAge')} ·{' '}
          {t('fa.settings.map', { name: quote(presetInfo(data.preset).name) })}
          {data.seed ? ` · ${t('fa.settings.seed', { seed: data.seed })}` : ''}.{' '}
          {t('fa.settings.fixedText')}
        </p>
      </div>

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
