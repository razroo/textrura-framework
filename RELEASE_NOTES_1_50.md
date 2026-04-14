# Release notes — 1.50.0 (logical-axis RTL, WebGPU text, PDF renderer)

## Summary

Three deferred roadmap items land in 1.50.0:

- **Logical-axis layout props** for full RTL flow through Textura props
- **WebGPU text rendering** via offscreen canvas atlas sampled by a dedicated textured-quad pipeline
- **`@geometra/renderer-pdf`** — a new zero-dependency PDF 1.4 renderer consuming shared geometry

## Textura — logical-axis props

`FlexProps` gains 16 logical-axis properties that resolve against the node's `dir` at layout time (Yoga `Edge.Start`/`Edge.End`):

- **Padding**: `paddingInlineStart`, `paddingInlineEnd`, `paddingBlockStart`, `paddingBlockEnd`
- **Margin**: `marginInlineStart`, `marginInlineEnd`, `marginBlockStart`, `marginBlockEnd`
- **Border**: `borderInlineStart`, `borderInlineEnd`, `borderBlockStart`, `borderBlockEnd`
- **Position**: `insetInlineStart`, `insetInlineEnd`, `insetBlockStart`, `insetBlockEnd`

In LTR, `*InlineStart` = left and `*InlineEnd` = right. In RTL, they swap automatically. Block-axis props map to top/bottom (horizontal writing modes).

```ts
// Was: required physical axes, manually flipped for RTL
box({ dir: 'rtl', marginLeft: 8 })

// Now: logical axes flip automatically
box({ dir: 'rtl', marginInlineStart: 8 })
```

Physical-axis props (`marginLeft`, `paddingRight`, etc.) continue to work unchanged.

## renderer-webgpu — text rendering

The WebGPU renderer now paints text natively:

- Offscreen `Canvas2D` rasterizes each text line into a 2048×2048 atlas
- A dedicated WGSL pipeline samples the atlas texture on screen-space quads
- Alpha blending applied to both color and text pipelines
- Word wrapping when `whiteSpace: 'normal' | 'pre-wrap'`
- `onFallbackNeeded` no longer fires for text elements

Remaining gaps tracked for follow-up: selection highlights, focus rings, gradients, shadows, border-radius, and images.

## renderer-pdf — new package

`@geometra/renderer-pdf` produces a self-contained PDF 1.4 binary from computed geometry:

```ts
import { PDFRenderer } from '@geometra/renderer-pdf'

const renderer = new PDFRenderer({ pageWidth: 612, pageHeight: 792 })
const pdfBytes: Uint8Array = renderer.generate(layout, tree)
```

Supports solid-color boxes, text (PDF base-14 fonts), nested hierarchies, custom page sizes, opacity, and scroll offsets. Zero external dependencies — raw PDF generation with catalog/pages/content stream/xref table/trailer.

Gaps: font embedding (base-14 only), word wrapping beyond `\n`, images, gradients, multi-page output.

## Migration notes

- **Non-breaking**. All additions; no existing props or APIs changed.
- Physical-axis props (`marginLeft`, etc.) still work. Logical-axis props are additive — use them when your app is bidi-aware.
- If you depend on `@geometra/renderer-webgpu` and previously checked for `onFallbackNeeded(1)` to handle text, note that text no longer triggers the fallback.

## Verification

- `npm run test` · `bun run test` — 2588 tests pass
- `bun run build` — all packages type-check and build cleanly
- `bun run release:gate` — geometry snapshot gate passes

## Package versions

All `@geometra/*` packages bumped from 1.49.0 → 1.50.0. `@geometra/renderer-pdf` enters at 1.50.0.
