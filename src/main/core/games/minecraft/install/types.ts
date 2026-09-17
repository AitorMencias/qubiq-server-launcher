import type { Distribution } from '@shared/games/minecraft/types'

/** Contexto que recibe cada estrategia de instalación (§6). */
export interface InstallContext {
  instanceId: string
  /** Directorio de trabajo del servidor (`<instancia>/server`). */
  serverDir: string
  minecraftVersion: string
  /** Build de Paper / versión de Forge / loader de Fabric. */
  build?: string
  /** El usuario aceptó builds en pruebas (alpha/beta) de la distribución. */
  allowExperimental?: boolean
  javaPath: string
  memoryMb: number
  onProgress: (phase: string, progress: number | null, detail?: string) => void
  signal?: AbortSignal
}

/** Resultado de instalar: lo que hay que persistir en el manifiesto. */
export interface InstallResult {
  /** Build/loader realmente instalado, que puede diferir del solicitado. */
  build?: string
}

/**
 * Cómo arrancar lo instalado.
 *
 * ⚠ No todas las distribuciones se lanzan con `-jar`. Forge moderno usa un
 * argfile generado por su instalador (§6, §15.1), y por eso esto devuelve la
 * lista completa de argumentos en lugar de una ruta a un jar.
 */
export interface LaunchPlan {
  /** Argumentos completos para java.exe, en orden. */
  args: string[]
  /**
   * true si la memoria ya va dentro de un fichero de argumentos y NO debe
   * añadirse otra vez a la línea de comandos (caso de Forge).
   */
  memoryHandledExternally: boolean
}

export interface Installer {
  readonly distribution: Distribution
  install(ctx: InstallContext): Promise<InstallResult>
  /** Se recalcula en cada arranque: el disco es la fuente de verdad. */
  buildLaunchPlan(ctx: InstallContext): Promise<LaunchPlan>
}
