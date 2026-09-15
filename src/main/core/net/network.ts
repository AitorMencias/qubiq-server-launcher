import { networkInterfaces } from 'node:os'
import { Socket } from 'node:net'
import { createSocket } from 'node:dgram'
import type { LocalAddress } from '@shared/types'
import type { PortProtocol } from '@shared/games'
import { USER_AGENT } from './http'

/**
 * Red y conectividad comunes a cualquier juego (§10): direcciones de la
 * máquina, puertos libres, puerta de enlace e IP pública.
 *
 * Cómo se pregunta a un servidor si está listo depende del juego (Minecraft usa
 * el Server List Ping), así que eso vive en `games/<juego>/`.
 */

/** Direcciones IPv4 de esta máquina, para jugar en la misma casa. */
export function localAddresses(): LocalAddress[] {
  const result: LocalAddress[] = []
  const interfaces = networkInterfaces()

  for (const [label, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      // Se descartan las redes virtuales de Docker/WSL/VirtualBox: aparecen
      // como IP válida pero ningún amigo puede conectarse por ahí.
      if (/^(vEthernet|Docker|VirtualBox|VMware|Loopback)/i.test(label)) continue
      result.push({ label, address: address.address })
    }
  }

  return result
}

/** Comprueba si algo está escuchando en el puerto, sin hablar el protocolo. */
export function isPortInUse(port: number, host = '127.0.0.1', timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false

    const finish = (inUse: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(inUse)
    }

    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
    socket.connect(port, host, () => finish(true))
  })
}

// --- Acceso desde internet (§10) --------------------------------------------

/**
 * IP del router (puerta de enlace por defecto), para poder enlazar a su panel
 * en la ayuda de apertura de puertos.
 *
 * Se saca de `route print`, cuya salida está traducida pero cuyas filas son
 * numéricas: el patrón busca solo cifras, así que funciona en cualquier idioma
 * de Windows. Node no expone la puerta de enlace por sí mismo.
 */
export async function defaultGateway(): Promise<string | null> {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)

    const { stdout } = await execFileAsync('route.exe', ['print', '-4', '0.0.0.0'], {
      windowsHide: true,
      timeout: 10_000
    })

    const match = /^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/m.exec(stdout)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * IP pública, consultando un servicio externo.
 *
 * ⚠ Contacta con un tercero, así que solo debe llamarse cuando el usuario pide
 * explícitamente comprobar el acceso desde internet (§10, nota de privacidad).
 */
export async function publicIp(timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      headers: { 'user-agent': USER_AGENT },
      signal: controller.signal
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ip?: string }
    return data.ip ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Primer puerto libre a partir del indicado, para resolver colisiones (§7). */
export async function findFreePort(start: number, attempts = 20): Promise<number> {
  for (let port = start; port < start + attempts; port++) {
    if (!(await isPortInUse(port))) return port
  }
  return start
}

/**
 * Comprueba si un puerto UDP está ocupado.
 *
 * En UDP no hay "conectar y ver si contesta". Intentar reservarlo no basta: un
 * servidor que abre su socket permitiendo compartirlo (Valheim lo hace) deja
 * que otro lo reserve encima sin error, y saldría "libre" estando en uso. Por
 * eso, si la reserva no falla, se confirma con la tabla de sockets del sistema.
 */
export async function isUdpPortInUse(port: number): Promise<boolean> {
  const bindFails = await new Promise<boolean>((resolve) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: false })
    socket.once('error', () => {
      socket.close()
      resolve(true)
    })
    socket.bind({ port, address: '0.0.0.0', exclusive: true }, () => {
      socket.close()
      resolve(false)
    })
  })
  if (bindFails) return true
  return (await udpPortsInUse()).has(port)
}

/** Puertos UDP abiertos según `netstat -an`. Las filas no se traducen. */
async function udpPortsInUse(): Promise<Set<number>> {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { stdout } = await promisify(execFile)(system32('netstat.exe'), ['-an', '-p', 'UDP'], {
      windowsHide: true,
      timeout: 10_000
    })
    const { stdout: v6 } = await promisify(execFile)(system32('netstat.exe'), ['-an', '-p', 'UDPv6'], {
      windowsHide: true,
      timeout: 10_000
    })
    return parseNetstatUdp(`${stdout}\n${v6}`)
  } catch {
    return new Set()
  }
}

/** `  UDP    0.0.0.0:2456    *:*` y `  UDP    [::]:2456    *:*`. */
export function parseNetstatUdp(stdout: string): Set<number> {
  const ports = new Set<number>()
  for (const match of stdout.matchAll(/^\s*UDP\s+(?:\[[^\]]*\]|[\d.]+):(\d+)\s/gm)) {
    ports.add(Number(match[1]))
  }
  return ports
}

function system32(exe: string): string {
  const windowsDir = process.env['SystemRoot'] || process.env['windir']
  return windowsDir ? `${windowsDir}\\System32\\${exe}` : exe
}

export async function isPortFree(port: number, protocol: PortProtocol): Promise<boolean> {
  if (protocol !== 'udp' && (await isPortInUse(port))) return false
  if (protocol !== 'tcp' && (await isUdpPortInUse(port))) return false
  return true
}

/**
 * Primer bloque de `span` puertos seguidos libres. Hay juegos que ocupan
 * varios contiguos (Valheim: el de juego y el siguiente para la consulta).
 */
export async function findFreePortBlock(
  start: number,
  protocol: PortProtocol,
  span = 1,
  attempts = 20
): Promise<number> {
  for (let base = start; base < start + attempts * span; base += span) {
    let free = true
    for (let port = base; port < base + span && free; port++) {
      free = await isPortFree(port, protocol)
    }
    if (free) return base
  }
  return start
}
