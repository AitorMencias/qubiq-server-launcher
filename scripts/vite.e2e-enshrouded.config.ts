import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Empaqueta la prueba de Enshrouded con el Vite del proyecto.
 * Se ejecuta desde la raíz (npm run e2e:enshrouded).
 */
const root = process.cwd()

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  build: {
    ssr: resolve(root, 'scripts/e2e/enshrouded.ts'),
    outDir: resolve(root, 'out/e2e-enshrouded'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'e2e-enshrouded.mjs' }
    }
  }
})
