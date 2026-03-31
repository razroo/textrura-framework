# Render target strategy (1.3)

## Selected target

`WebGPU` is the selected non-canvas backend target for the 1.3 proof milestone.

## Why WebGPU first

- Reuses browser-hosted canvas surfaces while proving a non-Canvas2D paint path.
- Validates the "same geometry, different backend" architecture with minimal
  protocol disruption.
- Creates a practical stepping stone for future performance-focused renderer work.

## Non-goals for 1.3 MVP

- Full visual parity with `@geometra/renderer-canvas`
- Complete text shaping/painting parity
- Advanced effects parity (gradients, shadows, border radius clipping)

## MVP definition

- `WebGPURenderer` capability check and async initialization
- Stable `render(layout, tree)` and `destroy()` integration with core app lifecycle
- Geometry-driven rendering of solid rectangular box fills
- Explicit unsupported-surface callback for fallback observability

## Compatibility notes

- Existing app protocol remains unchanged (`tree` + `layout` payloads).
- Backend choice is renderer-local and does not require protocol forks.
