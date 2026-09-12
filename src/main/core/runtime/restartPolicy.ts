/**
 * Política anti-bucle para los reinicios que pide un plugin.
 *
 * Es una función pura y sin estado propio a propósito: así se puede probar en
 * `smoke` sin arrancar un servidor de verdad, que es donde este tipo de lógica
 * se rompe sin que nadie se entere.
 *
 * Un plugin que pidiera reiniciar en bucle dejaría al equipo arrancando
 * servidores sin parar. El límite corta esa situación y deja constancia, en vez
 * de confiar en que el plugin se porte bien.
 */

export const RESTART_WINDOW_MS = 10 * 60_000
export const RESTART_LIMIT = 5

export interface RestartDecision {
  allowed: boolean
  /** Marcas dentro de la ventana. Incluye `now` solo si se permite. */
  recent: number[]
}

/**
 * Descarta las marcas fuera de la ventana y decide si cabe otro reinicio.
 *
 * @param previous marcas de tiempo de los reinicios anteriores
 * @param now      momento del reinicio que se está evaluando
 */
export function evaluateRestart(previous: number[], now: number): RestartDecision {
  const recent = previous.filter((ts) => now - ts < RESTART_WINDOW_MS)

  if (recent.length >= RESTART_LIMIT) {
    // Se devuelven las marcas ya filtradas aunque se bloquee: si no, las
    // antiguas se acumularían para siempre.
    return { allowed: false, recent }
  }

  return { allowed: true, recent: [...recent, now] }
}
