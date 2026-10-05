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
 *   2. Trae la última release de cada plugin oficial desde su repositorio,
 *      verificada, con la plantilla `config.yml` sacada de dentro del jar
 *      (`scripts/official-plugins.mjs`). La release sale con lo último publicado.
 *   3. Cambia la versión con `npm version`, que toca package.json y
 *      package-lock.json a la vez (a mano se desincronizan).
 *   4. typecheck + smoke, y e2e contra un servidor real si se pide. Si la
 *      prueba de humo solo falla por no llegar a un servicio externo (sale con
 *      2), se pregunta si seguir; `--allow-offline` lo acepta sin preguntar.
 *   5. `npm run dist` en release-nueva/, con `SHA256SUMS.txt` de los .exe (no van
 *      firmados: es lo que permite comprobarlos), y si sale bien sustituye release/
 *      entera: la carpeta queda solo con la versión nueva.
 *
 * Si algo falla después de cambiar la versión, se restaura la anterior: una
 * versión subida sin release que la respalde confunde la siguiente vez.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { syncOfficialPlugins } from './official-plugins.mjs'

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
  return npmStatus(args) === 0
}

/** Igual, pero devuelve el código de salida para distinguir tipos de fallo. */
function npmStatus(args) {
  // `shell: true` es obligatorio para lanzar npm.cmd en Windows desde Node 20, y
  // con él Node pide el comando en una sola cadena. Es seguro: los argumentos
  // son fijos y la versión ya ha pasado por la expresión regular.
  const result = spawnSync(`npm ${args.join(' ')}`, { stdio: 'inherit', shell: true })
  return result.status ?? 1
}

/**
 * La prueba de humo sale con 2 cuando todo lo comprobable está bien pero no se
 * pudo llegar a algún servicio externo. No es un cambio de API, así que no debe
 * bloquear igual que un fallo, pero tampoco seguir en silencio: se pregunta.
 *
 * Se abre una lectura nueva solo para esto: mantener la de antes abierta
 * mientras corren las pruebas dejaría la consola en modo crudo y Ctrl+C no
 * podría cortar un empaquetado.
 */
async function acceptOffline() {
  if (process.argv.includes('--allow-offline')) return true
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(
      '\nLa prueba de humo no pudo conectar con algún servicio (arriba pone cuál, como SIN CONEXIÓN).\n' +
        'Lo que sí se pudo comprobar está bien. ¿Seguir sin comprobar ese servicio? [s/N]: '
    )
    return /^s/i.test(answer.trim())
  } finally {
    rl.close()
  }
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

const RELEASE = 'release'
const STAGING = 'release-nueva'

/**
 * Cambia release/ por la recién empaquetada. Si release/ no se deja borrar
 * (un ejecutable abierto, el Explorador dentro de la carpeta), se avisa y la
 * nueva queda en release-nueva/ en lugar de mezclar versiones en release/.
 */
function replaceRelease() {
  try {
    rmSync(RELEASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
  } catch (err) {
    fail(
      `No se pudo borrar la release anterior (${err.code ?? err.message}). ¿Tienes abierto algún ` +
        `ejecutable de release/? La nueva está en ${STAGING}/.`
    )
    return false
  }
  try {
    renameSync(STAGING, RELEASE)
  } catch {
    // Windows a veces niega renombrar una carpeta recién escrita (antivirus
    // revisándola, indexador): copiar y borrar tarda más pero no depende de eso.
    try {
      cpSync(STAGING, RELEASE, { recursive: true })
      rmSync(STAGING, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
    } catch (err) {
      fail(`No se pudo mover la release nueva a release/ (${err.code ?? err.message}). Está en ${STAGING}/.`)
      return false
    }
  }
  console.log('  release/ contiene ahora solo la versión nueva')
  return true
}

function readVersion() {
  return JSON.parse(readFileSync('package.json', 'utf8')).version
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
    title('Plugins oficiales: última release de cada uno')
    if (!(await syncOfficialPlugins({ update: true }))) {
      return fail('No se han podido traer los plugins oficiales; sin ellos la release no los llevaría.')
    }

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
    let skippedServices = false
    const steps = [
      ['Comprobación de tipos', ['run', 'typecheck']],
      ['Prueba de humo', ['run', 'smoke']],
      ...(withE2e ? [['Prueba con servidor real', ['run', 'e2e', '--', 'paper']]] : [])
    ]
    for (const [name, args] of steps) {
      title(name)
      const status = npmStatus(args)
      if (status === 2 && name === 'Prueba de humo') {
        if (await acceptOffline()) {
          skippedServices = true
          continue
        }
        restore()
        fail(
          'La prueba de humo no pudo conectar con algún servicio y no se ha confirmado seguir. ' +
            'Vuelve a intentarlo más tarde, o usa --allow-offline para continuar sin preguntar.'
        )
        return
      }
      if (status !== 0) {
        restore()
        fail(`Ha fallado: ${name}. No se ha generado ninguna release.`)
        return
      }
    }

    // --- 5. Empaquetar -------------------------------------------------------
    // Se empaqueta en una carpeta aparte y solo si sale bien sustituye a
    // release/. Borrar la release anterior ANTES de empaquetar dejaría sin
    // ningún instalador si el empaquetado falla a medias.
    title('Empaquetando')
    rmSync(STAGING, { recursive: true, force: true })
    // npm añade lo que va tras `--` al final del script: le llega a electron-builder.
    if (!npm(['run', 'dist', '--', `--config.directories.output=${STAGING}`])) {
      rmSync(STAGING, { recursive: true, force: true })
      restore()
      fail('Ha fallado el empaquetado. La release anterior sigue en release/.')
      return
    }

    const artifacts = readdirSync(STAGING).filter((f) => f.includes(version) && f.endsWith('.exe'))
    if (artifacts.length === 0) {
      rmSync(STAGING, { recursive: true, force: true })
      restore()
      fail(`El empaquetado terminó pero no generó ningún .exe de la ${version}. La release anterior sigue en release/.`)
      return
    }

    // El ejecutable no va firmado (§13.3): el SHA-256 publicado junto a cada
    // release es lo que permite comprobar que lo descargado es lo que se subió.
    // Formato de sha256sum, para que `sha256sum -c` y Get-FileHash lo lean igual.
    const sums = artifacts
      .map((file) => `${createHash('sha256').update(readFileSync(join(STAGING, file))).digest('hex')}  ${file}`)
      .join('\n')
    writeFileSync(join(STAGING, 'SHA256SUMS.txt'), sums + '\n')

    title('Sustituyendo la release anterior')
    if (!replaceRelease()) return

    title(`Release ${version} lista`)
    for (const file of artifacts) {
      const mb = (statSync(join('release', file)).size / 1024 / 1024).toFixed(0)
      console.log(`  release\\${file}  (${mb} MB)`)
    }
    console.log('  release\\SHA256SUMS.txt  (súbelo con los .exe)')
    if (!withE2e) console.log('\n  Aviso: se ha generado SIN la prueba con servidor real.')
    if (skippedServices) {
      console.log('  Aviso: la prueba de humo no pudo comprobar algún servicio externo (SIN CONEXIÓN).')
    }
    console.log('\n  No se ha hecho commit ni tag.')

    // Solo con alguien delante. explorer.exe devuelve 1 aunque funcione: no se comprueba.
    if (process.stdout.isTTY) spawnSync('explorer.exe', [join(root, 'release')])
  } finally {
    rl.close()
  }
}

await main()
