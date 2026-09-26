import type { RustManifest } from '@shared/types'
import { rconPortFor, type RustPlayer } from '@shared/games/rust/types'
import { WebRconSession } from '../../net/webrconSession'

/**
 * La consola remota de Rust (WebRCON) y cómo leer lo que contesta.
 *
 * Todo lo de aquí sale de la grabación del servidor real
 * (`fixtures/rust/webrcon.json`), salvo lo marcado como sintético: con el
 * servidor vacío no se puede grabar un jugador dentro.
 *
 * ⚠ Siempre por **una sola conexión por servidor** (`WebRconSession`): Rust
 * admite cuatro por dirección y no suelta las cerradas, así que conectar para
 * cada orden lo dejaba sin consola en medio minuto (medido).
 */

const sessions = new Map<string, WebRconSession>()

function sessionFor(manifest: RustManifest): WebRconSession {
  const options = {
    host: '127.0.0.1',
    port: rconPortFor(manifest.port),
    password: manifest.data.rconPassword
  }
  const current = sessions.get(manifest.id)
  if (current?.matches(options)) return current
  // Otro puerto u otra contraseña: la anterior ya no sirve.
  current?.close()
  const session = new WebRconSession(options)
  sessions.set(manifest.id, session)
  return session
}

/** Una orden por WebRCON. Devuelve todo lo que conteste, unido por líneas. */
export function rustRcon(
  manifest: RustManifest,
  command: string,
  timeoutMs = 10_000
): Promise<string> {
  return sessionFor(manifest).command(command, { timeoutMs })
}

/** Cierra la sesión de un servidor, si la hay (al borrarlo o al pararlo). */
export function closeRustRcon(id: string): void {
  sessions.get(id)?.close()
  sessions.delete(id)
}

interface RawPlayer {
  SteamID?: string
  DisplayName?: string
  Ping?: number
  ConnectedSeconds?: number
}

/**
 * La respuesta de `playerlist`: un JSON con un objeto por jugador.
 *
 * Grabada con el servidor vacío (`[]`). La forma de cada jugador —`SteamID`,
 * `DisplayName`, `Ping`, `ConnectedSeconds`— es la documentada por Facepunch y
 * **no está grabada con alguien dentro**; por eso se lee con cuidado y lo que
 * no encaje se descarta en vez de romper la lista.
 */
export function parsePlayerList(answer: string): RustPlayer[] {
  let raw: unknown
  try {
    raw = JSON.parse(answer)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const players: RustPlayer[] = []
  for (const entry of raw as RawPlayer[]) {
    if (typeof entry?.SteamID !== 'string') continue
    players.push({
      steamId: entry.SteamID,
      name: typeof entry.DisplayName === 'string' && entry.DisplayName.length > 0 ? entry.DisplayName : entry.SteamID,
      ...(typeof entry.Ping === 'number' ? { ping: entry.Ping } : {}),
      ...(typeof entry.ConnectedSeconds === 'number' ? { connectedSeconds: entry.ConnectedSeconds } : {})
    })
  }
  return players
}

export interface RustServerInfo {
  hostname?: string
  players?: number
  maxPlayers?: number
  version?: string
  protocol?: string
  /** Memoria que dice usar el propio servidor, en MB. */
  memoryMb?: number
  framerate?: number
  uptimeSeconds?: number
}

/** La respuesta de `serverinfo`, que es un JSON (grabado). */
export function parseServerInfo(answer: string): RustServerInfo {
  try {
    const raw = JSON.parse(answer) as Record<string, unknown>
    const num = (key: string): number | undefined =>
      typeof raw[key] === 'number' ? (raw[key] as number) : undefined
    return {
      ...(typeof raw['Hostname'] === 'string' ? { hostname: raw['Hostname'] } : {}),
      ...(num('Players') !== undefined ? { players: num('Players') } : {}),
      ...(num('MaxPlayers') !== undefined ? { maxPlayers: num('MaxPlayers') } : {}),
      ...(num('Version') !== undefined ? { version: String(num('Version')) } : {}),
      ...(typeof raw['Protocol'] === 'string' ? { protocol: raw['Protocol'] } : {}),
      ...(num('MemoryUsageSystem') !== undefined ? { memoryMb: num('MemoryUsageSystem') } : {}),
      ...(num('Framerate') !== undefined ? { framerate: num('Framerate') } : {}),
      ...(num('Uptime') !== undefined ? { uptimeSeconds: num('Uptime') } : {})
    }
  } catch {
    return {}
  }
}

/**
 * Lo que dice la consulta de Steam en sus palabras clave (grabado):
 *
 *     mp4,cp0,ptrak,qp0,$r?,v2633,born1790427613,gmrust,cs165217,ts8,^o^z
 *
 * `v2633` es la versión de red, la que tiene que coincidir con la del juego de
 * quien entra; `born…` es cuándo nació el mapa (el último borrado); y `^o`
 * aparece solo con Oxide puesto: así sale el servidor marcado como modificado.
 */
export function parseKeywords(keywords: string | undefined): {
  version?: string
  bornAt?: string
  modded: boolean
} {
  const parts = (keywords ?? '').split(',')
  const version = parts.find((p) => /^v\d+$/.test(p))?.slice(1)
  const born = parts.find((p) => /^born\d+$/.test(p))
  return {
    ...(version ? { version } : {}),
    ...(born ? { bornAt: new Date(Number(born.slice(4)) * 1000).toISOString() } : {}),
    modded: parts.some((p) => p.includes('^o'))
  }
}
