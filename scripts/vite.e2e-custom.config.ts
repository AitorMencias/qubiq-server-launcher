import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Empaqueta la prueba de los servidores a medida con el Vite del proyecto.
 * Se ejecuta desde la raíz (npm run e2e:custom).
 */
const root = process.cwd()

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  build: {
    ssr: resolve(root, 'scripts/e2e/custom.ts'),
    outDir: resolve(root, 'out/e2e-custom'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'e2e-custom.mjs' }
    }
  }
})
