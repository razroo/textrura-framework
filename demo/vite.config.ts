import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  resolve: {
    alias: {
      'textura': path.resolve(import.meta.dirname, '../packages/textura/src/index.ts'),
      '@geometra/core': path.resolve(import.meta.dirname, '../packages/core/src/index.ts'),
      '@geometra/client': path.resolve(import.meta.dirname, '../packages/client/src/index.ts'),
      '@geometra/renderer-canvas': path.resolve(import.meta.dirname, '../packages/renderer-canvas/src/index.ts'),
      '@geometra/renderer-pdf': path.resolve(import.meta.dirname, '../packages/renderer-pdf/src/index.ts'),
      '@geometra/renderer-webgpu': path.resolve(import.meta.dirname, '../packages/renderer-webgpu/src/index.ts'),
      '@geometra/ui': path.resolve(import.meta.dirname, '../packages/ui/src/index.ts'),
      '@geometra/router': path.resolve(import.meta.dirname, '../packages/router/src/index.ts'),
    },
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        'agent-native-ops': path.resolve(import.meta.dirname, 'agent-native-ops/index.html'),
        'ai-on-demand': path.resolve(import.meta.dirname, 'ai-on-demand/index.html'),
        webgpu: path.resolve(import.meta.dirname, 'webgpu.html'),
      },
    },
  },
})
