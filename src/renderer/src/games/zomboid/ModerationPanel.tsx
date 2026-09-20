import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import {
  ROLES,
  roleInfo,
  type ZomboidAccount,
  type ZomboidBannedIp,
  type ZomboidRole
} from '@shared/games/zomboid/types'

/**
 * Las cuentas del servidor de Zomboid.
 *
 * Aquí no hay listas de texto (Valheim) ni ficheros JSON (Factorio): cada
 * jugador tiene una **cuenta de este servidor**, con su contraseña, y un nivel
 * de acceso. Todo eso vive en la base de datos que el servidor tiene abierta.
 *
 * De ahí salen las dos reglas de esta pantalla, y las dos se dicen en vez de
 * esconderlas: **ver** quién es quién se puede siempre, y **cambiar** algo
 * exige el servidor arrancado, porque la base de datos es suya.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function ModerationPanel({ state, onChanged }: Props): React.JSX.Element {
  const id = state.manifest.id
  const running = state.status === 'running'

  const [accounts, setAccounts] = useState<ZomboidAccount[]>([])
  const [bannedIps, setBannedIps] = useState<ZomboidBannedIp[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newUser, setNewUser] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [cuentas, ips] = await Promise.all([
        window.qubiq.zomboid.accounts.list(id),
        window.qubiq.zomboid.accounts.bannedIps(id)
      ])
      setAccounts(cuentas)
      setBannedIps(ips)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload, state.status])

  async function run(action: () => Promise<unknown>, done: string): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(done)
      await reload()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const asignables = ROLES.filter((r) => r.assignable)

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {!running && (
        <div className="alert info">
          <strong>Con el servidor parado solo se puede mirar</strong>
          <p>
            En Zomboid las cuentas viven dentro de la base de datos del propio servidor, y la única
            forma honesta de tocarla es pedírselo a él. Arráncalo para poder nombrar
            administradores, vetar o expulsar.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Cuentas</h3>
        <p className="hint">
          Cada jugador se crea la suya la primera vez que entra, con el usuario y la contraseña que
          escriba. No tienen nada que ver con Steam.
        </p>

        {loading ? (
          <p className="hint">Cargando…</p>
        ) : accounts.length === 0 ? (
          <p className="hint">
            Todavía no ha entrado nadie. En cuanto alguien entre, su cuenta aparecerá aquí.
          </p>
        ) : (
          <div>
            {accounts.map((account) => (
              <div
                className="row between"
                key={account.username}
                style={{ marginBottom: 10, gap: 10 }}
              >
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <strong>{account.username}</strong>
                    {account.online && <span className="badge">dentro ahora</span>}
                  </div>
                  <div className="help" style={{ margin: 0 }}>
                    {roleInfo(account.role).label} · {roleInfo(account.role).help}
                    {account.lastConnection ? ` · última vez: ${account.lastConnection}` : ''}
                  </div>
                </div>

                {/* Los campos de la app ocupan todo el ancho por defecto: aquí
                    hay que frenarlo, o el desplegable se come el nombre. */}
                <select
                  style={{ flex: 'none', width: 190 }}
                  value={account.role}
                  disabled={!running || busy}
                  onChange={(e) =>
                    void run(
                      () =>
                        window.qubiq.zomboid.accounts.setRole(
                          id,
                          account.username,
                          e.target.value as ZomboidRole
                        ),
                      `${account.username} ahora es ${roleInfo(e.target.value as ZomboidRole).label.toLowerCase()}.`
                    )
                  }
                >
                  {/* El nivel que tenga sale aunque no sea de los que ofrece la
                      app: esconderlo haría creer que es otra cosa. */}
                  {!asignables.some((r) => r.id === account.role) && (
                    <option value={account.role}>{roleInfo(account.role).label}</option>
                  )}
                  {asignables.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>

                <button
                  style={{ flex: 'none' }}
                  disabled={!running || busy || !account.online}
                  onClick={() =>
                    void run(
                      () => window.qubiq.zomboid.accounts.kick(id, account.username),
                      `${account.username} ha sido expulsado.`
                    )
                  }
                >
                  Echar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Dar de alta a alguien</h3>
        <p className="hint">
          Hace falta cuando el servidor está cerrado a jugadores nuevos: entonces solo entra quien
          tenga una cuenta creada por ti. Dale su usuario y su contraseña.
        </p>
        <div className="row">
          <input
            className="grow"
            placeholder="Usuario"
            value={newUser}
            disabled={!running || busy}
            onChange={(e) => setNewUser(e.target.value)}
          />
          <input
            className="grow"
            placeholder="Contraseña"
            value={newPassword}
            disabled={!running || busy}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button
            style={{ flex: 'none' }}
            disabled={!running || busy || newUser.trim() === '' || newPassword.trim() === ''}
            onClick={() =>
              void run(async () => {
                await window.qubiq.zomboid.accounts.add(id, newUser, newPassword)
                setNewUser('')
                setNewPassword('')
              }, 'Cuenta creada.')
            }
          >
            Crear cuenta
          </button>
        </div>
      </div>

      {bannedIps.length > 0 && (
        <div className="card">
          <h3>Direcciones vetadas</h3>
          <p className="hint">
            Vetar una dirección corta a quien esté detrás de ella, se llame como se llame. Si es una
            dirección compartida, puede llevarse por delante a más gente.
          </p>
          <div>
            {bannedIps.map((banned) => (
              <div className="row between" key={banned.ip} style={{ marginBottom: 8, gap: 10 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong>{banned.ip}</strong>
                  <div className="help" style={{ margin: 0 }}>
                    {banned.username ? `de ${banned.username}` : 'sin nombre'}
                    {banned.reason ? ` · ${banned.reason}` : ''}
                  </div>
                </div>
                <button
                  style={{ flex: 'none' }}
                  disabled={!running || busy}
                  onClick={() =>
                    void run(
                      () => window.qubiq.zomboid.accounts.unbanIp(id, banned.ip),
                      'Veto levantado.'
                    )
                  }
                >
                  Levantar el veto
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
