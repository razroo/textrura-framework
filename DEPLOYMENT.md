# Production deployment

How to run Geometra for real users. This guide covers process management, reverse proxying, authentication, scaling, monitoring, and a pre-launch checklist.

## Architecture

```
 Browser / AI agent               Bun / Node server
 ┌──────────────┐                ┌──────────────────────────┐
 │  thin client  │◄── WebSocket ──┤  view() → Yoga WASM      │
 │  (~2 KB loop) │   { x,y,w,h } │  → geometry diff/patch   │
 │  paint only   │────────────────┤  → broadcast to clients  │
 └──────────────┘  pointer/key    └──────────────────────────┘
```

The server holds the UI tree and computes layout. Clients receive pre-computed `{ x, y, width, height }` geometry and paint it. Clients are stateless paint loops; all application state lives on the server.

**Key implication**: the server is stateful. Each process owns its UI tree and set of connected WebSocket clients. This shapes every deployment decision below.

## Minimal production server

```ts
import { signal, box, text } from '@geometra/core/node'
import { createServer } from '@geometra/server'

const count = signal(0)

function view() {
  return box({ padding: 20 }, [
    text({ text: `Count: ${count.value}`, font: '16px Inter', lineHeight: 22, color: '#fff' }),
  ])
}

const server = await createServer(view, {
  port: Number(process.env.PORT ?? 3100),
  width: 800,
  height: 600,
  backpressureBytes: 512 * 1024,  // 512 KiB default
  onError: (err) => console.error('[geometra]', err),
})

console.log(`Geometra server listening on ws://0.0.0.0:${process.env.PORT ?? 3100}`)
```

### Attaching to an existing HTTP server

If you need HTTP endpoints (health checks, REST API) on the same port:

```ts
import { createServer as createHttpServer } from 'node:http'
import { createServer } from '@geometra/server'

const http = createHttpServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }
  res.writeHead(404).end()
})

const server = await createServer(view, {
  httpServer: http,
  wsPath: '/geometra-ws',  // default
  width: 800,
  height: 600,
  onError: (err) => console.error('[geometra]', err),
})

http.listen(Number(process.env.PORT ?? 3100), '0.0.0.0')
```

WebSocket clients connect to `ws://host:port/geometra-ws`. The `wsPath` is customizable.

## Environment variables

These are used across demos and can be adopted in production:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server listen port |
| `GEOMETRA_FULL_STACK_PORT` | `3200` | Full-stack dashboard demo port |
| `GEOMETRA_FULL_STACK_CLIENT_ORIGIN` | `http://localhost:5173/` | Allowed client origin (CORS) |
| `REGISTRY_PORT` | `3200` | Token registry HTTP port |
| `GEOMETRA_PORT` | `3100` | Geometra WS port (auth demos) |
| `REGISTRY_ADMIN_KEY` | — | Admin key for token registry |
| `VITE_GEOMETRA_WS_URL` | `ws://localhost:3100` | Client-side WS URL (Vite env) |

## Process management

### Bun (recommended)

```bash
bun run server.ts
```

For production, use a process supervisor. Bun does not have a built-in cluster mode.

### PM2

```bash
pm2 start server.ts --interpreter bun --name geometra
pm2 save
pm2 startup
```

### systemd

```ini
[Unit]
Description=Geometra server
After=network.target

[Service]
Type=simple
User=geometra
WorkingDirectory=/opt/geometra
ExecStart=/usr/local/bin/bun run server.ts
Restart=on-failure
RestartSec=5
Environment=PORT=3100
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Docker

```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN bun run build
EXPOSE 3100
CMD ["bun", "run", "server.ts"]
```

### Horizontal scaling

The server is stateful: each process holds its own UI tree and client set. You cannot round-robin WebSocket connections across replicas.

To scale horizontally:

- **Shard by session**: route each user to a specific process (sticky sessions via a load balancer or session-based routing).
- **One process per "room"**: if your app has independent workspaces (e.g. dashboards, documents), run one Geometra server per workspace.
- **Do not** load-balance WebSocket upgrade requests across replicas — a client must stay on the process that owns its UI state.

For most apps, a single Geometra process handles many concurrent clients efficiently because layout computation is fast (Yoga WASM) and only changed geometry is broadcast (patches, not full frames).

## Reverse proxy

### Nginx

```nginx
upstream geometra {
    server 127.0.0.1:3100;
}

