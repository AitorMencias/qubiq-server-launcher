import { es, type MessageKey } from './locales/es'
import { en } from './locales/en'
import { ru } from './locales/ru'
import { de } from './locales/de'
import { it } from './locales/it'
import { fr } from './locales/fr'
import { pt } from './locales/pt'
import { zh } from './locales/zh'
import { hi } from './locales/hi'
import { ja } from './locales/ja'
import type { Dictionary, Plural } from './types'

/**
 * Idiomas de la aplicación.
 *
 * Vive en `shared` porque lo usan los dos lados: la interfaz para todo lo que
 * enseña y el proceso principal para sus diálogos nativos. No depende de React
 * ni de Electron.
 *
 * No hay librería de por medio a propósito: con claves planas y el diccionario
 * español como referencia de tipos, `npm run typecheck` falla si a cualquier
 * idioma le falta una clave o le sobra una. Los plurales los resuelve
 * `Intl.PluralRules`, que ya sabe que el ruso tiene tres formas y el japonés una.
 */

export type { MessageKey } from './locales/es'
export type { Dictionary, Plural } from './types'

export type Language = 'es' | 'en' | 'ru' | 'de' | 'it' | 'fr' | 'pt' | 'zh' | 'hi' | 'ja'

export interface LanguageInfo {
  id: Language
  /** Cómo se llama en su propio idioma: es lo que busca quien no entiende el actual. */
  name: string
  /** Para `Intl`: fechas, números y plurales. */
  locale: string
}

export const LANGUAGES: LanguageInfo[] = [
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'ru', name: 'Русский', locale: 'ru-RU' },
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'pt', name: 'Português', locale: 'pt-BR' },
  { id: 'zh', name: '简体中文', locale: 'zh-CN' },
  { id: 'hi', name: 'हिन्दी', locale: 'hi-IN' },
  { id: 'ja', name: '日本語', locale: 'ja-JP' }
]

const DICTIONARIES: Record<Language, Dictionary> = { es, en, ru, de, it, fr, pt, zh, hi, ja }

/** Si el idioma de Windows no está traducido, se usa este (decisión del usuario). */
export const FALLBACK_LANGUAGE: Language = 'en'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LANGUAGES.some((language) => language.id === value)
}

/**
 * El primero de los idiomas preferidos del sistema que esté traducido, o inglés.
 * Solo cuenta la parte del idioma: `pt-PT` y `pt-BR` van los dos a portugués, y
 * `zh-TW` a chino (simplificado, que es el único que hay).
 */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0]
    if (isLanguage(base)) return base
  }
  return FALLBACK_LANGUAGE
}

/** El elegido en la configuración, o el del sistema si no se ha elegido ninguno. */
export function resolveLanguage(chosen: Language | undefined, preferred: readonly string[]): Language {
  return chosen && isLanguage(chosen) ? chosen : detectLanguage(preferred)
}

let current: Language = 'es'

export function setLanguage(language: Language): void {
  current = language
}

export function getLanguage(): Language {
  return current
}

export function languageInfo(language: Language = current): LanguageInfo {
  return LANGUAGES.find((info) => info.id === language) ?? LANGUAGES[0]!
}

/** Etiqueta BCP 47 del idioma actual, para `Intl` y `toLocaleString`. */
export function currentLocale(): string {
  return languageInfo(current).locale
}

export type Vars = Record<string, string | number>

/**
 * Texto traducido. Las variables van entre llaves: `{name}`. Si la clave es un
 * plural, `vars.count` elige la forma.
 */
export function t(key: MessageKey, vars?: Vars): string {
  const entry = lookup(key)
  // Una clave que no existe (montada con una plantilla) se enseña tal cual: se
  // ve el fallo en pantalla en vez de romperla, y el smoke las busca.
  if (entry === undefined) return key
  const text = typeof entry === 'string' ? entry : pluralForm(entry, vars?.['count'])
  return vars ? interpolate(text, vars) : text
}

function lookup(key: MessageKey): string | Plural | undefined {
  return (DICTIONARIES[current] as Record<string, string | Plural | undefined>)[key] ??
    (es as Record<string, string | Plural | undefined>)[key]
}

/** ¿Existe la clave? Para las que se montan con plantillas (`mc.official.hu.${path}`). */
export function hasKey(key: string): boolean {
  return key in es
}

function pluralForm(entry: Plural, count: string | number | undefined): string {
  const n = typeof count === 'number' ? count : Number(count ?? 0)
  const category = new Intl.PluralRules(currentLocale()).select(n) as keyof Plural
  return entry[category] ?? entry.other
}

function interpolate(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? formatVar(vars[name]!) : match
  )
}

