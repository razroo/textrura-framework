# Geometra roadmap

Phased plan to grow Geometra from a capable layout-on-geometry stack into a broadly credible UI framework (Yoga + Pretext via Textura).

## Phase A — Foundation (shipping now)

- Web font readiness before first paint (`waitForFonts` + tree collection).
- Keyboard focus that repaints when focus changes; click-to-focus for focusable boxes.
- Canvas debug overlay for layout bounds; optional focus ring styling.
- Harden tests around hit dispatch and font family parsing.

## Phase B — Apps that feel “real”

- **Text input**: caret, IME/composition, selection, undo baseline; align Pretext metrics with canvas paint.
- **Font policy**: document generic families, variable fonts, and server/client metric parity.
- **Runtime accessibility**: hidden DOM mirror or accessibility tree API + docs for canvas mode.
- **Protocol**: versioned WS frames; compatibility notes.

## Phase C — Platform & ecosystem

- Virtualized lists / large scroll regions; focus trap for overlays.
- Dev overlay (layout time, node count, hit targets).
- Visual/regression and geometry snapshot testing in CI.
- Optional component layer (`@geometra/ui`) built only on core primitives.

## Deferred / research

- Full RTL/document direction pass through Textura props.
- Animation primitives beyond current `animation.ts` helpers.
- Non-canvas render targets (WebGPU, PDF) consuming the same geometry.
