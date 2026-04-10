/**
 * Integration test for `connectThroughProxy({ isolated: true })`.
 *
 * Setup: a tiny HTTP server serves an HTML page that, on first visit, writes
 * a path-tagged marker to `localStorage` if one isn't already set, then
 * renders the marker text into an `<h1>`. The marker is therefore set ONCE
 * per browser instance, regardless of how many navigations happen.
 *
 * Two scenarios verify the isolated flag's behavior:
 *
 * 1. **Pooled (default)**: connect to `/page-a`, disconnect (the proxy
 *    enters the reusable pool), then connect to `/page-b`. The second
 *    connect attaches to the same pooled proxy, which navigates the
 *    existing Chromium from /page-a to /page-b — but the browser's
 *    localStorage still has `marker-from-/page-a`, so the second session
 *    SEES THE FIRST SESSION'S MARKER. This documents the contamination
 *    that breaks parallel form submission against real apply flows.
 *
 * 2. **Isolated**: same connect/disconnect/connect sequence, but with
 *    `isolated: true`. Each connect spawns a brand-new Chromium with
 *    empty storage, so the second session sees its own marker, not the
 *    first's. This is the fix.
 *
 * The point of having both cases in one test file is so that future edits
 * to the pool code can't quietly break the isolation guarantee — both
 * paths run end-to-end against real Chromium and assert on the actual
 * post-navigation a11y tree the MCP would expose to a tool call.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { buildA11yTree, connectThroughProxy, disconnect } from '../session.js'
import type { A11yNode, Session } from '../session.js'

const PAGE_HTML = `<!doctype html>
<html>
  <head><title>isolation-fixture</title></head>
  <body>
    <h1 id="marker"></h1>
    <script>
      const stored = localStorage.getItem('isolation-marker')
      if (!stored) {
        // First visit in this browser instance — set a path-tagged marker.
        localStorage.setItem('isolation-marker', 'marker-from-' + location.pathname)
      }
      document.getElementById('marker').textContent =
        localStorage.getItem('isolation-marker') || 'marker-missing'
    </script>
  </body>
</html>`

let baseUrl: string
let server: http.Server

function findHeadingText(node: A11yNode | null | undefined): string | undefined {
  if (!node) return undefined
  if (node.role === 'heading') {
    const name = (node.name ?? '').trim()
    if (name) return name
  }
  for (const child of node.children ?? []) {
    const found = findHeadingText(child)
    if (found) return found
  }
  return undefined
}

function currentA11y(session: Session): A11yNode | null {
  if (!session.tree || !session.layout) return null
  return buildA11yTree(session.tree, session.layout)
}

async function waitForMarkerText(
  session: Session,
  expectedPrefix: string,
  timeoutMs = 6_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = findHeadingText(currentA11y(session))
    if (text && text.startsWith(expectedPrefix)) return text
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(
    `Timed out waiting for heading text starting with "${expectedPrefix}". ` +
    `Last seen: ${JSON.stringify(findHeadingText(currentA11y(session)) ?? null)}`,
  )
}

describe('connectThroughProxy({ isolated: true })', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '/'
      if (url === '/page-a' || url === '/page-b') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(PAGE_HTML)
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(() => {
    // Force-close everything so the next test starts with no pooled proxies.
    disconnect({ closeProxy: true })
  })

  it('isolated sessions get independent localStorage between connects', async () => {
    // First isolated session against /page-a.
    const sessionA = await connectThroughProxy({
      pageUrl: `${baseUrl}/page-a`,
      headless: true,
      isolated: true,
    })
    expect(sessionA.isolated).toBe(true)
    const markerA = await waitForMarkerText(sessionA, 'marker-from-')
    expect(markerA).toBe('marker-from-/page-a')

    // Disconnect — because the session is isolated, this MUST destroy the
    // underlying Chromium. The next connect cannot attach to it.
    disconnect({ sessionId: sessionA.id })

    // Second isolated session against /page-b. Because each isolated
    // session gets its own brand-new Chromium, /page-b's first-visit
    // script runs against an empty localStorage and writes its own marker.
    const sessionB = await connectThroughProxy({
      pageUrl: `${baseUrl}/page-b`,
      headless: true,
      isolated: true,
    })
    expect(sessionB.isolated).toBe(true)
    const markerB = await waitForMarkerText(sessionB, 'marker-from-')
    // Critical assertion: sessionB does NOT see sessionA's marker.
    expect(markerB).toBe('marker-from-/page-b')
    expect(markerB).not.toBe(markerA)

    disconnect({ sessionId: sessionB.id })
  }, 30_000)

  it('pooled (default) sessions DO leak localStorage — documents the bug isolated fixes', async () => {
    // First pooled session against /page-a. The proxy will be eligible
    // for reuse after disconnect.
    const sessionA = await connectThroughProxy({
      pageUrl: `${baseUrl}/page-a`,
      headless: true,
      // isolated: false (default)
    })
    expect(sessionA.isolated).toBeFalsy()
    const markerA = await waitForMarkerText(sessionA, 'marker-from-')
    expect(markerA).toBe('marker-from-/page-a')

    // Disconnect WITHOUT closing the proxy — leaves it in the reusable pool.
    disconnect({ sessionId: sessionA.id, closeProxy: false })

    // Second pooled session against a *different* URL. The pool will
    // attach the existing Chromium and navigate it to /page-b, but the
    // browser still has /page-a's localStorage, so /page-b's first-visit
    // script sees the existing marker and doesn't overwrite it.
    const sessionB = await connectThroughProxy({
      pageUrl: `${baseUrl}/page-b`,
      headless: true,
    })
    const markerB = await waitForMarkerText(sessionB, 'marker-from-')
    // Documents the contamination: the second session sees the first
    // session's marker because they share a browser via the pool.
    expect(markerB).toBe('marker-from-/page-a')

    disconnect({ sessionId: sessionB.id, closeProxy: true })
  }, 30_000)

  it('serializes concurrent default connects to a pooled proxy onto a single session', async () => {
    // Regression for the per-proxy attach race. Before the attachLock fix,
    // two concurrent connectThroughProxy calls that both picked the same
    // pooled proxy entry could both pass attachToReusableProxy's
    // "reusedExistingSession" check (because neither's session was in
    // activeSessions yet — connect() runs first) and then both call
    // connect(proxy.wsUrl), creating two distinct WebSocket sessions
    // bound to the same Chromium. Two agents would silently mutate the
    // same DOM. With the lock, the second connect waits for the first,
    // re-picks via findReusableProxy, and takes the reusedExistingSession
    // branch — both calls return the same Session object.
    //
    // Step 1: warm the pool with a single connect+disconnect so the next
    // connects find an existing entry. Cold-start parallel connects
    // legitimately create separate browsers (no shared state to leak), so
    // the race only matters when the pool is already populated.
    const warmup = await connectThroughProxy({
      pageUrl: `${baseUrl}/page-a`,
      headless: true,
    })
    disconnect({ sessionId: warmup.id, closeProxy: false })

    // Step 2: fire two concurrent connects. Without the lock, both would
    // call connect(proxy.wsUrl) and create distinct sessions bound to the
    // same browser. With the lock, the second waits for the first to bind,
    // then sees the bound session and reuses it.
    const [sessionA, sessionB] = await Promise.all([
      connectThroughProxy({ pageUrl: `${baseUrl}/page-a`, headless: true }),
      connectThroughProxy({ pageUrl: `${baseUrl}/page-a`, headless: true }),
    ])

    // Both connects must converge on the same underlying session. If they
    // don't, the race re-emerged: two agents would race in the same browser.
    expect(sessionA.id).toBe(sessionB.id)

    disconnect({ sessionId: sessionA.id, closeProxy: true })
  }, 30_000)
})
