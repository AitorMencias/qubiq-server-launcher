import { request } from 'node:https'
import { connect } from 'node:tls'
import type {
  NewGameRequest,
  SatisfactorySave,
  SatisfactorySessions,
  SatisfactoryState
} from '@shared/games/satisfactory/types'

/**
 * La API HTTPS del servidor dedicado de Satisfactory.
 *
 * Es la única forma de hablar con él: no lee órdenes por la consola. Todo va
 * por POST a `/api/v1` en el MISMO puerto del juego (7777 TCP), con un cuerpo
 * `{ function, data }` y un token en la cabecera `Authorization`.
 *
 * ⚠ **Certificado autofirmado.** El servidor se genera el suyo al arrancar
 * (CN=FactoryGame), así que no hay autoridad que lo valide y se acepta sin
 * verificar. Se puede porque la app solo habla con el servidor que ella misma
 * ha lanzado en esta máquina (`127.0.0.1`): no se acepta ningún certificado de
 * un servidor remoto, ni se manda el token fuera del equipo.
 *
 * Verificado contra el servidor real en la fase 2 (ANALISIS.md §19.15).
 */

/** Por dónde se le habla: siempre local, porque es el que arranca la app. */
export interface ApiTarget {
  port: number
  token?: string
}

const HOST = '127.0.0.1'
const DEFAULT_TIMEOUT_MS = 20_000

export class SatisfactoryApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'SatisfactoryApiError'
  }
}

interface RawResponse {
  status: number
  body: string
}

/**
 * Códigos de la API traducidos. Los que no estén salen con su mensaje original:
 * vale más un texto en inglés que un «error desconocido».
 */
const ERROR_MESSAGES: Record<string, string> = {
  passwordless_login_not_possible:
    'Este servidor ya está reclamado: hace falta la contraseña de administrador.',
  invalid_password: 'La contraseña de administrador no es la de este servidor.',
  insufficient_scope: 'La app no tiene permisos suficientes en este servidor.',
  invalid_token: 'La sesión con el servidor ha caducado. Se volverá a entrar sola.',
  server_not_claimed: 'El servidor todavía no está reclamado.',
  server_game_running: 'Hay una partida en marcha en el servidor.'
}

function post(target: ApiTarget, body: string, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: HOST,
        port: target.port,
        path: '/api/v1',
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(target.token ? { Authorization: `Bearer ${target.token}` } : {})
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
        )
      }
    )

    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('El servidor no respondió a tiempo.')))
    req.end(body)
  })
}

/**
 * Llama a una función de la API.
 *
 * El servidor devuelve los errores con código 200 tan a menudo como con 4xx
 * (p. ej. `passwordless_login_not_possible`), así que lo que decide si algo ha
 * ido mal es que venga `errorCode`, no el estado HTTP.
 */
async function call<T>(
  target: ApiTarget,
  fn: string,
  data?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const body = JSON.stringify(data === undefined ? { function: fn } : { function: fn, data })
  const response = await post(target, body, timeoutMs)

  // 204: hecho y sin nada que devolver (Shutdown, SetClientPassword...).
  if (response.body.trim().length === 0) return undefined as T

  let parsed: { data?: T; errorCode?: string; errorMessage?: string }
  try {
    parsed = JSON.parse(response.body) as typeof parsed
  } catch {
    throw new SatisfactoryApiError(
      `El servidor respondió algo que no se entiende (${response.status}).`,
      'invalid_response',
      response.status
    )
  }

  if (parsed.errorCode) {
    throw new SatisfactoryApiError(
      ERROR_MESSAGES[parsed.errorCode] ?? parsed.errorMessage ?? parsed.errorCode,
      parsed.errorCode,
      response.status
    )
  }

  return parsed.data as T
}

// --- Estado ------------------------------------------------------------------

/**
 * ¿Está vivo el servidor? No necesita token, así que sirve para saber si ya ha
 * terminado de arrancar antes de haber entrado con ninguna contraseña.
 */
export async function healthCheck(port: number, timeoutMs = 4_000): Promise<boolean> {
  try {
    const data = await call<{ health: string }>(
      { port },
      'HealthCheck',
      { clientCustomData: '' },
      timeoutMs
    )
    return data?.health === 'healthy'
  } catch {
    return false
  }
}

