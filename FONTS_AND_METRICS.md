# Fonts and text metrics

How Geometra uses CSS-like `font` strings across layout (Textura / Pretext) and render targets, and how to keep server and client aligned.

## `text({ font: '…' })`

The `font` value is passed through to:

- **Canvas 2D** — `CanvasRenderingContext2D.font` in the browser (and any canvas-backed measurement).
- **Layout** — Textura text measurement for line breaking and intrinsic sizes everywhere layout runs (local app, server, etc.).

Prefer an explicit size and a **concrete family first**, then generics, e.g. `14px Inter, system-ui, sans-serif`.

## Text wrapping (`whiteSpace`)

Textura and renderers treat **omitted `whiteSpace` like `nowrap`**: one measured line, one paint line (unless you clip). That keeps short labels and controls predictable.

For **paragraph-style copy** in a flex column or card (anything that should wrap when the container is narrow), set **`whiteSpace: 'normal'`** on the `text()` node, or use **`bodyText()`** from `@geometra/core`, which defaults `whiteSpace` to `'normal'`. Without that, layout height can stay too small while paint overflows, and the next sibling can appear to overlap.

Use **`pre-wrap`** when preserving user line breaks (see `textarea` in `@geometra/ui`).

## Families ignored for “custom font” collection

`extractFontFamiliesFromCSSFont` (in `packages/core/src/fonts.ts`) drops generic CSS keywords so `collectFontFamiliesFromTree` and `waitForFonts` only target real face names:

`serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`, `system-ui`, `ui-sans-serif`, `ui-serif`, `ui-monospace`, `emoji`.

## Web font readiness (`waitForFonts`)

`waitForFonts(families, timeoutMs)` is **browser-only** (no-op without `document`). It uses `document.fonts.load('16px <Family>')` per unique family, then waits on `document.fonts.ready`, with a timeout so startup does not hang forever.

Typical pattern before first paint:

1. Build the initial UI tree (or a representative tree).
2. `collectFontFamiliesFromTree(tree)` → pass to `waitForFonts`.
3. Mount / first `createApp` render.

## Variable fonts

Variable fonts are expressed with normal CSS `font` strings supported by the host environment. For **strict cross-environment parity** (e.g. Node server layout vs browser canvas), prefer static font files or verify that both sides resolve the same metrics; variable axes can diverge subtly between implementations.

## Server vs client measurement parity

- The **same** element tree and `font` / `lineHeight` props should be used for server layout and client paint.
- **Physical fonts** (or metric-compatible substitutes) must exist on **both** the server layout host and the browser, or line wraps and caret positions can drift.
- The thin WebSocket client does not re-layout; it applies server geometry — so server-side fonts are authoritative for breaks.

## Terminal renderer

The terminal backend uses a fixed cell grid and simplified text assumptions; shaping and font fidelity differ from canvas. Treat terminal as a separate parity surface; see terminal docs and tests for scope.

## RTL and bidi

Direction and caret semantics are tracked separately in **`RTL_PARITY_MATRIX.md`**.

## Code entry points

- `packages/core/src/fonts.ts` — `extractFontFamiliesFromCSSFont`, `collectFontFamiliesFromTree`, `waitForFonts`

## Regression coverage

- `packages/renderer-canvas/src/__tests__/visual-regression.test.ts` — ensures the canvas paint path sets **`ctx.font` per text node** when multiple families appear in one tree (guards accidental reuse of a stale font).
