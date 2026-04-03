// Must be imported BEFORE textura or @chenglou/pretext.
// Pretext requires OffscreenCanvas for text measurement.
// @napi-rs/canvas provides a compatible canvas for Node.js.

import { createCanvas, type Canvas } from '@napi-rs/canvas'

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  class NodeOffscreenCanvas {
    private readonly _canvas: Canvas

    constructor(width: number, height: number) {
      this._canvas = createCanvas(width, height)
    }

    getContext(type: string) {
      if (type !== '2d') return null
      return this._canvas.getContext('2d')
    }
  }

  ;(globalThis as unknown as { OffscreenCanvas: typeof NodeOffscreenCanvas }).OffscreenCanvas =
    NodeOffscreenCanvas
}
