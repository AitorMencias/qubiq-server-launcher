import { useCallback, useEffect, useState } from 'react'
import type { ConnectionInfo, ExposureMode, InstanceState } from '@shared/types'
import { gameInfo, versionLabel } from '@shared/games'
import { ExposureHelp } from './ExposureHelp'

/**
 * Tarjeta de conexión en modo básico (§10).
 *
 * Muestra UNA dirección: la que hay que pasarle a los amigos. Nada de listar
 * localhost, adaptadores de red ni latencias.
 *
 * No se oculta la dirección del todo a propósito: sin ella el usuario no puede
 * meter a nadie, que es justo para lo que ha montado el servidor. Lo que se
 * evita es el listado técnico donde hay que adivinar cuál de las tres sirve.
 */

interface Props {
  state: InstanceState
  onManifestChanged: () => void
}

const MODE_LABELS: Record<ExposureMode, string> = {
  local: 'Solo quien esté en mi casa',
  router: 'También desde fuera, abriendo el router',
  tunnel: 'También desde fuera, con playit.gg'
}

export interface ShareAddress {
  /** La dirección que sirve, o null si todavía no hay ninguna que dar. */
  address: string | null
  /** Qué significa esa dirección, sin medias verdades. */
  note: string
  /** Por qué no hay dirección, cuando no la hay. */
  missing: string
  info: ConnectionInfo | null
  refresh: () => Promise<void>
}

/**
 * La dirección que hay que pasarle a los amigos, según cómo esté expuesto el
 * servidor. La usan esta tarjeta y la pantalla principal del modo básico.
 */
export function useShareAddress(state: InstanceState): ShareAddress {
  const { manifest, status } = state
  const [info, setInfo] = useState<ConnectionInfo | null>(null)
  const [publicIp, setPublicIp] = useState<string | null>(null)

  const exposure = manifest.exposure ?? { mode: 'local' as const }

  const refresh = useCallback(async () => {
    try {
      setInfo(await window.qubiq.network.info(manifest.id))
    } catch {
      setInfo(null)
    }
  }, [manifest.id])

  useEffect(() => {
    void refresh()
  }, [refresh, status])

  // Solo se consulta la IP pública si el usuario ha elegido abrir el router:
  // esa elección es la que hace falta consentir, porque sin esa IP no hay
  // ninguna dirección que darle a sus amigos (§10).
  useEffect(() => {
    if (exposure.mode !== 'router') {
      setPublicIp(null)
      return
    }
    let cancelled = false
    void window.qubiq.network
      .publicIp()
      .then((ip) => {
        if (!cancelled) setPublicIp(ip)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [exposure.mode])

  /**
   * La dirección que de verdad sirve, según cómo esté expuesto el servidor.
   *
   * ⚠ Aquí es fácil equivocarse y enseñar siempre la IP local. Sería un error
   * grave: en modo router los amigos de fuera necesitan la IP PÚBLICA, y darles
   * una 192.168.x hace que no puedan entrar sin entender por qué.
   */
  const address = (() => {
    if (exposure.mode === 'tunnel') {
      return exposure.tunnelAddress?.trim() || null
    }
    if (exposure.mode === 'router') {
      return publicIp ? `${publicIp}:${manifest.port}` : null
    }
    const local = info?.localAddresses[0]?.address
    return local ? `${local}:${manifest.port}` : `localhost:${manifest.port}`
  })()

  const note = (() => {
    if (exposure.mode === 'local') {
      return 'Vale para quien esté conectado a tu mismo wifi o router.'
    }
    if (exposure.mode === 'router') {
      return 'Es tu dirección de internet: vale para tus amigos estén donde estén, siempre que hayas abierto el puerto en el router.'
    }
    return 'Es tu dirección de playit.gg: vale para tus amigos estén donde estén.'
  })()

  const missing =
    exposure.mode === 'tunnel'
      ? 'Falta pegar la dirección que te da playit.gg. En Configuración → Conexión, pulsa "¿Cómo se hace?" para verlo paso a paso.'
      : 'No se ha podido averiguar tu dirección de internet. Comprueba que tienes conexión.'

  return { address, note, missing, info, refresh }
}

export function BasicConnection({ state, onManifestChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const [copied, setCopied] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const exposure = manifest.exposure ?? { mode: 'local' as const }
  const { address, note: addressNote, missing, info, refresh } = useShareAddress(state)

  async function copy(): Promise<void> {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <>
      <div className="card">
        <h3>La dirección de tu servidor</h3>
        <p className="hint">
          {status === 'running'
            ? `Pásasela a tus amigos. ${gameInfo(manifest.game).joinHint}`
            : 'Arranca el servidor y pásasela a tus amigos.'}
        </p>

        {address ? (
          <>
            <div className="row">
              <input
                className="grow"
                readOnly
                value={address}
                style={{ fontSize: 16, fontWeight: 600, letterSpacing: 0.3 }}
                onFocus={(e) => e.target.select()}
              />
              <button className="primary" style={{ flexShrink: 0 }} onClick={() => void copy()}>
                {copied ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <div className="help">
              {addressNote} Tienen que usar <strong>{versionLabel(manifest)}</strong>.
            </div>
          </>
        ) : (
          <div className="alert info" style={{ marginBottom: 0 }}>
            <strong>Todavía no hay dirección que dar</strong>
            <p>{missing}</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>¿Quién puede entrar?</h3>
          <button style={{ flexShrink: 0 }} onClick={() => setShowHelp(true)}>
            ¿Cómo se hace?
          </button>
        </div>
        <p className="hint">
          Por defecto solo entra quien esté en tu casa. Para que entren desde fuera hay que hacer
          una cosa más.
        </p>

        <select
          value={exposure.mode}
          onChange={(e) => {
            const mode = e.target.value as ExposureMode
            void window.qubiq.instances
              .update(manifest.id, { exposure: { ...exposure, mode } })
              .then(() => {
                onManifestChanged()
                void refresh()
              })
          }}
        >
          {(Object.keys(MODE_LABELS) as ExposureMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      {showHelp && (
        <ExposureHelp
          mode={exposure.mode}
          gateway={info?.gateway ?? null}
          localAddress={info?.localAddresses[0]?.address ?? null}
          manifest={manifest}
          onClose={() => setShowHelp(false)}
        />
      )}
    </>
  )
}
