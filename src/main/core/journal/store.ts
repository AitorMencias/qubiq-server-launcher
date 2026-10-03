import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JournalEntry } from '@shared/journal'
import { instanceDir } from '../paths'

/**
 * Dónde y cómo se guarda el historial de cada servidor.
 *
 * Una entrada por línea, en JSON, dentro de la carpeta de la instancia: así se
 * mueve con la carpeta de datos y se borra con el servidor sin hacer nada más.
 *
 * Se escribe **síncrono** a propósito. Son líneas cortas y pocas (entradas,
 * guardados, órdenes), y lo que más importa apuntar —que el servidor se ha
 * parado— pasa justo al cerrar la app, cuando una escritura asíncrona puede no
 * llegar a hacerse.
 */

const FILE = 'journal.jsonl'

/** A partir de aquí se recorta: ~1 MB son unas diez mil entradas. */
const MAX_BYTES = 1024 * 1024
/**
 * Lo que se conserva al recortar, de lo más reciente hacia atrás. La mitad, y
 * no justo el máximo: si no, a partir de ahí se recortaría en cada escritura.
 */
const KEEP_BYTES = MAX_BYTES / 2

export function journalPath(id: string): string {
  return join(instanceDir(id), FILE)
}

/**
 * Apunta una entrada. Nunca falla: el historial no puede romper lo que esté
 * haciendo el servidor.
 *
 * Si la carpeta de la instancia ya no existe (se acaba de borrar el servidor)
 * la escritura falla y no se apunta nada, que es lo correcto: no se vuelve a
 * crear una carpeta de un servidor borrado.
 */
export function appendJournal(id: string, entry: JournalEntry): void {
  const path = journalPath(id)
  try {
    appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8')
    if (statSync(path).size > MAX_BYTES) trim(path)
  } catch {
    // Sin carpeta o sin permiso: se pierde esta entrada y nada más.
  }
}

function trim(path: string): void {
  const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0)
  const kept: string[] = []
  let bytes = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    bytes += Buffer.byteLength(lines[i]!, 'utf8') + 1
    if (bytes > KEEP_BYTES) break
    kept.push(lines[i]!)
  }
  writeFileSync(path, `${kept.reverse().join('\n')}\n`, 'utf8')
}

/** Las últimas `limit` entradas, de la más reciente a la más antigua. */
export async function readJournal(id: string, limit: number): Promise<JournalEntry[]> {
  let raw: string
  try {
    raw = await readFile(journalPath(id), 'utf8')
  } catch {
    return []
  }

  const entries: JournalEntry[] = []
  const lines = raw.split('\n')
  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
    const entry = parseEntry(lines[i]!)
    if (entry) entries.push(entry)
  }
  return entries
}

/**
 * Una línea que no se entiende se salta: puede ser una escritura cortada por un
 * apagón o una entrada de una versión más nueva de la app.
 */
function parseEntry(line: string): JournalEntry | null {
  if (line.trim().length === 0) return null
  try {
    const value = JSON.parse(line) as Partial<JournalEntry> | null
    if (!value || typeof value.ts !== 'number' || typeof value.kind !== 'string') return null
    return KNOWN_KINDS.has(value.kind) ? (value as JournalEntry) : null
  } catch {
    return null
  }
}

const KNOWN_KINDS = new Set<string>([
  'join',
  'leave',
  'save',
  'backup',
  'restore',
  'moderation',
  'command',
  'start',
  'stop',
  'crash'
] satisfies JournalEntry['kind'][])
