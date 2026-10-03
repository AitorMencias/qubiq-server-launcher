import { useEffect, useState } from 'react'
import { Rich, t } from '../../i18n'

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
    return <p className="hint">{t('fa.source.looking')}</p>
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
            <div className="title">{t('fa.source.useLocal')}</div>
            <div className="sub">
              {local.version
                ? t('catalog.version', { version: local.version })
                : t('fa.source.unknownVersion')}
              {' · '}
              {local.spaceAge ? t('fa.source.withSpaceAge') : t('fa.source.withoutSpaceAge')} ·{' '}
              {t('fa.source.noDownload')}
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
          <div className="title">{t('fa.source.download')}</div>
          <div className="sub">
            {locals.length > 0 ? t('fa.source.downloadOther') : t('fa.source.downloadSize')}
          </div>
        </button>
      </div>

      {downloading && (
        // El paso del asistente centra el texto; los formularios van alineados a
        // la izquierda, igual que el recuadro de condiciones de los demás juegos.
        <div className="card" style={{ textAlign: 'left', marginBottom: 0 }}>
          <h3>{t('fa.source.account')}</h3>
          <p className="hint">
            <Rich k="fa.source.accountHint" values={{ notSaved: <strong>{t('fa.source.notSaved')}</strong> }} />
          </p>

          <div className="field">
            <label>{t('fa.source.user')}</label>
            <input
              type="text"
              value={user}
              placeholder={t('fa.source.userPlaceholder')}
              onChange={(e) => {
                setUser(e.target.value)
                setLoggedIn(false)
              }}
            />
          </div>

          <div className="field">
            <label>{t('vh.summary.password')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="help">{t('fa.source.passwordHelp')}</div>
          </div>

          {needsGuard && (
            <div className="field">
              <label>{t('fa.source.guard')}</label>
              <input
                type="text"
                value={guardCode}
                placeholder={t('fa.source.guardPlaceholder')}
                onChange={(e) => setGuardCode(e.target.value)}
              />
            </div>
          )}

          {loggedIn && (
            <div className="alert info">
              <strong>{t('fa.source.checked')}</strong>
              <p>{t('fa.source.checkedText')}</p>
            </div>
          )}
          {loginError && (
            <div className="alert error">
              <strong>{t('fa.source.loginFailed')}</strong>
              <p>{loginError}</p>
            </div>
          )}

          <button
            className="primary"
            disabled={checking || user.trim().length === 0}
            onClick={() => void checkAccount()}
          >
            {checking ? t('connection.checking') : t('fa.source.check')}
          </button>
        </div>
      )}
    </div>
  )
}
