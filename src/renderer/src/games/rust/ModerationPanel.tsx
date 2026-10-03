import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { validSteamId, type RustAdmin, type RustBan } from '@shared/games/rust/types'
import { t } from '../../i18n'

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
          <strong>{t('rust.mod.failed')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      <div className="alert info">
        <strong>{t('rust.mod.steamIdTitle')}</strong>
        <p>
          {t('rust.mod.steamIdText')}{' '}
          {running ? t('rust.mod.whenRunning') : t('rust.mod.whenStopped')}
        </p>
      </div>

      <div className="card">
        <h3>{t('rust.mod.admins')}</h3>
        <p className="hint">{t('rust.mod.adminsHint')}</p>
        {loading ? (
          <p className="hint">{t('rust.mod.loading')}</p>
        ) : admins.length === 0 ? (
          <p className="hint">{t('rust.mod.noAdmins')}</p>
        ) : (
          admins.map((admin) => (
            <div className="row between" key={admin.steamId} style={{ marginBottom: 8, gap: 10 }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <strong>{admin.name || admin.steamId}</strong>
                <div className="help" style={{ margin: 0 }}>
                  {admin.level === 'owner' ? t('rust.mod.owner') : t('rust.mod.moderator')} · {admin.steamId}
                </div>
              </div>
              <button
                style={{ flex: 'none' }}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => window.qubiq.rust.moderation.removeAdmin(id, admin.steamId),
                    admin.level === 'owner'
                      ? t('rust.mod.removedOwner', { name: admin.name || admin.steamId })
                      : t('rust.mod.removedModerator', { name: admin.name || admin.steamId })
                  )
                }
              >
                {t('rust.mod.remove')}
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
            placeholder={t('rust.mod.namePlaceholder')}
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
            <option value="owner">{t('rust.mod.owner')}</option>
            <option value="moderator">{t('rust.mod.moderator')}</option>
          </select>
          <button
            style={{ flex: 'none' }}
            disabled={busy || !adminIdOk}
            onClick={() =>
              void run(async () => {
                await window.qubiq.rust.moderation.setAdmin(id, adminId, adminName.trim(), adminLevel)
                setAdminId('')
                setAdminName('')
              }, running ? t('rust.mod.addedRunning') : t('rust.mod.addedStopped'))
            }
          >
            {t('rust.mod.add')}
          </button>
        </div>
        {adminId.length > 0 && !adminIdOk && (
          <div className="help">{t('rust.mod.badSteamId')}</div>
        )}
      </div>

      <div className="card">
        <h3>{t('rust.mod.bans')}</h3>
        {loading ? (
          <p className="hint">{t('rust.mod.loading')}</p>
        ) : bans.length === 0 ? (
          <p className="hint">{t('rust.mod.noBans')}</p>
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
                    t('rust.mod.unbanned')
                  )
                }
              >
                {t('rust.mod.unban')}
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
            placeholder={t('rust.mod.reasonPlaceholder')}
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
              }, t('rust.mod.banned'))
            }
          >
            {t('rust.mod.ban')}
          </button>
        </div>
      </div>
    </div>
  )
}
