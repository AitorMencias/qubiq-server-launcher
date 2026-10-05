import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Genera `THIRD-PARTY-NOTICES.txt` con la licencia de cada paquete de npm que
 * acaba DENTRO del ejecutable (GPLv3 y las propias licencias MIT lo exigen).
 *
 * Se saca de lo que Rollup mete de verdad en el bundle, no de package.json: así
 * no sobra nada que se quede fuera ni falta nada que entre por una dependencia
 * de otra. Electron y Chromium no pasan por aquí: electron-builder deja sus
 * licencias junto al ejecutable (LICENSE.electron.txt y LICENSES.chromium.html).
 *
 * La misma instancia sirve a main, preload y renderer: electron-vite los
 * compila uno detrás de otro en el mismo proceso, y cada uno reescribe el
 * fichero con todo lo acumulado hasta entonces.
 */

interface Options {
  /** Carpeta del proyecto, donde está node_modules. */
  root: string
  /** Fichero que se escribe. */
  output: string
  /** Texto fijo al principio: lo que no viene de npm. */
  header: string
}

interface Found {
  name: string
  version: string
  license: string
  homepage?: string
  text: string
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i

export function thirdPartyNotices(options: Options): Plugin {
  const found = new Map<string, Found>()

  function packageDir(id: string): string | null {
    const clean = id.replace(/^\0/, '').split('?')[0]!.replace(/\\/g, '/')
    const index = clean.lastIndexOf('/node_modules/')
    if (index < 0) return null
    const rest = clean.slice(index + '/node_modules/'.length).split('/')
    const name = rest[0]!.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]!
    return `${clean.slice(0, index)}/node_modules/${name}`
  }

  function read(dir: string): Found {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name: string
      version: string
      license?: string
      homepage?: string
    }
    const file = readdirSync(dir).find((entry) => LICENSE_FILE.test(entry))
    if (!file) throw new Error(`${pkg.name} no trae fichero de licencia: revisar a mano.`)
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? '(sin indicar)',
      homepage: pkg.homepage,
      text: readFileSync(join(dir, file), 'utf8').trim()
    }
  }

  return {
    name: 'qubiq-third-party-notices',
    apply: 'build',

    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        for (const [id, info] of Object.entries(chunk.modules)) {
          if (info.renderedLength === 0) continue
          // Los ayudantes que inyecta Vite (precarga de módulos) son código de Vite.
          const dir = id.startsWith('\0vite/')
            ? join(options.root, 'node_modules', 'vite')
            : packageDir(id)
          if (!dir || found.has(dir)) continue
          found.set(dir, read(dir))
        }
      }
    },

    closeBundle() {
      const packages = [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
      const line = '-'.repeat(78)
      const body = packages.map((p) =>
        [
          line,
          `${p.name} ${p.version}  (${p.license})`,
          ...(p.homepage ? [p.homepage] : []),
          '',
          p.text
        ].join('\n')
      )
      mkdirSync(dirname(options.output), { recursive: true })
      writeFileSync(options.output, [options.header.trim(), ...body, ''].join('\n\n'), 'utf8')
    }
  }
}