interface RawServerState {
  serverGameState: {
    activeSessionName: string
    numConnectedPlayers: number
    playerLimit: number
    techTier: number
    isGameRunning: boolean
    isGamePaused: boolean
    totalGameDuration: number
    averageTickRate: number
  }
}

export async function queryState(target: ApiTarget, timeoutMs = 8_000): Promise<SatisfactoryState> {
  const data = await call<RawServerState>(target, 'QueryServerState', undefined, timeoutMs)
  const state = data.serverGameState
  return {
    sessionName: state.activeSessionName,
    playersConnected: state.numConnectedPlayers,
    playerLimit: state.playerLimit,
    gameRunning: state.isGameRunning,
    paused: state.isGamePaused,
    durationSeconds: state.totalGameDuration,
    tickRate: state.averageTickRate,
    techTier: state.techTier
  }
}

// --- Entrar ------------------------------------------------------------------

/**
 * Reclama un servidor recién instalado: le pone nombre y contraseña de
 * administrador. Solo se puede hacer una vez y sin contraseña; después el
 * servidor contesta `passwordless_login_not_possible`.
 *
 * Es lo que evita que el usuario tenga que abrir el juego para configurar su
 * propio servidor.
 */
export async function claimServer(
  port: number,
  serverName: string,
  adminPassword: string
): Promise<string> {
  const initial = await call<{ authenticationToken: string }>({ port }, 'PasswordlessLogin', {
    MinimumPrivilegeLevel: 'InitialAdmin'
  })

  const claimed = await call<{ authenticationToken: string }>(
    { port, token: initial.authenticationToken },
    'ClaimServer',
    { ServerName: serverName, AdminPassword: adminPassword }
  )

  return claimed.authenticationToken
}

/** Entra como administrador con la contraseña que eligió el usuario. */
export async function login(port: number, adminPassword: string): Promise<string> {
  const data = await call<{ authenticationToken: string }>({ port }, 'PasswordLogin', {
    MinimumPrivilegeLevel: 'Administrator',
    Password: adminPassword
  })
  return data.authenticationToken
}

/** Contraseña que tendrán que escribir los jugadores. Vacía = sin contraseña. */
export async function setClientPassword(target: ApiTarget, password: string): Promise<void> {
  await call(target, 'SetClientPassword', { Password: password })
}

export async function renameServer(target: ApiTarget, serverName: string): Promise<void> {
  await call(target, 'RenameServer', { ServerName: serverName })
}

// --- Ajustes -----------------------------------------------------------------

export interface ServerOptions {
  /** Lo que está aplicado ahora mismo. */
  options: Record<string, string>
  /** Lo que se aplicará cuando se reinicie el servidor, si hay algo pendiente. */
  pending: Record<string, string>
}

export async function getServerOptions(target: ApiTarget): Promise<ServerOptions> {
  const data = await call<{
    serverOptions: Record<string, string>
    pendingServerOptions: Record<string, string>
  }>(target, 'GetServerOptions')
  return { options: data.serverOptions ?? {}, pending: data.pendingServerOptions ?? {} }
}

export async function applyServerOptions(
  target: ApiTarget,
  options: Record<string, string>
): Promise<void> {
  await call(target, 'ApplyServerOptions', { UpdatedServerOptions: options })
}

export interface AdvancedSettings {
  creativeModeEnabled: boolean
  settings: Record<string, string>
}

export async function getAdvancedGameSettings(target: ApiTarget): Promise<AdvancedSettings> {
  const data = await call<{
    creativeModeEnabled: boolean
    advancedGameSettings: Record<string, string>
  }>(target, 'GetAdvancedGameSettings')
  return {
    creativeModeEnabled: data.creativeModeEnabled,
    settings: data.advancedGameSettings ?? {}
  }
}

/**
 * Cambia las reglas de la partida. ⚠ El juego marca la partida como
 * «modificada» y le quita los logros para siempre: quien llame a esto tiene que
 * haberlo avisado antes.
 */
export async function applyAdvancedGameSettings(
  target: ApiTarget,
  settings: Record<string, string>
): Promise<void> {
  await call(target, 'ApplyAdvancedGameSettings', { AppliedAdvancedGameSettings: settings })
}

// --- Partidas ----------------------------------------------------------------