// Sin separador de miles: los números sueltos de las frases son sobre todo
// puertos, semillas y años, y «28.016» como puerto confunde. Donde sí hace
// falta (tamaños, cantidades grandes) se pasa ya formateado con formatNumber.
function formatVar(value: string | number): string {
  return typeof value === 'number' ? formatNumber(value, { useGrouping: false }) : value
}

/**
 * Trocea un texto por sus variables sin sustituirlas, para que la interfaz meta
 * en su sitio lo que no es texto (un `<strong>`, un enlace). Devuelve el texto y
 * el nombre de cada variable, alternados: `['Hola ', {var: 'name'}, '.']`.
 */
export function split(key: MessageKey, vars?: Vars): (string | { name: string })[] {
  const entry = lookup(key)
  if (entry === undefined) return [key]
  const text = typeof entry === 'string' ? entry : pluralForm(entry, vars?.['count'])
  const parts: (string | { name: string })[] = []
  let last = 0
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const name = match[1]!
    if (vars && name in vars) parts.push(formatVar(vars[name]!))
    else parts.push({ name })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(currentLocale(), options)
}

export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleString(currentLocale(), options)
}

export function formatDateOnly(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(date).toLocaleDateString(currentLocale(), options)
}

export function formatTime(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleTimeString(currentLocale(), options)
}

/**
 * Una opción de un catálogo (ajustes de un juego) con su `label` y su `help`
 * traducidos al leerlos, de `<prefijo>.label` y `<prefijo>.help`.
 *
 * Son propiedades enumerables con getter: copiar el objeto (`{...opción}`) o
 * mandarlo por IPC se lleva el texto en el idioma de ese momento.
 */
export function labelled<T extends object>(base: T, prefix: string): T & { label: string; help: string } {
  return Object.defineProperties({ ...base }, {
    label: { enumerable: true, get: () => t(`${prefix}.label` as MessageKey) },
    help: { enumerable: true, get: () => t(`${prefix}.help` as MessageKey) }
  }) as T & { label: string; help: string }
}

/** Un valor de una lista de opciones, con su nombre traducido al leerlo. */
export function choice(value: string, key: string): { value: string; label: string } {
  return Object.defineProperty({ value }, 'label', {
    enumerable: true,
    get: () => t(key as MessageKey)
  }) as { value: string; label: string }
}

/** «A, B y C» / «A, B and C» / «A、B、C». */
export function formatList(items: string[]): string {
  return new Intl.ListFormat(currentLocale(), { type: 'conjunction' }).format(items)
}

/**
 * Un título («Construir en bases») metido en mitad de una frase: con la
 * primera letra en minúscula. En alemán no, que ahí los sustantivos van en
 * mayúscula y no se sabe si la primera palabra lo es.
 */
export function midSentence(label: string): string {
  if (current === 'de' || label.length === 0) return label
  return label.charAt(0).toLocaleLowerCase(currentLocale()) + label.slice(1)
}

/**
 * Una lista troceada, para pintar cada elemento a su manera (en negrita) con
 * las comas y la «y» del idioma: `[{element: '2456'}, {literal: ' y '}, …]`.
 */
export function listParts(items: string[]): { type: 'element' | 'literal'; value: string }[] {
  return new Intl.ListFormat(currentLocale(), { type: 'conjunction' }).formatToParts(items)
}

/** Unidades de tamaño con el separador decimal del idioma: «1,5 GB» / «1.5 GB». */
// El ruso y el francés escriben las unidades a su manera (ГБ, Go); los demás
// idiomas de la app usan las latinas.
const BYTE_UNITS: Partial<Record<Language, string[]>> = {
  ru: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'],
  fr: ['o', 'Ko', 'Mo', 'Go', 'To']
}

const LATIN_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const
export type ByteUnit = (typeof LATIN_UNITS)[number]

/** «GB» como se escribe en el idioma de la app. */
export function unitLabel(unit: ByteUnit): string {
  return (BYTE_UNITS[current] ?? LATIN_UNITS)[LATIN_UNITS.indexOf(unit)]!
}

/** Una cantidad ya en su unidad: `formatSize(3.2, 'GB')` → «3,2 GB». */
export function formatSize(value: number, unit: ByteUnit, options?: Intl.NumberFormatOptions): string {
  return `${formatNumber(value, options)} ${unitLabel(unit)}`
}

export function formatBytes(bytes: number): string {
  const units = BYTE_UNITS[current] ?? LATIN_UNITS
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${formatNumber(value, { maximumFractionDigits: digits })} ${units[unit]}`
}

/** Todos los diccionarios, para la comprobación del smoke. */
export function dictionaries(): Record<Language, Dictionary> {
  return DICTIONARIES
}
