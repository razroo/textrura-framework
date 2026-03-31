# Integration cookbook (1.5+)

Short recipes for common stacks. All paths assume a Geometra workspace install.

## Local canvas app

1. Build layout with `@geometra/core` (`box`, `text`, signals) and optional `@geometra/ui` primitives.
2. Run Yoga via `textura` (`computeLayout`) or use `createApp` from core for local loop.
3. Paint with `CanvasRenderer` from `@geometra/renderer-canvas`.
4. **Inspector**: `new CanvasRenderer({ canvas, layoutInspector: true })`. Optionally set `renderer.inspectorProbe = { x, y }` in layout coordinates on pointer move to show `hitPathAtPoint` in the HUD. `renderer.renderFrame` increments each paint.

## Thin client + server

1. Server: `createServer` from `@geometra/server` — layout and diffs stay on the server.
2. Client: `createClient` from `@geometra/client` with a `CanvasRenderer`; forward resize for correct viewport.
3. Optional: negotiate `binaryFraming` and watch `onFrameMetrics` / server `onTransportMetrics` (see `TRANSPORT_1_4.md`).

## DOM-free migration

- Replace DOM measurement with Textura layout + core text metrics; avoid `window.getComputedStyle` in hot paths.
- Pointer: use hit events (`localX` / `localY`) from Geometra hit tests, not DOM `target`.
- Focus: use `focusedElement`, `focusNext` / `focusPrev`, and `collectFocusOrder` when building custom focus or inspector UX.

## Related docs

- `PROTOCOL_COMPATIBILITY.md` — wire format and optional binary frames.
- `TRANSPORT_1_4.md` — backpressure and CI transport baselines.
- `FRAMEWORK_NORTH_STAR.md` — invariants and quality bar.
