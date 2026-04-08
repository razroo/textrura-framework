#!/usr/bin/env node
import { formatProxyFatalError, launchProxyRuntime, parseHttpPageUrl } from './runtime.js'

const READY_SIGNAL_TYPE = 'geometra-proxy-ready'

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

function envRequestsReadyJson(): boolean {
  const v = (process.env.GEOMETRA_PROXY_READY_JSON ?? '').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function parsePortArg(raw: string | undefined): number {
  const n = Number(raw ?? '')
  if (Number.isInteger(n) && n >= 0 && n <= 65535) return n
  throw new Error(`Invalid --port value: ${raw ?? '(missing)'}`)
}

function parsePositiveIntArg(flag: string, raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? '')
  if (Number.isInteger(n) && n > 0) return n
  if (raw === undefined) return fallback
  throw new Error(`Invalid ${flag} value: ${raw}`)
}

function emitReadySignal(wsUrl: string, pageUrl: string): void {
  if (!envRequestsReadyJson()) return
  process.stdout.write(`${JSON.stringify({ type: READY_SIGNAL_TYPE, wsUrl, pageUrl })}\n`)
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
      port = parsePortArg(argv[++i])
    } else if (a === '--width') {
      width = parsePositiveIntArg('--width', argv[++i], 1280)
    } else if (a === '--height') {
      height = parsePositiveIntArg('--height', argv[++i], 720)
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
  const { url: rawUrl, port, width, height, headed, slowMo } = parseArgs(process.argv.slice(2))
  if (!rawUrl) {
    printUsage()
    process.exit(1)
  }
  const url = parseHttpPageUrl(rawUrl)

  const mode = headed ? 'headed (visible window)' : 'headless'
  const pace = slowMo > 0 ? `, slowMo ${slowMo}ms` : ''
  console.error(`[geometra-proxy] Chromium ${mode}${pace}`)
  console.error(`[geometra-proxy] Loading ${url} …`)
  const runtime = await launchProxyRuntime({
    url,
    port,
    width,
    height,
    headed,
    slowMo,
    debounceMs: 50,
    onListening(wsUrl) {
      console.error(`[geometra-proxy] WebSocket listening on ${wsUrl}`)
    },
    onError(err) {
      const message = formatProxyFatalError(err)
      console.error('[geometra-proxy] error:', message)
    },
  })
  const wsUrl = runtime.wsUrl
  console.error(`[geometra-proxy] Ready. Connect MCP with geometra_connect({ url: "${wsUrl}" })`)
  emitReadySignal(wsUrl, url)

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    await runtime.close()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
  process.on('SIGHUP', () => void shutdown())
}

main().catch(err => {
  console.error('[geometra-proxy] fatal:', formatProxyFatalError(err))
  process.exit(1)
})
