import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import type { WorldInfo } from '@shared/games/minecraft/types'
import { LEVEL_TYPES } from '@shared/games/minecraft/types'
import { formatBytes, formatDate as formatDateTime, quote, t } from '../../i18n'

/**
 * Gestión de mundos (§8).
 *
 * Un servidor solo puede tener un mundo activo a la vez: el que indica
 * `level-name`. Aquí se ven todos los que hay en la carpeta, se cambia de uno a
 * otro y se crean o borran. Todo exige el servidor parado, porque lo reescribe
 * al cerrarse.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onChanged: () => void
}

export function WorldsPanel({ state, mode, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status !== 'stopped' && status !== 'crashed'
  const basic = mode === 'basic'

  const [worlds, setWorlds] = useState<WorldInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [seed, setSeed] = useState('')
  const [levelType, setLevelType] = useState(LEVEL_TYPES[0]!.value)

  const refresh = useCallback(async () => {
    try {
      setWorlds(await window.qubiq.minecraft.worlds.list(manifest.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void refresh()
  }, [refresh, status])

  async function run(action: () => Promise<WorldInfo[]>, message: string): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setWorlds(await action())
      setNotice(message)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function create(): Promise<void> {
    await run(
      () =>
        window.qubiq.minecraft.worlds.create(manifest.id, {
          name: name.trim(),
          seed: seed.trim() || undefined,
          levelType
        }),
      t('mc.worlds.created', { name: quote(name.trim()) })
    )
    setName('')
    setSeed('')
    setCreating(false)
  }

  async function activate(world: WorldInfo): Promise<void> {
    await run(
      () => window.qubiq.minecraft.worlds.activate(manifest.id, world.name),
      t('mc.worlds.activated', { name: quote(world.name) })
    )
  }

  async function remove(world: WorldInfo): Promise<void> {
    const ok = window.confirm(
      t('mc.worlds.confirmDelete', { name: quote(world.name), size: formatSize(world.sizeBytes) })
    )
    if (!ok) return

    await run(
      () => window.qubiq.minecraft.worlds.remove(manifest.id, world.name),
      t('mc.worlds.deleted', { name: quote(world.name) })
    )
  }

  return (
    <div className="panel">
      {running && (
        <div className="alert info">
          <strong>{t('mc.worlds.stopFirst')}</strong>
          <p>{t('mc.worlds.stopFirstText')}</p>
        </div>
      )}

      {error && (
        <div className="alert error">
          <strong>{t('backup.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      {notice && !error && (
        <div className="alert info">
          <strong>{t('backup.done')}</strong>
          <p>{notice}</p>
        </div>
      )}

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{t('mc.worlds.title')}</h3>
          {!creating && (
            <button
              className="primary"
              disabled={running || busy}
              style={{ flexShrink: 0 }}
              onClick={() => setCreating(true)}
            >
              + {t('mc.worlds.create')}
            </button>
          )}
        </div>
        <p className="hint">{t('mc.worlds.hint')}</p>

        <div className="player-list">
          {worlds.map((world) => (
            <div className="player" key={world.name}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {world.name}
                  {world.active && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: 'var(--ok)',
                        fontWeight: 400
                      }}
                    >
                      ● {t('mc.worlds.inUse')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {world.generated ? (
                    <>
                      {formatSize(world.sizeBytes)}
                      {world.lastPlayed &&
                        ` · ${t('mc.worlds.lastPlayed', { date: formatDate(world.lastPlayed) })}`}
                      {world.legacyFolders.length > 0 && ` · ${t('mc.worlds.legacy')}`}
                    </>
                  ) : (
                    t('mc.worlds.notGenerated')
                  )}
                </div>
              </div>

              {!world.active && world.generated && (
                <button disabled={running || busy} onClick={() => void activate(world)}>
                  {t('mc.worlds.playThis')}
                </button>
              )}
              {!world.active && (
                <button
                  className="danger"
                  disabled={running || busy}
                  onClick={() => void remove(world)}
                >
                  {t('backup.delete')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {creating && (
        <div className="card">
          <h3>{t('mc.worlds.newTitle')}</h3>
          <p className="hint">{t('mc.worlds.newHint')}</p>

          <div className="field">
            <label>{t('wizard.summary.name')}</label>
            <input
              value={name}
              maxLength={40}
              placeholder={t('mc.worlds.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="help">{t('mc.worlds.nameHelp')}</div>
          </div>

          <div className="field">
            <label>{t('mc.prop.level-type.label')}</label>
            <select value={levelType} onChange={(e) => setLevelType(e.target.value)}>
              {LEVEL_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <div className="help">
              {LEVEL_TYPES.find((type) => type.value === levelType)?.help}
            </div>
          </div>

          {/* La semilla es un concepto de nicho: fuera del modo básico. */}
          {!basic && (
          <div className="field">
            <label>{t('mc.worlds.seed')}</label>
            <input
              value={seed}
              placeholder={t('mc.worlds.seedPlaceholder')}
              onChange={(e) => setSeed(e.target.value)}
            />
            <div className="help">{t('mc.worlds.seedHelp')}</div>
          </div>
          )}

          <div className="row between">
            <button
              onClick={() => {
                setCreating(false)
                setName('')
                setSeed('')
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              className="primary"
              disabled={running || busy || name.trim().length === 0}
              onClick={() => void create()}
            >
              {t('mc.worlds.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return t('mc.worlds.empty')
  return formatBytes(bytes)
}

function formatDate(iso: string): string {
  return formatDateTime(iso, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
