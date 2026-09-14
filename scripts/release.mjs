#!/usr/bin/env node
/**
 * Genera una release: cambia la versión, comprueba y empaqueta.
 *
 * Uso:  npm run release            (pregunta la versión)
 *       npm run release -- 0.3.0   (sin preguntar)
 *       release.bat                (doble clic)
 *
 * Pasos, en este orden y parando en el primer fallo:
 *   1. Pide la versión y la valida (x.y.z, opcionalmente -beta.1).
 *   2. Sincroniza la plantilla `config.yml` de cada plugin oficial con la que
 *      lleva DENTRO su jar. Actualizar el jar y olvidar la plantilla ya pasó
 *      una vez: la app habría instalado configuraciones sin las opciones
 *      nuevas del plugin, sin ningún error que lo delatara.
 *   3. Cambia la versión con `npm version`, que toca package.json y
 *      package-lock.json a la vez (a mano se desincronizan).
 *   4. typecheck + smoke, y e2e contra un servidor real si se pide.
 *   5. `npm run dist`.
 *
 * Si algo falla después de cambiar la versión, se restaura la anterior: una
 * versión subida sin release que la respalde confunde la siguiente vez.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

// Ver scripts/run-electron-vite.mjs: la variable que deja VS Code rompe Electron.
delete process.env.ELECTRON_RUN_AS_NODE

const VERSION = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/

function title(text) {
  console.log(`\n=== ${text}`)
}

function fail(message) {
  console.error(`\nERROR: ${message}`)
  process.exitCode = 1
}

/** Ejecuta un comando npm mostrando su salida. Devuelve true si acaba bien. */
function npm(args) {
  // `shell: true` es obligatorio para lanzar npm.cmd en Windows desde Node 20, y
  // con él Node pide el comando en una sola cadena. Es seguro: los argumentos
  // son fijos y la versión ya ha pasado por la expresión regular.
  const result = spawnSync(`npm ${args.join(' ')}`, { stdio: 'inherit', shell: true })
  return result.status === 0
}

function compare(a, b) {
  const pa = VERSION.exec(a)
  const pb = VERSION.exec(b)
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff !== 0) return diff
  }
  // Sin sufijo va después que con sufijo: 1.0.0-beta < 1.0.0.
  if (!pa[4] && pb[4]) return 1
  if (pa[4] && !pb[4]) return -1
  return (pa[4] ?? '').localeCompare(pb[4] ?? '')
}

