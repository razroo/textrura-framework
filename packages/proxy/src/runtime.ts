import { chromium, type Browser, type Page } from 'playwright'
import { installDomObserver, startGeometryWebSocket, type GeometryWsHub } from './geometry-ws.js'

export interface ProxyRuntimeHandle {
  browser: Browser
  page: Page
  hub: GeometryWsHub
  pageUrl: string
  wsUrl: string
  closed: boolean
  close: () => Promise<void>
}

export interface LaunchProxyRuntimeOptions {
  url: string
  port: number
  width?: number
  height?: number
  headed?: boolean
  slowMo?: number
  debounceMs?: number
  onListening?: (wsUrl: string) => void
  onError?: (err: unknown) => void
}

export function parseHttpPageUrl(raw: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`Invalid URL: ${raw}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}. geometra-proxy only opens http:// or https:// pages.`)
  }

  return parsed.toString()
}

export function formatProxyFatalError(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err)
  if (/Executable doesn't exist|playwright install chromium|browserType\.launch/i.test(base)) {
    return `${base}\nInstall Chromium with: npx playwright install chromium`
  }
  return base
}

export async function launchProxyRuntime(options: LaunchProxyRuntimeOptions): Promise<ProxyRuntimeHandle> {
  const pageUrl = parseHttpPageUrl(options.url)
  const launchOpts: Parameters<typeof chromium.launch>[0] = { headless: options.headed !== true }
  if (options.slowMo && options.slowMo > 0) launchOpts.slowMo = options.slowMo

  const browser = await chromium.launch(launchOpts)
  const page = await browser.newPage({
    viewport: {
      width: options.width ?? 1280,
      height: options.height ?? 720,
    },
  })

  let resolveListening!: (wsUrl: string) => void
  let rejectListening!: (err: Error) => void
  const listeningPromise = new Promise<string>((resolve, reject) => {
    resolveListening = resolve
    rejectListening = reject
  })

  let resolveBeforeInput!: () => void
  let rejectBeforeInput!: (err: unknown) => void
  const beforeInput = new Promise<void>((resolve, reject) => {
    resolveBeforeInput = resolve
    rejectBeforeInput = reject
  })

  let wsUrl = options.port === 0 ? '' : `ws://127.0.0.1:${options.port}`
  let closed = false
  let closing = false

  const reportError = (err: unknown) => {
    options.onError?.(err)
    if (!wsUrl) {
      rejectListening(new Error(formatProxyFatalError(err)))
    }
  }

  const hub = startGeometryWebSocket({
    port: options.port,
    page,
    debounceMs: options.debounceMs ?? 50,
    beforeInput,
    onListening(port) {
      wsUrl = `ws://127.0.0.1:${port}`
      resolveListening(wsUrl)
      options.onListening?.(wsUrl)
    },
    onError: reportError,
  })

  const handleUnexpectedClosure = (source: 'page' | 'browser') => {
    if (closed || closing) return
    closed = true
    const message =
      source === 'browser'
        ? 'Playwright browser was closed while geometra-proxy was still expected to serve MCP actions.'
        : 'Playwright page or context was closed while geometra-proxy was still expected to serve MCP actions.'
    const error = new Error(message)
    rejectBeforeInput(error)
    rejectListening(error)
    options.onError?.(error)
    void hub.close().catch(() => {})
  }

  page.on('close', () => {
    handleUnexpectedClosure('page')
  })
  browser.on('disconnected', () => {
    handleUnexpectedClosure('browser')
  })

  const refreshObservers = () => {
    void installDomObserver(page, hub.scheduleExtract)
      .then(() => {
        hub.scheduleExtract()
      })
      .catch(reportError)
  }
  page.on('domcontentloaded', refreshObservers)

  const initialNavigation = page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  void initialNavigation
    .then(async () => {
      resolveBeforeInput()
      await hub.flushExtract()
    })
    .catch(err => {
      rejectBeforeInput(err)
      reportError(err)
    })

  const listeningWsUrl = await listeningPromise

  const close = async () => {
    if (closed || closing) return
    closing = true
    try {
      await hub.close()
    } catch {
      /* ignore */
    }
    try {
      if (browser.isConnected()) {
        await browser.close()
      }
    } catch {
      /* ignore */
    }
    closed = true
    closing = false
  }

  return {
    browser,
    page,
    hub,
    pageUrl,
    wsUrl: listeningWsUrl,
    get closed() {
      return closed
    },
    close,
  }
}
