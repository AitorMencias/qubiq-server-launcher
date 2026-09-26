import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { validSteamId, type RustAdmin, type RustBan } from '@shared/games/rust/types'

/**
 * Administradores y vetados de un servidor de Rust.
 *
 * Todo funciona **con el servidor en marcha y parado**, que es lo que tiene de
 * bueno este juego: en marcha se le pide por su consola remota y surte efecto
 * al momento; parado se escribe en `users.cfg` y `bans.cfg`, que es lo que lee
 * al arrancar. La pantalla no cambia, solo por dónde va la orden.
 *
 * En Rust todo va por el **identificador de Steam** (SteamID64), no por el
 * nombre, que cada uno cambia cuando quiere. Desde la lista de quien está
 * dentro se hace con un botón; aquí se puede escribir a mano para quien aún no
 * ha entrado nunca.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function ModerationPanel({ state, onChanged }: Props): React.JSX.Element {
  const id = state.manifest.id
  const running = state.status === 'running'

  const [admins, setAdmins] = useState<RustAdmin[]>([])
  const [bans, setBans] = useState<RustBan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [adminId, setAdminId] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminLevel, setAdminLevel] = useState<RustAdmin['level']>('owner')
  const [banId, setBanId] = useState('')
  const [banReason, setBanReason] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [a, b] = await Promise.all([
        window.qubiq.rust.moderation.admins(id),
        window.qubiq.rust.moderation.bans(id)
      ])
      setAdmins(a)
      setBans(b)
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

  const adminIdOk = validSteamId(adminId)
  const banIdOk = validSteamId(banId)

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      <div className="alert info">
        <strong>En Rust se modera por el identificador de Steam</strong>
        <p>
          Son 17 cifras que empiezan por 7656 (el SteamID64). Con alguien dentro no hace falta
          saberlo: en la lista de jugadores está el botón. Para quien no ha entrado nunca, se busca
          su perfil de Steam en una web como steamid.io.
          {running
            ? ' Con el servidor en marcha, los cambios valen al momento.'
            : ' Con el servidor parado se guardan en sus ficheros y valen al arrancar.'}
        </p>
      </div>

      <div className="card">
        <h3>Administradores</h3>
        <p className="hint">
          Un administrador puede usar la consola del juego (F1) para lo que haga falta: echar,
          vetar, teletransportarse… El moderador puede moderar pero no tocar la configuración.
        </p>
        {loading ? (
          <p className="hint">Cargando…</p>
        ) : admins.length === 0 ? (
          <p className="hint">Todavía no hay ninguno. Hazte administrador a ti mismo para empezar.</p>
        ) : (
          admins.map((admin) => (
            <div className="row between" key={admin.steamId} style={{ marginBottom: 8, gap: 10 }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <strong>{admin.name || admin.steamId}</strong>
                <div className="help" style={{ margin: 0 }}>
                  {admin.level === 'owner' ? 'Administrador' : 'Moderador'} · {admin.steamId}
                </div>
              </div>
              <button
                style={{ flex: 'none' }}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => window.qubiq.rust.moderation.removeAdmin(id, admin.steamId),
                    `${admin.name || admin.steamId} ya no es ${admin.level === 'owner' ? 'administrador' : 'moderador'}.`
                  )
                }
              >
                Quitar
              </button>
            </div>
          ))
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <input
            className="grow"
            placeholder="SteamID64 (7656…)"
            value={adminId}
            disabled={busy}
            onChange={(e) => setAdminId(e.target.value.trim())}
          />
          <input
            className="grow"
            placeholder="Nombre, para reconocerlo"
            value={adminName}
            disabled={busy}
            onChange={(e) => setAdminName(e.target.value)}
          />
          <select
            style={{ flex: 'none', width: 150 }}
            value={adminLevel}
            disabled={busy}
            onChange={(e) => setAdminLevel(e.target.value as RustAdmin['level'])}
          >
            <option value="owner">Administrador</option>
            <option value="moderator">Moderador</option>
          </select>
          <button
            style={{ flex: 'none' }}
            disabled={busy || !adminIdOk}
            onClick={() =>
              void run(async () => {
                await window.qubiq.rust.moderation.setAdmin(id, adminId, adminName.trim(), adminLevel)
                setAdminId('')
                setAdminName('')
              }, running ? 'Añadido. Si está dentro, le vale al momento.' : 'Añadido. Le valdrá en cuanto arranques el servidor.')
            }
          >
            Añadir
          </button>
        </div>
        {adminId.length > 0 && !adminIdOk && (
          <div className="help">Eso no es un SteamID64: son 17 cifras que empiezan por 7656.</div>
        )}
      </div>

      <div className="card">
        <h3>Vetados</h3>
        {loading ? (
          <p className="hint">Cargando…</p>
        ) : bans.length === 0 ? (
          <p className="hint">Nadie. Quien se vete desde la lista de jugadores aparecerá aquí.</p>
        ) : (
          bans.map((ban) => (
            <div className="row between" key={ban.steamId} style={{ marginBottom: 8, gap: 10 }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <strong>{ban.name || ban.steamId}</strong>
                <div className="help" style={{ margin: 0 }}>
                  {ban.steamId}
                  {ban.reason ? ` · ${ban.reason}` : ''}
                </div>
              </div>
              <button
                style={{ flex: 'none' }}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => window.qubiq.rust.moderation.unban(id, ban.steamId),
                    'Veto levantado. Ya puede volver a entrar.'
                  )
                }
              >
                Levantar el veto
              </button>
            </div>
          ))
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <input
            className="grow"
            placeholder="SteamID64 (7656…)"
            value={banId}
            disabled={busy}
            onChange={(e) => setBanId(e.target.value.trim())}
          />
          <input
            className="grow"
            placeholder="Motivo (opcional)"
            value={banReason}
            disabled={busy}
            onChange={(e) => setBanReason(e.target.value)}
          />
          <button
            className="danger"
            style={{ flex: 'none' }}
            disabled={busy || !banIdOk}
            onClick={() =>
              void run(async () => {
                await window.qubiq.rust.moderation.ban(id, banId, banReason)
                setBanId('')
                setBanReason('')
              }, 'Vetado. Si estaba dentro, se le ha echado.')
            }
          >
            Vetar
          </button>
        </div>
      </div>
    </div>
  )
}
