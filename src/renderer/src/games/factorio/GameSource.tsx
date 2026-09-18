import { useEffect, useState } from 'react'

/**
 * De dónde sale el Factorio de este servidor.
 *
 * Es la pregunta que no tiene ningún otro juego: Factorio no publica servidor
 * dedicado para Windows, así que el servidor **es** el juego y hay que tenerlo.
 * Hay dos caminos y los dos piden algo:
 *
 * - Copiarlo de una instalación que ya esté en el equipo. No pide nada y no
 *   descarga nada; se copia y la copia se adelgaza (unos 250 MB).
 * - Descargarlo de Steam con la cuenta del usuario. La contraseña se usa una
 *   vez y **no se guarda**: Steam deja sus credenciales en caché y a partir de
 *   ahí basta el nombre de usuario.
 */

export interface LocalFactorio {
  path: string
  version: string | null
  spaceAge: boolean
  source: 'steam'
}

export interface GameSourceChoice {
  source: 'local' | 'steamcmd'
  sourcePath?: string
  steamUser?: string
  /** Si se sabe que habrá Space Age. De lo descargado no se sabe hasta bajarlo. */
  spaceAge: boolean | null
}

interface Props {
  value: GameSourceChoice | null
  onChange: (choice: GameSourceChoice | null) => void
}

export function GameSource({ value, onChange }: Props): React.JSX.Element {
  const [locals, setLocals] = useState<LocalFactorio[] | null>(null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [guardCode, setGuardCode] = useState('')
  const [needsGuard, setNeedsGuard] = useState(false)
  const [checking, setChecking] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  /** Ha pulsado «Descargarlo de Steam», aunque aún no haya comprobado la cuenta. */
  const [wantsDownload, setWantsDownload] = useState(value?.source === 'steamcmd')

  useEffect(() => {
    let alive = true
    void window.qubiq.factorio.steam
      .findLocal()
      .then((found) => {
        if (!alive) return
        setLocals(found)
        // Si hay una instalación, se propone: es lo que no descarga 5 GB.
        if (found.length > 0 && !value) {
          onChange({
            source: 'local',
            sourcePath: found[0]!.path,
            spaceAge: found[0]!.spaceAge
          })
        }
      })
      .catch(() => alive && setLocals([]))
    return () => {
      alive = false
    }
    // Solo al montar: después manda lo que elija el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function checkAccount(): Promise<void> {
    setChecking(true)
    setLoginError(null)
    try {
      await window.qubiq.factorio.steam.login({
        user: user.trim(),
        ...(password.length > 0 ? { password } : {}),
        ...(guardCode.trim().length > 0 ? { guardCode: guardCode.trim() } : {})
      })
      setLoggedIn(true)
      // La contraseña no se queda ni en memoria más de lo necesario.
      setPassword('')
      setGuardCode('')
      onChange({ source: 'steamcmd', steamUser: user.trim(), spaceAge: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setNeedsGuard(/Steam Guard/i.test(message))
      setLoginError(message)
      setLoggedIn(false)
      onChange(null)
    } finally {
      setChecking(false)
    }
  }

  if (locals === null) {
    return <p className="hint">Mirando si ya tienes Factorio en el equipo…</p>
  }

  // Sin instalaciones en el equipo, descargar es el único camino.
  const usingLocal = !wantsDownload && value?.source === 'local'
  const downloading = wantsDownload || locals.length === 0

  return (
    <div>
      <div
        className="choice-grid"
        style={{ gridTemplateColumns: '1fr', marginBottom: downloading ? 16 : 0 }}
      >
        {locals.map((local) => (
          <button
            key={local.path}
            className={`choice ${usingLocal && value?.sourcePath === local.path ? 'selected' : ''}`}
            onClick={() => {
              setWantsDownload(false)
              onChange({
                source: 'local',
                sourcePath: local.path,
                spaceAge: local.spaceAge
              })
            }}
          >
            <div className="title">Usar el Factorio que ya tienes</div>
            <div className="sub">
              {local.version ? `Versión ${local.version}` : 'Versión desconocida'}
              {local.spaceAge ? ' · con Space Age' : ' · sin Space Age'} · no descarga nada
              <br />
              {local.path}
            </div>
          </button>
        ))}

        <button
          className={`choice ${downloading ? 'selected' : ''}`}
          onClick={() => {
            setWantsDownload(true)
            setLoggedIn(false)
            onChange(null)
          }}
        >
          <div className="title">Descargarlo de Steam con mi cuenta</div>
          <div className="sub">
            {locals.length > 0
              ? 'Para tener una versión distinta de la que juegas, sin tocar tu instalación.'
              : 'Hacen falta unos 5 GB de descarga. El servidor se queda luego en unos 250 MB.'}
          </div>
        </button>
      </div>

      {downloading && (
        // El paso del asistente centra el texto; los formularios van alineados a
        // la izquierda, igual que el recuadro de condiciones de los demás juegos.
        <div className="card" style={{ textAlign: 'left', marginBottom: 0 }}>
          <h3>Tu cuenta de Steam</h3>
          <p className="hint">
            Tiene que ser la que tiene Factorio comprado. La contraseña se usa una vez para que
            Steam te reconozca y <strong>no se guarda</strong>: ni en la app, ni en el servidor, ni
            en ningún fichero.
          </p>

          <div className="field">
            <label>Usuario</label>
            <input
              type="text"
              value={user}
              placeholder="El nombre con el que entras en Steam"
              onChange={(e) => {
                setUser(e.target.value)
                setLoggedIn(false)
              }}
            />
          </div>

          <div className="field">
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="help">
              Solo la primera vez en este equipo. Después Steam ya te recuerda y basta el usuario.
            </div>
          </div>

          {needsGuard && (
            <div className="field">
              <label>Código de Steam Guard</label>
              <input
                type="text"
                value={guardCode}
                placeholder="El de la aplicación de Steam o el del correo"
                onChange={(e) => setGuardCode(e.target.value)}
              />
            </div>
          )}

          {loggedIn && (
            <div className="alert info">
              <strong>Cuenta comprobada</strong>
              <p>Steam te ha reconocido. La descarga irá con esta cuenta.</p>
            </div>
          )}
          {loginError && (
            <div className="alert error">
              <strong>No se ha podido entrar</strong>
              <p>{loginError}</p>
            </div>
          )}

          <button
            className="primary"
            disabled={checking || user.trim().length === 0}
            onClick={() => void checkAccount()}
          >
            {checking ? 'Comprobando…' : 'Comprobar la cuenta'}
          </button>
        </div>
      )}
    </div>
  )
}
