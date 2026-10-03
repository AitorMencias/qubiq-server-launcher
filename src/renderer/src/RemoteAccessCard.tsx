import { useEffect, useState } from 'react'
import {
  formatCode,
  type ConsoleLevel,
  type RemoteActivityEntry,
  type RemoteDevice,
  type RemoteInvite,
  type RemotePermissions,
  type RemoteStatus
} from '@shared/remote'
import type { MessageKey } from '@shared/i18n'
import type { GameId } from '@shared/types'
import { gameInfo } from '@shared/games'
import { CheckRow } from './CheckRow'
import { formatDate, formatList, quote, t } from './i18n'

/**
 * Configuración → Acceso remoto (§19.31).
 *
 * Encender y apagar, el puerto, la dirección y la huella del certificado,
 * invitar dispositivos con sus permisos, cambiarlos o quitarlos, y lo que han
 * hecho. Todo se refresca con el evento `remote` del proceso principal.
 */

const LEVELS: ConsoleLevel[] = [1, 2, 3]

export function RemoteAccessCard(): React.JSX.Element {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [activity, setActivity] = useState<RemoteActivityEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [servers, setServers] = useState<ServerOption[]>([])

  useEffect(() => {
    const refresh = (): void => {
      void window.qubiq.remote.status().then(setStatus).catch(() => undefined)
      void window.qubiq.remote.activity(20).then(setActivity).catch(() => undefined)
      void window.qubiq.instances
        .list()
        .then((states) =>
          setServers(
            states
              .map(({ manifest }) => ({ id: manifest.id, name: manifest.name, game: manifest.game }))
              .sort((a, b) => a.name.localeCompare(b.name))
          )
        )
        .catch(() => undefined)
    }
    refresh()
    return window.qubiq.on.remote(refresh)
  }, [])

  async function run(work: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!status) return <div className="card"><h3>{t('remote.title')}</h3></div>

  const listening = status.state === 'listening'

  return (
    <div className="card remote-card">
      <h3>{t('remote.title')}</h3>
      <p className="hint">{t('remote.hint')}</p>

      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className={status.enabled ? '' : 'primary'}
          disabled={busy}
          onClick={() => void run(() => window.qubiq.remote.setEnabled(!status.enabled))}
        >
          {status.enabled ? t('remote.disable') : t('remote.enable')}
        </button>
        <StateLine status={status} />
      </div>

      {error && (
        <div className="alert error" style={{ marginTop: 12, marginBottom: 0 }}>
          <p>{error}</p>
        </div>
      )}

      <PortField status={status} busy={busy} onSave={(port) => void run(() => window.qubiq.remote.setPort(port))} />

      {status.enabled && (
        <>
          <div className="field">
            <label>{t('remote.address.title')}</label>
            {status.addresses.length > 0 && (
              <div className="remote-urls">
                <span className="help" style={{ margin: 0 }}>
                  {t('remote.address.home')}
                </span>
                {status.addresses.map((address) => (
                  <span key={address} className="mono-path remote-url">
                    https://{address}:{status.port}
                  </span>
                ))}
              </div>
            )}
            <div className="help">{t('remote.address.outside', { port: status.port })}</div>
          </div>

          {status.fingerprint && (
            <div className="field">
              <label>{t('remote.fingerprint.label')}</label>
              <div className="mono-path remote-fingerprint">{status.fingerprint}</div>
              <div className="help">{t('remote.fingerprint.help')}</div>
            </div>
          )}

          <div className="alert info" style={{ marginBottom: 0 }}>
            <p>{t('remote.trayNote')}</p>
            <p>{t('remote.firewallNote')}</p>
          </div>
        </>
      )}

      <InviteSection status={status} servers={servers} listening={listening} onRun={run} busy={busy} />
      <DevicesSection devices={status.devices} servers={servers} onRun={run} busy={busy} />
      <ActivitySection entries={activity} />
    </div>
  )
}

function StateLine({ status }: { status: RemoteStatus }): React.JSX.Element {
  switch (status.state) {
    case 'off':
      return <span className="help">{t('remote.state.off')}</span>
    case 'starting':
      return <span className="help">{t('remote.state.starting')}</span>
    case 'listening':
      return <span className="chip good">{t('remote.state.listening', { port: status.port })}</span>
    case 'error': {
      const text =
        status.error === 'port-in-use'
          ? t('remote.state.portInUse', { port: status.port })
          : status.error === 'cert-failed'
            ? t('remote.state.certFailed')
            : t('remote.state.failed')
      return (
        <span className="chip bad" title={status.errorDetail ?? undefined}>
          {text}
        </span>
      )
    }
  }
}

