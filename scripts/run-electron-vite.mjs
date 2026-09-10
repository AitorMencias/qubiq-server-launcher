#!/usr/bin/env node
/**
 * Lanzador de electron-vite.
 *
 * Existe por un motivo concreto: VS Code exporta `ELECTRON_RUN_AS_NODE=1` a su
 * terminal integrada (y a las tareas). Si esa variable llega a electron.exe, el
 * binario arranca como Node normal, `require('electron')` devuelve la RUTA del
 * ejecutable en vez del módulo, y la app muere con:
 *
 *   TypeError: Cannot read properties of undefined (reading 'whenReady')
 *
 * El síntoma no apunta en absoluto a la causa, así que conviene eliminarla aquí
 * en lugar de dejar que cada quien lo descubra por su cuenta.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const command = process.argv[2] ?? 'dev'
const rest = process.argv.slice(3)

// El CLI se localiza por ruta y se ejecuta con el mismo Node, sin shell:
// pasar argumentos por shell no los escapa y aquí hay rutas con espacios.
// (No se usa require.resolve porque electron-vite no exporta su bin/.)
const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

const child = spawn(process.execPath, [cli, command, ...rest], {
  stdio: 'inherit',
  env
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
