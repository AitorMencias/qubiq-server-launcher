import type { es } from './locales/es'

/**
 * Formas de un texto con número. Cada idioma usa las suyas (`Intl.PluralRules`):
 * el español `one` y `other`; el ruso además `few` y `many`; el japonés y el
 * chino solo `other`. `other` es obligatoria porque es la que vale siempre.
 */
export interface Plural {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

/** Un texto en otro idioma tiene la misma forma que en español: texto o plural. */
export type Translation<T> = { [K in keyof T]: T[K] extends string ? string : Plural }

/** Un idioma entero: todas las claves del español, ni una más ni una menos. */
export type Dictionary = Translation<typeof es>
