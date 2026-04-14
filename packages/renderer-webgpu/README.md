# @geometra/renderer-webgpu

WebGPU renderer scaffold for Geometra.

This package provides:

- Capability detection via `WebGPURenderer.isSupported()`
- Async `init()` for adapter/device bootstrap (stub in first milestone)
- Stable renderer interface integration (`render()`/`destroy()`)

Current status:

- Solid-color box rendering via vertex-colored triangle pipeline
- **Border-radius** and **linear gradients** via dedicated SDF shape pipeline
- Text rendering via canvas-rasterized texture atlas with GPU sampling
- **Image rendering** via per-image GPU textures with async loading cache
- Full paint parity with `@geometra/renderer-canvas` is approaching — remaining gaps listed below

## Install

```bash
npm install @geometra/renderer-webgpu
```

## Current support

- WebGPU capability detection and async device/context initialization
- Solid-color box rendering (vertex-colored triangles)
- **Border-radius** via rounded-rect SDF fragment shader with antialiased edges
- **Linear gradients** (angle + 2-stop stops) interpolated per-fragment
- Text rendering via offscreen canvas atlas → GPU texture sampling
- Image rendering with per-image texture cache (async load, `img.decode()`)
- Word wrapping for `whiteSpace: 'normal' | 'pre-wrap'`
- Alpha blending across color, shape, text, and image pipelines
- Opacity propagation into paint colors and texture sampling
- 2D clear-pass fallback before `init()` completes
- Optional `onFallbackNeeded(count)` callback for unsupported paint features

Current gaps:

- Multi-stop gradients (only first and last stops used)
- Per-corner border radius (uniform radius only)
- Box shadow
- Selection highlights and focus rings
- Layout debug overlays
- Multiple gradient types (radial, conic)

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
