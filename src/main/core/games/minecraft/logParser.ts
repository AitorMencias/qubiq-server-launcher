import type { Diagnosis, LogLevel } from '@shared/types'
import type { ParsedEvent } from '../types'

/**
 * Traducción del log de un servidor de Minecraft a eventos y a mensajes
 * humanos (§7).
 *
 * El formato `[HH:mm:ss] [Server thread/INFO]: ...` es estable, pero frágil
 * como API: es texto pensado para leerse, no para parsearse. Por eso cada
 * patrón se trata como "mejor esfuerzo" y nunca se asume que casará.
 */

/**
 * Cada distribución usa un formato de cabecera DISTINTO. Los tres comprobados
 * contra servidores reales:
 *
 *   Vanilla:  [12:39:44] [Server thread/INFO]: mensaje
 *   Paper:    [12:39:44 INFO]: mensaje
 *   Forge:    [12:41:26] [main/INFO] [cp.mo.mo.Launcher/MODLAUNCHER]: mensaje
 *
 * Forge añade un tercer grupo de corchetes, así que la cabecera se trata como
 * "hora + uno o más bloques [..]". Soportar un solo formato deja la app ciega:
 * no detecta el arranque ni las entradas de jugadores en las otras dos.
 */

/** Hora entre corchetes seguida de uno o más bloques [..] y dos puntos. */
const BRACKETED_RE = /^\[(\d{2}:\d{2}:\d{2})\]((?:\s*\[[^\]]*\])+):\s*([\s\S]*)$/
/** Estilo Paper: hora y nivel en el mismo bloque. */
const COMPACT_RE = /^\[(\d{2}:\d{2}:\d{2})\s+([A-Z]+)\]:\s*([\s\S]*)$/

function splitHeader(line: string): { level: LogLevel; body: string } | null {
  const bracketed = BRACKETED_RE.exec(line)
  if (bracketed) {
    // El nivel va siempre en el PRIMER bloque ("Server thread/INFO").
    // Los siguientes son la clase o el subsistema y no deben influir: hay
    // clases cuyo nombre contiene "WARN" y falsearían el nivel.
    const firstTag = /\[([^\]]*)\]/.exec(bracketed[2]!)?.[1] ?? ''
    return { level: levelFrom(firstTag), body: bracketed[3]! }
  }

  const compact = COMPACT_RE.exec(line)
  if (compact) {
    return { level: levelFrom(compact[2]!), body: compact[3]! }
  }

  return null
}

function levelFrom(thread: string): LogLevel {
  const upper = thread.toUpperCase()
  if (upper.includes('ERROR') || upper.includes('FATAL')) return 'error'
  if (upper.includes('WARN')) return 'warn'
  return 'info'
}

export function parseLine(raw: string): ParsedEvent {
  const line = raw.replace(/\r$/, '')
  const header = splitHeader(line)
  const body = header?.body ?? line
  const level: LogLevel = header?.level ?? 'system'

  const event: ParsedEvent = { level, text: line }

  // Servidor listo: el evento que la interfaz espera para habilitar acciones.
  if (/^Done \([^)]+\)! For help, type "help"/.test(body)) {
    event.ready = true
    return event
  }

  const joined = /^([A-Za-z0-9_.]{1,32}) joined the game$/.exec(body)
  if (joined) {
    event.playerJoined = joined[1]
    return event
  }

  const left = /^([A-Za-z0-9_.]{1,32}) left the game$/.exec(body)
  if (left) {
    event.playerLeft = left[1]
    return event
  }

  const chat = /^<([A-Za-z0-9_.]{1,32})>\s(.*)$/.exec(body)
  if (chat) {
    event.level = 'chat'
    event.chat = { player: chat[1]!, message: chat[2]! }
    return event
  }

  // Lo que hace una orden lanzada por un operador desde dentro del juego sale
  // entre corchetes y con su nombre delante: «[Steve: Kicked Alex: …]».
  const byPlayer = /^\[([A-Za-z0-9_.]{1,32}): (.*)\]$/.exec(body)
  const said = byPlayer ? byPlayer[2]! : body

  if (SAVED_RE.test(said)) {
    event.saved = true
    return event
  }

  const moderation = parseModeration(said)
  if (moderation) {
    event.moderation = byPlayer ? { ...moderation, by: byPlayer[1]! } : moderation
    return event
  }

  const diagnosis = diagnose(line)
  if (diagnosis) {
    event.diagnosis = diagnosis
    event.level = 'error'
  }

  return event
}

