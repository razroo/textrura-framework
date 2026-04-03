import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      '@geometra/core': path.resolve(import.meta.dirname, '../../packages/core/src/index.ts'),
      '@geometra/core/node': path.resolve(import.meta.dirname, '../../packages/core/src/node.ts'),
      '@geometra/client': path.resolve(import.meta.dirname, '../../packages/client/src/index.ts'),
      '@geometra/renderer-canvas': path.resolve(import.meta.dirname, '../../packages/renderer-canvas/src/index.ts'),
      '@geometra/router': path.resolve(import.meta.dirname, '../../packages/router/src/index.ts'),
      '@geometra/server': path.resolve(import.meta.dirname, '../../packages/server/src/index.ts'),
      '@geometra/ui': path.resolve(import.meta.dirname, '../../packages/ui/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        legacyClient: 'client.html',
      },
    },
  },
})
