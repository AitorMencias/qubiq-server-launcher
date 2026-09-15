import { useCallback, useEffect, useState } from 'react'
import type {
  ConnectionInfo,
  ExposureMode,
  ExternalCheck,
  InstanceState
} from '@shared/types'
import { gameInfo, theSave, versionLabel } from '@shared/games'
import { ExposureHelp } from './ExposureHelp'

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

const MODE_LABELS: Record<ExposureMode, string> = {
  local: 'Solo en mi casa (misma red)',
  router: 'Por internet, abriendo un puerto en el router',
  tunnel: 'Por internet, con playit.gg (sin tocar el router)'
}

export function ConnectionCard({ state, onManifestChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
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
        <h3>Cómo conectarse</h3>
        <p className="hint">
          {running
            ? `${gameInfo(manifest.game).joinHint.replace(/\.$/, '')}, y pega una de estas direcciones.`
            : 'Arranca el servidor para poder conectarte.'}
        </p>

        <AddressRow
          label="Desde este mismo equipo"
          help="Para jugar en el PC donde corre el servidor."
          value={info?.loopback ?? `localhost:${manifest.port}`}
          copied={copied}
          onCopy={copy}
        />

        {info?.localAddresses.map((address) => (
          <AddressRow
            key={address.address}
            label="Desde tu casa (misma red)"
            help={`Para quien esté en tu wifi o router. Adaptador: ${address.label}.`}
            value={`${address.address}:${manifest.port}`}
            copied={copied}
            onCopy={copy}
          />
        ))}

        {info && info.localAddresses.length === 0 && (
          <div className="help" style={{ marginBottom: 14 }}>
            No se ha detectado ninguna red local. Comprueba que el equipo está conectado al router.
          </div>
        )}

        {running && ping && (
          <div
            className={`alert ${ping.state === 'ok' ? 'info' : 'error'}`}
            style={{ marginTop: 6, marginBottom: 0 }}
          >
            {ping.state === 'ok' ? (
              <>
                <strong>El servidor responde correctamente</strong>
                <p>
                  {ping.motd ? `"${ping.motd}" · ` : ''}
                  {ping.versionName ?? versionLabel(manifest)} · {ping.playersOnline ?? 0}/
                  {ping.playersMax ?? '?'} jugadores
                  {ping.latencyMs !== undefined && ` · ${ping.latencyMs} ms`}
                </p>
              </>
            ) : ping.state === 'comprobando' ? (
              <>
                <strong>Comprobando...</strong>
                <p>Preguntando al servidor si acepta conexiones.</p>
              </>
            ) : (
              <>
                <strong>El servidor no contesta todavía</strong>
                <p>
                  Está arrancado pero aún no acepta conexiones. Suele ser cuestión de segundos
                  mientras termina de generar {theSave(gameInfo(manifest.game).save)}.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Amigos desde fuera de casa</h3>
          <button style={{ flexShrink: 0 }} onClick={() => setShowHelp(true)}>
            ¿Cómo se hace?
          </button>
        </div>
        <p className="hint">
          Para que entre gente que no está en tu wifi hay que elegir una de estas dos vías.
        </p>

        <div className="field">
          <label>¿Cómo van a entrar tus amigos?</label>
          <select
            value={exposure.mode}
            onChange={(e) => void changeMode(e.target.value as ExposureMode)}
          >
            {(Object.keys(MODE_LABELS) as ExposureMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <div className="help">{MODE_HINTS[exposure.mode]}</div>
        </div>

        {exposure.mode === 'tunnel' && (
          <div className="field">
            <label>Dirección que te ha dado playit.gg</label>
            <div className="row">
              <input
                className="grow"
                placeholder="algo.joinmc.link"
                value={tunnelAddress}
                onChange={(e) => setTunnelAddress(e.target.value)}
                onBlur={() => void saveTunnelAddress()}
              />
              {tunnelAddress.trim().length > 0 && (
                <button style={{ flexShrink: 0 }} onClick={() => void copy(tunnelAddress.trim())}>
                  {copied === tunnelAddress.trim() ? 'Copiado' : 'Copiar'}
                </button>
              )}
            </div>
            <div className="help">
              Esta es la dirección que tienes que pasar a tus amigos, no tu IP.
            </div>
          </div>
        )}

        {exposure.mode !== 'local' && (
          <>
            <div className="row">
              <button className="primary" disabled={!running || checking} onClick={() => void runCheck()}>
                {checking ? 'Comprobando...' : 'Comprobar desde internet'}
              </button>
              {!running && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Arranca el servidor para poder comprobarlo.
                </span>
              )}
            </div>

            <div className="help" style={{ marginTop: 8 }}>
              Al comprobar consultamos tu IP pública y pedimos a un servicio externo que intente
              conectarse a tu servidor. Es la única forma de saber si tus amigos pueden entrar: desde
              este equipo siempre se ve.
            </div>

            {check && <CheckResult check={check} mode={exposure.mode} />}
          </>
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

const MODE_HINTS: Record<ExposureMode, string> = {
  local: 'Nadie de fuera podrá entrar. Es lo más seguro y no hay nada que configurar.',
  router:
    'Hay que crear una regla en el router. Da el mejor ping, pero no funciona si tu operador usa CGNAT.',
  tunnel:
    'No hay que tocar el router y funciona aunque tengas CGNAT. A cambio, algo más de ping y depende de un servicio externo.'
}

function CheckResult({
  check,
  mode
}: {
  check: ExternalCheck
  mode: ExposureMode
}): React.JSX.Element {
  const time = new Date(check.checkedAt).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  if (check.reachable) {
    return (
      <div className="alert info" style={{ marginTop: 12, marginBottom: 0 }}>
        <strong>Tus amigos pueden entrar</strong>
        <p>
          Comprobado desde fuera a las {time}. Diles que se conecten a{' '}
          <strong>{check.address}</strong>
          {check.playersOnline !== undefined && ` · ${check.playersOnline}/${check.playersMax}`}
        </p>
      </div>
    )
  }

  return (
    <div className="alert error" style={{ marginTop: 12, marginBottom: 0 }}>
      <strong>Todavía no se puede entrar desde fuera</strong>
      <p>
        {check.error ??
          (mode === 'router'
            ? 'El servidor no responde desde internet. Repasa la regla del router; si está bien puesta, lo más probable es que tu operador use CGNAT y no haya ningún puerto que abrir. En ese caso, cambia a playit.gg.'
            : 'La dirección del túnel no responde. Comprueba que el programa de playit.gg está abierto y que el túnel apunta al puerto correcto.')}
        {check.address && ` (probado: ${check.address})`}
        {' '}Comprobado a las {time}; estos servicios cachean el resultado un minuto, así que si
        acabas de cambiar algo, espera y vuelve a probar.
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
          {copied === value ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="help">{help}</div>
    </div>
  )
}
