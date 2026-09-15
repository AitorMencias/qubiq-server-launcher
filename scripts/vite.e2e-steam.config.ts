import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Empaqueta la prueba de los cimientos de Steam con el Vite del proyecto.
 * Se ejecuta desde la raíz (npm run e2e:steam).
 */
const root = process.cwd()

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  build: {
    ssr: resolve(root, 'scripts/e2e/steam.ts'),
    outDir: resolve(root, 'out/e2e-steam'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'e2e-steam.mjs' }
    }
  }
})
