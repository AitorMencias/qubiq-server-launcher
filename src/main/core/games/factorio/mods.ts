import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { download } from '../../net/downloader'
import { fetchJsonDirect } from '../../net/http'
import { dataDirFor } from './adapter'

/**
 * Mods de Factorio, del portal oficial.
 *
 * El portal (`mods.factorio.com`) deja **buscar y consultar sin credenciales**,
 * pero para descargar redirige al login y contesta 403: hace falta el usuario y
 * el token de factorio.com (comprobado en la fase 4). Esos dos datos los tiene
 * el propio juego en su `player-data.json`, así que la app puede pedir permiso
 * para usarlos en vez de pedir otra contraseña.
 *
 * Un aviso que la interfaz repite: **todos los que entren necesitan los mismos
 * mods**, y añadir o quitar uno cambia el checksum de prototipos del servidor.
 */

const PORTAL = 'https://mods.factorio.com'
const AUTH = 'https://auth.factorio.com'

export interface PortalCredentials {
  username: string
  token: string
}

/** Un mod tal como lo enseña el buscador. */
export interface ModSearchResult {
  name: string
  title: string
  owner: string
  summary: string
  downloadsCount: number
  /** Versión más nueva publicada y para qué Factorio va. */
  latestVersion: string | null
  factorioVersion: string | null
}

/** Un mod instalado en la carpeta del servidor. */
export interface InstalledMod {
  name: string
  version: string | null
  title: string | null
  enabled: boolean
  sizeBytes: number
}

interface PortalRelease {
  version: string
  download_url: string
  file_name: string
  sha1: string
  info_json?: { factorio_version?: string; dependencies?: string[] }
}

interface PortalMod {
  name: string
  title: string
  owner: string
  summary: string
  downloads_count: number
  releases?: PortalRelease[]
  latest_release?: PortalRelease
}

function modsDir(id: string): string {
  return join(dataDirFor(id), 'mods')
}

/**
 * El índice entero del portal, cacheado.
 *
 * ⚠ **La API del portal no sabe buscar por texto.** `q`, `query` y `search` se
 * ignoran —devuelven los 23.000 mods en orden alfabético— y `namelist` contesta
 * con un error 500 (comprobado en la fase 4). Lo que sí funciona es pedir el
 * índice completo, que son 13 MB y tarda un segundo y medio, y filtrar aquí.
 * Trae justo lo que hace falta: nombre, título, autor, resumen y descargas.
 */
let indexCache: { mods: PortalMod[]; at: number } | null = null
const INDEX_TTL_MS = 60 * 60 * 1000

async function loadIndex(): Promise<PortalMod[]> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.mods
  const data = await fetchJsonDirect<{ results: PortalMod[] }>(
    `${PORTAL}/api/mods?page_size=max`,
    60_000
  )
  indexCache = { mods: data.results ?? [], at: Date.now() }
  return indexCache.mods
}

/** Sin acentos y en minúsculas, para que «fabrica» encuentre «fábrica». */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Busca en el portal. Sin credenciales: esta parte es abierta.
 *
 * Ordena por descargas, que es lo que distingue un mod conocido de uno que
 * subió alguien ayer, y da preferencia al que se llama exactamente como lo
 * escrito.
 */
export async function searchMods(query: string, limit = 20): Promise<ModSearchResult[]> {
  const mods = await loadIndex()
  const q = normalize(query.trim())

  const candidatos = q.length === 0 ? mods : mods.filter((mod) => matches(mod, q))
  return candidatos
    .sort((a, b) => {
      const exacto = Number(normalize(b.name) === q) - Number(normalize(a.name) === q)
      return exacto !== 0 ? exacto : b.downloads_count - a.downloads_count
    })
    .slice(0, limit)
    .map((mod) => ({
      name: mod.name,
      title: mod.title,
      owner: mod.owner,
      summary: mod.summary,
      downloadsCount: mod.downloads_count,
      latestVersion: mod.latest_release?.version ?? null,
      factorioVersion: mod.latest_release?.info_json?.factorio_version ?? null
    }))
}

function matches(mod: PortalMod, q: string): boolean {
  return (
    normalize(mod.name).includes(q) ||
    normalize(mod.title).includes(q) ||
    normalize(mod.summary ?? '').includes(q)
  )
}

/**
 * La versión del mod que le sirve a un servidor.
 *
 * Se elige la más nueva que declare la misma serie de Factorio (2.1, 2.0…): una
 * versión para otra serie no carga, y el servidor se queda sin arrancar.
 */
export function pickRelease(releases: PortalRelease[], gameVersion?: string): PortalRelease | null {
  if (releases.length === 0) return null
  const serie = gameVersion ? gameVersion.split('.').slice(0, 2).join('.') : null
  const compatibles = serie
    ? releases.filter((r) => r.info_json?.factorio_version === serie)
    : releases
  const lista = compatibles.length > 0 ? compatibles : releases
  return lista[lista.length - 1] ?? null
}

/**
 * Descarga un mod y lo deja en la carpeta del servidor.
 *
 * La descarga se comprueba con el sha1 que publica el portal: un zip a medias
 * deja el servidor sin arrancar, y el error saldría al arrancar, no aquí.
 */