/**
 * El servidor ha guardado: la respuesta a `save-all` (varía entre versiones y
 * distribuciones: «Saved the game», «the world» o «the chunks») y el guardado
 * del cierre, que Vanilla cuenta con «All dimensions are saved» y Paper 26
 * con una línea de `ChunkHolderManager` por dimensión (medido: no siempre
 * escribe la de Vanilla). El servicio junta las que llegan seguidas. El
 * guardado automático de Vanilla y Paper no dice nada, así que ese no se ve.
 */
const SAVED_RE =
  /^Saved the (game|world|chunks)|All dimensions are saved$|^\[ChunkHolderManager\] Saved \d+ block chunks/i

/**
 * Las respuestas de las órdenes de moderación de Vanilla (Paper usa las
 * mismas). El registro va siempre en inglés, sea cual sea el idioma del juego.
 * Los vetos por IP no se apuntan: el historial no guarda direcciones.
 */
const MODERATION_LINES: [RegExp, NonNullable<ParsedEvent['moderation']>['action']][] = [
  [/^Kicked ([A-Za-z0-9_.]{1,32}): (.+)$/, 'kick'],
  [/^Banned ([A-Za-z0-9_.]{1,32}): (.+)$/, 'ban'],
  [/^Unbanned ([A-Za-z0-9_.]{1,32})$/, 'unban'],
  [/^Made ([A-Za-z0-9_.]{1,32}) a server operator$/, 'admin'],
  [/^Made ([A-Za-z0-9_.]{1,32}) no longer a server operator$/, 'unadmin'],
  [/^Added ([A-Za-z0-9_.]{1,32}) to the whitelist$/, 'whitelist'],
  [/^Removed ([A-Za-z0-9_.]{1,32}) from the whitelist$/, 'unwhitelist']
]

function parseModeration(text: string): ParsedEvent['moderation'] | null {
  for (const [pattern, action] of MODERATION_LINES) {
    const match = pattern.exec(text)
    if (!match) continue
    const reason = match[2]?.trim()
    return { action, player: match[1]!, ...(reason ? { reason } : {}) }
  }
  return null
}

/**
 * Catálogo de errores traducidos (§7).
 * Cada entrada convierte un síntoma técnico en un mensaje accionable.
 */
export function diagnose(line: string): Diagnosis | null {
  if (/FAILED TO BIND TO PORT/i.test(line)) {
    return {
      code: 'port-in-use',
      title: 'Ese puerto ya está ocupado',
      detail:
        'Otro programa (o quizá otro servidor tuyo ya arrancado) está usando el puerto. ' +
        'Puedes cambiarlo y volver a intentarlo.',
      action: { kind: 'change-port' }
    }
  }

  if (/UnsupportedClassVersionError|has been compiled by a more recent version/i.test(line)) {
    return {
      code: 'java-too-old',
      title: 'Esta versión necesita un Java más nuevo',
      detail:
        'El servidor se compiló con una versión de Java superior a la que se está usando. ' +
        'Podemos descargar la correcta automáticamente.',
      action: { kind: 'install-java' }
    }
  }

  if (/java\.lang\.OutOfMemoryError/i.test(line)) {
    return {
      code: 'out-of-memory',
      title: 'El servidor se quedó sin memoria',
      detail:
        'Con la RAM asignada actualmente no le llega. Subirla suele resolverlo, ' +
        'siempre que tu equipo tenga margen.',
      action: { kind: 'set-memory' }
    }
  }

  if (/You need to agree to the EULA/i.test(line)) {
    return {
      code: 'eula',
      title: 'Falta aceptar el EULA de Minecraft',
      detail:
        'Mojang exige aceptar sus condiciones antes de ejecutar un servidor. ' +
        'Solo hay que confirmarlo una vez por servidor.',
      action: { kind: 'accept-eula' }
    }
  }

  if (/Address already in use/i.test(line)) {
    return {
      code: 'port-in-use',
      title: 'Ese puerto ya está ocupado',
      detail: 'Otro programa está usando el mismo puerto.',
      action: { kind: 'change-port' }
    }
  }

  return null
}

/**
 * Diagnóstico a partir de una salida completa cuando el proceso muere sin
 * haber emitido un patrón reconocible. Devuelve las últimas líneas útiles.
 */
export function diagnoseExit(exitCode: number | null, recentLines: string[]): Diagnosis {
  for (const line of recentLines) {
    const found = diagnose(line)
    if (found) return found
  }

  const tail = recentLines.slice(-6).join('\n').trim()
  return {
    code: 'unknown-exit',
    title: 'El servidor se cerró inesperadamente',
    detail:
      tail.length > 0
        ? `Código de salida ${exitCode}. Últimas líneas del registro:\n${tail}`
        : `Código de salida ${exitCode}. No hubo mensajes en el registro.`
  }
}
