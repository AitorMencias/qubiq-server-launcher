import { existsSync } from 'node:fs'
import { delimiter, extname, isAbsolute, join, resolve } from 'node:path'

/**
 * La línea de órdenes de Windows, armada igual que la arma Node.
 *
 * En Windows un programa no recibe una lista de argumentos sino una sola
 * cadena, y cada uno la trocea a su manera. Al lanzar a través del guardián,
 * la cadena la hacemos nosotros: tiene que salir **idéntica** a la que hacía
 * Node (libuv, `quote_cmd_arg` y `make_program_args` de `src/win/process.c`),
 * o un servidor que arrancaba bien empezaría a recibir otros argumentos.
 */

/** Un argumento entrecomillado como lo hace libuv. */
export function quoteArg(arg: string): string {
  if (arg.length === 0) return '""'
  // Sin espacios, tabuladores ni comillas: tal cual.
  if (!/[ \t"]/.test(arg)) return arg
  // Sin comillas ni barras: basta rodearlo de comillas.
  if (!/["\\]/.test(arg)) return `"${arg}"`

  // Lo demás, con la regla de las barras: las que preceden a una comilla (o
  // al cierre) se duplican, y cada comilla se escapa con una barra. libuv lo
  // recorre al revés; aquí igual, para que salga lo mismo carácter a carácter.
  const out: string[] = []
  let quoteHit = true
  for (let i = arg.length; i > 0; i--) {
    const c = arg[i - 1]!
    out.push(c)
    if (quoteHit && c === '\\') {
      out.push('\\')
    } else if (c === '"') {
      quoteHit = true
      out.push('\\')
    } else {
      quoteHit = false
    }
  }
  return `"${out.reverse().join('')}"`
}

/**
 * Los argumentos tras el programa. Con `verbatim` (cmd y sus reglas propias),
 * sin tocar, separados por un espacio.
 */
export function argumentsLine(args: string[], verbatim = false): string {
  return args.map((arg) => (verbatim ? arg : quoteArg(arg))).join(' ')
}

/**
 * Ruta completa del programa. Los juegos dan rutas absolutas; solo cmd puede
 * llegar a secas (`cmd.exe` si falta `ComSpec`), y entonces se busca como
 * Node: en la carpeta de trabajo y después en el PATH.
 */
export function resolveCommand(command: string, cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  if (isAbsolute(command)) return command
  const names = extname(command) ? [command] : [`${command}.com`, `${command}.exe`]
  const dirs = [cwd, ...(env['PATH'] ?? env['Path'] ?? '').split(delimiter).filter(Boolean)]
  for (const dir of dirs) {
    for (const name of names) {
      const full = resolve(join(dir, name))
      if (existsSync(full)) return full
    }
  }
  return command
}
