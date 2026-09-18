import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Empaqueta la prueba de Factorio con el Vite del proyecto.
 * Se ejecuta desde la raíz (npm run e2e:factorio).
 */
const root = process.cwd()

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  build: {
    ssr: resolve(root, 'scripts/e2e/factorio.ts'),
    outDir: resolve(root, 'out/e2e-factorio'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'e2e-factorio.mjs' }
    }
  }
})
