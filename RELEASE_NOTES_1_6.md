# Release notes — 1.6 (fonts, metrics, protocol guidance)

## Summary

- **`FONTS_AND_METRICS.md`** — Policy for `text()` `font` strings, `waitForFonts`, generic families, variable-font caveats, and server/client text metric parity.
- **`PROTOCOL_EVOLUTION.md`** — How `PROTOCOL_VERSION`, GEOM v1, and future transport changes should be rolled out.
- **Canvas regression** — `visual-regression.test.ts` asserts distinct `ctx.font` values for mixed-family text nodes (guards accidental font clobbering in the paint path).
- **Roadmap** — `1.6.0` tracks fonts/metrics/docs; see `ROADMAP.md`.

## Migration notes

- **No breaking API changes** in this track. Consumers should read `FONTS_AND_METRICS.md` if they run **server layout + browser canvas** and see wrap/caret drift (usually missing fonts on one side).

## Performance notes

- Font audit test uses the existing fake canvas context; no hot-path change.

## Verification

- `npm run test` (includes `packages/renderer-canvas` visual regression tests).
