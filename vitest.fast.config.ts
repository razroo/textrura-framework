import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vitest.config'

export default mergeConfig(baseConfig, defineConfig({
  test: {
    include: ['packages/*/src/__tests__/**/*.test.ts'],
    exclude: [
      'packages/core/src/__tests__/fonts.test.ts',
      'packages/core/src/__tests__/perf-smoke.test.ts',
      'packages/core/src/__tests__/virtual-scroll.test.ts',
      'packages/server/src/__tests__/protocol-perf-smoke.test.ts',
    ],
  },
}))
