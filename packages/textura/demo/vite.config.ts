import { defineConfig } from 'vite'

export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
})
