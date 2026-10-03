import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'

/**
 * El proceso de un servidor, visto desde el supervisor.
 *
 * Hay dos formas de tenerlo: lanzado directamente por la app (`DirectProcess`,
 * sus tuberías mueren con ella) o a través del guardián (`GuardedProcess`, en
 * `guardian/`), que sobrevive a la app y permite volver a conectarse. El
 * supervisor no distingue: lee líneas, escribe en la entrada y espera la
 * salida.
 *
 * Eventos:
 *  - `line` (texto, replay): una línea de su salida, normal o de error.
 *    `replay` es true en las que ya se vieron antes de cerrar la app.
 *  - `exit` (código o null): ha terminado. Se emite una sola vez.
 *  - `error` (Error): no se pudo lanzar. Le sigue `exit` con null.
 *  - `notice` (nivel, texto): algo que contar en la consola.
 */
export interface ServerProcess extends EventEmitter {
  /** PID del servidor (no el del guardián): a él va el Ctrl+Break. */
  readonly pid: number | undefined
  /** Cuándo arrancó. En un reenganche, de antes de abrir la app. */
  readonly startedAt: number
  writeStdin(text: string): void
  /** Cierre a la fuerza, con sus hijos si `tree`. Último recurso. */
  kill(tree: boolean): void
  /**
   * Para los que guardan lo que llega hasta que alguien escucha: el
   * supervisor lo llama después de suscribirse.
   */
  resume?(): void
}

export interface DirectOptions {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  verbatimArguments?: boolean
}

/** Lanzado por la app, como siempre. Sus tuberías mueren con ella. */
export class DirectProcess extends EventEmitter implements ServerProcess {
  readonly startedAt = Date.now()
  private readonly child

  constructor(options: DirectOptions) {
    super()
    this.child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true,
      windowsVerbatimArguments: options.verbatimArguments ?? false,
      // stdin abierto es imprescindible: es el canal de comandos y de parada.
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // Escribir en stdin justo cuando el proceso muere da EPIPE como evento; sin
    // oyente tumbaría la app entera. El cierre ya lo trata 'close'.
    this.child.stdin.on('error', () => undefined)

    createInterface({ input: this.child.stdout }).on('line', (line) => this.emit('line', line))
    createInterface({ input: this.child.stderr }).on('line', (line) => this.emit('line', line))

    let ended = false
    this.child.on('error', (err) => {
      this.emit('error', err)
      if (ended) return
      ended = true
      this.emit('exit', null)
    })
    this.child.on('close', (code) => {
      if (ended) return
      ended = true
      this.emit('exit', code)
    })
  }

  get pid(): number | undefined {
    return this.child.pid
  }

  writeStdin(text: string): void {
    this.child.stdin.write(text)
  }

  kill(tree: boolean): void {
    const pid = this.child.pid
    if (tree && pid) killTree(pid, () => this.child.kill())
    else this.child.kill()
  }
}

/**
 * Mata un proceso y todos sus hijos. Matar solo al primero no basta cuando ese
 * es cmd con un .bat: el servidor de verdad es su hijo y seguiría vivo con el
 * puerto y el mundo abiertos. Si taskkill no está, se hace lo que se pueda con
 * `fallback`.
 */
export function killTree(pid: number, fallback: () => void): void {
  const windowsDir = process.env['SystemRoot'] || process.env['windir']
  const taskkill = windowsDir ? join(windowsDir, 'System32', 'taskkill.exe') : 'taskkill.exe'
  const killer = spawn(taskkill, ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  killer.on('error', fallback)
  killer.on('close', (code) => {
    if (code !== 0) fallback()
  })
}

/** Mata un proceso que no es hijo nuestro (el servidor, tras un reenganche). */
export function killPid(pid: number): void {
  try {
    process.kill(pid)
  } catch {
    // Ya no existe.
  }
}

/** ¿Sigue vivo ese PID? */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: existe, pero es de otro usuario.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}
