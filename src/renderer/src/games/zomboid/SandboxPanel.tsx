import { useCallback, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { presetInfo } from '@shared/games/zomboid/types'
import { ConfigTab } from './ConfigTab'
import { quote, t } from '../../i18n'

/**
 * Las reglas de la partida (`servertest_SandboxVars.lua`).
 *
 * Son más de trescientas y no se pueden cambiar en caliente: el juego las lee
 * al cargar el mundo y no las vuelve a mirar. Eso se dice en pantalla en vez de
 * dejar que el usuario cambie algo y no note nada.
 *
 * Lo que el modo básico eligió («Apocalipsis», «Alzamiento»…) no es otra cosa:
 * es un puñado de estas mismas opciones puestas de golpe, así que desde aquí se
 * puede volver a ese preajuste cuando el invento se tuerza.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function SandboxPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest } = state
  const id = manifest.id
  const running = state.status !== 'stopped' && state.status !== 'crashed'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => window.qubiq.zomboid.sandbox.get(id), [id])
  const save = useCallback(
    (changes: Parameters<typeof window.qubiq.zomboid.sandbox.set>[1]) =>
      window.qubiq.zomboid.sandbox.set(id, changes),
    [id]
  )

  const preset = manifest.game === 'zomboid' ? presetInfo(manifest.data.preset) : null

  async function restablecer(): Promise<void> {
    if (!preset) return
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.zomboid.sandbox.applyPreset(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && (
        <div className="panel" style={{ paddingBottom: 0 }}>
          <div className="alert error">
            <strong>{t('pz.sandbox.resetFailed')}</strong>
            <p>{error}</p>
          </div>
        </div>
      )}
      <ConfigTab
        instanceId={id}
        load={load}
        save={save}
        savedNotice={t('pz.sandbox.saved')}
        intro={t('pz.sandbox.intro')}
        blocked={
          running ? (
            <>
              <strong>{t('pz.sandbox.stopFirst')}</strong>
              <p>{t('pz.sandbox.stopFirstText')}</p>
            </>
          ) : undefined
        }
        extra={
          preset?.file ? (
            <button disabled={busy || running} onClick={() => void restablecer()}>
              {busy ? t('pz.sandbox.resetting') : t('pz.sandbox.reset', { name: quote(preset.name) })}
            </button>
          ) : undefined
        }
      />
    </>
  )
}
