import { parseVdf, vdfGet, type VdfValue } from '../formats/vdf'

/**
 * Interpretación de lo que escribe SteamCMD. Funciones puras, probadas en el
 * smoke contra salidas reales grabadas (scripts/smoke/fixtures/steam).
 *
 * Lo aprendido en el prototipo (ANALISIS.md §19.14):
 * - Las líneas de estado general salen **traducidas** al idioma de Windows
 *   ("Buscando actualizaciones disponibles..."). No se interpreta nada de eso.
 *   Lo que sí sale siempre en inglés, y es lo único que se lee, son las líneas
 *   `Update state (...) ..., progress: ...`, `Success! App ...` y `ERROR! ...`.
 * - Por una tubería, la salida llega **toda al final**: SteamCMD no vacía el
 *   búfer. El progreso en vivo se lee de `logs/console_log.txt`, que sí se
 *   escribe cada ~2 s con las mismas líneas y la hora delante.
 * - El código de salida no basta: 8 vale igual para "Missing configuration"
 *   (pasajero, se arregla reintentando) que para "No subscription" (permanente).
 *   Y la primera ejecución sale con 7 tras autoactualizarse, sin haber fallado.
 */

export type SteamCmdPhase =
  | 'preparing'
  | 'preallocating'
  | 'downloading'
  | 'verifying'
  | 'committing'
  | 'other'

export interface SteamCmdProgress {
  stateCode: number
  phase: SteamCmdPhase
  /** 0..1 dentro de la fase. */
  fraction: number
  done: number
  total: number
}

const PROGRESS = /Update state \(0x([0-9a-f]+)\) ([a-z ]+), progress: ([\d.]+) \((\d+) \/ (\d+)\)/i

export function parseProgressLine(line: string): SteamCmdProgress | null {
  const match = PROGRESS.exec(line)
  if (!match) return null
  const name = match[2].trim().toLowerCase()
  const phase: SteamCmdPhase = name.startsWith('download')
    ? 'downloading'
    : name.startsWith('verif')
      ? 'verifying'
      : name.startsWith('commit')
        ? 'committing'
        : name.startsWith('prealloc')
          ? 'preallocating'
          : name.startsWith('reconfig')
            ? 'preparing'
            : 'other'
  const done = Number(match[4])
  const total = Number(match[5])
  return {
    stateCode: parseInt(match[1], 16),
    phase,
    fraction: total > 0 ? Math.min(1, done / total) : 0,
    done,
    total
  }
}

export const PHASE_LABELS: Record<SteamCmdPhase, string> = {
  preparing: 'Preparando la descarga',
  preallocating: 'Reservando espacio en disco',
  downloading: 'Descargando',
  verifying: 'Comprobando los ficheros',
  committing: 'Aplicando la instalación',
  other: 'Instalando'
}

export interface SteamCmdError {
  /** El motivo tal como lo da Steam, en inglés. */
  reason: string
  /** Se arregla repitiendo la misma orden. */
  retryable: boolean
  /** Explicación para el usuario. */
  message: string
}

export interface SteamCmdOutcome {
  ok: boolean
  alreadyUpToDate: boolean
  /** SteamCMD se ha actualizado a sí mismo y hay que repetir la orden. */
  selfUpdated: boolean
  error?: SteamCmdError
}

/** Motivos pasajeros: la misma orden funciona al repetirla. */
const RETRYABLE = [/missing configuration/i, /no connection/i, /timeout/i, /service unavailable/i, /rate limit/i]

function explain(reason: string): string {
  if (/no subscription/i.test(reason)) {
    return 'Steam no permite descargar este servidor sin iniciar sesión con una cuenta.'
  }
  if (/disk|space/i.test(reason)) {
    return 'No hay espacio suficiente en el disco para instalar el servidor.'
  }
  if (/no connection|timeout|service unavailable/i.test(reason)) {
    return 'No se pudo conectar con Steam. Revisa la conexión a internet y vuelve a intentarlo.'
  }
  if (/missing configuration/i.test(reason)) {
    return 'Steam no llegó a enviar los datos del servidor. Vuelve a intentarlo en unos minutos.'
  }
  return `Steam no pudo instalar el servidor (${reason}).`
}

