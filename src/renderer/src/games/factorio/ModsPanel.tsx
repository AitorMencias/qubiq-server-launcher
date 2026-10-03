import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { modSizeLabel } from '@shared/games/mods'
import { Rich, quote, t } from '../../i18n'

/**
 * Mods de un servidor de Factorio, del portal oficial.
 *
 * Tres cosas que esta pantalla tiene que dejar claras, porque son las que
 * estropean una partida:
 *
 * 1. **Todos los que entren necesitan los mismos mods.** El servidor comprueba
 *    que coincidan y, si no, no deja entrar.
 * 2. Los cambios llegan al reiniciar el servidor.
 * 3. Descargar del portal exige identificarse en factorio.com. La app usa la
 *    sesión del propio juego si el usuario lo pide, y **no guarda el token en
 *    ningún fichero**.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

interface Credentials {
  username: string
  token: string
}

interface SearchResult {
  name: string
  title: string
  owner: string
  summary: string
  downloadsCount: number
  latestVersion: string | null
  factorioVersion: string | null
}

interface Installed {
  name: string
  version: string | null
  enabled: boolean
  sizeBytes: number
}

function formatSize(bytes: number): string {
  return modSizeLabel(bytes)
}

export function ModsPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const gameVersion = manifest.game === 'factorio' ? manifest.data.gameVersion : undefined

  const [installed, setInstalled] = useState<Installed[]>([])
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setInstalled(await window.qubiq.factorio.mods.list(manifest.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void load()
  }, [load])

  async function act(what: () => Promise<void>, message?: string): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await what()
      if (message) setNotice(message)
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function search(): Promise<void> {
    if (query.trim().length === 0) return
    setSearching(true)
    setError(null)
    try {
      setResults(await window.qubiq.factorio.mods.search(query.trim()))
    } catch (err) {
      setError(
        t('fa.mods.searchFailed', { error: err instanceof Error ? err.message : String(err) })
      )
    } finally {
      setSearching(false)
    }
  }

  async function useGameSession(): Promise<void> {
    setError(null)
    try {
      const found = await window.qubiq.factorio.portal.credentialsFromGame()
      if (!found) {
        setError(t('fa.mods.noSession'))
        return
      }
      setCredentials(found)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function login(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setCredentials(await window.qubiq.factorio.portal.login(user.trim(), password))
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const installedNames = new Set(installed.map((m) => m.name))

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>{t('panel.actionFailed')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      <div className="alert info">
        <strong>{t('fa.mods.sameTitle')}</strong>
        <p>{running ? t('fa.mods.sameTextRunning') : t('fa.mods.sameText')}</p>
      </div>

      <div className="card">
        <h3>{t('catalog.installedTitle')}</h3>
        {installed.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {t('catalog.none')}
          </p>
        ) : (
          installed.map((mod) => (
            <div className="row between" key={mod.name} style={{ marginBottom: 10 }}>
              <label className="row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={mod.enabled}
                  disabled={busy}
                  onChange={(e) =>
                    void act(() =>
                      window.qubiq.factorio.mods.setEnabled(manifest.id, mod.name, e.target.checked)
                    )
                  }
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <span>
                  <strong>{mod.name}</strong>
                  <div className="help" style={{ margin: 0 }}>
                    {mod.version ? `${t('catalog.version', { version: mod.version })} · ` : ''}
                    {formatSize(mod.sizeBytes)}
                    {mod.enabled ? '' : ` · ${t('mc.content.disabled')}`}
                  </div>
                </span>
              </label>
              <button
                className="danger"
                style={{ flexShrink: 0 }}
                disabled={busy}
                onClick={() =>
                  void act(
                    () => window.qubiq.factorio.mods.remove(manifest.id, mod.name),
                    t('catalog.modRemoved', { name: quote(mod.name) })
                  )
                }
              >
                {t('catalog.remove')}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3>{t('fa.mods.addTitle')}</h3>
        <p className="hint">{t('fa.mods.addHint')}</p>

        <div className="row" style={{ marginBottom: 14 }}>
          <input
            className="grow"
            value={query}
            placeholder={t('common.forExample', { examples: 'Factory Planner, Even Distribution…' })}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search()
            }}
          />
          <button
            style={{ flexShrink: 0 }}
            disabled={searching || query.trim().length === 0}
            onClick={() => void search()}
          >
            {searching ? t('catalog.searching') : t('catalog.search')}
          </button>
        </div>

        {results?.length === 0 && (
          <p className="hint">{t('catalog.noResults.mod')}</p>
        )}
        {results?.map((mod) => (
          <div className="row between" key={mod.name} style={{ marginBottom: 12 }}>
            <div>
              <strong>{mod.title}</strong>
              <p className="hint" style={{ margin: 0 }}>
                {mod.summary}
                <br />
                {mod.name} · {t('catalog.byAuthor', { author: mod.owner, count: mod.downloadsCount })}
                {mod.factorioVersion && ` · ${t('fa.mods.forVersion', { version: mod.factorioVersion })}`}
              </p>
            </div>
            <button
              style={{ flexShrink: 0 }}
              disabled={busy || !credentials || installedNames.has(mod.name)}
              title={credentials ? undefined : t('fa.mods.loginBelow')}
              onClick={() =>
                void act(async () => {
                  if (!credentials) return
                  await window.qubiq.factorio.mods.install(
                    manifest.id,
                    mod.name,
                    credentials,
                    gameVersion
                  )
                }, t('catalog.installedNotice', { name: quote(mod.title) }))
              }
            >
              {installedNames.has(mod.name) ? t('catalog.installed') : t('catalog.install')}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>{t('fa.mods.account')}</h3>
        {credentials ? (
          <div className="row between">
            <span>
              <Rich k="fa.mods.downloadingAs" values={{ user: <strong>{credentials.username}</strong> }} />
            </span>
            <button style={{ flexShrink: 0 }} onClick={() => setCredentials(null)}>
              {t('fa.mods.forget')}
            </button>
          </div>
        ) : (
          <>
            <p className="hint">{t('fa.mods.accountHint')}</p>
            <div className="row" style={{ marginBottom: 16 }}>
              <button className="primary" onClick={() => void useGameSession()}>
                {t('fa.mods.useSession')}
              </button>
            </div>

            <div className="field">
              <label>{t('fa.mods.orLogin')}</label>
              <input
                type="text"
                value={user}
                placeholder={t('fa.source.user')}
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t('vh.summary.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="help">
                <Rich k="fa.mods.passwordHelp" values={{ notSaved: <strong>{t('fa.source.notSaved')}</strong> }} />
              </div>
            </div>
            <button
              disabled={busy || user.trim().length === 0 || password.length === 0}
              onClick={() => void login()}
            >
              {t('fa.mods.login')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
