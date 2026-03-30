// Must be imported BEFORE textura or @chenglou/pretext.
// Pretext requires OffscreenCanvas for text measurement.
// @napi-rs/canvas provides a compatible canvas for Node.js.

import { createCanvas } from '@napi-rs/canvas'

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _canvas: any
    constructor(width: number, height: number) {
      this._canvas = createCanvas(width, height)
    }
    getContext(type: string) {
      if (type === '2d') return this._canvas.getContext('2d')
      return null
    }
  }
}
