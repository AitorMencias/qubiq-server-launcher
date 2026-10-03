import { hostname } from 'node:os'
import { service } from '../service'
import type { OrderHost } from './orders'

/** Las órdenes remotas contra el servicio de verdad. */
export function serviceOrderHost(): OrderHost {
  return {
    hostName: () => hostname(),
    list: () => service.list(),
    start: (id) => service.start(id),
    stop: (id) => service.stop(id),
    restart: (id) => service.restart(id),
    sendCommand: (id, command) => service.sendCommand(id, command),
    consoleSince: (id, after, max) => service.consoleSince(id, after, max)
  }
}
