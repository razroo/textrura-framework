# @geometra/renderer-canvas

Canvas2D renderer for Geometra. Renders UI element trees to an HTML `<canvas>` element with full hit-testing and text selection support.

## Install

```bash
npm install @geometra/renderer-canvas
```

## Key exports

- `createBrowserCanvasClient` — official browser bootstrap for thin-client canvas apps (`createClient` + `CanvasRenderer` + selection + accessibility mirror + focus wiring)
- `CanvasRenderer` — renders Geometra element trees to a canvas context
- `layoutInspector` — optional HUD (frame counter, **render ms** before HUD, node count, depth, root size, focus + Tab order, optional hit path when `inspectorProbe` is set); off by default
- `lastRenderWallMs` — wall time of the last full `render()` (ms), including overlays; readable for HUDs / metrics
- `lastLayoutWallMs` — last `computeLayout` time (ms) when using `createApp` (via optional `Renderer.setFrameTimings`)
- `inspectorProbe` — set `{ x, y }` in layout coordinates before `render` to show `hitPathAtPoint` in the HUD
- `enableSelection` — text selection on the canvas
- `enableAccessibilityMirror` — hidden accessibility DOM mirror from geometry

## Usage

```ts
import { createBrowserCanvasClient } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
createBrowserCanvasClient({
  canvas,
  url: 'ws://localhost:3200',
  binaryFraming: true,
  autoFocus: true,
  rendererOptions: {
    background: '#08111f',
  },
})
```

If you need lower-level control, the renderer package still exposes `CanvasRenderer`, `enableSelection`, and `enableAccessibilityMirror` directly.

## Links

- [Main repo](https://github.com/AiGeekz/geometra)
