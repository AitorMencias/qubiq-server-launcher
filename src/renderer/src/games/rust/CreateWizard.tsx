import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { defaultPortFor } from '@shared/games'
import {
  DEFAULT_GAME_PORT,
  DEFAULT_WORLD_SIZE,
  MAX_PLAYERS,
  MAX_SEED,
  MAX_WORLD_SIZE,
  MIN_WORLD_SIZE,
  WORLD_SIZES,
  queryPortFor,
  randomSeed,
  rconPortFor,
  rustPlusPortFor,
  worldSizeInfo
} from '@shared/games/rust/types'
import { D20Loader } from '../../D20Loader'
import { CheckRow } from '../../CheckRow'
import { MemoryNotice } from './MemoryNotice'
import { SteamAgreement } from '../../WizardParts'
import { formatNumber, t } from '../../i18n'

/**
 * Asistente en modo avanzado de Rust: un formulario con todo a la vista.
 *
 * Lo que añade sobre el básico: la semilla, un tamaño de mapa cualquiera, el
 * puerto (con los otros dos que usa, que siempre van detrás), la descripción,
 * Rust+ y el plan de borrado entero. Los ajustes de la partida tienen su propia
 * pantalla, donde caben con su explicación.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState(() => t('rust.wizard.defaultName'))
  const [description, setDescription] = useState('')
  const [port, setPort] = useState(DEFAULT_GAME_PORT)
  const [players, setPlayers] = useState(8)
  const [worldSize, setWorldSize] = useState(DEFAULT_WORLD_SIZE)
  const [seed, setSeed] = useState(() => randomSeed())
  const [pve, setPve] = useState(false)
  const [rustPlus, setRustPlus] = useState(false)
  const [autoWipe, setAutoWipe] = useState(false)
  const [newSeed, setNewSeed] = useState(true)
  const [blueprints, setBlueprints] = useState(false)
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sizeOk = worldSize >= MIN_WORLD_SIZE && worldSize <= MAX_WORLD_SIZE
  const seedOk = Number.isInteger(seed) && seed >= 1 && seed <= MAX_SEED
  const canCreate = agreed && name.trim().length > 0 && sizeOk && seedOk
  const medido = worldSizeInfo(worldSize)

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'rust',
        name,
        port,
        expectedPlayers: players,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          description,
          worldSize,
          seed,
          maxPlayers: players,
          rustPlus,
          settings: pve ? { 'server.pve': true } : {},
          wipe: { auto: autoWipe, newSeed, blueprints }
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
            <p className="hint">{t('rust.create.preparingHint')}</p>
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
        <strong>{t('rust.create.publicTitle')}</strong>
        <p>{t('rust.create.publicText')}</p>
      </div>

      <div className="card">
        <h3>{t('en.create.server')}</h3>

        <div className="field">
          <label>{t('wizard.summary.name')}</label>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <div className="help">{t('en.create.nameHelp')}</div>
        </div>

        <div className="field">
          <label>{t('fa.create.description')}</label>
          <input
            value={description}
            maxLength={200}
            placeholder={t('rust.create.descriptionPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
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
          <div className="help">{t('rust.create.slotsHelp', { max: MAX_PLAYERS })}</div>
        </div>

        <div className="field">
          <label>{t('help.router.port')}</label>
          <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
          <div className="help">
            {t('rust.create.portHelp', { rcon: rconPortFor(port), query: queryPortFor(port) })}
          </div>
        </div>

        <CheckRow
          label={t('rust.create.pve')}
          help={t('rust.create.pveHelp')}
          checked={pve}
          onChange={setPve}
        />
        <CheckRow
          label={t('rust.create.rustPlus')}
          help={t('rust.create.rustPlusHelp', { port: rustPlusPortFor(port) })}
          checked={rustPlus}
          onChange={setRustPlus}
        />
      </div>

      <div className="card">
        <h3>{t('rust.create.map')}</h3>

        <div className="field">
          <label>{t('rust.create.size')}</label>
          <div className="row" style={{ gap: 10 }}>
            <select
              value={WORLD_SIZES.some((w) => w.size === worldSize) ? String(worldSize) : 'otro'}
              onChange={(e) => {
                if (e.target.value !== 'otro') setWorldSize(Number(e.target.value))
              }}
              style={{ flex: 1 }}
            >
              {WORLD_SIZES.map((w) => (
                <option key={w.size} value={w.size}>
                  {w.label} ({w.size} m)
                </option>
              ))}
              <option value="otro">{t('rust.create.other')}</option>
            </select>
            <input
              type="number"
              min={MIN_WORLD_SIZE}
              max={MAX_WORLD_SIZE}
              step={250}
              value={worldSize}
              onChange={(e) => setWorldSize(Number(e.target.value))}
              style={{ width: 120, flex: 'none' }}
            />
          </div>
          <div className="help">
            {!sizeOk
              ? t('rust.create.sizeRange', { min: MIN_WORLD_SIZE, max: MAX_WORLD_SIZE })
              : medido
                ? t('rust.create.measured', {
                    players: medido.players.charAt(0).toUpperCase() + medido.players.slice(1),
                    gb: formatNumber(medido.memoryGb),
                    first: medido.firstStart
                  })
                : t('rust.create.sizeHelp')}
          </div>
        </div>
        <MemoryNotice worldSize={sizeOk ? worldSize : DEFAULT_WORLD_SIZE} />

        <div className="field">
          <label>{t('fa.create.seed')}</label>
          <div className="row" style={{ gap: 10 }}>
            <input
              type="number"
              min={1}
              max={MAX_SEED}
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <button style={{ flex: 'none' }} onClick={() => setSeed(randomSeed())}>
              {t('rust.create.otherSeed')}
            </button>
          </div>
          <div className="help">
            {seedOk ? t('rust.create.seedHelp') : t('rust.create.seedRange', { max: MAX_SEED })}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>{t('rust.create.wipeTitle')}</h3>
        <p className="hint">{t('rust.create.wipeHint')}</p>
        <CheckRow
          label={t('rust.wipe.auto')}
          help={t('rust.wipe.autoHelp')}
          checked={autoWipe}
          onChange={setAutoWipe}
        />
        <CheckRow
          label={t('rust.wipe.newSeed')}
          help={t('rust.wipe.newSeedHelp')}
          checked={newSeed}
          onChange={setNewSeed}
        />
        <CheckRow
          label={t('rust.wipe.blueprints')}
          help={t('rust.wipe.blueprintsHelp')}
          checked={blueprints}
          onChange={setBlueprints}
        />
      </div>

      <div className="card">
        <h3>{t('en.create.howConnect')}</h3>
        <div className="field">
          <label>{t('en.create.fromWhere')}</label>
          <select value={connection} onChange={(e) => setConnection(e.target.value as ExposureMode)}>
            <option value="local">{t('wizard.short.local')}</option>
            <option value="router">{t('vh.create.routerOption')}</option>
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
          {defaultPortFor('rust') === port ? t('en.create.defaultPort') : t('en.create.port', { port })})
        </button>
      </div>
    </div>
  )
}
