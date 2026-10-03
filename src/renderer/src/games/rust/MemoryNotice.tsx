import { useEffect, useState } from 'react'
import { MEMORY_RECOMMENDED_GB, worldSizeInfo } from '@shared/games/rust/types'
import { formatNumber, t } from '../../i18n'

/**
 * Aviso de memoria de Rust, según el tamaño del mapa.
 *
 * Es el juego más pesado de la app, y lo que manda es el mapa: medido con el
 * servidor vacío, 3,2 GB con uno pequeño y 5,6 con uno grande, más lo que
 * sumen los jugadores. Avisa, nunca bloquea: el equipo es del usuario.
 */
export function MemoryNotice({ worldSize }: { worldSize: number }): React.JSX.Element | null {
  const [totalMb, setTotalMb] = useState<number | null>(null)

  useEffect(() => {
    void window.qubiq.system
      .memory()
      .then((m) => setTotalMb(m.totalMb))
      .catch(() => setTotalMb(null))
  }, [])

  if (totalMb === null) return null
  const totalGb = totalMb / 1024
  const needed = worldSizeInfo(worldSize)?.memoryGb ?? 5
  // Lo que usa el servidor más lo que necesita Windows y quien juegue en el
  // mismo equipo: por debajo del doble, va justo.
  if (totalGb >= Math.max(needed * 2, MEMORY_RECOMMENDED_GB)) return null
  const short = totalGb < needed + 2

  return (
    <div className={`alert ${short ? 'error' : 'warn'}`} style={{ textAlign: 'left' }}>
      <strong>
        {short
          ? t('rust.memory.short', { gb: Math.round(totalGb), needed: formatNumber(needed) })
          : t('sf.memory.tight', { gb: Math.round(totalGb) })}
      </strong>
      <p>
        {short ? t('rust.memory.shortText') : t('rust.memory.tightText')} {t('rust.memory.closeApps')}
      </p>
    </div>
  )
}
