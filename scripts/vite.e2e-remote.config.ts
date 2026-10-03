import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Empaqueta la prueba del control remoto con el Vite del proyecto.
 * Se ejecuta desde la raíz (npm run e2e:remote).
 */
const root = process.cwd()

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  build: {
    ssr: resolve(root, 'scripts/e2e/remote.ts'),
    outDir: resolve(root, 'out/e2e-remote'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'e2e-remote.mjs' }
    }
  }
})
