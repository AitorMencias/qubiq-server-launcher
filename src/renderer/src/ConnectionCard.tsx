import { useCallback, useEffect, useState } from 'react'
import type {
  ConnectionInfo,
  ExposureMode,
  ExternalCheck,
  InstanceState
} from '@shared/types'
import { capabilitiesFor, gameInfo, versionLabel } from '@shared/games'
import { ExposureHelp } from './ExposureHelp'
import { JoinSteps } from './JoinSteps'
import { Rich, formatTime, t } from './i18n'

/**
 * Panel de conexión (§10).
 *
 * Direcciones separadas y explicadas, y un selector de cómo se va a exponer el
 * servidor. El estado local sale de un Server List Ping real; el acceso desde
 * internet solo se comprueba cuando el usuario lo pide, porque implica
 * contactar con servicios externos.
 */

interface Props {
  state: InstanceState
  onManifestChanged: () => void
}

const MODES: ExposureMode[] = ['local', 'crossplay', 'router', 'tunnel']

export function ConnectionCard({ state, onManifestChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const capabilities = capabilitiesFor(manifest)
  const [info, setInfo] = useState<ConnectionInfo | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const exposure = manifest.exposure ?? { mode: 'local' as const }
  const [tunnelAddress, setTunnelAddress] = useState(exposure.tunnelAddress ?? '')
  const [check, setCheck] = useState<ExternalCheck | null>(null)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setInfo(await window.qubiq.network.info(manifest.id))
    } catch {
      setInfo(null)
    }
  }, [manifest.id])

  useEffect(() => {
    void refresh()
    // Con el servidor en marcha se re-sondea, para que el estado no se quede viejo.
    if (status !== 'running') return
    const timer = setInterval(() => void refresh(), 10_000)
    return () => clearInterval(timer)
  }, [refresh, status])

  useEffect(() => {
    setTunnelAddress(exposure.tunnelAddress ?? '')
  }, [exposure.tunnelAddress])

  async function copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1600)
  }

  async function changeMode(mode: ExposureMode): Promise<void> {
    setCheck(null)
    await window.qubiq.instances.update(manifest.id, {
      exposure: { mode, tunnelAddress: tunnelAddress.trim() || undefined }
    })
    onManifestChanged()
    void refresh()
  }

  async function saveTunnelAddress(): Promise<void> {
    await window.qubiq.instances.update(manifest.id, {
      exposure: { mode: 'tunnel', tunnelAddress: tunnelAddress.trim() || undefined }
    })
    onManifestChanged()
  }

  async function runCheck(): Promise<void> {
    setChecking(true)
    setCheck(null)
    try {
      if (exposure.mode === 'tunnel') await saveTunnelAddress()
      setCheck(await window.qubiq.network.checkFromInternet(manifest.id))
    } catch (err) {
      setCheck({
        reachable: false,
        address: '',
        checkedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setChecking(false)
    }
  }

  const running = status === 'running'
  const ping = info?.ping
  const firstLocal = info?.localAddresses[0]?.address ?? null

  return (
    <>
      <div className="card">
        <h3>{t('connection.title')}</h3>
        <p className="hint">
          {running
            ? `${gameInfo(manifest.game).joinHint} ${t('connection.pasteOne')}`
            : t('connection.startToConnect')}
        </p>

        {/* Con crossplay la dirección no sirve para quien está fuera: lo que
            hay que repartir es el código, y va primero por eso. */}
        {exposure.mode === 'crossplay' && (
          <AddressRow
            label={t('connection.joinCode')}
            help={t('connection.joinCodeHelp')}
            value={
              state.joinCode ??
              (running ? t('connection.joinCodeWaiting') : t('connection.joinCodeStart'))
            }
            copied={copied}
            onCopy={copy}
          />
        )}

        <AddressRow
          label={t('connection.sameComputer')}
          help={t('connection.sameComputerHelp')}
          value={info?.loopback ?? `localhost:${manifest.port}`}
          copied={copied}
          onCopy={copy}
        />

        {info?.localAddresses.map((address) => (
          <AddressRow
            key={address.address}
            label={t('connection.home')}
            help={t('connection.homeHelp', { adapter: address.label })}
            value={`${address.address}:${manifest.port}`}
            copied={copied}
            onCopy={copy}
          />
        ))}

        {info && info.localAddresses.length === 0 && (
          <div className="help" style={{ marginBottom: 14 }}>
            {t('connection.noLocal')}
          </div>
        )}

        {running && ping && (
          <div
            className={`alert ${ping.state === 'ok' ? 'info' : 'error'}`}
            style={{ marginTop: 6, marginBottom: 0 }}
          >
            {ping.state === 'ok' ? (
              <>
                <strong>{t('connection.pingOk')}</strong>
                <p>
                  {ping.motd ? `"${ping.motd}" · ` : ''}
                  {ping.versionName ?? versionLabel(manifest)} ·{' '}
                  {t('connection.pingPlayers', {
                    online: ping.playersOnline ?? 0,
                    max: ping.playersMax ?? '?'
                  })}
                  {ping.latencyMs !== undefined && ` · ${ping.latencyMs} ms`}
                </p>
              </>
            ) : ping.state === 'comprobando' ? (
              <>
                <strong>{t('connection.checking')}</strong>
                <p>{t('connection.pingChecking')}</p>
              </>
            ) : (
              <>
                <strong>{t('connection.pingNo')}</strong>
                <p>{t(`connection.pingNoText.${gameInfo(manifest.game).save}`)}</p>
              </>
            )}
          </div>
        )}
      </div>

      <JoinSteps manifest={manifest} />

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{t('connection.outside')}</h3>
          <button style={{ flexShrink: 0 }} onClick={() => setShowHelp(true)}>
            {t('connection.howTo')}
          </button>
        </div>
        <p className="hint">{t('connection.outsideHint')}</p>

        <div className="field">
          <label>{t('connection.howJoin')}</label>
          <select
            value={exposure.mode}
            onChange={(e) => void changeMode(e.target.value as ExposureMode)}
          >
            {MODES
              // El crossplay solo existe en los juegos que lo traen de serie.
              .filter((mode) => mode !== 'crossplay' || capabilities.crossplay)
              .map((mode) => (
                <option key={mode} value={mode}>
                  {t(`connection.mode.${mode}`)}
                </option>
              ))}
          </select>
          <div className="help">{t(`connection.modeHint.${exposure.mode}`)}</div>
        </div>

        {exposure.mode === 'tunnel' && (
          <div className="field">
            <label>{t('connection.tunnelAddress')}</label>
            <div className="row">
              <input
                className="grow"
                placeholder={gameInfo(manifest.game).tunnelAddressExample}
                value={tunnelAddress}
                onChange={(e) => setTunnelAddress(e.target.value)}
                onBlur={() => void saveTunnelAddress()}
              />
              {tunnelAddress.trim().length > 0 && (
                <button style={{ flexShrink: 0 }} onClick={() => void copy(tunnelAddress.trim())}>
                  {copied === tunnelAddress.trim() ? t('connection.copied') : t('panel.copy')}
                </button>
              )}
            </div>
            <div className="help">{t('connection.tunnelHelp')}</div>
          </div>
        )}

        {exposure.mode !== 'local' && capabilities.externalCheck && (
          <>
            <div className="row">
              <button className="primary" disabled={!running || checking} onClick={() => void runCheck()}>
                {checking ? t('connection.checking') : t('connection.checkButton')}
              </button>
              {!running && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {t('connection.startToCheck')}
                </span>
              )}
            </div>

            <div className="help" style={{ marginTop: 8 }}>
              {t('connection.checkPrivacy')}
            </div>

            {check && <CheckResult check={check} mode={exposure.mode} />}
          </>
        )}

        {/* Sin servicio externo que hable el protocolo del juego no hay
            comprobación honesta posible: se dice, en vez de ofrecer un botón
            que siempre respondería que no se llega. */}
        {exposure.mode !== 'local' && !capabilities.externalCheck && (
          <div className="alert info" style={{ textAlign: 'left' }}>
            <strong>{t('connection.noCheckTitle')}</strong>
            <p>{t('connection.noCheck', { game: gameInfo(manifest.game).name })}</p>
          </div>
        )}
      </div>

      {showHelp && (
        <ExposureHelp
          mode={exposure.mode}
          gateway={info?.gateway ?? null}
          localAddress={firstLocal}
          manifest={manifest}
          onClose={() => setShowHelp(false)}
        />
      )}
    </>
  )
}

