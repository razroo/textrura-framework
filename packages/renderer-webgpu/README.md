# @geometra/renderer-webgpu

WebGPU renderer scaffold for Geometra.

This package provides:

- Capability detection via `WebGPURenderer.isSupported()`
- Async `init()` for adapter/device bootstrap (stub in first milestone)
- Stable renderer interface integration (`render()`/`destroy()`)

Current status:

- Solid-color box rendering via vertex-colored triangle pipeline
- **Border-radius** (uniform + per-corner) via rounded-rect SDF shape pipeline
- **Linear gradients** — 2-stop via vertex color interpolation, N-stop via shared gradient atlas
- **Box shadow** via shadow pre-pass with blurred SDF
- Text rendering via canvas-rasterized texture atlas with GPU sampling
- **Image rendering** via per-image GPU textures with async loading cache
- Near paint parity with `@geometra/renderer-canvas`; remaining gaps listed below

## Install

```bash
npm install @geometra/renderer-webgpu
```

## Current support

- WebGPU capability detection and async device/context initialization
- Solid-color box rendering (vertex-colored triangles)
- **Rounded corners** via SDF fragment shader, with uniform or per-corner radius (`topLeft`, `topRight`, `bottomLeft`, `bottomRight`)
- **Linear gradients**: 2-stop via vertex color interpolation, N-stop baked into a shared 1D gradient atlas
- **Box shadow** emitted as a pre-pass draw with blurred SDF (`offsetX`, `offsetY`, `blur`, `color`)
- Text rendering via offscreen canvas atlas → GPU texture sampling
- Image rendering with per-image texture cache (async load, `img.decode()`)
- Word wrapping for `whiteSpace: 'normal' | 'pre-wrap'`
- Alpha blending across color, shape, text, and image pipelines
- Opacity propagation into paint colors and texture sampling
- 2D clear-pass fallback before `init()` completes
- Optional `onFallbackNeeded(count)` callback for unsupported paint features

Current gaps:

- Selection highlights and focus rings (app-level overlays; render through `renderer-canvas` only)
- Layout debug overlays (dev tooling; `renderer-canvas` only)
- Radial or conic gradients (only linear)
- Gradient atlas capacity: 64 simultaneous multi-stop gradients per frame (flat/2-stop gradients are unlimited)

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
