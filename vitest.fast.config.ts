import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/__tests__/**/*.test.ts'],
    exclude: [
      'packages/core/src/__tests__/fonts.test.ts',
      'packages/core/src/__tests__/perf-smoke.test.ts',
      'packages/core/src/__tests__/virtual-scroll.test.ts',
      'packages/server/src/__tests__/protocol-perf-smoke.test.ts',
    ],
    pool: 'threads',
    testTimeout: 30_000,
  },
})
