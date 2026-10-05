import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { thirdPartyNotices } from './scripts/third-party-notices'
import { NOTICES_FILE, PROJECT } from './src/shared/about'
import type { BundledOfficialPlugin } from './src/shared/games/minecraft/officialPlugins'

const shared = resolve(__dirname, 'src/shared')

/**
 * Los plugins oficiales que viajan en `resources/`, con su licencia y su
 * código. Los deja ahí `npm run plugins`, que corre antes de `build` y `dev`.
 */
function officialPluginsNotice(): string {
  const dir = resolve(__dirname, 'resources/minecraft/plugins')
  const plugins = existsSync(dir)
    ? readdirSync(dir)
        .map((id) => resolve(dir, id, 'plugin.json'))
        .filter((path) => existsSync(path))
        .map((path) => JSON.parse(readFileSync(path, 'utf8')) as BundledOfficialPlugin)
    : []
  if (plugins.length === 0) return ''
  return [
    'Plugins oficiales que instala la app (cada uno con su repositorio, su código y su licencia):',
    ...plugins.map(
      (p) => `  - ${p.jarFileName} (${p.license ?? 'licencia sin indicar'}): ${p.repository}`
    )
  ].join('\n')
}

// Una sola instancia para los tres: acumula lo que entra en cada bundle. El
// fichero lo empaqueta electron-builder junto al ejecutable (extraResources).
const notices = thirdPartyNotices({
  root: __dirname,
  output: resolve(__dirname, 'out', NOTICES_FILE),
  header: `
${PROJECT.name}
${PROJECT.copyright}
Licencia: ${PROJECT.license} (LICENSE.txt). Código fuente: ${PROJECT.repository}

Avisos de terceros: el código de otros proyectos que va dentro de esta
aplicación, con su licencia. Electron, Chromium y Node.js traen las suyas en la
carpeta de instalación: LICENSE.electron.txt y LICENSES.chromium.html.

${officialPluginsNotice()}
`
})

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), notices],
    resolve: {
      alias: { '@shared': shared }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), notices],
    resolve: {
      alias: { '@shared': shared }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': shared
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // La página del control remoto (§19.31): la sirve el propio anfitrión.
          remote: resolve(__dirname, 'src/renderer/remote.html')
        }
      }
    },
    plugins: [react(), notices]
  }
})
