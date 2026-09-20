import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Empaqueta la prueba de Zomboid con el Vite del proyecto.
 * Se ejecuta desde la raíz (npm run e2e:zomboid).
 */
const root = process.cwd()

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  build: {
    ssr: resolve(root, 'scripts/e2e/zomboid.ts'),
    outDir: resolve(root, 'out/e2e-zomboid'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'e2e-zomboid.mjs' }
    }
  }
})
