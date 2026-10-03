import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import {
  GLOBAL_KEYS,
  MIN_PASSWORD_LENGTH,
  MODIFIERS,
  PRESETS,
  queryPortFor,
  type ValheimGlobalKey,
  type ValheimModifiers,
  type ValheimPreset
} from '@shared/games/valheim/types'
import { D20Loader } from '../../D20Loader'
import { SteamAgreement } from '../../WizardParts'
import { Rich, t } from '../../i18n'

/**
 * Asistente de Valheim en modo avanzado: todo en un formulario.
 *
 * Sobre el básico añade control, no pasos: el puerto, los modificadores sueltos
 * (dureza, castigo por morir, recursos, ataques, portales), las reglas de sí o
 * no y si el servidor sale en la lista pública de Steam.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState(() => t('vh.wizard.defaultName'))
  const [worldName, setWorldName] = useState('')
  const [password, setPassword] = useState('')
  const [port, setPort] = useState(defaultPortFor('valheim'))
  const [connection, setConnection] = useState<ExposureMode>('crossplay')
  const [preset, setPreset] = useState<ValheimPreset>('normal')
  const [modifiers, setModifiers] = useState<ValheimModifiers>({})
  const [globalKeys, setGlobalKeys] = useState<ValheimGlobalKey[]>([])
  const [listed, setListed] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Valheim usa el puerto y el siguiente, los dos UDP. Un puerto UDP
    // «reservable» no está libre de verdad (README), de ahí el protocolo.
    void window.qubiq.network
      .freePort(defaultPortFor('valheim'), 'udp')
      .then(setPort)
      .catch(() => undefined)
  }, [])

  const passwordOk = password.trim().length === 0 || password.trim().length >= MIN_PASSWORD_LENGTH
  const passwordInName =
    password.trim().length > 0 && name.toLowerCase().includes(password.trim().toLowerCase())
  const canCreate = agreed && passwordOk && !passwordInName && name.trim().length > 0

  function toggleKey(key: ValheimGlobalKey, on: boolean): void {
    setGlobalKeys((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)))
  }

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'valheim',
        name,
        port,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          password: password.trim(),
          worldName: worldName.trim() || name.trim(),
          preset,
          modifiers,
          globalKeys,
          listed
        }
      })
      onCreated(manifest.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (busy) {
    return (
      <div className="panel">
        <div className="card loading-card" style={{ maxWidth: 620, margin: '40px auto 0' }}>
          <D20Loader size={84} />
          <div>
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">{t('vh.create.preparingHint')}</p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              {progress?.detail ?? t('panel.working')}
            </p>
            {progress?.progress != null && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginTop: 16 }}>
                <strong>{t('wizard.prepareFailed')}</strong>
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('catalog.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('panel.tab.server')}</h3>

        <div className="field">
          <label>{t('wizard.summary.name')}</label>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <div className="help">{t('vh.create.nameHelp')}</div>
        </div>

        <div className="field">
          <label>{t('vh.summary.world')}</label>
          <input
            value={worldName}
            maxLength={40}
            placeholder={name}
            onChange={(e) => setWorldName(e.target.value)}
          />
          <div className="help">{t('vh.create.worldHelp')}</div>
        </div>

        <div className="field">
          <label>{t('vh.summary.password')}</label>
          <input
            type="text"
            value={password}
            maxLength={40}
            placeholder={t('vh.create.passwordPlaceholder', { min: MIN_PASSWORD_LENGTH })}
            onChange={(e) => setPassword(e.target.value)}
          />
          {!passwordOk && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              {t('vh.password.shortText', { min: MIN_PASSWORD_LENGTH })}
            </div>
          )}
          {passwordInName && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              {t('vh.create.passwordInName')}
            </div>
          )}
        </div>

        <div className="field">
          <label>{t('help.router.port')}</label>
          <input
            type="number"
            min={1024}
            max={65535}
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">
            <Rich
              k="vh.create.portHelp"
              vars={{ next: queryPortFor(port) }}
              values={{ udp: <strong>UDP</strong> }}
            />
          </div>
        </div>

        <div className="field">
          <label>{t('vh.create.howJoin')}</label>
          <select
            value={connection}
            onChange={(e) => setConnection(e.target.value as ExposureMode)}
          >
            <option value="local">{t('connection.mode.local')}</option>
            <option value="crossplay">{t('vh.create.crossplayOption')}</option>
            <option value="router">{t('vh.create.routerOption')}</option>
            <option value="tunnel">{t('vh.create.tunnelOption')}</option>
          </select>
          <div className="help">{t('vh.create.crossplayHelp')}</div>
        </div>

        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{t('vh.create.listed')}</span>
        </label>
        <div className="help">{t('vh.create.listedHelp')}</div>
      </div>

      <div className="card">
        <h3>{t('mc.wizard.summary.difficulty')}</h3>

        <div className="field">
          <label>{t('vh.create.preset')}</label>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as ValheimPreset)}
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="help">{PRESETS.find((p) => p.value === preset)?.help}</div>
        </div>

        {MODIFIERS.map((modifier) => (
          <div className="field" key={modifier.key}>
            <label>{modifier.label}</label>
            <select
              value={modifiers[modifier.key] ?? 'default'}
              onChange={(e) =>
                setModifiers((prev) => ({ ...prev, [modifier.key]: e.target.value }))
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

      <div className="card">
        <h3>{t('vh.create.rules')}</h3>
        <p className="hint">{t('vh.create.rulesHint')}</p>
        {GLOBAL_KEYS.map((rule) => (
          <label className="row" key={rule.key} style={{ cursor: 'pointer', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={globalKeys.includes(rule.key)}
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

      <SteamAgreement agreed={agreed} onChange={setAgreed} />

      <div className="row">
        <button className="primary" disabled={!canCreate} onClick={() => void create()}>
          {t('wizard.create')}
        </button>
        <button onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}
