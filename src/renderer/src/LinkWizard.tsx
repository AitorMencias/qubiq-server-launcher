import { useState } from 'react'
import { CODE_LENGTH, formatCode, normalizeCode, type RemoteLinksState, type RemoteProbe } from '@shared/remote'
import { Fingerprint, linkErrorText } from './RemoteLinkParts'
import { t } from './i18n'

/**
 * «Conectar con otro QubiQ»: la dirección, la huella comparada a mano y el
 * código. La huella va antes que el código a propósito: si alguien estuviera
 * en medio, se le pararía antes de que viera el código.
 */

interface Props {
  state: RemoteLinksState
  onCancel: () => void
  onLinked: (id: string) => void
}

export function LinkWizard({ state, onCancel, onLinked }: Props): React.JSX.Element {
  const [address, setAddress] = useState('')
  const [probe, setProbe] = useState<RemoteProbe | null>(null)
  const [matches, setMatches] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => t('link.add.defaultName', { pc: state.defaultName }))
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (working || address.trim().length === 0) return
    setWorking(true)
    setError(null)
    const result = await window.qubiq.remoteLinks.probe(address)
    setWorking(false)
    if (!result.ok) return setError(linkErrorText(result.error, result.detail))
    setProbe(result.data)
    setMatches(false)
  }

  async function pair(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!probe || !ready || working) return
    setWorking(true)
    setError(null)
    const result = await window.qubiq.remoteLinks.pair({
      address: probe.address,
      fingerprint: probe.fingerprint,
      code,
      name: name.trim()
    })
    setWorking(false)
    if (!result.ok) return setError(linkErrorText(result.error, result.detail))
    onLinked(result.data.id)
  }

  const ready = matches && normalizeCode(code).length === CODE_LENGTH && name.trim().length > 0

  return (
    <>
      <div className="topbar">
        <h2>{t('link.add.title')}</h2>
        <button onClick={onCancel}>{t('common.cancel')}</button>
      </div>
      <div className="panel">
        <div className="card">
          <p className="hint">{t('link.add.intro')}</p>
          <p className="hint">{t('link.add.before')}</p>
        </div>

        {!state.secureStorage && (
          <div className="alert error">
            <p>{t('link.add.noSecureStorage')}</p>
          </div>
        )}

        {!probe ? (
          <form className="card" onSubmit={(e) => void search(e)}>
            <div className="field">
              <label htmlFor="link-address">{t('link.add.address')}</label>
              <div className="row">
                <input
                  id="link-address"
                  className="grow"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  value={address}
                  placeholder="192.168.1.20:8443"
                  onChange={(e) => setAddress(e.target.value)}
                />
                <button type="submit" className="primary" disabled={working || address.trim().length === 0}>
                  {working ? t('link.add.searching') : t('link.add.search')}
                </button>
              </div>
              <div className="help">{t('link.add.addressHelp')}</div>
            </div>
            {error && (
              <div className="alert error">
                <p>{error}</p>
              </div>
            )}
          </form>
        ) : (
          <form className="card" onSubmit={(e) => void pair(e)}>
            <p className="hint">{t('link.add.found', { address: probe.address })}</p>

            <h3>{t('link.add.fingerprintTitle')}</h3>
            <p className="hint">{t('link.add.fingerprintHelp')}</p>
            <Fingerprint value={probe.fingerprint} />
            <label className="link-check">
              <input type="checkbox" checked={matches} onChange={(e) => setMatches(e.target.checked)} />
              {t('link.add.fingerprintMatch')}
            </label>

            <div className="field">
              <label htmlFor="link-code">{t('link.add.code')}</label>
              <input
                id="link-code"
                className="link-code-input"
                autoComplete="off"
                spellCheck={false}
                disabled={!matches}
                value={code}
                placeholder="XXXX-XXXX"
                onChange={(e) => setCode(formatCode(e.target.value).slice(0, CODE_LENGTH + 1))}
              />
            </div>

            <div className="field">
              <label htmlFor="link-name">{t('link.add.name')}</label>
              <input
                id="link-name"
                maxLength={60}
                disabled={!matches}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="help">{t('link.add.nameHelp')}</div>
            </div>

            {error && (
              <div className="alert error">
                <p>{error}</p>
              </div>
            )}

            <div className="row">
              <button
                type="button"
                disabled={working}
                onClick={() => {
                  setProbe(null)
                  setError(null)
                }}
              >
                {t('link.add.back')}
              </button>
              <button type="submit" className="primary" disabled={!ready || working || !state.secureStorage}>
                {working ? t('link.add.working') : t('link.add.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