export function interpretRun(stdout: string, exitCode: number | null): SteamCmdOutcome {
  const success = /Success! App '\d+' (fully installed|already up to date)/i.exec(stdout)
  if (success) {
    return { ok: true, alreadyUpToDate: /already up to date/i.test(success[1]), selfUpdated: false }
  }

  const failure = /ERROR! Failed to install app '\d+' \(([^)]+)\)/i.exec(stdout)
  if (failure) {
    const reason = failure[1].trim()
    return {
      ok: false,
      alreadyUpToDate: false,
      selfUpdated: false,
      error: { reason, retryable: RETRYABLE.some((re) => re.test(reason)), message: explain(reason) }
    }
  }

  if (exitCode === 7 && /Update complete, launching/i.test(stdout)) {
    return { ok: false, alreadyUpToDate: false, selfUpdated: true }
  }

  // Estado raro de Steam al reconfigurar (cambiar de rama sin nada que bajar).
  // No sale por la vía de «ERROR! Failed to install», y volver a intentarlo lo
  // arregla, así que se marca como pasajero en vez de dar el error genérico.
  const state = /Error! App '\d+' state is 0x([0-9a-f]+) after update job/i.exec(stdout)
  if (state) {
    return {
      ok: false,
      alreadyUpToDate: false,
      selfUpdated: false,
      error: {
        reason: `state 0x${state[1]}`,
        retryable: true,
        message:
          'Steam dejó la instalación a medias al cambiar de versión. ' +
          'Vuelve a intentarlo: suele arreglarse solo.'
      }
    }
  }

  if (exitCode === 0) return { ok: true, alreadyUpToDate: false, selfUpdated: false }

  return {
    ok: false,
    alreadyUpToDate: false,
    selfUpdated: false,
    error: {
      reason: `exit ${exitCode}`,
      retryable: false,
      message:
        `SteamCMD terminó con un error (código ${exitCode}). Si tienes antivirus, ` +
        'comprueba que no lo esté bloqueando.'
    }
  }
}

/** Build instalado, según el `appmanifest_<appId>.acf` que deja SteamCMD. */
export function buildIdFromManifest(acfText: string): string | null {
  const value = vdfGet(parseVdf(acfText), 'AppState', 'buildid')
  return typeof value === 'string' ? value : null
}

/** Build publicado en una rama, según la salida de `app_info_print`. */
export function buildIdFromAppInfo(stdout: string, appId: number, branch = 'public'): string | null {
  const root = parseVdf(stdout)
  const app = vdfGet(root, String(appId))
  const value = vdfGet(findKey(app, 'branches'), branch, 'buildid')
  return typeof value === 'string' ? value : null
}

/** La rama por defecto de cualquier aplicación de Steam: la que juega todo el mundo. */
export const DEFAULT_BRANCH = 'public'

/** Una rama publicada por el estudio, tal como la declara Steam. */
export interface SteamBranch {
  name: string
  buildId: string
  /** El texto del estudio («Previous stable»), si lo pone. Solo en las que no son `public`. */
  description?: string
  /** Hace falta una clave para usarla, así que la app no la puede ofrecer. */
  needsPassword: boolean
  /** Cuándo se publicó, en segundos Unix. Sirve para ordenarlas. */
  timeUpdated: number
}

/**
 * Todas las ramas de una aplicación, según `app_info_print`.
 *
 * Es de donde sale «volver a una versión anterior»: Valheim publica media
 * docena de ramas antiguas con su descripción («Last stable build before
 * Ashlands»), y Satisfactory tiene `experimental` además de `public`.
 * Comprobado contra la salida real grabada en `fixtures/steam`.
 */
export function branchesFromAppInfo(stdout: string, appId: number): SteamBranch[] {
  const app = vdfGet(parseVdf(stdout), String(appId))
  const branches = findKey(app, 'branches')
  if (!branches || typeof branches === 'string') return []

  const result: SteamBranch[] = []
  for (const [name, node] of Object.entries(branches)) {
    if (!node || typeof node === 'string') continue
    const buildId = vdfGet(node, 'buildid')
    if (typeof buildId !== 'string') continue
    const description = vdfGet(node, 'description')
    result.push({
      name,
      buildId,
      // Steam mete tabuladores dentro de alguna descripción (Valheim lo hace).
      ...(typeof description === 'string' && description.trim()
        ? { description: description.trim() }
        : {}),
      needsPassword: vdfGet(node, 'pwdrequired') === '1',
      timeUpdated: Number(vdfGet(node, 'timeupdated') ?? 0)
    })
  }

  // La pública primero, y el resto de más reciente a más antigua: es el orden
  // en el que se busca («la de siempre» o «la de justo antes»).
  result.sort((a, b) => {
    if (a.name === DEFAULT_BRANCH) return -1
    if (b.name === DEFAULT_BRANCH) return 1
    return b.timeUpdated - a.timeUpdated
  })
  return result
}

/**
 * Rama instalada, según el `appmanifest_<appId>.acf`.
 *
 * Steam solo escribe `UserConfig.BetaKey` cuando se instaló con `-beta`; si no
 * está, es la pública. Hace falta saberlo para dos cosas: enseñar en qué rama
 * va el servidor, y validar los ficheros cuando se cambia de rama.
 */
export function branchFromManifest(acfText: string): string {
  // Se busca la clave esté donde esté y con las mayúsculas que sean: vive en
  // `UserConfig` o en `MountedConfig` según cómo se instalara.
  const value = findKey(parseVdf(acfText), 'betakey')
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BRANCH
}

function findKey(node: VdfValue | undefined, key: string): VdfValue | undefined {
  if (!node || typeof node === 'string') return undefined
  for (const [k, v] of Object.entries(node)) {
    if (k.toLowerCase() === key) return v
    const found = findKey(v, key)
    if (found) return found
  }
  return undefined
}
