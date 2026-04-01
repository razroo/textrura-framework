# @geometra/renderer-webgpu

WebGPU renderer scaffold for Geometra.

This package provides:

- Capability detection via `WebGPURenderer.isSupported()`
- Async `init()` for adapter/device bootstrap (stub in first milestone)
- Stable renderer interface integration (`render()`/`destroy()`)

Current status:

- API scaffold is implemented
- Full paint parity with `@geometra/renderer-canvas` is not implemented yet

## Install

```bash
npm install @geometra/renderer-webgpu
```

## Current support

- WebGPU capability detection and async device/context initialization
- Geometry render integration for solid box backgrounds
- 2D clear-pass fallback before `init()` completes
- Optional `onFallbackNeeded(count)` callback when a tree includes unsupported paint features

Current gaps:

- text paint
- selection highlight
- focus/debug overlays
- gradients, shadows, and border-radius parity
- full canvas feature parity

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
