import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same build shape as mcp-greenhouse-fixture: built once into dist/, served
// from there by the benchmark script's inline static server. We never run
// vite dev for the benchmark — vite dev would inject HMR runtime that the
// MCP would have to walk past, which contaminates the test of the MCP
// against real Radix DOM.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
