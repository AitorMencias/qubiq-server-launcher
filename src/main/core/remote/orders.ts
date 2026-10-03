import type { InstanceState, LogLine } from '@shared/types'
import { capabilitiesFor } from '@shared/games'
import {
  CONTROL_ORDERS,
  LEVEL2_COMMANDS,
  commandAllowed,
  maskAddresses,
  type RemoteArgs,
  type RemoteConsoleResult,
  type RemoteError,
  type RemoteListResult,
  type RemoteOrder,
  type RemotePermissions
} from '@shared/remote'

/**
 * La tabla de órdenes del control remoto (§19.31).
 *
 * ⚠ Esto es TODO lo que se puede hacer desde fuera. No hay un «llamar a lo que
 * sea del servicio»: cada orden es un caso de este `switch`, con sus datos
 * comprobados. Añadir una es una decisión de seguridad, no una línea más.
 */

/** Lo que las órdenes necesitan del núcleo. En la app es el servicio; en el smoke, uno falso. */
export interface OrderHost {
  hostName(): string
  list(): Promise<InstanceState[]>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  restart(id: string): Promise<void>
  sendCommand(id: string, command: string): Promise<void>
  consoleSince(id: string, after?: number, max?: number): { lines: (LogLine & { seq: number })[]; next: number }
}

export interface OrderDevice {
  name: string
  permissions: RemotePermissions
}

/** Un «no» de una orden, con su código para que el otro lado lo traduzca. */
export class OrderRefused extends Error {
  constructor(
    readonly code: RemoteError,
    detail?: string
  ) {
    super(detail ?? code)
  }
}

/** Líneas de consola por petición, como mucho. */
export const CONSOLE_PAGE = 200
/** Longitud máxima de un comando. */
export const MAX_COMMAND = 500
/**
 * Lo que se espera a una orden lenta antes de contestar «hecho». Parar Rust o
 * un Minecraft grande lleva más que una petición HTTP razonable: si no ha
 * fallado en este tiempo, sigue sola y el estado se ve en la lista.
 */
export const ORDER_WAIT_MS = 8_000

export async function runOrder(
  host: OrderHost,
  device: OrderDevice,
  order: RemoteOrder,
  args: RemoteArgs
): Promise<unknown> {
  if (order === 'list') return listResult(host, device)

  const server = await findServer(host, device, args.server)

  if (CONTROL_ORDERS.includes(order) && !device.permissions.control) {
    throw new OrderRefused('forbidden')
  }

  switch (order) {
    case 'start':
      if (server.status === 'running' || server.status === 'starting') {
        throw new OrderRefused('already-running')
      }
      if (server.status === 'installing' || server.status === 'stopping') throw new OrderRefused('busy')
      await settle(host.start(server.manifest.id))
      return null

    case 'stop':
      if (server.status === 'installing') throw new OrderRefused('busy')
      if (server.status === 'stopped' || server.status === 'crashed') return null
      await settle(host.stop(server.manifest.id))
      return null

    case 'restart':
      if (server.status === 'installing' || server.status === 'stopping') throw new OrderRefused('busy')
      await settle(host.restart(server.manifest.id))
      return null

    case 'console': {
      const after = typeof args.after === 'number' && args.after >= 0 ? Math.floor(args.after) : 0
      const { lines, next } = host.consoleSince(server.manifest.id, after, CONSOLE_PAGE)
      const result: RemoteConsoleResult = {
        next,
        lines: lines.map((line) => ({
          seq: line.seq,
          ts: line.ts,
          level: line.level,
          text: maskAddresses(line.text)
        }))
      }
      return result
    }

    case 'send': {
      const command = typeof args.command === 'string' ? args.command.replace(/[\r\n]+/g, ' ').trim() : ''
      if (command.length === 0 || command.length > MAX_COMMAND) throw new OrderRefused('bad-request')
      if (device.permissions.console === 1) throw new OrderRefused('forbidden')
      if (!capabilitiesFor(server.manifest).commands) throw new OrderRefused('no-console')
      if (!commandAllowed(device.permissions.console, server.manifest.game, command)) {
        throw new OrderRefused('command-not-allowed')
      }
      if (server.status !== 'running' && server.status !== 'starting') {
        throw new OrderRefused('not-running')
      }
      await settle(host.sendCommand(server.manifest.id, command))
      return null
    }
  }
}

async function listResult(host: OrderHost, device: OrderDevice): Promise<RemoteListResult> {
  const states = await visibleServers(host, device)
  return {
    host: host.hostName(),
    device: device.name,
    permissions: device.permissions,
    allowedCommands: LEVEL2_COMMANDS,
    // Solo lo que hace falta para pintar la lista: el manifiesto lleva
    // contraseñas (de RCON, del propio servidor) que no tienen por qué salir.
    servers: states.map((state) => {
      const capabilities = capabilitiesFor(state.manifest)
      const running = state.status === 'running' || state.status === 'starting'
      return {
        id: state.manifest.id,
        name: state.manifest.name,
        game: state.manifest.game,
        status: state.status,
        players: running ? state.players : [],
        playerCount: running ? state.playerCount : null,
        playerIds: capabilities.playerIds,
        playerNames: capabilities.playerNames,
        commands: capabilities.commands
      }
    })
  }
}

/**
 * Los servidores que este dispositivo puede ver: los de su lista que existen.
 * Uno borrado sigue en la lista hasta que se edite, pero ya no sale.
 */
async function visibleServers(host: OrderHost, device: OrderDevice): Promise<InstanceState[]> {
  const allowed = new Set(device.permissions.servers)
  return (await host.list()).filter((state) => allowed.has(state.manifest.id))
}

/**
 * Busca el servidor entre los que el dispositivo puede ver. Un id que no
 * está es un error, nunca una ruta. Y uno que existe pero no es suyo da el
 * MISMO error que uno inventado: desde fuera no se sabe qué más hay.
 */
async function findServer(host: OrderHost, device: OrderDevice, id: unknown): Promise<InstanceState> {
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) throw new OrderRefused('bad-request')
  const server = (await visibleServers(host, device)).find((state) => state.manifest.id === id)
  if (!server) throw new OrderRefused('unknown-server')
  return server
}

/**
 * Espera a la orden hasta `ORDER_WAIT_MS`. Si falla antes, se cuenta como
 * fallo con el mensaje del núcleo; si sigue en marcha, se da por aceptada y
 * un fallo posterior se queda en la consola, como pasa con los botones.
 */
async function settle(work: Promise<void>): Promise<void> {
  // Que un fallo tardío no quede como promesa rechazada sin atender.
  work.catch(() => undefined)
  let timer: NodeJS.Timeout | undefined
  const waited = new Promise<'pending'>((resolve) => {
    timer = setTimeout(() => resolve('pending'), ORDER_WAIT_MS)
  })
  try {
    await Promise.race([work, waited])
  } catch (err) {
    throw new OrderRefused('failed', err instanceof Error ? err.message : String(err))
  } finally {
    clearTimeout(timer)
  }
}
