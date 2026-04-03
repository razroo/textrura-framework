# Auth, token registry, and Geometra core

Geometra’s rendering pipeline stays **identity-agnostic**: `@geometra/core` and layout/geometry code never depend on an IdP or token store. Production apps attach auth at the **WebSocket boundary** on the server and pass tokens on the client URL (or a custom extractor).

## Related repositories

| Repo | Package | Role |
|------|---------|------|
| [geometra](https://github.com/razroo/geometra) | `@geometra/server`, `@geometra/client` | Layout authority, thin client, protocol |
| [geometra-auth](https://github.com/razroo/geometra-auth) | `@geometra/auth` | `createAuth()` hooks for `createServer()`; `connectWithAuth()` for clients |
| [geometra-token-registry](https://github.com/razroo/geometra-token-registry) | `@geometra/token-registry` | HTTP verify API for `remoteVerifier()`; token mint/revoke |

## Server contract (`@geometra/server`)

`createServer(view, options)` supports optional hooks:

- **`onConnection(request)`** — Return a **truthy** context (e.g. auth profile) to accept the socket; return **`null`** to reject. Rejection closes the WebSocket with code **`4001`** (`CLOSE_AUTH_FAILED` in `packages/server/src/protocol.ts`).
- **`onMessage(message, context)`** — Return **`false`** to block the message. The server sends a protocol **`error`** with message `"Forbidden"` and code **`4003`** (`CLOSE_FORBIDDEN`).

Layout, patches, and protocol versioning are unchanged. See `PROTOCOL_COMPATIBILITY.md` and `PROTOCOL_EVOLUTION.md`.

## Client contract (`@geometra/client`)

- **Auth rejected (4001)** — The socket closes before any frame. **`createClient`** does not reconnect after **`4001`** (so bad tokens do not retry forever). Use **`onClose`** if you need UI when the server rejects the handshake.
- **Forbidden (4003)** — Delivered as a normal **`error`** server message; `onError` receives `new Error("Forbidden")` (same path as other protocol errors).

`@geometra/auth` **`connectWithAuth`** forwards **`4001`** to **`onAuthRejected`**.

## Token placement

Default pattern (used by `connectWithAuth`): **`?token=`** on the WebSocket URL. Servers can override with **`extractToken(request)`** (for example `Sec-WebSocket-Protocol`, `Authorization` on the upgrade where supported, or cookies via your HTTP server).

## Token refresh and reconnect

There is **no** in-band token refresh in the geometry protocol. When a token expires:

1. Close the client (or let the server close you).
2. Obtain a new token from your issuer (for example `@geometra/token-registry` admin API or your own IdP).
3. Open a **new** WebSocket with the new token.

## Production stack (registry + remote verify)

1. Run **`serveRegistry()`** from `@geometra/token-registry` (or your own service that implements the same **`POST /verify`** contract: Bearer token, JSON `{ role, claims? }`).
2. On the Geometra server:

   ```ts
   import { createServer } from '@geometra/server'
   import { createAuth, remoteVerifier } from '@geometra/auth'

   const auth = createAuth({
     verify: remoteVerifier('http://localhost:3200/verify'),
     policies: { viewer: { allow: ['resize'] } },
   })

   await createServer(view, { port: 3100, ...auth })
   ```

3. On the browser client, use **`connectWithAuth`** with a token minted by the registry (or your IdP).

## What stays out of core

- No imports of `@geometra/auth` or `@geometra/token-registry` inside `packages/core`, renderers, or the default server/client surface.
- Optional packages and cookbooks wire the stack at **app** level.

## See also

- `INTEGRATION_COOKBOOK.md` — links here for the thin-client + server path.
- [geometra-auth README](https://github.com/razroo/geometra-auth/blob/main/README.md) — verifiers, policies, `extractToken`.
- [geometra-token-registry README](https://github.com/razroo/geometra-token-registry/blob/main/README.md) — HTTP API and stores.
