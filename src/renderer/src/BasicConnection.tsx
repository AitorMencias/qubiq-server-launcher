import { useCallback, useEffect, useState } from 'react'
import type { ConnectionInfo, ExposureMode, InstanceState } from '@shared/types'
import { capabilitiesFor, gameInfo, versionLabel } from '@shared/games'
import { ExposureHelp } from './ExposureHelp'
import { JoinSteps } from './JoinSteps'
import { t } from './i18n'

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

const MODES: ExposureMode[] = ['local', 'crossplay', 'router', 'tunnel']

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
    // Con crossplay no hay dirección: el juego da un código de 6 dígitos, y lo
    // genera de nuevo en cada arranque. Con el servidor parado no existe.
    if (exposure.mode === 'crossplay') return state.joinCode
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
    return t(`share.note.${exposure.mode}`)
  })()

  const missing = (() => {
    if (exposure.mode === 'crossplay') {
      return status === 'running' ? t('share.missing.codeWaiting') : t('share.missing.codeStart')
    }
    if (exposure.mode === 'tunnel') {
      return t('share.missing.tunnel', {
        path: `${t('panel.configuration')} → ${t('panel.tab.connection')}`,
        button: t('connection.howTo')
      })
    }
    return t('share.missing.publicIp')
  })()

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
        <h3>{t('share.title')}</h3>
        <p className="hint">
          {status === 'running'
            ? `${t('share.passIt')} ${gameInfo(manifest.game).joinHint}`
            : t('share.startAndPass')}
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
                {copied ? t('panel.copied') : t('panel.copy')}
              </button>
            </div>
            <div className="help">
              {addressNote} {t('share.mustUse')} <strong>{versionLabel(manifest)}</strong>.
            </div>
          </>
        ) : (
          <div className="alert info" style={{ marginBottom: 0 }}>
            <strong>{t('share.noAddress')}</strong>
            <p>{missing}</p>
          </div>
        )}
      </div>

      <JoinSteps manifest={manifest} />

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{t('share.whoCanJoin')}</h3>
          <button style={{ flexShrink: 0 }} onClick={() => setShowHelp(true)}>
            {t('connection.howTo')}
          </button>
        </div>
        <p className="hint">{t('share.whoCanJoinHint')}</p>

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
          {MODES
            // El crossplay solo existe en los juegos que lo traen de serie.
            .filter((mode) => mode !== 'crossplay' || capabilitiesFor(manifest).crossplay)
            .map((mode) => (
              <option key={mode} value={mode}>
                {t(`share.mode.${mode}`)}
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
