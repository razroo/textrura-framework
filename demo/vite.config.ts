import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
})