export async function installMod(
  id: string,
  modName: string,
  credentials: PortalCredentials,
  gameVersion?: string
): Promise<InstalledMod> {
  const mod = await fetchJsonDirect<PortalMod>(`${PORTAL}/api/mods/${encodeURIComponent(modName)}/full`)
  const release = pickRelease(mod.releases ?? [], gameVersion)
  if (!release) throw new Error(`El mod «${modName}» no tiene ninguna versión publicada.`)

  const url =
    `${PORTAL}${release.download_url}` +
    `?username=${encodeURIComponent(credentials.username)}&token=${encodeURIComponent(credentials.token)}`

  const destination = join(modsDir(id), release.file_name)
  await download({
    url,
    destination,
    expectedHash: { algorithm: 'sha1', value: release.sha1 }
  })

  await setModEnabled(id, mod.name, true)
  const info = await stat(destination)
  return {
    name: mod.name,
    version: release.version,
    title: mod.title,
    enabled: true,
    sizeBytes: info.size
  }
}

/** Los mods que hay en la carpeta del servidor, con si están encendidos. */
export async function listMods(id: string): Promise<InstalledMod[]> {
  const dir = modsDir(id)
  const enabled = await readModList(id)
  const mods: InstalledMod[] = []

  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.zip')) continue
    // Los zip del portal se llaman `nombre_version.zip`.
    const match = /^(.+)_(\d+\.\d+\.\d+)\.zip$/i.exec(entry.name)
    const name = match?.[1] ?? entry.name.replace(/\.zip$/i, '')
    const info = await stat(join(dir, entry.name))
    mods.push({
      name,
      version: match?.[2] ?? null,
      title: null,
      enabled: enabled[name] ?? true,
      sizeBytes: info.size
    })
  }
  return mods.sort((a, b) => a.name.localeCompare(b.name))
}

async function readModList(id: string): Promise<Record<string, boolean>> {
  try {
    const raw = JSON.parse(await readFile(join(modsDir(id), 'mod-list.json'), 'utf8')) as {
      mods?: { name: string; enabled: boolean }[]
    }
    return Object.fromEntries((raw.mods ?? []).map((m) => [m.name, m.enabled]))
  } catch {
    return {}
  }
}

/**
 * Enciende o apaga un mod.
 *
 * Es el mismo fichero con el que se enciende Space Age, así que hay que
 * conservar lo que ya haya: reescribirlo entero apagaría la expansión sin que
 * nadie lo haya pedido.
 */
export async function setModEnabled(id: string, name: string, enabled: boolean): Promise<void> {
  const path = join(modsDir(id), 'mod-list.json')
  let mods: { name: string; enabled: boolean }[] = []
  try {
    mods = (JSON.parse(await readFile(path, 'utf8')) as { mods?: typeof mods }).mods ?? []
  } catch {
    mods = [{ name: 'base', enabled: true }]
  }
  const existing = mods.find((m) => m.name === name)
  if (existing) existing.enabled = enabled
  else mods.push({ name, enabled })
  await writeFile(path, JSON.stringify({ mods }, null, 2), 'utf8')
}

export async function removeMod(id: string, name: string): Promise<void> {
  if (name === 'base') throw new Error('El mod base es el propio juego: no se puede quitar.')
  for (const entry of await readdir(modsDir(id)).catch(() => [])) {
    if (entry.toLowerCase().startsWith(`${name.toLowerCase()}_`) && entry.endsWith('.zip')) {
      await rm(join(modsDir(id), entry), { force: true })
    }
  }
  await setModEnabled(id, name, false)
}

/**
 * Credenciales de factorio.com sacadas de la sesión del propio juego.
 *
 * El juego guarda ahí su usuario y un token —no la contraseña—, que es
 * exactamente lo que pide el portal para descargar. Leerlo evita pedirle al
 * usuario otra contraseña, pero es un secreto suyo: **solo se lee cuando lo
 * pide expresamente desde la interfaz**, nunca por iniciativa de la app.
 */
export async function credentialsFromGame(): Promise<PortalCredentials | null> {
  const path = join(process.env['APPDATA'] ?? '', 'Factorio', 'player-data.json')
  try {
    const data = JSON.parse(await readFile(path, 'utf8')) as {
      'service-username'?: string
      'service-token'?: string
    }
    const username = data['service-username']
    const token = data['service-token']
    if (!username || !token) return null
    return { username, token }
  } catch {
    return null
  }
}

/**
 * Entra en factorio.com para conseguir un token.
 *
 * Es la alternativa a la sesión del juego, para quien no lo tenga instalado en
 * este equipo. La contraseña se usa aquí y no se guarda: lo que se conserva es
 * el token que devuelve el servicio.
 */
export async function loginToPortal(
  username: string,
  password: string
): Promise<PortalCredentials> {
  const body = new URLSearchParams({ username, password, api_version: '4' })
  const response = await fetch(`${AUTH}/api-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('factorio.com no acepta ese usuario y esa contraseña.')
    }
    throw new Error(`factorio.com contestó con un error (${response.status}).`)
  }
  const data = (await response.json()) as { token?: string; username?: string }
  if (!data.token) throw new Error('factorio.com no ha devuelto un token.')
  return { username: data.username ?? username, token: data.token }
}