function PortField({
  status,
  busy,
  onSave
}: {
  status: RemoteStatus
  busy: boolean
  onSave: (port: number) => void
}): React.JSX.Element {
  const [value, setValue] = useState(String(status.port))
  useEffect(() => setValue(String(status.port)), [status.port])

  const port = Number(value)
  const valid = Number.isInteger(port) && port >= 1024 && port <= 65535
  const changed = valid && port !== status.port

  return (
    <div className="field" style={{ marginTop: 16 }}>
      <label htmlFor="remote-port">{t('remote.port.label')}</label>
      <div className="row">
        <input
          id="remote-port"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 5))}
          style={{ width: 110 }}
        />
        <button disabled={busy || !changed} onClick={() => onSave(port)}>
          {t('remote.port.save')}
        </button>
      </div>
      <div className="help">{valid ? t('remote.port.help') : t('remote.port.invalid')}</div>
    </div>
  )
}

/** Un servidor del equipo, para marcarlo en los permisos. */
interface ServerOption {
  id: string
  name: string
  game: GameId
}

function PermissionsEditor({
  value,
  servers,
  onChange,
  disabled,
  idPrefix
}: {
  value: RemotePermissions
  servers: ServerOption[]
  onChange: (permissions: RemotePermissions) => void
  disabled?: boolean
  idPrefix: string
}): React.JSX.Element {
  const toggle = (id: string, on: boolean): void => {
    const rest = value.servers.filter((server) => server !== id)
    onChange({ ...value, servers: on ? [...rest, id] : rest })
  }
  return (
    <div className="remote-perms">
      <div className="field">
        <label>{t('remote.perm.servers')}</label>
        <div className="help" style={{ marginTop: 0, marginBottom: 8 }}>
          {t('remote.perm.serversHelp')}
        </div>
        {servers.length === 0 ? (
          <div className="help">{t('remote.perm.noServersYet')}</div>
        ) : (
          <div className="remote-servers" id={`${idPrefix}-servers`}>
            {servers.map((server) => (
              <CheckRow
                key={server.id}
                label={server.name}
                help={gameInfo(server.game).name}
                checked={value.servers.includes(server.id)}
                disabled={disabled}
                onChange={(on) => toggle(server.id, on)}
              />
            ))}
          </div>
        )}
      </div>
      <CheckRow
        label={t('remote.perm.control')}
        checked={value.control}
        disabled={disabled}
        onChange={(control) => onChange({ ...value, control })}
      />
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor={`${idPrefix}-console`}>{t('remote.perm.console')}</label>
        <select
          id={`${idPrefix}-console`}
          value={value.console}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, console: Number(e.target.value) as ConsoleLevel })}
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`remote.console.${level}` as MessageKey)}
            </option>
          ))}
        </select>
        <div className={`help ${value.console === 3 ? 'remote-warn' : ''}`}>
          {t(`remote.console.${value.console}.help` as MessageKey)}
        </div>
      </div>
    </div>
  )
}

function InviteSection({
  status,
  servers,
  listening,
  busy,
  onRun
}: {
  status: RemoteStatus
  servers: ServerOption[]
  listening: boolean
  busy: boolean
  onRun: (work: () => Promise<unknown>) => Promise<void>
}): React.JSX.Element {
  // Ningún servidor marcado de serie: hay que elegirlos (decisión del usuario).
  const [permissions, setPermissions] = useState<RemotePermissions>({ control: true, console: 1, servers: [] })
  const invite = status.invite
  // Solo cuentan los que existen: uno borrado mientras se elegía no vale.
  const chosen = permissions.servers.filter((id) => servers.some((server) => server.id === id))

  return (
    <div className="remote-section">
      <h4>{t('remote.invite.title')}</h4>
      {!listening ? (
        <p className="help">{t('remote.invite.needOn')}</p>
      ) : invite ? (
        <InviteCode
          invite={invite}
          servers={servers}
          busy={busy}
          onCancel={() => void onRun(() => window.qubiq.remote.cancelInvite())}
        />
      ) : (
        <>
          <p className="hint">{t('remote.invite.hint')}</p>
          <PermissionsEditor value={permissions} servers={servers} onChange={setPermissions} idPrefix="invite" />
          <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
            <button
              className="primary"
              disabled={busy || chosen.length === 0}
              onClick={() => void onRun(() => window.qubiq.remote.createInvite({ ...permissions, servers: chosen }))}
            >
              {t('remote.invite.create')}
            </button>
            {chosen.length === 0 && <span className="help">{t('remote.invite.needServer')}</span>}
          </div>
        </>
      )}
    </div>
  )
}

