# @geometra/proxy

Headless Chromium proxy that extracts **live DOM layout** (`getBoundingClientRect`) plus a **synthetic Geometra UI tree** and streams **GEOM v1** `frame` / `patch` messages over WebSocket (JSON text). Use it with [`@geometra/mcp`](../../mcp/README.md) to drive arbitrary web apps without screenshots.

## Install

```bash
npm install @geometra/proxy playwright
npx playwright install chromium
```

## CLI

```bash
npx geometra-proxy https://example.com --port 3200
npx geometra-proxy http://localhost:8080 --width 1440 --height 900 --headed
```

Default mode is headless. Use `--headed` when you want to watch the browser interact in real time while driving it through `@geometra/mcp`. This is mainly for debugging / demos and usually does **not** materially change token usage, because token usage comes from MCP response payloads rather than whether Chromium is visible.

## Protocol

Matches `packages/server` GEOM v1: `frame` with `layout`, `tree`, `protocolVersion`; `patch` with `patches`; client messages `resize`, `event` (`onClick`), `key`, `composition`.

Proxy-specific client messages (native Textura servers respond with `error`):

- **`file`** — `paths`, optional `x`/`y`, `strategy` (`auto`|`chooser`|`hidden`|`drop`), optional `dropX`/`dropY` for drop targets.
- **`selectOption`** — `{ type: 'selectOption', x, y, value? | label? | index? }` — native `<select>` only.
- **`listboxPick`** — `{ type: 'listboxPick', label, exact?, openX?, openY? }` — ARIA `role=option` (custom dropdowns).
- **`wheel`** — `{ type: 'wheel', deltaY?, deltaX?, x?, y? }` — scroll / wheel at optional coordinates.

Extraction merges **all nested iframes** (including cross-origin) into root viewport coordinates, walks **open shadow roots**, and best-effort **enriches names** from Chrome’s accessibility tree (CDP) for closed shadow / opaque widgets.

Binary framing is not used (always JSON text), which is what the MCP server expects.

## Limitations

- No shadow-DOM piercing; iframes are not flattened.
- Large DOMs produce large frames; patch coalescing follows the same rules as `@geometra/server`.
