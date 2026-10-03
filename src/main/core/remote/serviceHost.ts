import { hostname } from 'node:os'
import { service } from '../service'
import type { OrderHost } from './orders'

/** Las órdenes remotas contra el servicio de verdad. */
export function serviceOrderHost(): OrderHost {
  return {
    hostName: () => hostname(),
    list: () => service.list(),
    start: (id, by) => service.start(id, { by }),
    stop: (id, by) => service.stop(id, { by }),
    restart: (id, by) => service.restart(id, { by }),
    sendCommand: (id, command, by) => service.sendCommand(id, command, { by }),
    consoleSince: (id, after, max) => service.consoleSince(id, after, max),
    journal: (id, limit) => service.listJournal(id, limit)
  }
}
