import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RustManifest } from '@shared/types'
import { IDENTITY, consoleQuote, type RustAdmin, type RustBan } from '@shared/games/rust/types'
import { serverDir } from '../../paths'

/**
 * Los ficheros de configuración de Rust, dentro de `server/<identidad>/cfg`.
 *
 * Casi todo va por la línea de órdenes, que **manda sobre `server.cfg`**
 * (medido: con el nombre puesto en los dos sitios gana la línea de órdenes). Lo
 * que no se puede pasar por ahí es un número negativo: `+app.port -1` lo lee
 * como `1` —se come el guion— y deja algo escuchando en el puerto 1 (medido con
 * netstat). Por eso lo único que la app escribe en `server.cfg` es apagar Rust+,
 * y lo hace en un bloque propio al final, sin tocar lo que haya puesto el
 * usuario por encima.
 *
 * `users.cfg` (administradores) y `bans.cfg` (vetados) los escribe el propio
 * servidor con `server.writecfg`, y los lee al arrancar. Con el servidor en
 * marcha se modera por su consola; parado, editando estos ficheros.
 */

export function identityDir(id: string): string {
  return join(serverDir(id), 'server', IDENTITY)
}

export function cfgDir(id: string): string {
  return join(identityDir(id), 'cfg')
}

export const serverCfgPath = (id: string): string => join(cfgDir(id), 'server.cfg')
export const usersCfgPath = (id: string): string => join(cfgDir(id), 'users.cfg')
export const bansCfgPath = (id: string): string => join(cfgDir(id), 'bans.cfg')

/** Marca del bloque que gestiona la app dentro de `server.cfg`. */
export const MANAGED_MARK = '// --- QubiQ: desde aquí lo escribe la app en cada arranque. Lo de arriba es tuyo. ---'

/** Lo que va en el bloque de la app. */
export function managedBlock(manifest: RustManifest): string[] {
  // Rust+ se apaga con un puerto no válido, y solo se puede decir desde aquí
  // («Companion server port is invalid, cannot initialize companion server»).
  return manifest.data.rustPlus ? [] : ['app.port -1']
}

/**
 * Deja `server.cfg` con el bloque de la app al día y lo del usuario intacto.
 *
 * Todo lo que haya por encima de la marca se conserva tal cual; lo de debajo se
 * rehace. Si no había fichero, se crea solo con el bloque.
 */
export async function writeServerCfg(manifest: RustManifest): Promise<void> {
  const path = serverCfgPath(manifest.id)
  const current = await readFile(path, 'utf8').catch(() => '')
  const mark = current.indexOf(MANAGED_MARK)
  const user = (mark >= 0 ? current.slice(0, mark) : current).replace(/\s+$/, '')
  const block = managedBlock(manifest)
  const content = [user, user.length > 0 ? '' : null, MANAGED_MARK, ...block]
    .filter((line): line is string => line !== null)
    .join('\r\n')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${content}\r\n`, 'utf8')
}

// --- Administradores ------------------------------------------------------------

/**
 * `ownerid 76561197960287930 "Nombre" "motivo"`, una línea por persona. Es lo
 * que escribe `server.writecfg`; el motivo es opcional.
 */
const USER_LINE = /^\s*(ownerid|moderatorid)\s+(\d+)(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?/

export function parseUsersCfg(text: string): RustAdmin[] {
  const admins: RustAdmin[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = USER_LINE.exec(line)
    if (!match) continue
    admins.push({
      steamId: match[2]!,
      name: match[3] ?? '',
      level: match[1] === 'ownerid' ? 'owner' : 'moderator'
    })
  }
  return admins
}

export function serializeUsersCfg(admins: RustAdmin[]): string {
  return admins
    .map(
      (admin) =>
        `${admin.level === 'owner' ? 'ownerid' : 'moderatorid'} ${admin.steamId} ${consoleQuote(admin.name)} ${consoleQuote('QubiQ')}`
    )
    .map((line) => `${line}\r\n`)
    .join('')
}

export async function readAdmins(id: string): Promise<RustAdmin[]> {
  return parseUsersCfg(await readFile(usersCfgPath(id), 'utf8').catch(() => ''))
}

export async function writeAdmins(id: string, admins: RustAdmin[]): Promise<void> {
  await mkdir(cfgDir(id), { recursive: true })
  await writeFile(usersCfgPath(id), serializeUsersCfg(admins), 'utf8')
}

// --- Vetados ---------------------------------------------------------------------

/**
 * `banid 76561197960287930 "Nombre" "motivo" -1`: el último número es cuándo
 * caduca el veto (-1, nunca). Es la forma que devuelve `banlistex` sin el
 * número de orden delante (grabado), y la que escribe `server.writecfg`.
 */
const BAN_LINE = /^\s*(?:banid\s+|\d+\s+)(\d{5,})\s+"([^"]*)"\s+"([^"]*)"/

export function parseBans(text: string): RustBan[] {
  const bans: RustBan[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = BAN_LINE.exec(line)
    if (!match) continue
    bans.push({ steamId: match[1]!, name: match[2]!, reason: match[3]! })
  }
  return bans
}

export function serializeBansCfg(bans: RustBan[]): string {
  return bans
    .map((ban) => `banid ${ban.steamId} ${consoleQuote(ban.name)} ${consoleQuote(ban.reason)} -1\r\n`)
    .join('')
}

export async function readBansCfg(id: string): Promise<RustBan[]> {
  return parseBans(await readFile(bansCfgPath(id), 'utf8').catch(() => ''))
}

export async function writeBansCfg(id: string, bans: RustBan[]): Promise<void> {
  await mkdir(cfgDir(id), { recursive: true })
  await writeFile(bansCfgPath(id), serializeBansCfg(bans), 'utf8')
}
