import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Empaqueta la prueba de Valheim con el Vite del proyecto.
 * Se ejecuta desde la raíz (npm run e2e:valheim).
 */
const root = process.cwd()

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  build: {
    ssr: resolve(root, 'scripts/e2e/valheim.ts'),
    outDir: resolve(root, 'out/e2e-valheim'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'e2e-valheim.mjs' }
    }
  }
})
