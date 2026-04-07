#!/usr/bin/env node
import { chromium } from 'playwright'
import { installDomObserver, startGeometryWebSocket } from './geometry-ws.js'

function printUsage(): void {
  console.error(`Usage: geometra-proxy <url> [--port <n>] [--width <n>] [--height <n>] [--headless] [--headed] [--slow-mo <ms>]

Open <url> in Chromium and stream GEOM v1 frames on WebSocket (JSON text).

Default is a visible browser window (headed) so you can watch MCP-driven automation.
Use --headless or env GEOMETRA_HEADLESS=1 for CI / servers without a display.

Examples:
  geometra-proxy http://localhost:8080 --port 3200
  geometra-proxy https://example.com --port 3200 --width 1440 --height 900
  geometra-proxy https://jobs.example.com/apply --slow-mo 40
  geometra-proxy http://localhost:3000 --headless

Requires Chromium for Playwright:  npx playwright install chromium
`)
}

function envRequestsHeadless(): boolean {
  const v = (process.env.GEOMETRA_HEADLESS ?? '').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function parseArgs(argv: string[]): {
  url: string
  port: number
  width: number
  height: number
  headed: boolean
  slowMo: number
} {
  let url = ''
  let port = 3200
  let width = 1280
  let height = 720
  let headed = !envRequestsHeadless()
  let slowMo = 0

  const envSlow = process.env.GEOMETRA_SLOW_MO ?? process.env.GEOMETRA_SLOWMO
  if (envSlow !== undefined && envSlow !== '') {
    const n = Number(envSlow)
    if (Number.isFinite(n) && n >= 0) slowMo = Math.floor(n)
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--port') {
      port = Math.max(1, Number(argv[++i] ?? '0') || 3200)
    } else if (a === '--width') {
      width = Math.max(1, Number(argv[++i] ?? '0') || 1280)
    } else if (a === '--height') {
      height = Math.max(1, Number(argv[++i] ?? '0') || 720)
    } else if (a === '--headed') {
      headed = true
    } else if (a === '--headless') {
      headed = false
    } else if (a === '--slow-mo' || a === '--slowMo') {
      const n = Number(argv[++i] ?? '')
      if (Number.isFinite(n) && n >= 0) slowMo = Math.floor(n)
    } else if (!a.startsWith('-')) {
      url = a
    } else {
      console.error(`Unknown option: ${a}`)
      printUsage()
      process.exit(1)
    }
  }
  return { url, port, width, height, headed, slowMo }
}

async function main(): Promise<void> {
  const { url, port, width, height, headed, slowMo } = parseArgs(process.argv.slice(2))
  if (!url) {
    printUsage()
    process.exit(1)
  }

  const launchOpts: Parameters<typeof chromium.launch>[0] = { headless: !headed }
  if (slowMo > 0) launchOpts.slowMo = slowMo

  const browser = await chromium.launch(launchOpts)
  const page = await browser.newPage()
  await page.setViewportSize({ width, height })

  const mode = headed ? 'headed (visible window)' : 'headless'
  const pace = slowMo > 0 ? `, slowMo ${slowMo}ms` : ''
  console.error(`[geometra-proxy] Chromium ${mode}${pace}`)
  console.error(`[geometra-proxy] Loading ${url} …`)
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  const hub = startGeometryWebSocket({
    port,
    page,
    debounceMs: 50,
    onListening(p) {
      console.error(`[geometra-proxy] WebSocket listening on ws://127.0.0.1:${p}`)
    },
    onError(err) {
      console.error('[geometra-proxy] error:', err)
    },
  })

  await hub.flushExtract()
  await installDomObserver(page, hub.scheduleExtract)

  console.error(
    `[geometra-proxy] Ready. Connect MCP with geometra_connect({ url: "ws://127.0.0.1:${port}" })`,
  )

  const shutdown = async () => {
    try {
      await hub.close()
    } catch {
      /* ignore */
    }
    await browser.close()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch(err => {
  console.error('[geometra-proxy] fatal:', err)
  process.exit(1)
})
