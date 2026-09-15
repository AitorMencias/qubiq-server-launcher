import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Empaqueta la prueba de humo con el Vite que ya usa el proyecto, para no
 * añadir un ejecutor de TypeScript solo para esto.
 * Se ejecuta desde la raíz del proyecto (npm run smoke).
 */
const root = process.cwd()

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  build: {
    ssr: resolve(root, 'scripts/e2e/minecraft.ts'),
    outDir: resolve(root, 'out/e2e'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'e2e.mjs' }
    }
  }
})