server {
    listen 443 ssl;
    server_name app.example.com;

    ssl_certificate     /etc/ssl/certs/app.pem;
    ssl_certificate_key /etc/ssl/private/app.key;

    # WebSocket upgrade
    location /geometra-ws {
        proxy_pass http://geometra;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Keep idle connections alive (default 60s may be too short)
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Static client assets
    location / {
        root /var/www/geometra-client;
        try_files $uri $uri/ /index.html;
    }
}
```

### Caddy

```caddyfile
app.example.com {
    handle /geometra-ws {
        reverse_proxy localhost:3100
    }
    handle {
        root * /var/www/geometra-client
        file_server
        try_files {path} /index.html
    }
}
```

Caddy handles WebSocket upgrades and TLS automatically.

## TLS / WSS

Terminate TLS at the reverse proxy, not in the Geometra server. The server listens on plain `ws://` internally; the proxy upgrades to `wss://` externally.

Client connection:

```ts
const client = createClient({
  url: 'wss://app.example.com/geometra-ws',
  renderer,
  canvas,
})
```

## Authentication

Geometra's rendering pipeline is identity-agnostic. Auth is attached at the WebSocket boundary using server hooks. See `PLATFORM_AUTH.md` for the full contract.

### Quick setup

```ts
const server = await createServer(view, {
  port: 3100,
  onConnection: async (request) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
    const token = url.searchParams.get('token')
    if (!token) return null  // reject → 4001, client won't reconnect

    const user = await verifyToken(token)
    return user ?? null  // truthy = accept, null = reject
  },
  onMessage: (message, context) => {
    // Return false to block a message (sends 4003 error to client)
    return true
  },
  onDisconnect: (context) => {
    // Clean up user session
  },
})
```

**Close codes**:

| Code | Meaning | Client behaviour |
|------|---------|-----------------|
| `4001` | Auth rejected | No auto-reconnect |
| `4003` | Message forbidden | Delivered as `error` message |
| `1000` | Normal close | Reconnect if `reconnect: true` |

For production token management, use `@geometra/auth` and `@geometra/token-registry`. See `PLATFORM_AUTH.md`.

## Scaling characteristics

### What's fast

- **Layout**: Yoga WASM computes flexbox layout in microseconds for typical UI trees.
- **Diffing**: Only changed `{ x, y, width, height }` values are sent as patches (not full frames).
- **Coalescing**: Duplicate patch paths are merged before broadcast (last write wins).
- **Binary framing**: Optional GEOM v1 envelope wraps JSON in a 9-byte header, negotiated per-client.

### Backpressure

When a client's `WebSocket.bufferedAmount` exceeds `backpressureBytes` (default 512 KiB), that client is skipped for the current broadcast and marked for a full frame resync on the next successful send. This keeps server memory bounded under slow consumers.

### When full frames are sent

- Initial connection (first frame)
- After backpressure resync
- When the tree structure changes (new/removed elements)
- When patch count exceeds 20 for a single update

### Limits to be aware of

- Each `server.update()` recomputes layout and broadcasts to all clients. Very high-frequency updates (>60/s) can saturate the WebSocket write buffer.
- Tree structural changes always trigger a full frame, not patches. Minimise unnecessary element creation/destruction in hot loops.
- The binary framing envelope is a transport optimisation, not compression. For large trees, frame sizes are proportional to node count.

## Client deployment

The thin client is a static JS bundle. Build it with Vite (or any bundler) and serve from a CDN.

```bash
npx vite build  # produces dist/ with static assets
```

### Reconnection

`createClient` reconnects automatically by default:

- Exponential backoff: starts at 1s, doubles each retry, caps at 30s
- **Does not reconnect** after auth rejection (close code 4001)
- Disable with `reconnect: false`

### Binary framing

Opt in per-client for reduced frame overhead:

```ts
const client = createClient({
  url: 'wss://app.example.com/geometra-ws',
  renderer,
  canvas,
  binaryFraming: true,
})
```

## Monitoring and observability

### Server-side metrics

```ts
const server = await createServer(view, {
  onTransportMetrics: (metrics) => {
    // Called after each broadcast
    console.log({
      deferredSends: metrics.deferredSends,        // clients skipped (backpressure)
      coalescedPatchDelta: metrics.coalescedPatchDelta,  // patches merged
      binaryOutboundFrames: metrics.binaryOutboundFrames, // binary clients served
    })
  },
})
```

**What to alert on**:

- `deferredSends > 0` sustained: clients can't keep up. Check network or reduce update frequency.
- `coalescedPatchDelta` consistently high: redundant updates are being coalesced. Consider batching state changes with `batch()`.

### Client-side metrics

```ts
const client = createClient({
  url: 'wss://...',
  renderer,
  canvas,
  onFrameMetrics: (metrics) => {
    console.log({
      messageType: metrics.messageType,   // 'frame' | 'patch'
      decodeMs: metrics.decodeMs,         // JSON/binary parse time
      applyMs: metrics.applyMs,           // state merge time
      renderMs: metrics.renderMs,         // paint time
      patchCount: metrics.patchCount,     // patches in this message
      encoding: metrics.encoding,         // 'json' | 'binary'
      bytesReceived: metrics.bytesReceived,
    })
  },
})
```

**What to watch**: `renderMs` spikes indicate paint bottlenecks. `decodeMs` spikes on large frames may indicate the tree is too large for the client device.

## Health checks

When using the `httpServer` attachment option, add an HTTP health endpoint:

```ts
const http = createHttpServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }))
    return
  }
  res.writeHead(404).end()
})

const server = await createServer(view, { httpServer: http })
http.listen(3100)
```

Use this endpoint for load balancer health checks, Kubernetes liveness probes, and uptime monitoring.

## Pre-launch checklist

- [ ] Server listens on a non-root port behind a reverse proxy
- [ ] TLS terminated at the proxy; clients connect via `wss://`
- [ ] `onConnection` hook validates auth tokens; bad tokens get 4001
- [ ] `onError` handler logs to your observability stack (not just console)
- [ ] `backpressureBytes` set appropriately for expected client count and update frequency
- [ ] `onTransportMetrics` wired to monitoring (even just logging)
- [ ] Client built as static assets and served from CDN
- [ ] Client `reconnect: true` (default) and `onClose` handles 4001 gracefully
- [ ] Process supervisor configured (PM2, systemd, or container orchestrator)
- [ ] Reverse proxy WebSocket timeout set high enough (>= 3600s for long-lived sessions)
- [ ] Load testing performed: verify patch throughput and backpressure under concurrent clients

## Related docs

- **`PLATFORM_AUTH.md`** — Full auth contract, token registry, role-based policies
- **`TRANSPORT_1_4.md`** — Backpressure, patch coalescing, binary framing, CI baselines
- **`PROTOCOL_EVOLUTION.md`** — Protocol versioning and forward-compatibility strategy
- **`INTEGRATION_COOKBOOK.md`** — Canvas, server/client, and DOM-free migration patterns
- **`PERF_BASELINES.md`** — Performance smoke test thresholds
