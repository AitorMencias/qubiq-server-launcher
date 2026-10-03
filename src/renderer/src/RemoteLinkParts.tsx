import { useEffect } from 'react'
import type { RemoteClientError, RemoteLink, RemoteLinkState } from '@shared/remote'
import type { MessageKey } from '@shared/i18n'
import { GameIcon } from './GameIcon'
import { t } from './i18n'

/**
 * Piezas comunes de las pantallas de otros QubiQ (0.13.0): la lista lateral,
 * la de una conexión y la de un servidor remoto.
 */

/** Los «no» que solo existen en este lado; los demás los dice el anfitrión. */
const CLIENT_ERRORS: readonly RemoteClientError[] = [
  'offline',
  'cert-changed',
  'key-lost',
  'bad-address',
  'not-qubiq',
  'no-secure-storage',
  'unknown-link'
]

export function linkErrorText(error: RemoteClientError, detail?: string | null): string {
  if (CLIENT_ERRORS.includes(error)) return t(`link.error.${error}` as MessageKey)
  const text = t(`remote.error.${error}` as MessageKey)
  // El detalle técnico solo cuando el anfitrión explica un fallo suyo (el EULA sin aceptar…).
  return error === 'failed' && detail ? `${text} ${detail}` : text
}

export function linkStateLabel(state: RemoteLinkState): string {
  return t(`link.state.${state}` as MessageKey)
}

/** Lo que se sabe de un servidor depende de que su equipo conteste. */
export function linkReachable(link: RemoteLink): boolean {
  return link.state === 'online'
}

/**
 * Un equipo en la lista lateral: su encabezado («En SALON-PC», con su
 * conexión) y debajo sus servidores. Sin conexión siguen saliendo, con el
 * estado como desconocido: no se sabe si están caídos.
 */
export function RemoteLinkGroup({
  link,
  open,
  onOpen
}: {
  link: RemoteLink
  /** Lo que está abierto de este equipo, si algo. */
  open: { server: string | null } | null
  onOpen: (server: string | null) => void
}): React.JSX.Element {
  const reachable = linkReachable(link)
  const servers = link.list?.servers ?? []
  return (
    <div className="link-group">
      <button
        className={`link-group-head ${open && open.server === null ? 'active' : ''}`}
        title={link.address}
        onClick={() => onOpen(null)}
      >
        <span className="link-group-name">{t('link.group', { host: link.host })}</span>
        <span className="link-group-state">
          <span className={`dot link-${link.state}`} />
          {link.state === 'online' ? null : linkStateLabel(link.state)}
        </span>
      </button>
      {link.list && servers.length === 0 && <p className="link-group-empty">{t('link.noServers')}</p>}
      {servers.map((server) => (
        <div
          key={server.id}
          className={`instance-item remote ${open?.server === server.id ? 'active' : ''}`}
          onClick={() => onOpen(server.id)}
        >
          <GameIcon game={server.game} size={30} />
          <div className="text">
            <div className="name">{server.name}</div>
            <div className="meta">
              <span className={`dot ${reachable ? server.status : 'unknown'}`} style={{ display: 'inline-block' }} />{' '}
              {reachable ? t(`status.${server.status}` as MessageKey) : t('link.statusUnknown')}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** La huella en dos líneas de 16 pares, para compararla de un vistazo. */
export function Fingerprint({ value }: { value: string }): React.JSX.Element {
  const pairs = value.split(':')
  return (
    <code className="link-fingerprint">
      {pairs.slice(0, 16).join(':')}
      <br />
      {pairs.slice(16).join(':')}
    </code>
  )
}

/**
 * Llama a `work` ahora y cada `everyMs`, sin solaparse, mientras `enabled` y
 * la ventana esté a la vista.
 */
export function usePolling(work: () => Promise<void>, everyMs: number, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async (): Promise<void> => {
      if (stopped || running) return
      running = true
      clearTimeout(timer)
      try {
        if (document.visibilityState === 'visible') await work()
      } finally {
        running = false
      }
      if (!stopped) timer = setTimeout(() => void tick(), everyMs)
    }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void tick()
    }
    void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [work, everyMs, enabled])
}
