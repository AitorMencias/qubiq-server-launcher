import { runPowerShell } from './powershell'

/**
 * Parada "como si pulsaras Ctrl+C" en la ventana del servidor, para juegos que
 * no leen órdenes por stdin (Valheim, Enshrouded).
 *
 * Resultado del prototipo de la fase 1 (ANALISIS.md §19.14):
 * - **Ctrl+C no sirve.** El proceso hijo hereda de la app la orden de ignorar
 *   Ctrl+C, y Windows la respeta: el evento se genera pero nunca llega.
 * - **Ctrl+Break sí.** No se puede ignorar de esa forma, y Valheim lo trata
 *   igual: guarda el mundo y sale con código 0.
 *
 * Cómo se manda: un proceso solo puede enviar eventos a la consola a la que
 * está conectado, así que un PowerShell auxiliar suelta la suya, se engancha a
 * la del servidor, se protege del evento que va a generar y lo emite para toda
 * esa consola. Tarda ~0,5 s, que en una parada es irrelevante.
 */

const SCRIPT = (pid: number): string => `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class QubiqConsoleSignal {
  delegate bool Handler(uint type);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetConsoleCtrlHandler(Handler h, bool add);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GenerateConsoleCtrlEvent(uint ev, uint group);
  static Handler keep = t => true;
  public static int Send(uint pid) {
    FreeConsole();
    if (!AttachConsole(pid)) return 10;
    SetConsoleCtrlHandler(keep, true);
    if (!GenerateConsoleCtrlEvent(1, 0)) return 11;
    System.Threading.Thread.Sleep(200);
    FreeConsole();
    return 0;
  }
}
'@
exit [QubiqConsoleSignal]::Send(${pid})
`

/**
 * Envía Ctrl+Break a la consola del proceso. Lanza si no se pudo entregar;
 * que el servidor reaccione se comprueba esperando a que salga.
 */
export async function sendCtrlBreak(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`PID no válido: ${pid}`)
  const { exitCode, stderr } = await runPowerShell(SCRIPT(pid), 20_000)
  if (exitCode === 10) {
    throw new Error('No se pudo conectar con la consola del servidor (¿ya se había cerrado?).')
  }
  if (exitCode !== 0) {
    throw new Error(`No se pudo enviar la orden de cierre al servidor (código ${exitCode}). ${stderr.trim()}`)
  }
}
