import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'

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
  return bytes > 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
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
        `No se ha podido consultar el portal de mods: ${err instanceof Error ? err.message : String(err)}`
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
        setError(
          'No se ha encontrado una sesión de Factorio en este equipo. Entra con tu usuario y contraseña de factorio.com.'
        )
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
          <strong>No se pudo completar la acción</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      <div className="alert info">
        <strong>Todos los que entren necesitan los mismos mods</strong>
        <p>
          Si no coinciden con los del servidor, Factorio no les deja pasar. Los cambios se aplican
          {running ? ' cuando reinicies el servidor.' : ' al arrancar el servidor.'}
        </p>
      </div>

      <div className="card">
        <h3>Instalados</h3>
        {installed.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Ninguno. El servidor va con el juego tal cual.
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
                    {mod.version ? `Versión ${mod.version} · ` : ''}
                    {formatSize(mod.sizeBytes)}
                    {mod.enabled ? '' : ' · desactivado'}
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
                    `«${mod.name}» quitado.`
                  )
                }
              >
                Quitar
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3>Añadir del portal oficial</h3>
        <p className="hint">
          Busca por nombre o por lo que hace. Salen primero los más descargados.
        </p>

        <div className="row" style={{ marginBottom: 14 }}>
          <input
            className="grow"
            value={query}
            placeholder="Por ejemplo: Factory Planner, Even Distribution…"
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
            {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        {results?.length === 0 && (
          <p className="hint">No hay ningún mod que se llame así ni que hable de eso.</p>
        )}
        {results?.map((mod) => (
          <div className="row between" key={mod.name} style={{ marginBottom: 12 }}>
            <div>
              <strong>{mod.title}</strong>
              <p className="hint" style={{ margin: 0 }}>
                {mod.summary}
                <br />
                {mod.name} · de {mod.owner} · {mod.downloadsCount.toLocaleString('es-ES')} descargas
                {mod.factorioVersion && ` · para Factorio ${mod.factorioVersion}`}
              </p>
            </div>
            <button
              style={{ flexShrink: 0 }}
              disabled={busy || !credentials || installedNames.has(mod.name)}
              title={credentials ? undefined : 'Identifícate abajo para poder descargar'}
              onClick={() =>
                void act(async () => {
                  if (!credentials) return
                  await window.qubiq.factorio.mods.install(
                    manifest.id,
                    mod.name,
                    credentials,
                    gameVersion
                  )
                }, `«${mod.title}» instalado.`)
              }
            >
              {installedNames.has(mod.name) ? 'Instalado' : 'Instalar'}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Cuenta de factorio.com</h3>
        {credentials ? (
          <div className="row between">
            <span>
              Descargando como <strong>{credentials.username}</strong>.
            </span>
            <button style={{ flexShrink: 0 }} onClick={() => setCredentials(null)}>
              Olvidar
            </button>
          </div>
        ) : (
          <>
            <p className="hint">
              El portal no deja descargar sin cuenta. Si tienes Factorio en este equipo, la app
              puede usar la sesión que ya tiene el juego, sin pedirte la contraseña.
            </p>
            <div className="row" style={{ marginBottom: 16 }}>
              <button className="primary" onClick={() => void useGameSession()}>
                Usar la sesión del juego
              </button>
            </div>

            <div className="field">
              <label>O entra con tu usuario de factorio.com</label>
              <input
                type="text"
                value={user}
                placeholder="Usuario"
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="help">
                Se usa una vez para pedir un permiso de descarga y <strong>no se guarda</strong>.
                Ese permiso tampoco se escribe en disco: vale mientras la app esté abierta.
              </div>
            </div>
            <button
              disabled={busy || user.trim().length === 0 || password.length === 0}
              onClick={() => void login()}
            >
              Entrar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
