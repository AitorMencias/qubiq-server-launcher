import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import {
  BASIC_SANDBOX,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_MEMORY_MB,
  MAX_MEMORY_MB,
  MAX_PLAYERS,
  MIN_MEMORY_MB,
  MIN_PASSWORD_LENGTH,
  PRESETS,
  presetInfo,
  udpPortFor,
  type ZomboidPreset
} from '@shared/games/zomboid/types'
import { D20Loader } from '../../D20Loader'
import { SteamAgreement } from '../../WizardParts'
import { Rich, formatNumber, t } from '../../i18n'

/**
 * Asistente de Project Zomboid en modo avanzado: todo en un formulario.
 *
 * Sobre el básico añade el puerto, la memoria, el límite de jugadores, el PvP,
 * la contraseña del servidor, si se puede entrar sin cuenta creada, las seis
 * reglas de partida que más se notan y Steam, que es la única opción de esta
 * pantalla que saca algo hacia fuera y por eso va con su aviso.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState(() => t('pz.wizard.defaultName'))
  const [adminPassword, setAdminPassword] = useState('')
  const [password, setPassword] = useState('')
  const [description, setDescription] = useState('')
  const [port, setPort] = useState(defaultPortFor('zomboid'))
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS)
  const [memoryMb, setMemoryMb] = useState(DEFAULT_MEMORY_MB)
  const [pvp, setPvp] = useState(false)
  const [openToNewPlayers, setOpenToNewPlayers] = useState(true)
  const [useSteam, setUseSteam] = useState(false)
  const [preset, setPreset] = useState<ZomboidPreset>('survivor')
  const [sandbox, setSandbox] = useState<Record<string, number>>({})
  const [connection, setConnection] = useState<ExposureMode>('local')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.qubiq.network
      .freePort(defaultPortFor('zomboid'), 'udp')
      .then(setPort)
      .catch(() => undefined)
  }, [])

  const adminOk = adminPassword.trim().length >= MIN_PASSWORD_LENGTH && !/["\s]/.test(adminPassword)
  const passwordOk = password.trim().length === 0 || password.trim().length >= MIN_PASSWORD_LENGTH
  const canCreate = agreed && adminOk && passwordOk && name.trim().length > 0

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'zomboid',
        name,
        port,
        expectedPlayers: maxPlayers,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          adminPassword: adminPassword.trim(),
          password: password.trim(),
          description: description.trim(),
          maxPlayers,
          memoryMb,
          pvp,
          openToNewPlayers,
          useSteam,
          preset,
          ...(Object.keys(sandbox).length > 0 ? { sandbox } : {})
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
            <p className="hint">{t('pz.create.preparingHint')}</p>
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
        </div>

        <div className="field">
          <label>{t('fa.create.description')}</label>
          <input
            value={description}
            maxLength={120}
            placeholder={t('pz.create.optional')}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="help">{t('pz.create.descriptionHelp')}</div>
        </div>

        <div className="field">
          <label>{t('sf.wizard.summary.admin')}</label>
          <input
            type="text"
            value={adminPassword}
            maxLength={40}
            placeholder={t('pz.password.placeholder', { min: MIN_PASSWORD_LENGTH })}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
          <div className="help">
            <Rich k="pz.create.adminUser" values={{ admin: <strong>admin</strong> }} />
          </div>
          {adminPassword.trim().length > 0 && !adminOk && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              {t('pz.create.adminInvalid', { min: MIN_PASSWORD_LENGTH })}
            </div>
          )}
        </div>

        <div className="field">
          <label>{t('vh.settings.password')}</label>
          <input
            type="text"
            value={password}
            maxLength={40}
            placeholder={t('pz.create.passwordPlaceholder')}
            onChange={(e) => setPassword(e.target.value)}
          />
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
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          />
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
              k="pz.create.portHelp"
              vars={{ next: udpPortFor(port) }}
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
            <option value="router">{t('fa.create.routerOption')}</option>
            <option value="tunnel">{t('vh.create.tunnelOption')}</option>
          </select>
        </div>

        <div className="field">
          <label>
            {t('pz.create.memory', {
              gb: formatNumber(memoryMb / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            })}
          </label>
          <input
            type="range"
            min={MIN_MEMORY_MB}
            max={MAX_MEMORY_MB}
            step={512}
            value={memoryMb}
            onChange={(e) => setMemoryMb(Number(e.target.value))}
          />
          <div className="help">{t('pz.create.memoryHelp')}</div>
        </div>

        <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={pvp}
            onChange={(e) => setPvp(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{t('pz.create.pvp')}</span>
        </label>

        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={openToNewPlayers}
            onChange={(e) => setOpenToNewPlayers(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{t('pz.create.open')}</span>
        </label>
        <div className="help">{t('pz.create.openHelp', { tab: t('tab.moderation') })}</div>
      </div>

      <div className="card">
        <h3>Steam</h3>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={useSteam}
            onChange={(e) => setUseSteam(e.target.checked)}
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

      <div className="card">
        <h3>{t('mc.wizard.summary.difficulty')}</h3>
        <div className="field">
          <label>{t('vh.create.preset')}</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as ZomboidPreset)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="help">{presetInfo(preset).description}</div>
        </div>

        <p className="hint">
          {t('pz.create.sixRules', { path: `${t('panel.configuration')} → ${t('pz.tab.game')}` })}
        </p>

        {BASIC_SANDBOX.map((choice) => (
          <div className="field" key={choice.key}>
            <label>{choice.label}</label>
            <select
              value={sandbox[choice.key] === undefined ? '' : String(sandbox[choice.key])}
              onChange={(e) =>
                setSandbox((prev) => {
                  const next = { ...prev }
                  if (e.target.value === '') delete next[choice.key]
                  else next[choice.key] = Number(e.target.value)
                  return next
                })
              }
            >
              <option value="">{t('vh.mod.default')}</option>
              {choice.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="help">{choice.help}</div>
          </div>
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
