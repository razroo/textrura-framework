import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/__tests__/**/*.test.ts'],
    pool: 'threads',
    testTimeout: 30_000,
  },
})