function nextPatch(version) {
  const m = VERSION.exec(version)
  if (!m) return null
  return m[4] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

function readVersion() {
  return JSON.parse(readFileSync('package.json', 'utf8')).version
}

/** Lee un fichero de dentro de un jar con el bsdtar de Windows, sin dependencias. */
function readFromJar(jarPath, entry) {
  const windowsDir = process.env.SystemRoot || process.env.windir
  // Por ruta absoluta: el tar de GNU que instala Git no entiende "C:\..." (§19.3).
  const tar = windowsDir ? join(windowsDir, 'System32', 'tar.exe') : 'tar.exe'
  const result = spawnSync(tar, ['-xOf', jarPath, entry], { maxBuffer: 16 * 1024 * 1024 })
  return result.status === 0 && result.stdout.length > 0 ? result.stdout : null
}

function syncPluginTemplates() {
  const base = join('resources', 'plugins')
  if (!existsSync(base)) return true

  let ok = true
  for (const plugin of readdirSync(base)) {
    const dir = join(base, plugin)
    if (!statSync(dir).isDirectory()) continue

    const jars = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.jar'))
    if (jars.length !== 1) {
      // Dos jars del mismo plugin impiden arrancar el servidor; mejor pararlo aquí.
      fail(`${dir} tiene ${jars.length} jars y debería tener exactamente uno.`)
      ok = false
      continue
    }

    const embedded = readFromJar(join(dir, jars[0]), 'config.yml')
    if (!embedded) {
      console.log(`  ${plugin}: el jar no trae config.yml, nada que sincronizar`)
      continue
    }

    const templatePath = join(dir, 'config.yml')
    const current = existsSync(templatePath) ? readFileSync(templatePath) : null
    if (current && current.equals(embedded)) {
      console.log(`  ${plugin}: la plantilla ya coincide con ${jars[0]}`)
    } else {
      writeFileSync(templatePath, embedded)
      console.log(`  ${plugin}: plantilla ACTUALIZADA desde ${jars[0]}`)
    }
  }
  return ok
}

async function main() {
  const current = readVersion()
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  // Se lee con el iterador y no con rl.question(): si llegan varias líneas de
  // golpe (respuestas pegadas, o redirigidas desde un fichero), question()
  // pierde las que llegan antes de preguntar y el script se queda colgado.
  const lines = rl[Symbol.asyncIterator]()
  /** Devuelve null si se cierra la entrada: eso es cancelar, nunca aceptar. */
  const ask = async (question) => {
    process.stdout.write(question)
    const { value, done } = await lines.next()
    return done ? null : value.trim()
  }
  const cancelled = () => console.log('\nCancelado. No se ha cambiado nada.')

  try {
    // --- 1. Versión ----------------------------------------------------------
    let version = process.argv.slice(2).find((a) => !a.startsWith('-'))
    if (!version) {
      const suggested = nextPatch(current)
      const answer = await ask(
        `Versión actual: ${current}\nNueva versión${suggested ? ` [${suggested}]` : ''}: `
      )
      if (answer === null) return cancelled()
      version = answer || suggested
    }
    version = version?.replace(/^v/i, '')

    if (!version || !VERSION.test(version)) {
      fail(`"${version ?? ''}" no es una versión válida. Usa el formato 1.2.3 (o 1.2.3-beta.1).`)
      return
    }

    if (VERSION.test(current) && compare(version, current) <= 0) {
      const answer = await ask(
        `La ${version} no es mayor que la actual (${current}). ¿Seguir igualmente? [s/N]: `
      )
      if (answer === null || !/^s/i.test(answer)) return cancelled()
    }

    let withE2e
    if (process.argv.includes('--e2e')) withE2e = true
    else if (process.argv.includes('--no-e2e')) withE2e = false
    else {
      const answer = await ask(
        '¿Pasar también la prueba con un servidor real (e2e)? Tarda unos minutos. [S/n]: '
      )
      if (answer === null) return cancelled()
      withE2e = !/^n/i.test(answer)
    }

    rl.close()

    // --- 2. Plantillas de los plugins ----------------------------------------
    title('Plugins oficiales')
    if (!syncPluginTemplates()) return

    // --- 3. Cambiar la versión -----------------------------------------------
    title(`Versión ${current} -> ${version}`)
    const backup = {
      'package.json': readFileSync('package.json'),
      'package-lock.json': existsSync('package-lock.json') ? readFileSync('package-lock.json') : null
    }
    const restore = () => {
      for (const [file, content] of Object.entries(backup)) {
        if (content) writeFileSync(file, content)
      }
      console.error(`Se ha restaurado la versión ${current}.`)
    }

    if (!npm(['version', version, '--no-git-tag-version', '--allow-same-version'])) {
      restore()
      fail('No se pudo cambiar la versión.')
      return
    }

    // --- 4. Comprobaciones ---------------------------------------------------
    const steps = [
      ['Comprobación de tipos', ['run', 'typecheck']],
      ['Prueba de humo', ['run', 'smoke']],
      ...(withE2e ? [['Prueba con servidor real', ['run', 'e2e', '--', 'paper']]] : [])
    ]
    for (const [name, args] of steps) {
      title(name)
      if (!npm(args)) {
        restore()
        fail(`Ha fallado: ${name}. No se ha generado ninguna release.`)
        return
      }
    }

    // --- 5. Empaquetar -------------------------------------------------------
    title('Empaquetando')
    if (!npm(['run', 'dist'])) {
      restore()
      fail('Ha fallado el empaquetado.')
      return
    }

    const artifacts = existsSync('release')
      ? readdirSync('release').filter((f) => f.includes(version) && f.endsWith('.exe'))
      : []
    if (artifacts.length === 0) {
      fail(`El empaquetado terminó pero no hay ningún .exe de la ${version} en release/.`)
      return
    }

    title(`Release ${version} lista`)
    for (const file of artifacts) {
      const mb = (statSync(join('release', file)).size / 1024 / 1024).toFixed(0)
      console.log(`  release\\${file}  (${mb} MB)`)
    }
    if (!withE2e) console.log('\n  Aviso: se ha generado SIN la prueba con servidor real.')
    console.log('\n  No se ha hecho commit ni tag.')

    // Solo con alguien delante. explorer.exe devuelve 1 aunque funcione: no se comprueba.
    if (process.stdout.isTTY) spawnSync('explorer.exe', [join(root, 'release')])
  } finally {
    rl.close()
  }
}

await main()
