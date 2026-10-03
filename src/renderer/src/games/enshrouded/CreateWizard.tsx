import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import {
  DEFAULT_QUERY_PORT,
  MAX_PLAYERS,
  PRESETS,
  TAGS,
  roleProblems,
  type EnshroudedPreset,
  type EnshroudedRole
} from '@shared/games/enshrouded/types'
import { D20Loader } from '../../D20Loader'
import { CheckRow } from '../../CheckRow'
import { RolesEditor } from './RolesEditor'
import { rolesFor } from './roles'
import { suggestPassword } from './BasicWizard'
import { SteamAgreement } from '../../WizardParts'
import { t } from '../../i18n'

/**
 * Asistente en modo avanzado de Enshrouded: un formulario con todo a la vista.
 *
 * Lo que añade sobre el básico: el puerto, los cuatro roles con sus permisos
 * uno a uno, las etiquetas con las que sale en la lista del juego y el chat.
 * Los ajustes finos de la partida no están aquí a propósito: son treinta y
 * siete y tienen su propia pantalla, donde caben con su explicación.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState(() => t('en.wizard.defaultName'))
  const [worldName, setWorldName] = useState('')
  const [port, setPort] = useState(DEFAULT_QUERY_PORT)
  const [players, setPlayers] = useState(4)
  const [preset, setPreset] = useState<EnshroudedPreset>('Default')
  const [roles, setRoles] = useState<EnshroudedRole[]>(() =>
    rolesFor(suggestPassword(), suggestPassword())
  )
  const [tags, setTags] = useState<string[]>([])
  const [textChat, setTextChat] = useState(true)
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const world = worldName.trim() || name.trim()
  const rolesProblem = roleProblems(roles)
  const canCreate = agreed && name.trim().length > 0 && world.length > 0 && rolesProblem === null

  function toggleTag(value: string, on: boolean): void {
    setTags((prev) => (on ? [...prev, value] : prev.filter((tag) => tag !== value)))
  }

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'enshrouded',
        name,
        port,
        expectedPlayers: players,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: { worldName: world, preset, roles, tags, enableTextChat: textChat }
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
            <p className="hint">{t('en.create.preparingHint')}</p>
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

      <div className="alert warn">
        <strong>{t('en.create.publicTitle')}</strong>
        <p>{t('en.create.publicText')}</p>
      </div>

      <div className="card">
        <h3>{t('en.create.server')}</h3>

        <div className="field">
          <label>{t('wizard.summary.name')}</label>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <div className="help">{t('en.create.nameHelp')}</div>
        </div>

        <div className="field">
          <label>{t('vh.summary.world')}</label>
          <input
            value={worldName}
            maxLength={40}
            placeholder={name}
            onChange={(e) => setWorldName(e.target.value)}
          />
          <div className="help">{t('en.create.worldHelp')}</div>
        </div>

        <div className="field">
          <label>{t('en.summary.slots')}</label>
          <input
            type="number"
            min={1}
            max={MAX_PLAYERS}
            value={players}
            onChange={(e) => setPlayers(Number(e.target.value))}
          />
          <div className="help">{t('en.create.slotsHelp', { max: MAX_PLAYERS })}</div>
        </div>

        <div className="field">
          <label>{t('help.router.port')}</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">{t('en.create.portHelp')}</div>
        </div>

        <div className="field">
          <label>{t('mc.wizard.summary.difficulty')}</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as EnshroudedPreset)}>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="help">{PRESETS.find((p) => p.value === preset)?.help}</div>
        </div>
      </div>

      <div className="card">
        <h3>{t('en.create.roles')}</h3>
        <p className="hint">{t('en.wizard.passwords.help')}</p>
        <RolesEditor roles={roles} onChange={setRoles} />
        {rolesProblem && (
          <div className="alert error">
            <strong>{t('en.create.wontStart')}</strong>
            <p>{rolesProblem}</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>{t('en.create.list')}</h3>
        <p className="hint">{t('en.create.tagsHint')}</p>
        <div className="field">
          {TAGS.slice(0, 5).map((tag) => (
            <CheckRow
              key={tag.value}
              label={tag.label}
              checked={tags.includes(tag.value)}
              onChange={(on) => toggleTag(tag.value, on)}
            />
          ))}
        </div>

        <CheckRow
          label={t('en.create.textChat')}
          help={t('en.create.textChatHelp')}
          checked={textChat}
          onChange={setTextChat}
        />
      </div>

      <div className="card">
        <h3>{t('en.create.howConnect')}</h3>
        <div className="field">
          <label>{t('en.create.fromWhere')}</label>
          <select
            value={connection}
            onChange={(e) => setConnection(e.target.value as ExposureMode)}
          >
            <option value="local">{t('wizard.short.local')}</option>
            <option value="router">{t('fa.create.routerOption')}</option>
            <option value="tunnel">{t('vh.create.tunnelOption')}</option>
          </select>
          <div className="help">
            {t('en.create.changeLater', {
              path: `${t('panel.configuration')} → ${t('panel.tab.connection')}`
            })}
          </div>
        </div>
      </div>

      <SteamAgreement agreed={agreed} onChange={setAgreed} />

      <div className="row between">
        <button onClick={onCancel}>{t('common.cancel')}</button>
        <button className="primary" disabled={!canCreate} onClick={() => void create()}>
          {t('wizard.create')} (
          {defaultPortFor('enshrouded') === port
            ? t('en.create.defaultPort')
            : t('en.create.port', { port })}
          )
        </button>
      </div>
    </div>
  )
}
