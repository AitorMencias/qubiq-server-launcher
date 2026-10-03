import { useEffect, useState } from 'react'
import type { RelocationErrorCode, RelocationStatus } from '@shared/dataFolder'
import { D20Loader } from './D20Loader'
import { formatBytes, t } from './i18n'

/**
 * Lo único que se ve mientras la app mueve su carpeta de datos, al arrancar.
 *
 * El núcleo aún no está en marcha (a propósito: así nada tiene los ficheros
 * abiertos), así que no hay servidores que enseñar ni nada que tocar. Al
 * terminar se cuenta cómo ha ido y se sigue a la app normal recargando.
 */
export function RelocationScreen({ initial }: { initial: RelocationStatus }): React.JSX.Element {
  const [status, setStatus] = useState<RelocationStatus>(initial)

  useEffect(() => window.qubiq.on.relocation(setStatus), [])

  async function proceed(): Promise<void> {
    await window.qubiq.app.dismissRelocation().catch(() => undefined)
    window.location.reload()
  }

  return (
    <div className="relocation-screen">
      <div className="card relocation-card">
        {status.state === 'moving' && (
          <>
            <div className="row" style={{ gap: 14 }}>
              <D20Loader size={44} />
              <div>
                <h3>{t('relocation.movingTitle')}</h3>
                <p className="hint" style={{ margin: 0 }}>
                  {t('relocation.movingHint')}
                </p>
              </div>
            </div>
            <Paths from={status.from} to={status.to} />
            <p className="relocation-phase">{phaseText(status)}</p>
            {status.progress.phase === 'copying' && status.progress.totalBytes ? (
              <div className="progress">
                <div
                  style={{
                    width: `${Math.round(
                      ((status.progress.copiedBytes ?? 0) / status.progress.totalBytes) * 100
                    )}%`
                  }}
                />
              </div>
            ) : null}
          </>
        )}

        {status.state === 'done' && (
          <>
            <h3>{t('relocation.doneTitle')}</h3>
            <Paths from={status.from} to={status.to} />
            <div className="alert info">
              <strong>{t('relocation.firewallTitle')}</strong>
              <p>{t('relocation.firewall')}</p>
            </div>
            {status.leftovers && (
              <div className="alert warn">
                <strong>{t('relocation.leftoversTitle')}</strong>
                <p>{t('relocation.leftovers', { path: status.from })}</p>
              </div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="primary" onClick={() => void proceed()}>
                {t('relocation.continue')}
              </button>
            </div>
          </>
        )}

        {status.state === 'failed' && (
          <>
            <h3>{t('relocation.failedTitle')}</h3>
            <Paths from={status.from} to={status.to} />
            <div className="alert error">
              <strong>{t('relocation.untouched')}</strong>
              <p>{errorText(status.error, status.detail)}</p>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="primary" onClick={() => void proceed()}>
                {t('relocation.continue')}
              </button>
            </div>
          </>
        )}

        {status.state === 'idle' && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="primary" onClick={() => void proceed()}>
              {t('relocation.continue')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Paths({ from, to }: { from: string; to: string }): React.JSX.Element {
  return (
    <div className="relocation-paths">
      <span className="share-label">{t('relocation.from')}</span>
      <span className="mono-path">{from}</span>
      <span className="share-label">{t('relocation.to')}</span>
      <span className="mono-path">{to}</span>
    </div>
  )
}

function phaseText(status: Extract<RelocationStatus, { state: 'moving' }>): string {
  const { progress } = status
  switch (progress.phase) {
    case 'measuring':
      return t('relocation.phase.measuring')
    case 'moving':
      return t('relocation.phase.moving')
    case 'copying':
      return t('relocation.phase.copying', {
        copied: formatBytes(progress.copiedBytes ?? 0),
        total: formatBytes(progress.totalBytes ?? 0)
      })
    case 'verifying':
      return t('relocation.phase.verifying')
    case 'cleaning':
      return t('relocation.phase.cleaning')
  }
}

function errorText(code: RelocationErrorCode, detail: string | undefined): string {
  switch (code) {
    case 'locked':
      return t('relocation.error.locked')
    case 'mismatch':
      return t('relocation.error.mismatch')
    case 'links':
      return t('relocation.error.links', { path: detail ?? '' })
    case 'missing':
      return t('relocation.error.missing')
    case 'other':
      return t('relocation.error.other', { detail: detail ?? '' })
  }
}
