/**
 * Filtro de ecos: para los servidores que escriben cada línea dos veces.
 *
 * Lo estrena Rust. Medido contra el servidor real: un tercio de sus líneas
 * salen dos veces, casi siempre seguidas y a veces con otra en medio, y nunca
 * con más de un segundo entre la línea y su copia. No es la tubería: en su
 * propio fichero de registro (`-logfile`) pasa exactamente igual.
 *
 * Cada línea absorbe **un solo** eco, así que dos guardados seguidos que dicen
 * lo mismo siguen saliendo los dos: lo que se tira es la copia, no la repetición.
 */

/** Cuánto y cuántas líneas atrás se busca el eco de una línea. */
const WINDOW_MS = 1_000
const WINDOW_LINES = 6

export class EchoFilter {
  private window: { text: string; at: number }[] = []

  /** true si la línea hay que enseñarla; false si es el eco de una reciente. */
  accept(raw: string, now = Date.now()): boolean {
    // Rust mete un BOM delante de alguna línea y no de su copia (medido).
    const text = raw.replace(/^﻿+/, '').trimEnd()
    this.window = this.window.filter((entry) => now - entry.at < WINDOW_MS)
    const index = this.window.findIndex((entry) => entry.text === text)
    if (index >= 0) {
      this.window.splice(index, 1)
      return false
    }
    this.window.push({ text, at: now })
    if (this.window.length > WINDOW_LINES) this.window.shift()
    return true
  }

  reset(): void {
    this.window = []
  }
}
