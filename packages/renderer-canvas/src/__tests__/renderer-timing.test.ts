import { describe, it, expect, vi } from 'vitest'
import { box, type FrameTimings } from '@geometra/core'
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
  it('treats omitted or non-finite layoutMs as 0', () => {
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
    renderer.setFrameTimings({} as unknown as FrameTimings)
    expect(renderer.lastLayoutWallMs).toBe(0)
    renderer.setFrameTimings({ layoutMs: undefined as unknown as number })
    expect(renderer.lastLayoutWallMs).toBe(0)
  })

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

  it('treats non-number layoutMs (bigint, string, boolean) as 0 without throwing', () => {
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
    expect(() =>
      renderer.setFrameTimings({ layoutMs: 99n as unknown as number }),
    ).not.toThrow()
    expect(renderer.lastLayoutWallMs).toBe(0)
    expect(() =>
      renderer.setFrameTimings({ layoutMs: '12' as unknown as number }),
    ).not.toThrow()
    expect(renderer.lastLayoutWallMs).toBe(0)
    expect(() =>
      renderer.setFrameTimings({ layoutMs: true as unknown as number }),
    ).not.toThrow()
    expect(renderer.lastLayoutWallMs).toBe(0)
  })
})

describe('CanvasRenderer.render wall time', () => {
  it('sets lastRenderWallMs to the elapsed performance.now() delta for the frame', () => {
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

    // render() samples performance.now() at frame start and again when computing lastRenderWallMs
    // (inspector HUD is off by default, so there is no third sample).
    const stamps = [100, 103.5]
    let i = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => stamps[i++] ?? stamps[stamps.length - 1]!)

    const renderer = new CanvasRenderer({ canvas })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)

    expect(renderer.lastRenderWallMs).toBeCloseTo(3.5, 5)
    spy.mockRestore()
  })
})
