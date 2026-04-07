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

## Protocol

Matches `packages/server` GEOM v1: `frame` with `layout`, `tree`, `protocolVersion`; `patch` with `patches`; client messages `resize`, `event` (`onClick`), `key`, `composition`. Binary framing is not used (always JSON text), which is what the MCP server expects.

## Limitations

- No shadow-DOM piercing; iframes are not flattened.
- Large DOMs produce large frames; patch coalescing follows the same rules as `@geometra/server`.
