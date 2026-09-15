import type { StopStrategy } from '../games/types'
import { sendCtrlBreak } from '../system/consoleSignal'
import { rconCommand } from '../net/rcon'
import { webRconCommand } from '../net/webrcon'

/**
 * Ejecuta la estrategia de parada de un juego. Solo PIDE el cierre: esperar a
 * que el proceso termine (y matarlo si no lo hace) es cosa del supervisor.
 */

export const DEFAULT_STOP_GRACE_MS = 60_000

export interface StopTarget {
  pid: number | undefined
  writeStdin(text: string): void
}

export async function requestStop(strategy: StopStrategy, target: StopTarget): Promise<void> {
  switch (strategy.kind) {
    case 'stdin':
      target.writeStdin(`${strategy.command}\n`)
      return
    case 'ctrl-break':
      if (!target.pid) throw new Error('El proceso del servidor no tiene PID.')
      await sendCtrlBreak(target.pid)
      return
    case 'rcon':
      await rconCommand(
        { host: strategy.host ?? '127.0.0.1', port: strategy.port, password: strategy.password },
        strategy.command
      )
      return
    case 'webrcon':
      await webRconCommand(
        { host: strategy.host ?? '127.0.0.1', port: strategy.port, password: strategy.password },
        strategy.command
      )
      return
    case 'api':
      await strategy.request()
      return
  }
}
