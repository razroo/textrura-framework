import { defineConfig } from '@playwright/test'

const port = 4174

export default defineConfig({
  testDir: './tests/demo-e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 820 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-unsafe-webgpu'],
    },
  },
  webServer: {
    command: `bun run demo:dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    port,
    timeout: 30_000,
    reuseExistingServer: false,
  },
})
