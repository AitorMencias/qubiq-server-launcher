import type { LogLine } from '@shared/types'

/**
 * Últimas líneas de la consola de cada servidor, numeradas.
 *
 * La consola de la app se la guarda la propia interfaz, que recibe cada línea
 * por evento. Quien pregunta desde fuera (el control remoto, §19.31) llega
 * más tarde y de vez en cuando: necesita pedir «lo que haya desde la línea N»,
 * y para eso el número tiene que crecer siempre, aunque las líneas viejas se
 * vayan descartando.
 */

export interface NumberedLine extends LogLine {
  seq: number
}

export const HISTORY_LINES = 500

export class ConsoleHistory {
  private readonly buffers = new Map<string, NumberedLine[]>()
  private readonly counters = new Map<string, number>()

  constructor(private readonly limit = HISTORY_LINES) {}

  push(id: string, line: LogLine): void {
    const seq = (this.counters.get(id) ?? 0) + 1
    this.counters.set(id, seq)
    let buffer = this.buffers.get(id)
    if (!buffer) {
      buffer = []
      this.buffers.set(id, buffer)
    }
    buffer.push({ ...line, seq })
    if (buffer.length > this.limit) buffer.splice(0, buffer.length - this.limit)
  }

  /**
   * Las líneas posteriores a `after`, como mucho `max` (las más recientes).
   * `next` es lo que hay que pedir la vez siguiente.
   */
  since(id: string, after = 0, max = this.limit): { lines: NumberedLine[]; next: number } {
    const buffer = this.buffers.get(id) ?? []
    const next = this.counters.get(id) ?? 0
    // Un `after` mayor que el contador es de una sesión anterior de la app (el
    // contador vuelve a 0 al reabrirla): se trata como si empezara de cero.
    const from = after > next ? 0 : after
    const lines = buffer.filter((line) => line.seq > from)
    return { lines: lines.slice(-max), next }
  }

  forget(id: string): void {
    this.buffers.delete(id)
    this.counters.delete(id)
  }
}
