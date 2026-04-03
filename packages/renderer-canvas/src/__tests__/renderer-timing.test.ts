import { describe, it, expect } from 'vitest'
import { CanvasRenderer } from '../renderer.js'

class FakeCtx {
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  font = '12px sans-serif'
  textBaseline = 'top' as CanvasTextBaseline
  globalAlpha = 1
  scale(): void {}
  setTransform(): void {}
  fillRect(): void {}
  beginPath(): void {}
  rect(): void {}
  clip(): void {}
  save(): void {}
  restore(): void {}
  strokeRect(): void {}
  fillText(): void {}
  measureText(s: string): { width: number } {
    return { width: s.length * 8 }
  }
}

describe('CanvasRenderer.setFrameTimings', () => {
  it('clamps non-finite or negative layoutMs to 0', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { devicePixelRatio: 1 },
      configurable: true,
      writable: true,
    })
    const ctx = new FakeCtx()
    const canvas = {
      style: {} as Record<string, string>,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement

    const renderer = new CanvasRenderer({ canvas })
    renderer.setFrameTimings({ layoutMs: Number.NaN })
    expect(renderer.lastLayoutWallMs).toBe(0)
    renderer.setFrameTimings({ layoutMs: Number.POSITIVE_INFINITY })
    expect(renderer.lastLayoutWallMs).toBe(0)
    renderer.setFrameTimings({ layoutMs: -3 })
    expect(renderer.lastLayoutWallMs).toBe(0)
    renderer.setFrameTimings({ layoutMs: 4.25 })
    expect(renderer.lastLayoutWallMs).toBe(4.25)
  })
})
