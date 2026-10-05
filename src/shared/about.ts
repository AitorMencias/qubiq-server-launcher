/**
 * Quién hace la app y dónde está su código. La GPLv3 (§0 y §5d) pide que una
 * interfaz interactiva muestre el copyright, que no hay garantía, la licencia y
 * cómo conseguir el código: lo enseña «Acerca de» en Configuración, y lo usan
 * también los avisos de terceros que se generan al compilar.
 */
export const PROJECT = {
  name: 'QubiQ Server Launcher',
  copyright: 'Copyright © 2026 AitorMencias',
  license: 'GPL-3.0-or-later',
  repository: 'https://github.com/AitorMencias/qubiq-server-launcher',
  /**
   * Frase que exigen las condiciones de marca de Mojang, en inglés y tal cual:
   * por eso no pasa por los diccionarios.
   */
  minecraftDisclaimer:
    'NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.'
} as const

/** Ficheros que viajan junto al ejecutable, en la carpeta de recursos. */
export const LICENSE_FILE = 'LICENSE.txt'
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt'

export interface AboutInfo {
  version: string
  electron: string
  chrome: string
  node: string
  /** Plugins oficiales que viajan con la app: cada uno tiene su repositorio. */
  plugins: { name: string; version: string; license: string | null; repository: string }[]
}