function InviteCode({
  invite,
  servers,
  busy,
  onCancel
}: {
  invite: RemoteInvite
  servers: ServerOption[]
  busy: boolean
  onCancel: () => void
}): React.JSX.Element {
  const names = servers.filter((server) => invite.permissions.servers.includes(server.id)).map((server) => server.name)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const left = Math.max(0, Date.parse(invite.expiresAt) - now)
  const minutes = Math.floor(left / 60_000)
  const seconds = Math.floor((left % 60_000) / 1000)

  return (
    <div className="remote-invite">
      <label>{t('remote.invite.code')}</label>
      <div className="remote-code">{formatCode(invite.code)}</div>
      <div className="help">
        {t('remote.invite.expiresIn', { time: `${minutes}:${String(seconds).padStart(2, '0')}` })} ·{' '}
        {t('remote.perm.console')}: {t(`remote.console.${invite.permissions.console}` as MessageKey)}
        {invite.permissions.control ? ` · ${t('remote.perm.control')}` : ''}
      </div>
      <div className="help">
        {t('remote.perm.servers')}: {formatList(names)}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button disabled={busy} onClick={onCancel}>
          {t('remote.invite.cancel')}
        </button>
      </div>
    </div>
  )
}

function DevicesSection({
  devices,
  servers,
  busy,
  onRun
}: {
  devices: RemoteDevice[]
  servers: ServerOption[]
  busy: boolean
  onRun: (work: () => Promise<unknown>) => Promise<void>
}): React.JSX.Element {
  const [confirming, setConfirming] = useState<string | null>(null)

  return (
    <div className="remote-section">
      <h4>{t('remote.devices.title')}</h4>
      {devices.length === 0 && <p className="help">{t('remote.devices.none')}</p>}
      {devices.map((device) => (
        <div key={device.id} className="remote-device">
          <div className="remote-device-head">
            <div>
              <strong>{device.name}</strong>
              <div className="help" style={{ margin: 0 }}>
                {device.lastSeen && device.lastAddress
                  ? t('remote.devices.lastSeen', { date: formatDate(device.lastSeen), address: device.lastAddress })
                  : t('remote.devices.paired', { date: formatDate(device.createdAt) })}
              </div>
            </div>
            {confirming === device.id ? null : (
              <button className="danger" disabled={busy} onClick={() => setConfirming(device.id)}>
                {t('remote.devices.revoke')}
              </button>
            )}
          </div>
          {confirming === device.id && (
            <div className="alert warn" style={{ marginTop: 10, marginBottom: 0 }}>
              <p>{t('remote.devices.revokeConfirm', { name: quote(device.name) })}</p>
              <div className="row">
                <button onClick={() => setConfirming(null)}>{t('common.cancel')}</button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => void onRun(() => window.qubiq.remote.revokeDevice(device.id)).then(() => setConfirming(null))}
                >
                  {t('remote.devices.revoke')}
                </button>
              </div>
            </div>
          )}
          {!device.permissions.servers.some((id) => servers.some((server) => server.id === id)) && (
            <div className="alert warn" style={{ marginBottom: 10 }}>
              <p>{t('remote.devices.noServers')}</p>
            </div>
          )}
          <PermissionsEditor
            value={device.permissions}
            servers={servers}
            disabled={busy}
            idPrefix={`device-${device.id}`}
            onChange={(permissions) => void onRun(() => window.qubiq.remote.updateDevice(device.id, permissions))}
          />
        </div>
      ))}
    </div>
  )
}

function ActivitySection({ entries }: { entries: RemoteActivityEntry[] }): React.JSX.Element {
  return (
    <div className="remote-section">
      <h4>{t('remote.activity.title')}</h4>
      {entries.length === 0 ? (
        <p className="help">{t('remote.activity.none')}</p>
      ) : (
        <table className="remote-activity">
          <tbody>
            {entries.map((entry, index) => (
              <tr key={`${entry.ts}-${index}`}>
                <td className="nowrap">{formatDate(entry.ts)}</td>
                <td>{entry.device ?? t('remote.activity.unknownDevice')}</td>
                <td className="mono">{entry.address}</td>
                <td>
                  {t(`remote.order.${entry.order}` as MessageKey)}
                  {entry.server ? ` · ${entry.server}` : ''}
                  {entry.command ? <span className="mono"> · {entry.command}</span> : null}
                </td>
                <td className={entry.result === 'ok' ? 'ok' : 'bad'}>
                  {entry.result === 'ok'
                    ? t('remote.result.ok')
                    : t(`remote.error.${entry.result}` as MessageKey)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
