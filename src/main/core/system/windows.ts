import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { psQuote, runPowerShell } from './powershell'

const execFileAsync = promisify(execFile)

/** Comprobaciones del sistema que necesitan algunos juegos. */

function system32(exe: string): string {
  const windowsDir = process.env['SystemRoot'] || process.env['windir']
  return windowsDir ? join(windowsDir, 'System32', exe) : exe
}

export interface VcRedistStatus {
  installed: boolean
  version: string | null
}

/**
 * Visual C++ Redistributable 2015-2022 (x64). Hay servidores que no arrancan
 * sin él y el error que da Windows ("falta VCRUNTIME140.dll") no dice qué
 * instalar. La clave es la que documenta Microsoft para detectarlo.
 */
export async function vcRedistX64(): Promise<VcRedistStatus> {
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64'
  ]
  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync(system32('reg.exe'), ['query', key], {
        windowsHide: true,
        timeout: 10_000
      })
      const status = parseVcRedistQuery(stdout)
      if (status.installed) return status
    } catch {
      // La clave no existe: se prueba la siguiente.
    }
  }
  return { installed: false, version: null }
}

/** Interpreta la salida de `reg query`. Separada para poder probarla. */
export function parseVcRedistQuery(stdout: string): VcRedistStatus {
  const installed = /^\s*Installed\s+REG_DWORD\s+0x1\s*$/im.test(stdout)
  const version = /^\s*Version\s+REG_SZ\s+(\S+)\s*$/im.exec(stdout)?.[1] ?? null
  return { installed, version: installed ? version : null }
}

export const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'

/**
 * Firma digital de un ejecutable descargado sin hash publicado (SteamCMD).
 * Devuelve el sujeto del certificado solo si la firma es válida.
 */
export async function authenticodeSigner(path: string): Promise<string | null> {
  const { exitCode, stdout } = await runPowerShell(
    `$s = Get-AuthenticodeSignature -LiteralPath ${psQuote(path)}
if ($s.Status -ne 'Valid') { exit 1 }
Write-Output $s.SignerCertificate.Subject`,
    30_000
  )
  return exitCode === 0 ? stdout.trim() : null
}
