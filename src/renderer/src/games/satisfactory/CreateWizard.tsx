import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import { RELIABLE_PORT, SERVER_OPTIONS } from '@shared/games/satisfactory/types'
import { D20Loader } from '../../D20Loader'
import { MemoryNotice } from './MemoryNotice'
import { SteamAgreement } from '../../WizardParts'
import { Rich, t } from '../../i18n'

/**
 * Asistente de Satisfactory en modo avanzado: todo en un formulario.
 *
 * Lo que añade sobre el básico es control, no pasos: puerto, nombre de la
 * partida distinto del servidor y los ajustes del servidor que se pueden dejar
 * puestos desde el principio.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState(() => t('sf.wizard.defaultName'))
  const [sessionName, setSessionName] = useState('')
  const [expectedPlayers, setExpectedPlayers] = useState(4)
  const [adminPassword, setAdminPassword] = useState('')
  const [clientPassword, setClientPassword] = useState('')
  const [port, setPort] = useState(defaultPortFor('satisfactory'))
  const [connection, setConnection] = useState<ExposureMode>('local')
  const [autosaveMinutes, setAutosaveMinutes] = useState(5)
  const [autoPause, setAutoPause] = useState(true)
  const [agreed, setAgreed] = useState(false)
  const [totalMemoryMb, setTotalMemoryMb] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.qubiq.system
      .memory()
      .then((memory) => setTotalMemoryMb(memory.totalMb))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    // El puerto propuesto es el primero libre en TCP y UDP a la vez: el juego
    // usa los dos, y uno UDP «reservable» no está libre de verdad (README).
    void window.qubiq.network
      .freePort(defaultPortFor('satisfactory'), 'tcp+udp')
      .then(setPort)
      .catch(() => undefined)
  }, [])

  const adminOk = adminPassword.trim().length >= 4

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'satisfactory',
        name,
        expectedPlayers,
        port,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          adminPassword: adminPassword.trim(),
          clientPassword: clientPassword.trim(),
          sessionName: sessionName.trim() || name.trim(),
          serverOptions: {
            'FG.AutosaveInterval': `${autosaveMinutes * 60}.0`,
            'FG.DSAutoPause': autoPause ? 'True' : 'False'
          }
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
            <p className="hint">{t('sf.create.preparingHint')}</p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>{progress?.detail ?? t('panel.working')}</p>
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
        <h3>1. {t('wizard.summary.name')}</h3>
        <div className="field">
          <label>{t('wizard.serverName')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div className="field">
          <label>{t('sf.create.sessionName')}</label>
          <input
            value={sessionName}
            placeholder={name}
            onChange={(e) => setSessionName(e.target.value)}
            maxLength={40}
          />
          <div className="help">{t('sf.create.sessionHelp')}</div>
        </div>
      </div>

      <div className="card">
        <h3>2. {t('sf.create.passwords')}</h3>
        <p className="hint">{t('sf.create.passwordsHint')}</p>
        <div className="field">
          <label>{t('sf.wizard.summary.admin')}</label>
          <input
            type="text"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            maxLength={40}
            placeholder={t('sf.wizard.admin.placeholder')}
          />
        </div>
        <div className="field">
          <label>{t('wizard.summary.joinPassword')}</label>
          <input
            type="text"
            value={clientPassword}
            onChange={(e) => setClientPassword(e.target.value)}
            maxLength={40}
            placeholder={t('wizard.password.emptyNone')}
          />
        </div>
      </div>

      <div className="card">
        <h3>3. {t('sf.create.playersConnection')}</h3>
        <div className="field">
          <label>{t('wizard.playersAtOnce', { n: expectedPlayers })}</label>
          <input
            type="range"
            min={1}
            max={16}
            step={1}
            value={expectedPlayers}
            onChange={(e) => setExpectedPlayers(Number(e.target.value))}
          />
          <div className="help">{t('sf.create.playersHelp')}</div>
        </div>

        <div className="field">
          <label>{t('help.router.port')}</label>
          <input
            type="number"
            value={port}
            min={1024}
            max={65535}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">
            <Rich k="sf.create.portHelp" values={{ port: <strong>{RELIABLE_PORT}</strong> }} />
          </div>
        </div>

        <div className="field">
          <label>{t('wizard.fromWhere')}</label>
          <select value={connection} onChange={(e) => setConnection(e.target.value as ExposureMode)}>
            <option value="local">{t('wizard.short.local')}</option>
            <option value="router">{t('wizard.short.router')}</option>
            <option value="tunnel">{t('wizard.short.tunnel')}</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h3>4. {t('sf.create.gameSettings')}</h3>
        <p className="hint">
          {t('sf.create.gameSettingsHint', {
            path: `${t('panel.configuration')} → ${t('tab.settings')}`
          })}
        </p>
        <div className="field">
          <label>{t('sf.create.autosave', { n: autosaveMinutes })}</label>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={autosaveMinutes}
            onChange={(e) => setAutosaveMinutes(Number(e.target.value))}
          />
          <div className="help">{SERVER_OPTIONS[0]!.help}</div>
        </div>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoPause}
            onChange={(e) => setAutoPause(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{t('sf.create.autoPause')}</span>
        </label>
      </div>

      <MemoryNotice totalMemoryMb={totalMemoryMb} players={expectedPlayers} />

      <SteamAgreement
        number={5}
        agreed={agreed}
        onChange={setAgreed}
        hint={t('sf.create.steamHint')}
      />

      <div className="row between">
        <button onClick={onCancel}>{t('common.cancel')}</button>
        <button
          className="primary"
          disabled={!agreed || !adminOk || name.trim().length === 0}
          onClick={() => void create()}
        >
          {t('wizard.create')}
        </button>
      </div>
    </div>
  )
}
