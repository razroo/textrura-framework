import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  resolve: {
    alias: {
      '@geometra/core': path.resolve(import.meta.dirname, '../packages/core/src/index.ts'),
      '@geometra/renderer-canvas': path.resolve(import.meta.dirname, '../packages/renderer-canvas/src/index.ts'),
      '@geometra/ui': path.resolve(import.meta.dirname, '../packages/ui/src/index.ts'),
    },
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
})