interface RawSaveHeader {
  saveName: string
  sessionName: string
  playDurationSeconds: number
  saveDateTime: string
  buildVersion: number
  isCreativeModeEnabled: boolean
  isModdedSave: boolean
}

/**
 * `2026.09.16-12.41.49` (UTC) a ISO. El formato es del juego, no estándar.
 * Si cambiara, se devuelve la cadena original antes que inventarse una fecha.
 */
export function parseSaveDate(raw: string): string {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/.exec(raw)
  if (!match) return raw
  const [, y, mo, d, h, mi, s] = match
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`
}

export async function enumerateSessions(target: ApiTarget): Promise<SatisfactorySessions> {
  const data = await call<{
    sessions: { sessionName: string; saveHeaders: RawSaveHeader[] }[]
    currentSessionIndex: number
  }>(target, 'EnumerateSessions')

  const sessions = (data.sessions ?? []).map((session) => ({
    sessionName: session.sessionName,
    saves: (session.saveHeaders ?? [])
      .map(
        (header): SatisfactorySave => ({
          saveName: header.saveName,
          sessionName: header.sessionName,
          playDurationSeconds: header.playDurationSeconds,
          savedAt: parseSaveDate(header.saveDateTime),
          buildVersion: header.buildVersion,
          creativeModeEnabled: header.isCreativeModeEnabled,
          modded: header.isModdedSave
        })
      )
      // La más reciente primero: es la que se quiere cargar casi siempre.
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }))

  const current = sessions[data.currentSessionIndex]
  return { sessions, currentSessionName: current?.sessionName ?? null }
}

/**
 * Crea una partida nueva y la deja cargada. El servidor contesta 202 y sigue
 * cargando por su cuenta, así que después hay que esperar a que `queryState`
 * diga que hay partida en marcha.
 */
export async function createNewGame(target: ApiTarget, game: NewGameRequest): Promise<void> {
  await call(target, 'CreateNewGame', {
    NewGameData: {
      SessionName: game.sessionName,
      // El mapa es obligatorio aunque el juego solo tenga uno: sin él la API
      // responde `missing_params`.
      MapName: 'GrassFields',
      StartingLocation: '',
      bSkipOnboarding: true,
      ...(game.gameRules ? { AdvancedGameSettings: game.gameRules } : {})
    }
  })
}

export async function loadGame(target: ApiTarget, saveName: string): Promise<void> {
  await call(target, 'LoadGame', { SaveName: saveName, EnableAdvancedGameSettings: false })
}

export async function saveGame(target: ApiTarget, saveName: string): Promise<void> {
  await call(target, 'SaveGame', { SaveName: saveName })
}

export async function deleteSaveFile(target: ApiTarget, saveName: string): Promise<void> {
  await call(target, 'DeleteSaveFile', { SaveName: saveName })
}

export async function deleteSaveSession(target: ApiTarget, sessionName: string): Promise<void> {
  await call(target, 'DeleteSaveSession', { SessionName: sessionName })
}

// --- Parada ------------------------------------------------------------------

/**
 * Pide al servidor que se cierre. Guarda la partida y sale solo en unos
 * segundos: es la forma limpia de pararlo, equivalente al `stop` de Minecraft.
 */
export async function shutdown(target: ApiTarget): Promise<void> {
  await call(target, 'Shutdown', undefined, 10_000)
}

// --- Versión -----------------------------------------------------------------

/**
 * Versión del juego, sacada del certificado que el propio servidor se genera:
 * su descripción lleva la rama y el número de build
 * (`++FactoryGame+rel-main-anniversary-2026-CL-502094`).
 *
 * No hay ninguna función de la API que la dé, y saberla es lo que permite
 * enseñar en la ficha con qué versión están jugando.
 */
export function serverVersion(port: number, timeoutMs = 4_000): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const certificate = socket.getPeerCertificate() as { subject?: { description?: string } }
      socket.end()
      resolve(readableVersion(certificate?.subject?.description))
    })
    socket.on('error', () => resolve(null))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(null)
    })
  })
}

/** `++FactoryGame+rel-main-anniversary-2026-CL-502094` → `anniversary-2026 (build 502094)`. */
export function readableVersion(description: string | undefined): string | null {
  if (!description) return null
  const match = /rel-main-(.+?)-CL-(\d+)/.exec(description)
  if (!match) return description
  return `${match[1]} (build ${match[2]})`
}
