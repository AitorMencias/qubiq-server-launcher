import type { Language } from './i18n'

/**
 * La carpeta de datos de la app y su traslado a otro sitio.
 *
 * Todo lo que el núcleo tiene que contar aquí va en códigos con sus datos, no
 * en frases: la pantalla lo dice en el idioma elegido. Es lo que se hará con el
 * resto de mensajes del núcleo en la segunda entrega de los idiomas.
 */

export interface DataFolderInfo {
  /** Donde están ahora los datos. */
  current: string
  /** La de siempre, `%APPDATA%\qubiq-server-launcher`. */
  defaultPath: string
  isDefault: boolean
}

/** Lo que impide mover la carpeta al sitio elegido. */
export type RelocationProblem =
  | { code: 'same' }
  | { code: 'nested' }
  | { code: 'spaces' }
  | { code: 'network' }
  | { code: 'occupied'; entries: string[] }
  | { code: 'not-writable' }
  | { code: 'space'; neededBytes: number; freeBytes: number }
  | { code: 'busy'; servers: string[] }
  | { code: 'valheim-path'; servers: string[]; length: number; max: number }
  | { code: 'links'; path: string }

/** Lo que conviene saber antes de moverla, pero no la impide. */
export type RelocationWarning =
  | { code: 'firewall' }
  | { code: 'copy'; totalBytes: number }
  | { code: 'cloud' }
  | { code: 'valheim-path'; servers: string[]; length: number; max: number }

export interface RelocationPlan {
  /** La carpeta que eligió el usuario. */
  chosen: string
  /**
   * Donde acabarán los datos. Es la elegida si está vacía; si no, una
   * subcarpeta `QubiQ` dentro, para no mezclar los datos con lo que ya hubiera.
   */
  target: string
  /** En el mismo disco se renombra (instantáneo); si no, se copia. */
  sameDrive: boolean
  totalBytes: number
  freeBytes: number | null
  problems: RelocationProblem[]
  warnings: RelocationWarning[]
}

export type RelocationPhase = 'measuring' | 'moving' | 'copying' | 'verifying' | 'cleaning'

export interface RelocationProgress {
  phase: RelocationPhase
  copiedBytes?: number
  totalBytes?: number
}

export type RelocationErrorCode = 'locked' | 'mismatch' | 'links' | 'missing' | 'other'

export type RelocationStatus =
  | { state: 'idle' }
  | { state: 'moving'; from: string; to: string; progress: RelocationProgress }
  | { state: 'done'; from: string; to: string; leftovers: boolean }
  | { state: 'failed'; from: string; to: string; error: RelocationErrorCode; detail?: string }

/** Lo que la interfaz necesita saber antes de pintar nada. */
export interface BootInfo {
  /** El idioma con el que arrancar: el elegido, o el de Windows. */
  language: Language
  /** El de Windows, para decir cuál es la opción «automático». */
  systemLanguage: Language
  relocation: RelocationStatus
}
