import { useCallback, useState } from 'react'
import type { InstanceState, ManifestChanges, UiMode } from '@shared/types'
import {
  MAX_MEMORY_MB,
  MAX_PLAYERS,
  MEMORY_RECOMMENDED_GB,
  MIN_MEMORY_MB,
  MIN_PASSWORD_LENGTH,
  PRESETS,
  type ZomboidData
} from '@shared/games/zomboid/types'
import { ConfigTab } from './ConfigTab'
import { Rich, formatNumber, t } from '../../i18n'

/**
 * Ajustes de un servidor de Project Zomboid.
 *
 * Son tres cosas distintas y se separan a propósito, porque se aplican en
 * momentos distintos:
 *
 * - Lo de aquí arriba vive en el manifiesto y va en la línea de órdenes o en
 *   las claves del `.ini` que lleva la app: se aplica al arrancar.
 * - Los demás ajustes del servidor son las otras 120 claves del `.ini`, y esas
 *   sí se pueden cambiar en caliente (pestaña «Servidor»).
 * - Las reglas de la partida están en su propia pestaña.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

export function ZomboidSettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const running = status === 'running'

  // El manifiesto es una unión por juego: hay que mirar de cuál es antes de
  // leer `data`, y la comprobación va DESPUÉS de los hooks.
  const original = manifest.game === 'zomboid' ? manifest.data : null
  const [data, setData] = useState<ZomboidData | null>(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!original || !data) return <div className="panel" />

  const changed = JSON.stringify(data) !== JSON.stringify(original)
  const adminOk =
    data.adminPassword.length >= MIN_PASSWORD_LENGTH && !/["\s]/.test(data.adminPassword)
  const passwordOk = data.password.length === 0 || data.password.length >= MIN_PASSWORD_LENGTH

  function set(changes: Partial<ZomboidData>): void {
    setNotice(null)
    setData((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.instances.update(manifest.id, { data } as ManifestChanges)
      setNotice(running ? t('pz.settings.savedRunning') : t('vh.settings.saved'))
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
          <p>
            <Rich k="pz.settings.runningText" values={{ tab: <strong>{t('pz.tab.server')}</strong> }} />
          </p>
        </div>
      )}

      <div className="card">
        <h3>{t('vh.settings.whoJoins')}</h3>

        <div className="field">
          <label>{t('sf.wizard.summary.admin')}</label>
          <input
            type="text"
            value={data.adminPassword}
            maxLength={40}
            onChange={(e) => set({ adminPassword: e.target.value })}
          />
          <div className="help">
            <Rich k="pz.settings.adminHelp" values={{ admin: <code>admin</code> }} />
          </div>
          {!adminOk && (
            <div className="alert error" style={{ marginTop: 10 }}>
              <strong>{t('pz.password.invalid')}</strong>
              <p>{t('pz.password.invalidText', { min: MIN_PASSWORD_LENGTH })}</p>
            </div>
          )}
        </div>

        <div className="field">
          <label>{t('vh.settings.password')}</label>
          <input
            type="text"
            value={data.password}
            maxLength={40}
            placeholder={t('pz.create.passwordPlaceholder')}
            onChange={(e) => set({ password: e.target.value })}
          />
          <div className="help">{t('pz.settings.passwordHelp')}</div>
          {!passwordOk && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              {t('pz.create.passwordShort', { min: MIN_PASSWORD_LENGTH })}
            </div>
          )}
        </div>

        <div className="field">
          <label>{t('details.maxPlayers')}</label>
          <input
            type="number"
            min={1}
            max={MAX_PLAYERS}
            value={data.maxPlayers}
            onChange={(e) => set({ maxPlayers: Number(e.target.value) })}
          />
          <div className="help">{t('pz.settings.maxPlayersHelp', { max: MAX_PLAYERS })}</div>
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 6 }}>
          <input
            type="checkbox"
            checked={data.openToNewPlayers}
            onChange={(e) => set({ openToNewPlayers: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{t('pz.create.open')}</span>
        </label>
        <div className="help">
          <Rich k="pz.settings.openHelp" values={{ tab: <strong>{t('tab.moderation')}</strong> }} />
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 12 }}>
          <input
            type="checkbox"
            checked={data.pvp}
            onChange={(e) => set({ pvp: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{t('pz.create.pvp')}</span>
        </label>
      </div>

      <div className="card">
        <h3>{t('chooser.memory')}</h3>
        <div className="field">
          <label>
            {t('mc.memory.label', {
              gb: formatNumber(data.memoryMb / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            })}
          </label>
          <input
            type="range"
            min={MIN_MEMORY_MB}
            max={MAX_MEMORY_MB}
            step={512}
            value={data.memoryMb}
            onChange={(e) => set({ memoryMb: Number(e.target.value) })}
          />
          <div className="help">{t('pz.settings.memoryHelp', { gb: MEMORY_RECOMMENDED_GB })}</div>
        </div>
      </div>

      {advanced && (
        <div className="card">
          <h3>Steam</h3>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={data.useSteam}
              onChange={(e) => set({ useSteam: e.target.checked })}
              style={{ width: 16, height: 16, flexShrink: 0 }}
            />
            <span>{t('pz.create.useSteam')}</span>
          </label>
          <div className="alert info" style={{ marginTop: 10 }}>
            <strong>{t('pz.steam.publicTitle')}</strong>
            <p>
              <Rich k="pz.steam.publicText" values={{ always: <strong>{t('pz.steam.always')}</strong> }} />
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <h3>{t('mc.wizard.summary.difficulty')}</h3>
        <p className="hint">
          <Rich
            k="pz.settings.difficulty"
            values={{
              preset: <strong>{PRESETS.find((p) => p.id === data.preset)?.name ?? data.preset}</strong>,
              tab: <strong>{t('pz.tab.game')}</strong>
            }}
          />
        </p>
      </div>

      <div className="row">
        <button
          className="primary"
          disabled={busy || !changed || !adminOk || !passwordOk}
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

/**
 * Las otras 120 claves del `servertest.ini`, con la explicación que el propio
 * servidor escribe encima de cada una.
 */
export function ZomboidServerPanel({ state }: { state: InstanceState }): React.JSX.Element {
  const id = state.manifest.id
  const running = state.status === 'running'
  const load = useCallback(() => window.qubiq.zomboid.settings.get(id), [id])
  const save = useCallback(
    (changes: Parameters<typeof window.qubiq.zomboid.settings.set>[1]) =>
      window.qubiq.zomboid.settings.set(id, changes),
    [id]
  )

  return (
    <ConfigTab
      instanceId={id}
      load={load}
      save={save}
      savedNotice={running ? t('pz.server.savedRunning') : t('pz.server.saved')}
      intro={
        <>
          <Rich k="pz.server.intro" values={{ file: <code>servertest.ini</code> }} />{' '}
          {running ? t('pz.server.introRunning') : t('pz.server.introStopped')}
        </>
      }
    />
  )
}
