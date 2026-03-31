# Release notes — 1.8 (layout timing + geometry CI gate)

## Summary

- **`Renderer.setFrameTimings?({ layoutMs })`** — `createApp` measures `computeLayout` and invokes this hook before `render`.
- **`CanvasRenderer`** — implements the hook as **`lastLayoutWallMs`**; **`layoutInspector`** HUD shows **`layout X.XXms`** (Yoga) alongside **`render X.XXms`** (paint through HUD).
- **`npm run test:geometry`** — Vitest snapshot for a rounded box-only `ComputedLayout`; runs as part of **`npm run release:gate`**.

## Migration notes

- **Non-breaking**: `setFrameTimings` is optional; existing renderers need no changes.

## Verification

- `npm run test` · `npm run release:gate` · `npm run build`
