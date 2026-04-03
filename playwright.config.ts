import { defineConfig } from '@playwright/test'

const serverPort = 3320
const clientPort = 4173
const baseURL = `http://127.0.0.1:${clientPort}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    // Align with thin-client resize → full-stack-dashboard layout used by canvas hit coordinates below.
    viewport: { width: 1280, height: 820 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run server',
      cwd: 'demos/full-stack-dashboard',
      env: {
        ...process.env,
        GEOMETRA_FULL_STACK_PORT: String(serverPort),
        GEOMETRA_FULL_STACK_CLIENT_ORIGIN: `${baseURL}/`,
        // Stable canvas hit targets in tests/e2e (no default toast consuming banner height).
        GEOMETRA_E2E: '1',
      },
      port: serverPort,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: `npm run client -- --host 127.0.0.1 --port ${clientPort} --strictPort`,
      cwd: 'demos/full-stack-dashboard',
      env: {
        ...process.env,
        VITE_GEOMETRA_WS_URL: `ws://127.0.0.1:${serverPort}`,
      },
      port: clientPort,
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
})
