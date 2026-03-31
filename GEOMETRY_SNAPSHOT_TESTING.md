# Geometry snapshot testing

Patterns for locking **computed layout** (`ComputedLayout` from Textura) and **tree shape** in CI without a pixel raster.

## What to snapshot

- **Layout numbers** — `x`, `y`, `width`, `height`, and `children` arrays (rounded if your pipeline has float noise).
- **Semantic / a11y** — `toAccessibilityTree` output (see core a11y tests) when behavior is contract-driven.
- **Protocol patches** — `diffLayout` / `coalescePatches` results for deterministic trees (`packages/server` tests).

Avoid snapshotting raw **canvas pixels** unless the job is explicitly visual regression; prefer geometry or draw-operation traces (see `packages/renderer-canvas` visual regression tests).

## Minimal layout snapshot (Vitest)

```ts
import { expect, it } from 'vitest'
import { box, text, toLayoutTree } from '@geometra/core'
import { init, computeLayout } from 'textura'

it('layout matches snapshot', async () => {
  await init()
  const tree = box({ width: 200, height: 100, padding: 8 }, [
    text({ text: 'Hi', font: '14px sans-serif', lineHeight: 18 }),
  ])
  const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 100 })
  const stable = JSON.stringify(layout, null, 2)
  expect(stable).toMatchSnapshot()
})
```

Round or strip volatile fields if WASM/layout micro-differences appear across platforms.

## Renderer paint audits

- **Font stack** — `visual-regression.test.ts` records `ctx.font` at each `fillText` for mixed-family trees.
- **Draw ops** — the same file snapshots the fake 2D **operation sequence** for selection, focus ring, gradients, and clipping.

## CI

- **`npm run test:geometry`** — runs `packages/core/src/__tests__/geometry-snapshot-ci.test.ts` (rounded `ComputedLayout` snapshot). Included in **`npm run release:gate`** so CI quality workflows exercise it.

## Related

- `PERF_BASELINES.md` — wall-time smoke thresholds.
- `FONTS_AND_METRICS.md` — when text metrics affect layout snapshots across environments.
