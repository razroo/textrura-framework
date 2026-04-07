import { describe, expect, it } from 'vitest'
import { formatConnectFailureMessage, normalizeConnectTarget } from '../connect-utils.js'
import { formatProxyStartupFailure, parseProxyReadySignalLine } from '../proxy-spawn.js'

describe('normalizeConnectTarget', () => {
  it('accepts explicit pageUrl for http(s) pages', () => {
    const result = normalizeConnectTarget({ pageUrl: 'https://example.com/jobs/123' })

    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'proxy',
        pageUrl: 'https://example.com/jobs/123',
        autoCoercedFromUrl: false,
      },
    })
  })

  it('rejects non-http pageUrl protocols', () => {
    const result = normalizeConnectTarget({ pageUrl: 'ws://127.0.0.1:3100' })

    expect(result).toEqual({
      ok: false,
      error: 'pageUrl must use http:// or https:// (received ws:)',
    })
  })

  it('auto-coerces http url input onto the proxy path', () => {
    const result = normalizeConnectTarget({ url: 'https://jobs.example.com/apply' })

    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'proxy',
        pageUrl: 'https://jobs.example.com/apply',
        autoCoercedFromUrl: true,
      },
    })
  })

  it('accepts ws url input for already-running peers', () => {
    const result = normalizeConnectTarget({ url: 'ws://127.0.0.1:3100' })

    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'ws',
        wsUrl: 'ws://127.0.0.1:3100/',
        autoCoercedFromUrl: false,
      },
    })
  })

  it('rejects ambiguous and empty connect inputs', () => {
    expect(normalizeConnectTarget({})).toEqual({
      ok: false,
      error: 'Provide exactly one of: url (WebSocket or webpage URL) or pageUrl (https://…).',
    })

    expect(normalizeConnectTarget({ url: 'ws://127.0.0.1:3100', pageUrl: 'https://example.com' })).toEqual({
      ok: false,
      error: 'Provide exactly one of: url (WebSocket or webpage URL) or pageUrl (https://…).',
    })
  })
})

describe('formatConnectFailureMessage', () => {
  it('adds a targeted hint when ws connect fails for a normal webpage flow', () => {
    const message = formatConnectFailureMessage(
      new Error('WebSocket error connecting to ws://localhost:3100: connect ECONNREFUSED'),
      { kind: 'ws', wsUrl: 'ws://localhost:3100', autoCoercedFromUrl: false },
    )

    expect(message).toContain('ECONNREFUSED')
    expect(message).toContain('pageUrl: "https://…"')
  })
})

describe('proxy ready helpers', () => {
  it('parses structured proxy ready JSON', () => {
    const wsUrl = parseProxyReadySignalLine(
      '{"type":"geometra-proxy-ready","wsUrl":"ws://127.0.0.1:41237","pageUrl":"https://example.com"}',
    )

    expect(wsUrl).toBe('ws://127.0.0.1:41237')
  })

  it('still accepts legacy human-readable ready logs', () => {
    const wsUrl = parseProxyReadySignalLine('[geometra-proxy] WebSocket listening on ws://127.0.0.1:3200')

    expect(wsUrl).toBe('ws://127.0.0.1:3200')
  })

  it('adds install and port conflict hints to proxy startup failures', () => {
    const chromiumHint = formatProxyStartupFailure(
      "browserType.launch: Executable doesn't exist at /tmp/chromium",
      { pageUrl: 'https://example.com', port: 0 },
    )
    expect(chromiumHint).toContain('npx playwright install chromium')

    const portHint = formatProxyStartupFailure(
      'listen EADDRINUSE: address already in use 127.0.0.1:3337',
      { pageUrl: 'https://example.com', port: 3337 },
    )
    expect(portHint).toContain('Requested port 3337 is unavailable')
  })
})