function CheckResult({
  check,
  mode
}: {
  check: ExternalCheck
  mode: ExposureMode
}): React.JSX.Element {
  const time = formatTime(check.checkedAt, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  if (check.reachable) {
    return (
      <div className="alert info" style={{ marginTop: 12, marginBottom: 0 }}>
        <strong>{t('connection.reachable')}</strong>
        <p>
          <Rich
            k="connection.reachableText"
            vars={{ time }}
            values={{ address: <strong>{check.address}</strong> }}
          />
          {check.playersOnline !== undefined && ` · ${check.playersOnline}/${check.playersMax}`}
        </p>
      </div>
    )
  }

  return (
    <div className="alert error" style={{ marginTop: 12, marginBottom: 0 }}>
      <strong>{t('connection.unreachable')}</strong>
      <p>
        {check.error ??
          (mode === 'router' ? t('connection.unreachableRouter') : t('connection.unreachableTunnel'))}
        {check.address && ` ${t('connection.tried', { address: check.address })}`}{' '}
        {t('connection.checkedAt', { time })}
      </p>
    </div>
  )
}

interface AddressRowProps {
  label: string
  help: string
  value: string
  copied: string | null
  onCopy: (value: string) => Promise<void>
}

function AddressRow({ label, help, value, copied, onCopy }: AddressRowProps): React.JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <input className="grow" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button style={{ flexShrink: 0 }} onClick={() => void onCopy(value)}>
          {copied === value ? t('connection.copied') : t('panel.copy')}
        </button>
      </div>
      <div className="help">{help}</div>
    </div>
  )
}
