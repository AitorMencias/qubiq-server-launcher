import { MEMORY_MIN_GB, MEMORY_RECOMMENDED_GB } from '@shared/games/satisfactory/types'

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
          ? `Tu equipo tiene ${totalGb.toFixed(0)} GB de memoria y Satisfactory pide ${needed}`
          : `Tu equipo tiene ${totalGb.toFixed(0)} GB de memoria: irá justo`}
      </strong>
      <p>
        {short
          ? 'Puedes crearlo igualmente, pero es probable que vaya a tirones o que el servidor se cierre solo. '
          : 'Con partidas grandes o más de cuatro jugadores se recomiendan 16 GB. '}
        Cierra otros programas mientras juguéis, y ten en cuenta que jugar en este mismo equipo
        también consume lo suyo.
      </p>
    </div>
  )
}
