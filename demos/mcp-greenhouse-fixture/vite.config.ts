import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The fixture is built once and served from `dist/` by the benchmark script's
// inline static server. We never run vite dev for the actual benchmark — vite
// dev would inject HMR runtime and module-graph noise that the MCP would have
// to walk past, which is exactly the kind of contamination we don't want when
// the goal is to test the MCP against react-select's production DOM.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Single entry, no code splitting — the fixture is small and we want the
    // benchmark static server to be able to serve everything from a flat dist/.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
