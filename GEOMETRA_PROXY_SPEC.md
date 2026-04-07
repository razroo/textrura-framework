# Geometra Proxy — Geometry Protocol for Any Web App

## Problem

Computer-use agents (Anthropic computer use, OpenAI Operator, Google Mariner) interact with web UIs through a slow, expensive loop:

```
screenshot → vision model → "I see a button" → click → wait for render → screenshot → repeat
```

Every action costs 3-5 seconds and a vision model inference call. Vision models hallucinate UI elements, miss small text, and can't reliably read dense interfaces.

## Solution

A proxy server that sits between Chromium (typically **visible / headed by default** in `geometra-proxy`) and AI agents, extracting computed geometry from any web app and streaming it as structured JSON over WebSocket — the Geometra geometry protocol.

```
Traditional computer-use:
  Agent → screenshot → vision model → interpret pixels → act → 3-5s per action

Geometra Proxy:
  Agent → WebSocket → { role: "button", name: "Submit", bounds: {x:200, y:300, w:80, h:40} } → 50ms
```

The browser still renders the page (handles all CSS — grid, floats, everything). The proxy just extracts the computed result and streams it.

## Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  AI Agent    │◄───►│   Geometra Proxy      │◄───►│  Any Web App │
│  (MCP/WS)   │     │                        │     │  (existing)  │
│              │     │  1. Chromium (headed*)  │     │              │
│  Reads JSON  │     │  2. DOM observer       │     │  Gmail,      │
│  geometry    │     │  3. Geometry extractor │     │  Salesforce, │
│              │     │  4. WebSocket server   │     │  any URL     │
└─────────────┘     └──────────────────────┘     └─────────────┘
```

## How It Works

### 1. Browser Layer (Playwright/Puppeteer)

Launch Chromium and navigate to the target URL. The **`geometra-proxy` CLI defaults to `headless: false`** (visible window); use `--headless` or `GEOMETRA_HEADLESS=1` for CI.

```ts
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage()
await page.goto(targetUrl)
```

\*Headless mode is still supported for automation hosts without a display.

### 2. Geometry Extraction

Inject a script that extracts computed geometry + semantic info from every visible DOM element:

```ts
const geometry = await page.evaluate(() => {
  function extract(element, path = []) {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)

    // Skip invisible elements
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) {
      return null
    }

    const node = {
      role: element.getAttribute('role') || inferRole(element),
      name: getAccessibleName(element),
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      path,
      focusable: isFocusable(element),
      children: [],
    }

    // Add state
    if (element.disabled) node.state = { disabled: true }
    if (element.getAttribute('aria-expanded')) {
      node.state = { ...node.state, expanded: element.getAttribute('aria-expanded') === 'true' }
    }

    // Recurse into children
    let childIndex = 0
    for (const child of element.children) {
      const childNode = extract(child, [...path, childIndex])
      if (childNode) {
        node.children.push(childNode)
        childIndex++
      }
    }

    // For leaf text nodes
    if (node.children.length === 0 && element.textContent?.trim()) {
      node.text = element.textContent.trim()
    }

    return node
  }

  function inferRole(el) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'button' || tag === 'a') return 'button'
    if (tag === 'input') return el.type === 'checkbox' ? 'checkbox' : 'textbox'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'nav') return 'navigation'
    if (tag === 'main') return 'main'
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') return 'heading'
    if (tag === 'li') return 'listitem'
    if (tag === 'ul' || tag === 'ol') return 'list'
    if (tag === 'img') return 'img'
    return 'group'
  }

  function getAccessibleName(el) {
    return el.getAttribute('aria-label')
      || el.getAttribute('alt')
      || el.getAttribute('title')
      || el.getAttribute('placeholder')
      || (el.labels?.[0]?.textContent)
      || (el.textContent?.trim().slice(0, 100))
      || undefined
  }

  function isFocusable(el) {
    const tag = el.tagName.toLowerCase()
    if (el.disabled) return false
    if (el.tabIndex >= 0) return true
    return ['a', 'button', 'input', 'select', 'textarea'].includes(tag)
  }

  return extract(document.body, [])
})
```

### 3. MutationObserver for Live Updates

Watch for DOM changes and re-extract geometry on mutations:

```ts
await page.evaluate(() => {
  const observer = new MutationObserver(() => {
    // Debounce and re-extract
    clearTimeout(window.__geometraTimer)
    window.__geometraTimer = setTimeout(() => {
      const geometry = extract(document.body, [])
      window.__geometraCallback(geometry)
    }, 50)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  })
})
```

### 4. WebSocket Server

Stream geometry updates using the same protocol as native Geometra servers:

```ts
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: 3200 })

