export interface NormalizedConnectTarget {
  kind: 'proxy' | 'ws'
  autoCoercedFromUrl: boolean
  pageUrl?: string
  wsUrl?: string
}

export function normalizeConnectTarget(input: {
  url?: string
  pageUrl?: string
}): { ok: true; value: NormalizedConnectTarget } | { ok: false; error: string } {
  const rawUrl = normalizeOptional(input.url)
  const rawPageUrl = normalizeOptional(input.pageUrl)

  if (rawUrl && rawPageUrl) {
    return { ok: false, error: 'Provide exactly one of: url (WebSocket or webpage URL) or pageUrl (https://…).'}
  }

  if (!rawUrl && !rawPageUrl) {
    return { ok: false, error: 'Provide exactly one of: url (WebSocket or webpage URL) or pageUrl (https://…).'}
  }

  if (rawPageUrl) {
    const parsed = parseUrl(rawPageUrl)
    if (!parsed) {
      return { ok: false, error: `Invalid pageUrl: ${rawPageUrl}` }
    }
    if (!isHttpProtocol(parsed.protocol)) {
      return { ok: false, error: `pageUrl must use http:// or https:// (received ${parsed.protocol})` }
    }
    return {
      ok: true,
      value: {
        kind: 'proxy',
        pageUrl: parsed.toString(),
        autoCoercedFromUrl: false,
      },
    }
  }

  const parsed = parseUrl(rawUrl!)
  if (!parsed) {
    return {
      ok: false,
      error: `Invalid url: ${rawUrl}. Use ws://... for an already-running Geometra server, or https://... for a normal webpage.`,
    }
  }

  if (isHttpProtocol(parsed.protocol)) {
    return {
      ok: true,
      value: {
        kind: 'proxy',
        pageUrl: parsed.toString(),
        autoCoercedFromUrl: true,
      },
    }
  }

  if (isWsProtocol(parsed.protocol)) {
    return {
      ok: true,
      value: {
        kind: 'ws',
        wsUrl: parsed.toString(),
        autoCoercedFromUrl: false,
      },
    }
  }

  return {
    ok: false,
    error: `Unsupported url protocol ${parsed.protocol}. Use ws://... for an already-running Geometra server, or http:// / https:// for webpages.`,
  }
}

export function formatConnectFailureMessage(err: unknown, target: NormalizedConnectTarget): string {
  const base = err instanceof Error ? err.message : String(err)
  const hints: string[] = []

  if (
    target.kind === 'ws' &&
    /ECONNREFUSED|timed out|closed before first frame|WebSocket error connecting/i.test(base)
  ) {
    hints.push('If this is a normal website, call geometra_connect with pageUrl: "https://…" so MCP can start @geometra/proxy for you.')
  }

  if (/Could not resolve @geometra\/proxy/i.test(base)) {
    hints.push('Ensure @geometra/proxy is installed alongside @geometra/mcp.')
  }

  if (hints.length === 0) return base
  return `${base}\nHint: ${hints.join(' ')}`
}

export function isHttpUrl(value: string): boolean {
  const parsed = parseUrl(value)
  return parsed !== null && isHttpProtocol(parsed.protocol)
}

function normalizeOptional(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isHttpProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:'
}

function isWsProtocol(protocol: string): boolean {
  return protocol === 'ws:' || protocol === 'wss:'
}
