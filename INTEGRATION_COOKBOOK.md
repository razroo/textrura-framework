# Integration cookbook (1.5+)

Short recipes for common stacks. All paths assume a Geometra workspace install.

## Local canvas app

1. Build layout with `@geometra/core` (`box`, `text`, signals) and optional `@geometra/ui` primitives.
2. Run Yoga via `textura` (`computeLayout`) or use `createApp` from core for local loop.
3. Paint with `CanvasRenderer` from `@geometra/renderer-canvas`.
4. **Inspector**: `new CanvasRenderer({ canvas, layoutInspector: true })`. With **`createApp`**, the HUD shows **`layout`** ms (Yoga) and **`render`** ms (canvas). Optionally set `renderer.inspectorProbe = { x, y }` on pointer move for `hitPathAtPoint`. Custom hosts can implement **`Renderer.setFrameTimings`** themselves before calling `render`.

## Thin client + server

1. Server: `createServer` from `@geometra/server` — layout and diffs stay on the server.
2. Client: `createClient` from `@geometra/client` with a `CanvasRenderer`; forward resize for correct viewport.
3. Optional: negotiate `binaryFraming` and watch `onFrameMetrics` / server `onTransportMetrics` (see `TRANSPORT_1_4.md`).
4. For the official full-stack path that also uses `@geometra/ui` and `@geometra/router`, run `npm run create:app -- ./my-geometra-app` or pick another template with `npm run create:app -- --list`.

## Production auth (`@geometra/auth` + token registry)

Auth belongs on the **WebSocket upgrade** and optional **per-message** policy hooks — not inside `@geometra/core`.

- Use **`@geometra/auth`** `createAuth()` and spread its hooks into `createServer()` (token verify + role policies).
- Use **`@geometra/token-registry`** as the HTTP backend for `remoteVerifier()`, or any compatible verify endpoint.
- Wire semantics, close codes **4001** / **4003**, refresh, and “what not to put in core” are documented in **`PLATFORM_AUTH.md`**.

## DOM-free migration

- Replace DOM measurement with Textura layout + core text metrics; avoid `window.getComputedStyle` in hot paths.
- Pointer: use hit events (`localX` / `localY`) from Geometra hit tests, not DOM `target`.
- Focus: use `focusedElement`, `focusNext` / `focusPrev`, and `collectFocusOrder` when building custom focus or inspector UX.

## Related docs

- `PLATFORM_AUTH.md` — `@geometra/auth`, `@geometra/token-registry`, WS contract, refresh/reconnect.
- `FONTS_AND_METRICS.md` — `font` strings, `waitForFonts`, server/client metric parity.
- `PROTOCOL_COMPATIBILITY.md` — wire format and optional binary frames.
- `PROTOCOL_EVOLUTION.md` — versioning and future transport changes.
- `TRANSPORT_1_4.md` — backpressure and CI transport baselines.
- `FRAMEWORK_NORTH_STAR.md` — invariants and quality bar.
- `GEOMETRY_SNAPSHOT_TESTING.md` — snapshot `ComputedLayout` and draw-op traces in tests.
