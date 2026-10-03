import { useState } from 'react'
import type { RemoteLink, RemoteUnlinkResult } from '@shared/remote'
import type { MessageKey } from '@shared/i18n'
import { gameInfo } from '@shared/games'
import { GameIcon } from './GameIcon'
import { Fingerprint, linkErrorText, linkStateLabel } from './RemoteLinkParts'
import { formatDate, t } from './i18n'

/**
 * Una conexión con otro QubiQ: en qué estado está, qué le deja hacer el otro
 * equipo a este, sus servidores y quitarla. Si la huella ha cambiado, aquí se
 * compara y se confirma la nueva.
 */

interface Props {
  link: RemoteLink
  onOpenServer: (server: string) => void
  onRemoved: (result: RemoteUnlinkResult) => void
}

export function RemoteLinkPanel({ link, onOpenServer, onRemoved }: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const list = link.list

  async function retry(): Promise<void> {
    setError(null)
    await window.qubiq.remoteLinks.refresh(link.id)
  }

  async function showNewFingerprint(): Promise<void> {
    setError(null)
    setWorking(true)
    // Con una huella vacía no confía en nada: solo trae la que enseña ahora.
    const result = await window.qubiq.remoteLinks.trust(link.id, '')
    setWorking(false)
    if (!result.ok && result.error !== 'cert-changed') setError(linkErrorText(result.error, result.detail))
  }

  async function trust(): Promise<void> {
    if (!link.newFingerprint) return
    setError(null)
    setWorking(true)
    const result = await window.qubiq.remoteLinks.trust(link.id, link.newFingerprint)
    setWorking(false)
    if (!result.ok) setError(linkErrorText(result.error, result.detail))
  }

  async function remove(): Promise<void> {
    setError(null)
    setWorking(true)
    const result = await window.qubiq.remoteLinks.remove(link.id)
    setWorking(false)
    if (!result.ok) return setError(linkErrorText(result.error, result.detail))
    onRemoved(result.data)
  }

  return (
    <>
      <div className="topbar">
        <span className="link-host-icon" aria-hidden="true">
          ⇄
        </span>
        <h2>{link.host}</h2>
        <span className="status">
          <span className={`dot link-${link.state}`} />
          {linkStateLabel(link.state)}
        </span>
        {(link.state === 'offline' || link.state === 'connecting') && (
          <button onClick={() => void retry()}>{t('link.retry')}</button>
        )}
      </div>

      <div className="panel">
        {error && (
          <div className="alert error">
            <p>{error}</p>
          </div>
        )}

        {link.state === 'offline' && (
          <div className="alert warn">
            <p>{t('link.offline.text', { host: link.host })}</p>
            {link.lastContact && <p>{t('link.lastContact', { date: formatDate(link.lastContact) })}</p>}
          </div>
        )}
        {link.state === 'online' && link.error && (
          <div className="alert warn">
            <p>{linkErrorText(link.error, link.errorDetail)}</p>
          </div>
        )}
        {link.state === 'revoked' && (
          <div className="alert error">
            <p>{t('link.revoked.text', { host: link.host })}</p>
          </div>
        )}
        {link.state === 'key-lost' && (
          <div className="alert error">
            <p>{t('link.keyLost.text')}</p>
          </div>
        )}

        {link.state === 'cert-changed' && (
          <div className="card link-cert-changed">
            <h3>{linkStateLabel('cert-changed')}</h3>
            <p className="hint">{t('link.certChanged.text', { host: link.host })}</p>
            <div className="field">
              <label>{t('link.certChanged.old')}</label>
              <Fingerprint value={link.fingerprint} />
            </div>
            {link.newFingerprint ? (
              <>
                <div className="field">
                  <label>{t('link.certChanged.new')}</label>
                  <Fingerprint value={link.newFingerprint} />
                  <div className="help">{t('link.certChanged.check')}</div>
                </div>
                <button className="primary" disabled={working} onClick={() => void trust()}>
                  {t('link.certChanged.trust')}
                </button>
              </>
            ) : (
              <button disabled={working} onClick={() => void showNewFingerprint()}>
                {t('link.certChanged.load')}
              </button>
            )}
          </div>
        )}

        {list && (
          <div className="card">
            <h3>{t('link.panel.servers')}</h3>
            {list.servers.length === 0 ? (
              <p className="hint">{t('link.noServers')}</p>
            ) : (
              <div className="player-list">
                {list.servers.map((server) => (
                  <button key={server.id} className="link-server-row" onClick={() => onOpenServer(server.id)}>
                    <GameIcon game={server.game} size={24} />
                    <span className="pname">{server.name}</span>
                    <span className="hint">{gameInfo(server.game).name}</span>
                    <span className="status">
                      <span className={`dot ${link.state === 'online' ? server.status : 'unknown'}`} />
                      {link.state === 'online'
                        ? t(`status.${server.status}` as MessageKey)
                        : t('link.statusUnknown')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card">
          <h3>{t('link.panel.details')}</h3>
          <dl className="data-list">
            <div>
              <dt>{t('link.panel.address')}</dt>
              <dd>
                <code>{link.address}</code>
              </dd>
            </div>
            <div>
              <dt>{t('link.panel.device')}</dt>
              <dd>{link.device}</dd>
            </div>
            <div>
              <dt>{t('link.panel.paired')}</dt>
              <dd>{formatDate(link.pairedAt)}</dd>
            </div>
            <div>
              <dt>{t('link.panel.fingerprint')}</dt>
              <dd>
                <Fingerprint value={link.fingerprint} />
              </dd>
            </div>
          </dl>
          {list && (
            <>
              <h3>{t('link.panel.permissions')}</h3>
              <ul className="link-permissions">
                <li>{list.permissions.control ? t('link.panel.controlYes') : t('link.panel.controlNo')}</li>
                <li>
                  {t('link.panel.console', {
                    level: t(`remote.console.${list.permissions.console}` as MessageKey)
                  })}
                </li>
              </ul>
              <p className="hint">{t('link.panel.permissionsHelp')}</p>
            </>
          )}
        </div>

        <div className="card danger-zone">
          <h3>{t('link.remove.title')}</h3>
          <p className="hint">{t('link.remove.hint')}</p>
          {confirmingRemove ? (
            <div className="row">
              <span className="grow">{t('link.remove.confirm', { host: link.host })}</span>
              <button disabled={working} onClick={() => setConfirmingRemove(false)}>
                {t('common.cancel')}
              </button>
              <button className="danger" disabled={working} onClick={() => void remove()}>
                {working ? t('link.remove.working') : t('link.remove.button')}
              </button>
            </div>
          ) : (
            <button className="danger" onClick={() => setConfirmingRemove(true)}>
              {t('link.remove.button')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
