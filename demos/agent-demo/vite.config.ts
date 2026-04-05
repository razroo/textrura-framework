import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  build: {
    rollupOptions: {
      input: 'client.html',
    },
  },
})
