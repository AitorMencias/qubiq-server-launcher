import { Fragment, type ReactNode } from 'react'
import { split, t, type MessageKey, type Vars } from '@shared/i18n'

/**
 * Lo que la interfaz necesita de los idiomas además de `t()`.
 *
 * Cambiar de idioma no remonta nada: `App` guarda el idioma en su estado, y al
 * cambiarlo se vuelve a pintar todo el árbol con el nuevo (ningún componente
 * usa `memo`). Por eso los textos se piden siempre al pintar, nunca en
 * constantes de módulo: una constante se quedaría en el idioma del arranque.
 */

export {
  t,
  formatBytes,
  formatDate,
  formatDateOnly,
  formatNumber,
  formatTime,
  formatList,
  midSentence,
  formatSize,
  unitLabel
} from '@shared/i18n'

/**
 * Un texto con piezas que no son texto: `{path}` puede ser un `<code>`.
 * Las variables que sean texto o número se pueden pasar igual que a `t()`.
 */
export function Rich({
  k,
  values = {},
  vars
}: {
  k: MessageKey
  values?: Record<string, ReactNode>
  vars?: Vars
}): React.JSX.Element {
  return (
    <>
      {split(k, vars).map((part, index) =>
        typeof part === 'string' ? (
          <Fragment key={index}>{part}</Fragment>
        ) : (
          <Fragment key={index}>{values[part.name] ?? `{${part.name}}`}</Fragment>
        )
      )}
    </>
  )
}

/** Un nombre dentro de una frase, con las comillas del idioma: «Mi servidor» / “My server”. */
export function quote(text: string): string {
  return t('common.quoted', { text })
}

/** Pone el idioma en `<html lang>`: elige la tipografía de cada escritura (ver styles.css). */
export function applyDocumentLanguage(language: string): void {
  document.documentElement.lang = language
}