wss.on('connection', (ws) => {
  // Send initial frame
  ws.send(JSON.stringify({
    type: 'frame',
    layout: currentGeometry,   // { x, y, width, height, children: [...] }
    tree: currentTree,         // { kind, props, semantic, children: [...] }
  }))

  // On DOM change, send patch or full frame
  onGeometryUpdate((newGeometry) => {
    ws.send(JSON.stringify({
      type: 'frame',
      layout: newGeometry,
      tree: currentTree,
    }))
  })

  // Handle agent interactions
  ws.on('message', (data) => {
    const msg = JSON.parse(data)

    if (msg.type === 'event' && msg.eventType === 'onClick') {
      // Forward click to the actual browser page
      page.mouse.click(msg.x, msg.y)
    }

    if (msg.type === 'key') {
      // Forward keyboard event to the browser
      page.keyboard.press(msg.key)
    }

    if (msg.type === 'resize') {
      page.setViewportSize({ width: msg.width, height: msg.height })
    }
  })
})
```

### 5. Agent Interaction (via existing @geometra/mcp)

The existing MCP server (`mcp/` in this repo) works unchanged. Agent connects to the proxy the same way it connects to a native Geometra server:

```
claude mcp add geometra -- node ./mcp/dist/index.js
```

```
> Connect to ws://localhost:3200 and tell me what's on screen
> Click the "Sign In" button
> Type "user@example.com" into the email field
```

## File Structure

```
packages/proxy/
├── src/
│   ├── index.ts           # CLI entry: parse args, launch proxy
│   ├── browser.ts         # Playwright browser management
│   ├── extractor.ts       # DOM → geometry extraction logic
│   ├── observer.ts        # MutationObserver + change detection
│   ├── server.ts          # WebSocket server (Geometra protocol)
│   └── types.ts           # Shared types
├── package.json
├── tsconfig.json
└── README.md
```

## CLI Interface

```bash
# Basic usage
geometra-proxy https://gmail.com --port 3200

# With viewport size
geometra-proxy https://app.example.com --port 3200 --width 1440 --height 900

# With authentication (cookies/headers)
geometra-proxy https://internal.app.com --port 3200 --cookie "session=abc123"
```

## package.json

```json
{
  "name": "@geometra/proxy",
  "version": "0.1.0",
  "description": "Geometry protocol proxy for any web app — extract computed layout from live DOM, stream to AI agents",
  "bin": {
    "geometra-proxy": "./dist/index.js"
  },
  "dependencies": {
    "playwright": "^1.40.0",
    "ws": "^8.18.0"
  }
}
```

## Protocol Compatibility

The proxy outputs the same wire format as native Geometra servers:

**Server → Agent:**
- `{ type: 'frame', layout: { x, y, width, height, children: [...] }, tree: {...} }`
- `{ type: 'patch', patches: [{ path: [0,1], x, y, width, height }] }`

**Agent → Server:**
- `{ type: 'event', eventType: 'onClick', x: 200, y: 300 }` → forwarded as `page.mouse.click(200, 300)`
- `{ type: 'key', eventType: 'onKeyDown', key: 'Enter', ... }` → forwarded as `page.keyboard.press('Enter')`
- `{ type: 'resize', width: 1440, height: 900 }` → forwarded as `page.setViewportSize(...)`

## Diff Detection (Optimization)

Instead of re-extracting the full DOM on every mutation, diff the geometry:

1. On mutation, re-extract only the subtree that changed (use MutationObserver target)
2. Compare new bounds against previous bounds
3. Send `patch` messages for changed nodes, `frame` for structural changes (add/remove elements)

This keeps the WebSocket traffic minimal for most interactions (button hover, input typing, etc.).

## Key Decisions

- **Playwright over Puppeteer**: Better cross-browser support, more reliable selectors, active maintenance
- **Extract from computed DOM, not source HTML**: This handles all CSS (grid, floats, calc, media queries) because the browser already resolved everything
- **Same WebSocket protocol as native Geometra**: The existing MCP server and any Geometra client work unchanged
- **Headless by default**: No visible browser window. The proxy is infrastructure, not a user-facing tool.

## Success Criteria

1. Agent can navigate a real web app (e.g. a todo app) via the proxy using only `geometra_connect` / `geometra_query` / `geometra_click` / `geometra_type`
2. Interaction speed is <200ms per action (vs 3-5s for screenshot + vision model)
3. Element identification accuracy is >95% (vs ~80% for vision models on dense UIs)
4. Works with SPAs (React, Vue, Angular) that update DOM dynamically
5. MutationObserver catches dynamic content changes and streams updates

## What This Enables

- **Computer-use agents** interact with any web app at JSON speed, no vision model in the loop
- **Testing agents** verify web app behavior without screenshot diffing
- **Monitoring agents** watch live web apps for UI state changes
- **Migration path**: teams using the proxy discover native Geometra is even faster (no browser at all), creating an adoption funnel
