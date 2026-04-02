import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        legacyClient: 'client.html',
      },
    },
  },
})
