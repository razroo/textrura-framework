# Release notes — 1.51.0 (WebGPU canvas parity + PDF production features)

## Summary

1.51.0 closes the gap between `@geometra/renderer-webgpu` and `@geometra/renderer-canvas` for standard paint features, and upgrades `@geometra/renderer-pdf` from a minimal scaffold into a production-ready backend for text reports and documents.

- **WebGPU renderer** gains box shadow, multi-stop and radial gradients, per-corner border radius, focus ring, layout debug bounds, and selection highlight
- **PDF renderer** gains word wrapping, multi-page output, and JPEG image embedding
- **Core** widens `StyleProps.borderRadius` and `StyleProps.gradient` types to support the new shapes

## Core — type changes

Both additions are non-breaking: existing number / linear-gradient values continue to work unchanged.

```ts
// Before — single number only
box({ borderRadius: 8 })

// Now — also supports per-corner
box({
  borderRadius: { topLeft: 16, topRight: 4, bottomLeft: 4, bottomRight: 16 },
})

// Before — linear gradients only
box({ gradient: { type: 'linear', stops: [...] } })

// Now — radial supported too
box({
  gradient: {
    type: 'radial',
    center: { x: 0.3, y: 0.3 }, // normalized box coords
    radius: 1,                  // normalized to half-diagonal
    stops: [
      { offset: 0, color: '#fff' },
      { offset: 1, color: '#000' },
    ],
  },
})
```

New exported type: `BorderRadiusCorners` (`{ topLeft?, topRight?, bottomLeft?, bottomRight? }`).

## renderer-canvas

- `roundRect` accepts either a `number` or `BorderRadiusCorners`, drawing per-corner arcs correctly
- `gradient.type === 'radial'` renders via `createRadialGradient` with CSS `farthest-corner` semantics when `radius: 1` (default)

## renderer-webgpu — near canvas parity

Major extensions to the shape pipeline:

- **Box shadow** via shadow pre-pass (blurred SDF drawn behind the fill)
- **Multi-stop linear gradients** baked into a shared 1D gradient atlas
- **Radial gradients** (2-stop in-shader, N-stop via atlas)
- **Per-corner border radius** via `vec4` radius in the SDF
- **Focus ring** (`showFocusRing`, `focusRingColor`, `focusRingPadding`)
- **Layout debug bounds** (`debugLayoutBounds`, `debugStrokeColor`)
- **Selection highlight** via `selection: SelectionRange | null` field + `selectionColor` option
- Stroke mode for rounded outlines via fragment-shader ring SDF

Per-vertex layout grew from 17 → 26 floats to carry per-corner radius, shadow blur, gradient atlas row, stroke width, and radial center/radius. The texture pipeline now serves both the text atlas and per-image textures.

Remaining gaps: conic gradients, find-match highlights, inspector HUD (all dev-tooling nice-to-haves).

## renderer-pdf — production-ready

Three substantial additions take the PDF renderer from "prints boxes and single-line text" to "can output real documents":

- **Word wrapping** — Helvetica AFM width tables (1000 units/em) drive greedy word-wrap when `whiteSpace: 'normal' | 'pre-wrap'`. Courier-family uses its fixed 600-unit monospace width. `measureTextWidth` and `wrapText` exported as helpers.
- **Multi-page output** — when `layout.height > pageHeight`, content is automatically split into `ceil(height / pageHeight)` pages with per-page `yBias`. Off-page leaf elements are culled; container boxes still walked so descendants straddling page boundaries render correctly.
- **JPEG image embedding** — `preloadImage(src, { bytes, width, height })` chainable API (plus `images` constructor option) registers pre-loaded JPEG bytes. Embedded as XObjects with `/Filter [/ASCIIHexDecode /DCTDecode]` so the PDF stream stays textual while the viewer decodes the original JPEG.

```ts
const jpegBytes = new Uint8Array(readFileSync('logo.jpg'))
const renderer = new PDFRenderer({ pageWidth: 612, pageHeight: 792 })
  .preloadImage('logo.jpg', { bytes: jpegBytes, width: 400, height: 200 })
const pdf = renderer.generate(layout, tree)
```

Remaining gaps: PNG/WebP/GIF (JPEG only), custom font embedding, gradients / shadows / border-radius in PDF output.

## Migration notes

- **No breaking changes.** All additions widen existing types or add new optional fields.
- `StyleProps.borderRadius` is now `number | BorderRadiusCorners`. Existing `number` usages are unaffected.
- `StyleProps.gradient` is now a discriminated union (`linear` | `radial`). Existing `{ type: 'linear', ... }` values continue to work; `type` is still required.
- Renderers that don't support a given gradient type (e.g. `renderer-pdf` seeing a linear gradient) simply skip the paint rather than erroring.

## Verification

- `bun run test` — 2272 tests across 78 test files pass
- `bun run build` — all packages type-check and build
- `bun run release:gate` — geometry snapshot gate passes

## Package versions

All `@geometra/*` packages and `textura` / `@geometra/mcp` bumped 1.50.0 → 1.51.0.
