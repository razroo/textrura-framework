# Release notes — 1.7 (dev observability + geometry CI docs)

## Summary

- **CanvasRenderer** — `lastRenderWallMs` records full `render()` wall time (ms). With `layoutInspector: true`, the HUD shows **`render X.XXms`** measured just before the inspector draws (negligible gap vs full frame).
- **`GEOMETRY_SNAPSHOT_TESTING.md`** — How to snapshot `ComputedLayout` / draw-op traces in Vitest without pixel baselines.

## Migration notes

- No breaking changes. Inspector remains off by default.

## Verification

- `npm run test` · `npm run build`
