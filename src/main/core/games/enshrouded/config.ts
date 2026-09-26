import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EnshroudedManifest } from '@shared/types'
import {
  DEFAULT_QUERY_PORT,
  changedFromPreset,
  presetSettings,
  type EnshroudedBan,
  type EnshroudedRole,
  type EnshroudedSettings
} from '@shared/games/enshrouded/types'
import { serverDir } from '../../paths'

/**
 * El `enshrouded_server.json`, que es **toda** la configuración del servidor.
 *
 * Tres cosas medidas contra el servidor real que mandan sobre cómo se escribe
 * (ANALISIS.md §19.24):
 *
 * 1. **El servidor lo reescribe entero al arrancar.** Se queda con lo que
 *    entiende, completa lo que falte con sus valores de serie y **borra las
 *    claves que no conoce**. Así que la app no guarda nada suyo ahí: el
 *    manifiesto es la única fuente de verdad y el fichero se genera en cada
 *    arranque.
 * 2. **Pero hay algo que el servidor escribe y la app no sabe:** la lista de
 *    vetados, que se llena desde dentro del juego. Generar el fichero sin
 *    leerlo antes borraría los vetos puestos jugando, así que **siempre se
 *    lee primero y se conserva `bannedAccounts` tal cual venga**.
 * 3. **Con un preajuste que no sea `Custom`, los `gameSettings` se ignoran en
 *    silencio.** El fichero se queda con ellos puestos, así que mirándolo
 *    parece que están aplicados. Por eso `buildConfig` pone `Custom` sola en
 *    cuanto algún valor se aparta del preajuste.
 */

export function configPath(id: string): string {
  return join(serverDir(id), 'enshrouded_server.json')
}

/** Carpeta donde viven los mundos, dentro de la del servidor. */
export const WORLDS_DIR = 'mundos'

/** Y donde el servidor escribe sus registros, que no son los de la app. */
export const LOGS_DIR = 'registros'

/**
 * Lo que la app le escribe al servidor.
 *
 * Es el fichero entero menos `bannedAccounts`, que viene de lo que hubiera.
 */
export interface EnshroudedConfig {
  name: string
  saveDirectory: string
  logDirectory: string
  ip: string
  queryPort: number
  slotCount: number
  tags: string[]
  voiceChatMode: string
  enableVoiceChat: boolean
  enableTextChat: boolean
  gameSettingsPreset: string
  gameSettings: EnshroudedSettings
  userGroups: EnshroudedRole[]
  bannedAccounts: unknown[]
}

/**
 * Lee el fichero que haya. Devuelve null si aún no existe (servidor recién
 * instalado y nunca arrancado), que no es un error.
 */
export async function readConfig(id: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath(id), 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Los vetados que hay ahora mismo en el fichero.
 *
 * ⚠ La clave es `bannedAccounts`. El README oficial la llama `bans` y usa otros
 * nombres de campo; probado metiéndole las dos formas, la del README se borra
 * sin decir nada. La fecha viene dentro de un objeto (`banDate: { value }`).
 */
export function bansOf(config: Record<string, unknown> | null): EnshroudedBan[] {
  const raw = config?.['bannedAccounts']
  if (!Array.isArray(raw)) return []

  const bans: EnshroudedBan[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const fecha = record['banDate']
    bans.push({
      accountId: Number(record['accountId'] ?? 0),
      displayName: String(record['displayName'] ?? ''),
      characterName: String(record['characterName'] ?? ''),
      banDate: Number(
        fecha && typeof fecha === 'object' ? ((fecha as Record<string, unknown>)['value'] ?? 0) : 0
      )
    })
  }
  return bans
}

/** Le devuelve al servidor la forma exacta en la que él escribe un veto. */
export function banToRaw(ban: EnshroudedBan): Record<string, unknown> {
  return {
    accountId: ban.accountId,
    displayName: ban.displayName,
    characterName: ban.characterName,
    banDate: { value: ban.banDate }
  }
}

/**
 * El preajuste que hay que escribir de verdad.
 *
 * Si el usuario ha tocado algún ajuste, tiene que ser `Custom` o el servidor no
 * los mirará. Es la trampa de este juego y la única forma de que la pantalla no
 * mienta.
 */
export function effectivePreset(manifest: EnshroudedManifest): string {
  const { preset, settings } = manifest.data
  if (preset === 'Custom') return 'Custom'
  return changedFromPreset(preset, settings).length > 0 ? 'Custom' : preset
}

/**
 * El fichero que se le escribe al servidor, a partir del manifiesto y de lo
 * que ya hubiera en disco (los vetados).
 */
export function buildConfig(
  manifest: EnshroudedManifest,
  previous: Record<string, unknown> | null
): EnshroudedConfig {
  const { data } = manifest
  const preset = effectivePreset(manifest)

  // Con un preajuste, se escriben sus valores medidos en vez de los guardados:
  // así el fichero dice lo mismo que aplica el servidor, y si alguien lo abre a
  // mano no se lleva una sorpresa.
  const gameSettings = preset === 'Custom' ? { ...data.settings } : presetSettings(manifest.data.preset)

  const bans = previous?.['bannedAccounts']

  return {
    name: manifest.name,
    // Relativo al ejecutable, que es la carpeta del servidor de la instancia:
    // el juego ya queda aislado sin tener que pelearse con carpetas del
    // usuario, al revés que Valheim, Satisfactory o Zomboid.
    saveDirectory: `./${WORLDS_DIR}/${data.worldName}`,
    logDirectory: `./${LOGS_DIR}`,
    ip: '0.0.0.0',
    queryPort: manifest.port || DEFAULT_QUERY_PORT,
    slotCount: Math.min(Math.max(manifest.expectedPlayers ?? 4, 1), 16),
    tags: [...data.tags],
    voiceChatMode: data.voiceChatMode,
    enableVoiceChat: data.enableVoiceChat,
    enableTextChat: data.enableTextChat,
    gameSettingsPreset: preset,
    gameSettings,
    userGroups: data.roles.map((role) => ({ ...role })),
    // Lo único que no sale del manifiesto: lo pone el servidor desde el juego.
    bannedAccounts: Array.isArray(bans) ? bans : []
  }
}

/** Escribe el fichero conservando los vetados que ya hubiera. */
export async function writeConfig(manifest: EnshroudedManifest): Promise<EnshroudedConfig> {
  const previous = await readConfig(manifest.id)
  const config = buildConfig(manifest, previous)
  // Con tabuladores y salto al final, como lo escribe el propio servidor: así
  // un `diff` entre lo que deja la app y lo que deja él no sale lleno de ruido.
  await writeFile(configPath(manifest.id), `${JSON.stringify(config, null, '\t')}\n`, 'utf8')
  return config
}
