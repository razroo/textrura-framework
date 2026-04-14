# @geometra/renderer-webgpu

WebGPU renderer scaffold for Geometra.

This package provides:

- Capability detection via `WebGPURenderer.isSupported()`
- Async `init()` for adapter/device bootstrap (stub in first milestone)
- Stable renderer interface integration (`render()`/`destroy()`)

Current status:

- Solid-color box rendering via vertex-colored triangle pipeline
- **Border-radius** (uniform + per-corner) via rounded-rect SDF shape pipeline
- **Linear and radial gradients** — 2-stop via vertex color interpolation, N-stop via shared gradient atlas
- **Box shadow** via shadow pre-pass with blurred SDF
- **Focus ring** (configurable color/padding) and **layout debug bounds** overlays via shape-pipeline stroke mode
- **Selection highlights** via the color pipeline (shares `SelectionRange` with `@geometra/renderer-canvas`)
- Text rendering via canvas-rasterized texture atlas with GPU sampling
- **Image rendering** via per-image GPU textures with async loading cache
- Near canvas parity; remaining gaps listed below

## Install

```bash
npm install @geometra/renderer-webgpu
```

## Current support

- WebGPU capability detection and async device/context initialization
- Solid-color box rendering (vertex-colored triangles)
- **Rounded corners** via SDF fragment shader, with uniform or per-corner radius (`topLeft`, `topRight`, `bottomLeft`, `bottomRight`)
- **Linear and radial gradients**: 2-stop via vertex color interpolation, N-stop baked into a shared 1D gradient atlas
- **Box shadow** emitted as a pre-pass draw with blurred SDF (`offsetX`, `offsetY`, `blur`, `color`)
- **Focus ring** (`showFocusRing` / `focusRingColor` / `focusRingPadding`) via shape-pipeline stroke mode
- **Layout debug bounds** (`debugLayoutBounds` / `debugStrokeColor`) via shape-pipeline stroke mode
- **Text selection highlights** (`selection` field + `selectionColor`) using the shared core `SelectionRange` contract
- Text rendering via offscreen canvas atlas → GPU texture sampling
- Image rendering with per-image texture cache (async load, `img.decode()`)
- Word wrapping for `whiteSpace: 'normal' | 'pre-wrap'`
- Alpha blending across color, shape, text, and image pipelines
- Opacity propagation into paint colors and texture sampling
- 2D clear-pass fallback before `init()` completes
- Optional `onFallbackNeeded(count)` callback for unsupported paint features

Current gaps:

- Conic gradients (only linear + radial)
- Gradient atlas capacity: 64 simultaneous multi-stop gradients per frame (flat/2-stop gradients are unlimited)
- Text find-match highlights (renderer-canvas only via `enableFind`)
- Accessibility mirror (app-level; can be enabled separately via `@geometra/core`)
- Per-frame inspector HUD with frame timings (renderer-canvas only)

## Usage

```ts
import { createApp, box, text } from '@geometra/core'
import { WebGPURenderer } from '@geometra/renderer-webgpu'

const renderer = new WebGPURenderer({ canvas })
if (WebGPURenderer.isSupported()) {
  await renderer.init()
}

await createApp(
  () => box({ padding: 16 }, [
    text({ text: 'WebGPU scaffold', font: '16px Inter', lineHeight: 22, color: '#fff' }),
  ]),
  renderer,
  { width: 400, height: 200 },
)
```

## Notes

- Call `await renderer.init()` before relying on GPU rendering. Until then, `render()` uses a predictable clear-pass fallback.
- The current implementation is best treated as an MVP backend for capability probes and early integration work, not a canvas replacement.
- For the current backend matrix, see [RENDERER_SUPPORT_MATRIX.md](https://github.com/razroo/geometra/blob/main/RENDERER_SUPPORT_MATRIX.md).
