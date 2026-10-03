/**
 * Frecuencia de las copias automáticas (§12).
 *
 * El manifiesto la guarda en `backup.intervalHours`, que admite fracciones
 * (5 minutos = 1/12). Se dejó así, en vez de cambiar a minutos, para no migrar
 * el manifiesto: una versión anterior de la app sigue entendiendo el campo.
 * Todo lo demás trabaja en minutos enteros con estas funciones.
 */

import type { BackupSettings, InstanceManifest } from './types'
import { t, type MessageKey } from './i18n'

/**
 * Menos de esto no se permite: cada copia pide guardar al servidor y comprime
 * el mundo entero, y según el juego eso se nota en la partida.
 */
export const MIN_BACKUP_MINUTES = 5
/** Una semana. Más no tiene sentido con el servidor arrancado. */
export const MAX_BACKUP_MINUTES = 7 * 24 * 60
/** Historial mínimo que se aconseja cubrir con las copias conservadas. */
export const RECOMMENDED_HISTORY_MINUTES = 3 * 60
/** Máximo de copias que se pueden conservar. */
export const MAX_BACKUP_KEEP = 100

export function intervalMinutes(backup: BackupSettings): number {
  return Math.round(backup.intervalHours * 60)
}

export function minutesToHours(minutes: number): number {
  return minutes / 60
}

/** Por qué no vale un intervalo, o null si vale. */
export function intervalProblem(minutes: number): string | null {
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes)) {
    return t('backup.problem.integer')
  }
  if (minutes < MIN_BACKUP_MINUTES) {
    return t('backup.problem.min', { min: MIN_BACKUP_MINUTES })
  }
  if (minutes > MAX_BACKUP_MINUTES) return t('backup.problem.max')
  return null
}

/**
 * Cada cuánto escribe la partida el propio servidor, si no se le puede pedir
 * que guarde cuando la app quiera. En esos juegos la copia espera a su guardado,
 * así que hacerlas más a menudo solo daría copias repetidas.
 */
export function gameSaveMinutes(manifest: InstanceManifest): number | null {
  switch (manifest.game) {
    case 'valheim':
      return Math.max(1, Math.round(manifest.data.saveIntervalSeconds / 60))
    case 'enshrouded':
      return 5 // Medido: guarda cada 5 minutos y no se le puede pedir antes.
    default:
      // Minecraft, Factorio, Zomboid, Satisfactory y Rust guardan cuando se les
      // pide (Rust con `server.save` por su consola remota).
      return null
  }
}

export interface IntervalRecommendation {
  minutes: number
  reason: string
}

const MB = 1024 * 1024
const GB = 1024 * MB

/**
 * Tramos por tamaño del mundo sin comprimir. Lo que cuesta una copia es
 * comprimir y escribir el mundo entero (y, en Minecraft, dejar de guardar
 * mientras tanto): con mundos pequeños es cosa de segundos y compensa hacerlas
 * a menudo; con uno de varios gigas cada copia es un rato de disco a tope.
 */
const SIZE_STEPS: { upTo: number; minutes: number }[] = [
  { upTo: 200 * MB, minutes: 15 },
  { upTo: 1 * GB, minutes: 30 },
  { upTo: 5 * GB, minutes: 60 },
  { upTo: 20 * GB, minutes: 180 },
  { upTo: Infinity, minutes: 360 }
]

/** Frecuencia aconsejada para este servidor, según su juego y lo que pesa su mundo. */
export function recommendedInterval(
  manifest: InstanceManifest,
  worldBytes: number
): IntervalRecommendation {
  const step = SIZE_STEPS.find((s) => worldBytes <= s.upTo) ?? SIZE_STEPS[SIZE_STEPS.length - 1]
  const bySize = step.minutes
  const sizeReason =
    worldBytes === 0
      ? t('backup.reason.empty')
      : bySize <= 30
        ? t('backup.reason.light')
        : t('backup.reason.heavy')

  const save = gameSaveMinutes(manifest)
  if (save !== null && save > bySize) {
    return {
      minutes: Math.max(save, MIN_BACKUP_MINUTES),
      reason: t('backup.reason.gameSaves', { interval: formatMinutes(save) })
    }
  }
  return { minutes: bySize, reason: sizeReason }
}

/** Copias necesarias para cubrir el historial aconsejado con este intervalo. */
export function keepForRecommendedHistory(minutes: number): number {
  return Math.min(MAX_BACKUP_KEEP, Math.ceil(RECOMMENDED_HISTORY_MINUTES / minutes))
}

/** Minutos a texto: 5 -> "5 minutos", 90 -> "1 h 30 min", 120 -> "2 horas". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return t('time.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return t('time.hours', { count: hours })
  return t('time.hoursMinutes', { h: hours, m: rest })
}

/** Tiempo largo a texto aproximado: 4320 -> "3 días". */
export function formatSpan(minutes: number): string {
  if (minutes < 24 * 60) return formatMinutes(minutes)
  const days = Math.round(minutes / (24 * 60))
  if (days < 7) return t('time.days', { count: days })
  const weeks = Math.round(days / 7)
  if (weeks < 5) return t('time.weeks', { count: weeks })
  const months = Math.round(days / 30)
  return t('time.months', { count: months })
}

/**
 * El motivo de una copia, en el idioma de la interfaz.
 *
 * El núcleo lo guarda dentro de la copia, en español (es un dato de la copia,
 * y las ya hechas lo tienen así). Aquí se reconocen los que escribe la app y
 * se traducen al enseñarlos; uno que no se reconozca se enseña tal cual.
 */
const REASONS: [RegExp, MessageKey][] = [
  [/^Copia manual$/, 'backup.why.manual'],
  [/^Copia programada$/, 'backup.why.scheduled'],
  [/^Copia previa a reinstalar$/, 'backup.why.reinstall'],
  [/^Copia previa a cambiar de versión$/, 'backup.why.version'],
  [/^Estado previo a restaurar (.+)$/, 'backup.why.restore'],
  [/^Copia previa a borrar el mundo (.+)$/, 'backup.why.deleteWorld'],
  [/^Copia previa a borrar "(.+)"$/, 'backup.why.deleteWorld'],
  [/^Antes de recuperar (.+)$/, 'backup.why.recover'],
  [/^Copia previa al borrado del mapa$/, 'backup.why.wipe'],
  [/^(?:Copia previa a actualizar|Antes de actualizar) (.+)$/, 'backup.why.update'],
  [/^Copia previa a crear la partida (.+)$/, 'backup.why.newSession'],
  [/^Copia previa a cargar (.+)$/, 'backup.why.load'],
  [/^Copia previa a borrar la partida (.+)$/, 'backup.why.deleteSession'],
  [/^Copia previa a cambiar las reglas de la partida$/, 'backup.why.rules'],
  [/^Antes de poner la dificultad (.+)$/, 'backup.why.preset']
]

export function backupReasonLabel(reason: string): string {
  for (const [pattern, key] of REASONS) {
    const match = pattern.exec(reason)
    if (match) return t(key, { name: match[1] ?? '' })
  }
  return reason
}
