import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { gameInfo, memoryNeedGb } from '@shared/games'
import { formatList, formatNumber, t } from './i18n'

/**
 * Aviso antes de arrancar un servidor más con otros ya en marcha.
 *
 * Con siete juegos en la app, tener dos o tres servidores encendidos a la vez
 * es normal, y el equipo es el mismo para todos. Se suma lo que usa cada uno
 * según cómo está configurado (en Rust, según el mapa) y, si con este no cabe,
 * se dice cuáles están en marcha. Avisa, nunca bloquea: puede que alguno esté
 * parado del todo en un momento.
 */

/** Lo que se deja para Windows y para quien juegue en el mismo equipo. */
const SYSTEM_GB = 3

export function LoadNotice({ state }: { state: InstanceState }): React.JSX.Element | null {
  const [others, setOthers] = useState<InstanceState[]>([])
  const [totalGb, setTotalGb] = useState<number | null>(null)
  const stopped = state.status === 'stopped' || state.status === 'crashed'

  useEffect(() => {
    if (!stopped) return
    let alive = true
    void Promise.all([window.qubiq.instances.list(), window.qubiq.system.memory()])
      .then(([list, memory]) => {
        if (!alive) return
        setOthers(
          list.filter(
            (s) =>
              s.manifest.id !== state.manifest.id &&
              (s.status === 'running' || s.status === 'starting')
          )
        )
        setTotalGb(memory.totalMb / 1024)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [state.manifest.id, stopped])

  if (!stopped || totalGb === null || others.length === 0) return null

  const used = others.reduce((sum, s) => sum + memoryNeedGb(s.manifest), 0)
  const need = memoryNeedGb(state.manifest)
  if (used + need + SYSTEM_GB <= totalGb) return null
  const noCabe = used + need > totalGb

  const lista = formatList(
    others.map((s) => `${s.manifest.name} (${gameInfo(s.manifest.game).name})`)
  )
  const gb = (n: number): string => formatNumber(n, { maximumFractionDigits: 1 })

  return (
    <div className={`alert ${noCabe ? 'error' : 'warn'}`}>
      <strong>{noCabe ? t('load.noRoomTitle') : t('load.tightTitle')}</strong>
      <p>
        {t('load.text', {
          count: others.length,
          list: lista,
          used: gb(used),
          need: gb(need),
          total: gb(totalGb)
        })}{' '}
        {noCabe ? t('load.noRoom') : t('load.tight')}
      </p>
    </div>
  )
}
