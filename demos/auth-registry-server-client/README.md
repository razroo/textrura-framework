# Auth + token registry + Geometra server/client

End-to-end demo matching **`PLATFORM_AUTH.md`**:

1. **`@geometra/token-registry`** — HTTP `POST /verify` on port **3200**
2. **`@geometra/auth`** — `createAuth` + `remoteVerifier('http://127.0.0.1:3200/verify')` spread into `createServer`
3. **Browser** — `connectWithAuth` from `@geometra/auth/client`

Opaque tokens are minted at server startup (new random values each run). A small **localhost-only** HTTP server on **3098** exposes `GET /demo-tokens` so this page can load `{ admin, viewer }` without hard-coding secrets.

## Run (two terminals)

From the **repo root**:

```bash
npm install
cd demos/auth-registry-server-client
npm install
```

**Terminal 1 — combined registry + Geometra server**

```bash
npm run server
```

**Terminal 2 — Vite client**

```bash
npm run client
```

Open the URL Vite prints (usually `http://localhost:5173`). Use **Admin** / **Viewer** / **Invalid** to exercise handshake **4001**, **Forbidden** on blocked events, and live frames.

## Optional env

- **`REGISTRY_ADMIN_KEY`** — protects registry admin routes (default in code is a local demo key). Minting in this demo uses `registry.createToken()` in-process, not the HTTP admin API.
- **`REGISTRY_PORT`** (default `3200`), **`DEMO_TOKENS_PORT`** (default `3098`), **`GEOMETRA_PORT`** (default `3100`) — change if ports are already in use. If you change them, update **`DEMO_TOKENS_URL`** and **`url`** in `client.ts` to match.

## See also

- [`PLATFORM_AUTH.md`](../../PLATFORM_AUTH.md) (repo root)
- [`@geometra/auth`](https://www.npmjs.com/package/@geometra/auth)
- [`@geometra/token-registry`](https://www.npmjs.com/package/@geometra/token-registry)
