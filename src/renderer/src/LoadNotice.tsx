import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { gameInfo, memoryNeedGb } from '@shared/games'

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

  const nombres = others.map((s) => `${s.manifest.name} (${gameInfo(s.manifest.game).name})`)
  const lista =
    nombres.length === 1 ? nombres[0]! : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  const gb = (n: number): string => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

  return (
    <div className={`alert ${noCabe ? 'error' : 'warn'}`}>
      <strong>
        {noCabe ? 'Con este no cabe en la memoria del equipo' : 'Con este, el equipo va a ir justo'}
      </strong>
      <p>
        {others.length === 1 ? 'Ya está en marcha' : 'Ya están en marcha'} {lista}, que usan unos{' '}
        {gb(used)} GB. Este necesita unos {gb(need)} más, y el equipo tiene {gb(totalGb)} GB en total.
        {noCabe
          ? ' Si lo arrancas, lo normal es que alguno vaya a tirones o se cierre solo: para antes alguno que no estéis usando.'
          : ' Puede ir bien, pero si jugáis en este mismo equipo, notaréis la diferencia.'}
      </p>
    </div>
  )
}
