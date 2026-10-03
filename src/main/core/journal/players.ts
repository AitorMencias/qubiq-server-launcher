import type { JournalInput } from '@shared/journal'

/**
 * Quién ha entrado y quién ha salido entre dos listas de jugadores.
 *
 * El supervisor no avisa de cambios, sino de la lista entera cada vez (es lo
 * que da Zomboid al preguntarle, y lo que se arma con el registro en los
 * demás). Comparar la de antes con la de ahora sirve igual para los dos casos.
 *
 * En los juegos que solo dicen cuántos hay (Satisfactory, Enshrouded) se
 * compara el número. Si entretanto el registro ha dado algún nombre (en
 * Satisfactory, «Join succeeded»), se aprovecha para las entradas.
 */

export interface PlayersSnapshot {
  names: string[]
  count: number | null
}

export function playerChanges(
  before: PlayersSnapshot,
  after: PlayersSnapshot,
  countOnly: boolean
): JournalInput[] {
  const newNames = after.names.filter((name) => !before.names.includes(name))

  if (countOnly) {
    const was = before.count ?? 0
    // Sin número todavía (la primera pregunta aún no ha vuelto) no hay cambio.
    if (after.count === null) return []
    const now = after.count
    const changes: JournalInput[] = []
    if (now > was) {
      for (let i = 0; i < now - was; i++) {
        const player = newNames[i]
        changes.push({ kind: 'join', ...(player ? { player } : {}), online: was + i + 1 })
      }
    } else {
      for (let i = 0; i < was - now; i++) changes.push({ kind: 'leave', online: was - i - 1 })
    }
    return changes
  }

  const gone = before.names.filter((name) => !after.names.includes(name))
  const changes: JournalInput[] = []
  // Primero las salidas: si alguien sale y otro entra en la misma pasada, el
  // número de dentro que se apunta en cada una cuadra así.
  let online = before.names.length
  for (const player of gone) changes.push({ kind: 'leave', player, online: --online })
  for (const player of newNames) changes.push({ kind: 'join', player, online: ++online })
  return changes
}
