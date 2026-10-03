import { MEMORY_MIN_GB, MEMORY_RECOMMENDED_GB } from '@shared/games/satisfactory/types'
import { t } from '../../i18n'

/**
 * Aviso de memoria de Satisfactory.
 *
 * Es el juego más exigente de los que gestiona la app junto a Rust, y enterarse
 * después de descargar 15 GB sería una faena. Avisa, nunca bloquea: el equipo
 * es del usuario y puede cerrar cosas o probar igualmente.
 */
export function MemoryNotice({
  totalMemoryMb,
  players
}: {
  totalMemoryMb: number | null
  players: number
}): React.JSX.Element | null {
  if (totalMemoryMb === null) return null

  const totalGb = totalMemoryMb / 1024
  // Con más de cuatro jugadores, el propio juego pide los 16 GB.
  const needed = players > 4 ? MEMORY_RECOMMENDED_GB : MEMORY_MIN_GB

  if (totalGb >= MEMORY_RECOMMENDED_GB) return null

  const short = totalGb < needed

  return (
    <div className={`alert ${short ? 'error' : 'warn'}`} style={{ textAlign: 'left' }}>
      <strong>
        {short
          ? t('sf.memory.short', { gb: Math.round(totalGb), needed })
          : t('sf.memory.tight', { gb: Math.round(totalGb) })}
      </strong>
      <p>
        {short ? t('sf.memory.shortText') : t('sf.memory.tightText')} {t('sf.memory.closeApps')}
      </p>
    </div>
  )
}
