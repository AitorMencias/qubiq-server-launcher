/**
 * Defensas del control remoto que no son criptografía: números de uso único,
 * límites de frecuencia y bloqueo de direcciones que fallan demasiado.
 *
 * Todo en memoria. Reabrir la app lo olvida, y está bien: la ventana de tiempo
 * de las firmas (un minuto) es más corta que lo que tarda en reabrirse.
 */

/** Diferencia máxima entre el reloj del dispositivo y el del anfitrión. */
export const CLOCK_WINDOW_MS = 60_000
/** Más que el doble de la ventana: una firma vieja ya no pasa la hora. */
const NONCE_TTL_MS = 2 * CLOCK_WINDOW_MS + 10_000

export const LIMITS = {
  /** Fallos de autenticación por dirección antes de bloquearla. */
  failures: { max: 10, windowMs: 5 * 60_000 },
  blockMs: 15 * 60_000,
  /** Arrancar, parar y reiniciar, por dispositivo. */
  control: { max: 10, windowMs: 10 * 60_000 },
  /** Envíos a la consola, por dispositivo. */
  send: { max: 30, windowMs: 60_000 },
  /** Cualquier orden, por dispositivo (la página sondea cada pocos segundos). */
  any: { max: 300, windowMs: 60_000 }
} as const

export class NonceCache {
  private readonly seen = new Map<string, number>()

  /** False si ya se usó. Lo apunta si no. */
  use(key: string, now = Date.now()): boolean {
    this.prune(now)
    if (this.seen.has(key)) return false
    this.seen.set(key, now + NONCE_TTL_MS)
    return true
  }

  private prune(now: number): void {
    for (const [key, expires] of this.seen) {
      if (expires <= now) this.seen.delete(key)
    }
  }
}

/**
 * Claves que se recuerdan como mucho. Con escáneres que cambian de dirección,
 * cada una deja su entrada: sin tope, el mapa solo crecería.
 */
const MAX_KEYS = 5_000

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  /** True si cabe una más en la ventana. La apunta si cabe. */
  allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
    if (this.hits.size >= MAX_KEYS && !this.hits.has(key)) this.prune(now - windowMs)
    const recent = (this.hits.get(key) ?? []).filter((at) => at > now - windowMs)
    if (recent.length >= max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }

  clear(key: string): void {
    this.hits.delete(key)
  }

  get size(): number {
    return this.hits.size
  }

  /** Olvida las claves sin nada reciente; si aún sobran, las más antiguas. */
  private prune(before: number): void {
    for (const [key, times] of this.hits) {
      if ((times.at(-1) ?? 0) <= before) this.hits.delete(key)
    }
    for (const key of this.hits.keys()) {
      if (this.hits.size < MAX_KEYS) break
      this.hits.delete(key)
    }
  }
}

export class AddressGuard {
  private readonly failures = new RateLimiter()
  private readonly blocked = new Map<string, number>()

  isBlocked(address: string, now = Date.now()): boolean {
    const until = this.blocked.get(address)
    if (until === undefined) return false
    if (until > now) return true
    this.blocked.delete(address)
    return false
  }

  /** Apunta un fallo. True si con él la dirección queda bloqueada. */
  fail(address: string, now = Date.now()): boolean {
    const { max, windowMs } = LIMITS.failures
    if (this.failures.allow(address, max - 1, windowMs, now)) return false
    if (this.blocked.size >= MAX_KEYS) {
      for (const [key, until] of this.blocked) if (until <= now) this.blocked.delete(key)
    }
    this.blocked.set(address, now + LIMITS.blockMs)
    this.failures.clear(address)
    return true
  }
}
