import { fetchJsonDirect } from './http'

/**
 * Comprobación desde internet para juegos de Steam: la alternativa a
 * mcstatus.io, que solo sabe de Minecraft.
 *
 * Un servidor dedicado de Steam se da de alta en el servidor maestro de Valve
 * con la IP pública desde la que conecta. `GetServersAtAddress` es público (sin
 * clave de API) y dice qué servidores hay registrados en una IP.
 *
 * ⚠ Qué demuestra y qué no:
 * - Registrado = Steam lo conoce y cualquiera puede verlo en el navegador de
 *   servidores. Eso descarta los fallos de arranque y de conexión con Steam.
 * - NO demuestra que se pueda entrar: el alta la hace el servidor hacia fuera,
 *   así que funciona aunque el router bloquee todo lo que entra. Hay que decirlo
 *   así en la interfaz, sin prometer más.
 * - Solo aparecen los servidores públicos. Uno marcado como privado (Valheim con
 *   `-public 0`) no sale nunca.
 *
 * Como sale de la máquina del usuario con su IP pública, solo se llama cuando el
 * usuario pulsa el botón, igual que la comprobación de Minecraft.
 */

export interface SteamRegisteredServer {
  /** Dirección de consulta, `ip:puerto`. */
  addr: string
  appId: number
  gameDir: string
  gamePort: number
  lan: boolean
  secure: boolean
}

interface ApiServer {
  addr: string
  appid: number
  gamedir: string
  gameport: number
  lan: boolean
  secure: boolean
}

interface ApiResponse {
  response: { success: boolean; servers?: ApiServer[]; message?: string }
}

const ENDPOINT = 'https://api.steampowered.com/ISteamApps/GetServersAtAddress/v0001/'

export function parseServersAtAddress(body: ApiResponse): SteamRegisteredServer[] {
  if (!body?.response?.success) {
    throw new Error(`Steam no pudo consultar la dirección: ${body?.response?.message ?? 'sin detalle'}`)
  }
  return (body.response.servers ?? []).map((s) => ({
    addr: s.addr,
    appId: s.appid,
    gameDir: s.gamedir,
    gamePort: s.gameport,
    lan: s.lan,
    secure: s.secure
  }))
}

export async function serversAtAddress(ip: string): Promise<SteamRegisteredServer[]> {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error(`IP no válida: ${ip}`)
  const body = await fetchJsonDirect<ApiResponse>(`${ENDPOINT}?addr=${ip}&format=json`, 15_000)
  return parseServersAtAddress(body)
}

export interface SteamRegistration {
  registered: boolean
  server?: SteamRegisteredServer
}

/** ¿Está este servidor (juego y puerto) dado de alta en Steam con esa IP? */
export async function steamRegistration(
  publicIp: string,
  appId: number,
  gamePort: number
): Promise<SteamRegistration> {
  const servers = await serversAtAddress(publicIp)
  const server = servers.find((s) => s.appId === appId && s.gamePort === gamePort)
  return server ? { registered: true, server } : { registered: false }
}
