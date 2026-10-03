import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import type { AppSettings } from '@shared/types'
import { isLanguage } from '@shared/i18n'
import { dataRoot, ensureDir } from '../paths'

/**
 * Ajustes de la aplicación, comunes a todas las instancias.
 *
 * Viven aparte de los manifiestos porque describen a la PERSONA que usa la app
 * (qué nivel de detalle quiere ver), no a un servidor concreto.
 */

const DEFAULTS: AppSettings = {
  // Se empieza en modo básico a propósito: el problema de la interfaz completa
  // no es que sea complicada, es que obliga a decidir sobre cosas que alguien
  // que nunca ha montado un servidor no sabe responder (§3).
  uiMode: 'basic'
}

function settingsPath(): string {
  return join(dataRoot(), 'settings.json')
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    // Se fusiona con los valores por defecto para que añadir un ajuste nuevo
    // no rompa los ficheros ya escritos.
    const settings: AppSettings = { ...DEFAULTS, ...parsed }
    // Un idioma que esta versión no conoce (quitado, o de una más nueva) se
    // olvida y se vuelve al de Windows, en vez de pedir un diccionario que no hay.
    if (settings.language !== undefined && !isLanguage(settings.language)) delete settings.language
    return settings
  } catch {
    return { ...DEFAULTS }
  }
}

export async function updateSettings(changes: Partial<AppSettings>): Promise<AppSettings> {
  const current = await readSettings()
  const updated: AppSettings = { ...current, ...changes }
  // `language: undefined` es «como Windows»: se quita del fichero.
  if ('language' in changes && changes.language === undefined) delete updated.language
  await ensureDir(dataRoot())
  await writeFile(settingsPath(), JSON.stringify(updated, null, 2), 'utf8')
  return updated
}
