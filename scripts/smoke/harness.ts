import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Arnés de la prueba de humo: comprobaciones, secciones y recuento final.
 * Lo comparten las pruebas comunes y las de cada juego.
 */

export const execFileAsync = promisify(execFile)

let passed = 0
let failed = 0
const unreachable: string[] = []

export function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

/**
 * ¿El error es que no se pudo llegar al servicio, y no que respondiera algo
 * distinto de lo esperado?
 *
 * La diferencia importa: esta prueba existe para detectar que una API ha
 * cambiado, y un servicio inalcanzable no dice nada de eso. Pasa de verdad: los
 * operadores españoles bloquean IPs compartidas de Cloudflare durante los
 * partidos de LaLiga, y con ellas cae, por ejemplo, meta.fabricmc.net.
 */
function connectionProblem(err: unknown): string | null {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'tiempo de espera agotado'
  const codes = [
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND',
    'EAI_AGAIN', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH'
  ]
  if (e?.cause?.code && codes.includes(e.cause.code)) return e.cause.message ?? e.cause.code
  if (e?.message === 'fetch failed') return e.cause?.message ?? 'fetch failed'
  return null
}

export async function section(title: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n== ${title}`)
  try {
    await fn()
  } catch (err) {
    const offline = connectionProblem(err)
    if (offline) {
      unreachable.push(title)
      console.error(`  SIN CONEXIÓN ${title}: no se pudo llegar al servicio (${offline})`)
      return
    }
    failed++
    console.error(`  FAIL ${title} lanzó una excepción: ${(err as Error).message}`)
  }
}

/** Imprime el recuento y fija el código de salida. */
export function finish(): void {
  console.log(
    `\n${passed} correctas, ${failed} fallidas` +
      (unreachable.length > 0 ? `, ${unreachable.length} sin conexión (${unreachable.join(', ')})` : '')
  )
  // 1 = algo ha fallado de verdad. 2 = todo lo que se pudo comprobar está bien,
  // pero hay servicios a los que no se llegó: no es un fallo, pero tampoco un OK.
  if (failed > 0) process.exitCode = 1
  else if (unreachable.length > 0) process.exitCode = 2
}
