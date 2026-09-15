import { execFile } from 'node:child_process'
import { join } from 'node:path'

/**
 * PowerShell como herramienta del sistema, sin dependencias npm.
 *
 * Dos precauciones, por la misma razón que `systemTarPath()`:
 * - Ruta absoluta: nada del PATH puede suplantarlo.
 * - `-EncodedCommand` en lugar de un `.ps1`: la política de ejecución de
 *   scripts no se aplica a órdenes en línea, así que funciona igual en un
 *   equipo con los scripts bloqueados.
 */

export function powershellPath(): string {
  const windowsDir = process.env['SystemRoot'] || process.env['windir']
  return windowsDir
    ? join(windowsDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
}

export interface PowerShellResult {
  exitCode: number
  stdout: string
  stderr: string
}

export function runPowerShell(script: string, timeoutMs = 30_000): Promise<PowerShellResult> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    execFile(
      powershellPath(),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err && typeof err.code !== 'number') {
          reject(err)
          return
        }
        resolve({ exitCode: err ? (err.code as number) : 0, stdout, stderr })
      }
    )
  })
}

/** Comillas simples de PowerShell: la única secuencia especial es '' */
export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
