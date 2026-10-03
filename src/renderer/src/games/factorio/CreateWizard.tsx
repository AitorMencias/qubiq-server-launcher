import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import {
  DEFAULT_MAX_PLAYERS,
  MIN_PASSWORD_LENGTH,
  PRESETS,
  type FactorioPreset
} from '@shared/games/factorio/types'
import { D20Loader } from '../../D20Loader'
import { GameSource, type GameSourceChoice } from './GameSource'
import { SteamAgreement } from '../../WizardParts'
import { Rich, t } from '../../i18n'

/**
 * Asistente en modo avanzado de Factorio: todo en una pantalla.
 *
 * Quien elige este modo sabe lo que hace, así que aquí sí aparecen la semilla,
 * el número de jugadores, el autoguardado y la verificación de cuentas. Lo que
 * sigue sin aparecer es RCON: no es una opción, es la única forma que tiene la
 * app de hablar con el servidor, y va atada a este equipo.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [source, setSource] = useState<GameSourceChoice | null>(null)
  const [name, setName] = useState(() => t('sf.wizard.defaultName'))
  const [description, setDescription] = useState('')
  const [password, setPassword] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS)
  const [preset, setPreset] = useState<FactorioPreset>('default')
  const [seed, setSeed] = useState('')
  const [spaceAge, setSpaceAge] = useState(true)
  const [verifyAccounts, setVerifyAccounts] = useState(true)
  const [autoPause, setAutoPause] = useState(true)
  const [port, setPort] = useState(defaultPortFor('factorio'))
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const spaceAgeImposible = source?.spaceAge === false
  const passwordOk = password.trim().length === 0 || password.trim().length >= MIN_PASSWORD_LENGTH
  const canCreate = source !== null && name.trim().length > 0 && passwordOk && agreed

  async function create(): Promise<void> {
    if (!source) return
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'factorio',
        name,
        port,
        expectedPlayers: maxPlayers,
        agreements: ['steam-subscriber'],
        exposure: { mode: connection },
        options: {
          source: source.source,
          ...(source.sourcePath ? { sourcePath: source.sourcePath } : {}),
          ...(source.steamUser ? { steamUser: source.steamUser } : {}),
          password: password.trim(),
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
          maxPlayers,
          preset,
          ...(seed.trim().length > 0 ? { seed: seed.trim() } : {}),
          spaceAge: spaceAge && !spaceAgeImposible,
          autoPause,
          verifyAccounts
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
        <h3>{t('fa.create.game')}</h3>
        <p className="hint">{t('fa.create.gameHint')}</p>
        <GameSource value={source} onChange={setSource} />
      </div>

      <div className="card">
        <h3>{t('panel.tab.server')}</h3>

        <div className="field">
          <label>{t('wizard.summary.name')}</label>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <div className="help">{t('fa.create.nameHelp')}</div>
        </div>

        <div className="field">
          <label>{t('fa.create.description')}</label>
          <input
            value={description}
            maxLength={200}
            placeholder={t('fa.create.descriptionPlaceholder', { name })}
            onChange={(e) => setDescription(e.target.value)}
          />
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
              {t('fa.create.passwordShort', { min: MIN_PASSWORD_LENGTH })}
            </div>
          )}
        </div>

        <div className="field">
          <label>{t('details.maxPlayers')}</label>
          <input
            type="number"
            min={1}
            max={64}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          />
        </div>

        <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={verifyAccounts}
            onChange={(e) => setVerifyAccounts(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            <strong>{t('fa.create.verify')}</strong>
            <div className="help" style={{ margin: 0 }}>
              <Rich k="fa.create.verifyHelp" values={{ host: <code>auth.factorio.com</code> }} />
            </div>
          </span>
        </label>

        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoPause}
            onChange={(e) => setAutoPause(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{t('fa.create.autoPause')}</span>
        </label>
      </div>

      <div className="card">
        <h3>{t('fa.summary.map')}</h3>

        <div className="field">
          <label>{t('fa.create.mapGen')}</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as FactorioPreset)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="help">{PRESETS.find((p) => p.id === preset)?.description}</div>
        </div>

        <div className="field">
          <label>{t('fa.create.seed')}</label>
          <input
            value={seed}
            placeholder={t('fa.create.seedPlaceholder')}
            onChange={(e) => setSeed(e.target.value)}
          />
          <div className="help">{t('fa.create.seedHelp')}</div>
        </div>

        <label className="row" style={{ cursor: spaceAgeImposible ? 'default' : 'pointer' }}>
          <input
            type="checkbox"
            checked={spaceAge && !spaceAgeImposible}
            disabled={spaceAgeImposible}
            onChange={(e) => setSpaceAge(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            <strong>{t('fa.wizard.spaceAge')}</strong>
            <div className="help" style={{ margin: 0 }}>
              {spaceAgeImposible ? t('fa.create.noExpansion') : t('fa.create.spaceAgeHelp')}
            </div>
          </span>
        </label>
      </div>

      <div className="card">
        <h3>{t('panel.tab.connection')}</h3>

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
            <Rich k="fa.create.portHelp" values={{ udp: <strong>UDP</strong> }} />
          </div>
        </div>

        <div className="field">
          <label>{t('vh.create.howJoin')}</label>
          <select
            value={connection}
            onChange={(e) => setConnection(e.target.value as ExposureMode)}
          >
            <option value="local">{t('connection.mode.local')}</option>
            <option value="router">{t('fa.create.routerOption')}</option>
            <option value="tunnel">{t('vh.create.tunnelOption')}</option>
          </select>
        </div>
      </div>

      <SteamAgreement agreed={agreed} onChange={setAgreed} hint={t('fa.create.steamHint')} />

      <div className="row">
        <button className="primary" disabled={!canCreate} onClick={() => void create()}>
          {t('wizard.create')}
        </button>
        <button onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}
