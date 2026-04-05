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
  fillRect(_x: number, _y: number, _w: number, _h: number): void {}
  beginPath(): void {}
  rect(): void {}
  clip(): void {}
  save(): void {}
  restore(): void {}
  strokeRect(): void {}
  fillText(_text: string, _x: number, _y: number): void {}
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

  it('normalizes layoutMs IEEE -0 to +0 (Math.max collapses -0; HUD uses toFixed on lastLayoutWallMs)', () => {
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
    renderer.setFrameTimings({ layoutMs: -0 })
    expect(Object.is(renderer.lastLayoutWallMs, -0)).toBe(false)
    expect(1 / renderer.lastLayoutWallMs).toBe(Infinity)
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

    // Boxed numbers are typeof object; Number.isFinite is false — do not coerce via unary +.
    expect(() =>
      renderer.setFrameTimings({ layoutMs: Object(4.25) as unknown as number }),
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

  it('records 0 lastRenderWallMs when the second performance.now is non-finite (corrupt clock)', () => {
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

    let step = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
      step++
      return step === 1 ? 100 : Number.NaN
    })

    const renderer = new CanvasRenderer({ canvas })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)

    expect(renderer.lastRenderWallMs).toBe(0)
    spy.mockRestore()
  })

  it('records 0 lastRenderWallMs when the first performance.now is non-finite (corrupt clock)', () => {
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

    let step = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
      step++
      return step === 1 ? Number.NaN : 103
    })

    const renderer = new CanvasRenderer({ canvas })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)

    expect(renderer.lastRenderWallMs).toBe(0)
    spy.mockRestore()
  })

  it('records 0 lastRenderWallMs when performance.now does not advance (stable clock)', () => {
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

    const spy = vi.spyOn(performance, 'now').mockImplementation(() => 42)

    const renderer = new CanvasRenderer({ canvas })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)

    expect(renderer.lastRenderWallMs).toBe(0)
    spy.mockRestore()
  })

  it('sets lastRenderWallMs to 0 when global performance is undefined (no stale frame time)', () => {
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

    const stamps = [100, 103.5]
    let i = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => stamps[i++] ?? stamps[stamps.length - 1]!)

    const renderer = new CanvasRenderer({ canvas })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)
    expect(renderer.lastRenderWallMs).toBeCloseTo(3.5, 5)
    spy.mockRestore()

    vi.stubGlobal('performance', undefined)
    try {
      renderer.render(layout, tree)
      expect(renderer.lastRenderWallMs).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('records 0 lastRenderWallMs when performance.now moves backward (non-monotonic clock)', () => {
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

    const stamps = [100, 98.5]
    let i = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => stamps[i++] ?? stamps[stamps.length - 1]!)

    const renderer = new CanvasRenderer({ canvas })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)

    expect(renderer.lastRenderWallMs).toBe(0)
    spy.mockRestore()
  })

  it('with layoutInspector, lastRenderWallMs spans the full frame including the HUD timing sample', () => {
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

    // render(): frame start, HUD pre-paint delta, final wall clock (must not stop at the HUD sample).
    const stamps = [100, 102, 106]
    let i = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => stamps[i++] ?? stamps[stamps.length - 1]!)

    const renderer = new CanvasRenderer({ canvas, layoutInspector: true })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)

    expect(renderer.lastRenderWallMs).toBeCloseTo(6, 5)
    spy.mockRestore()
  })

  it('with layoutInspector, clamps HUD pre-paint ms to 0 when the middle performance.now is non-finite; final delta still uses the last sample', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { devicePixelRatio: 1 },
      configurable: true,
      writable: true,
    })
    const ctx = new FakeCtx()
    const fillText = vi.spyOn(ctx, 'fillText')
    const canvas = {
      style: {} as Record<string, string>,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement

    const stamps = [100, Number.NaN, 107.25]
    let i = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => stamps[i++] ?? stamps[stamps.length - 1]!)

    const renderer = new CanvasRenderer({ canvas, layoutInspector: true })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)

    expect(renderer.lastRenderWallMs).toBeCloseTo(7.25, 5)
    const renderHudLine = fillText.mock.calls.find(args => String(args[0]).startsWith('render '))
    expect(renderHudLine).toBeDefined()
    expect(String(renderHudLine![0])).toBe('render 0.00ms')
    spy.mockRestore()
  })

  it('with layoutInspector, records 0 lastRenderWallMs when the final performance.now is non-finite', () => {
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

    const stamps = [100, 102, Number.NaN]
    let i = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => stamps[i++] ?? stamps[stamps.length - 1]!)

    const renderer = new CanvasRenderer({ canvas, layoutInspector: true })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.render(layout, tree)

    expect(renderer.lastRenderWallMs).toBe(0)
    spy.mockRestore()
  })
})

describe('CanvasRenderer layoutInspector inspectorProbe', () => {
  it('omits the HUD hit line when probe coordinates are non-finite or non-numbers (no NaN text; no BigInt Number.isFinite throw)', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { devicePixelRatio: 1 },
      configurable: true,
      writable: true,
    })
    const ctx = new FakeCtx()
    const fillText = vi.spyOn(ctx, 'fillText')
    const canvas = {
      style: {} as Record<string, string>,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement

    const renderer = new CanvasRenderer({ canvas, layoutInspector: true })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.inspectorProbe = { x: Number.NaN, y: 5 }
    renderer.render(layout, tree)
    expect(fillText.mock.calls.some(args => String(args[0]).startsWith('hit ['))).toBe(false)

    renderer.inspectorProbe = { x: 3, y: Number.POSITIVE_INFINITY }
    renderer.render(layout, tree)
    expect(fillText.mock.calls.some(args => String(args[0]).startsWith('hit ['))).toBe(false)

    renderer.inspectorProbe = { x: 3, y: 5 } as unknown as { x: number; y: number }
    Object.assign(renderer.inspectorProbe, { x: 1n as unknown as number, y: 0 })
    expect(() => renderer.render(layout, tree)).not.toThrow()
    expect(fillText.mock.calls.some(args => String(args[0]).startsWith('hit ['))).toBe(false)
  })

  it('draws the HUD hit line when probe coordinates are finite numbers', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { devicePixelRatio: 1 },
      configurable: true,
      writable: true,
    })
    const ctx = new FakeCtx()
    const fillText = vi.spyOn(ctx, 'fillText')
    const canvas = {
      style: {} as Record<string, string>,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement

    const renderer = new CanvasRenderer({ canvas, layoutInspector: true })
    const tree = box({ width: 10, height: 10 })
    const layout = { x: 0, y: 0, width: 10, height: 10, children: [] }

    renderer.inspectorProbe = { x: 5, y: 5 }
    renderer.render(layout, tree)

    expect(fillText.mock.calls.some(args => String(args[0]).startsWith('hit ['))).toBe(true)
  })
})

describe('CanvasRenderer sibling zIndex paint order', () => {
  it('treats non-finite zIndex like 0 so higher finite z paints on top (matches hit-test stacking)', () => {
    class RecordingCtx extends FakeCtx {
      fills: Array<{ style: string; x: number; y: number; w: number; h: number }> = []
      override fillRect(x: number, y: number, w: number, h: number): void {
        this.fills.push({ style: String(this.fillStyle), x, y, w, h })
      }
    }

    Object.defineProperty(globalThis, 'window', {
      value: { devicePixelRatio: 1 },
      configurable: true,
      writable: true,
    })
    const ctx = new RecordingCtx()
    const canvas = {
      style: {} as Record<string, string>,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement

    const renderer = new CanvasRenderer({ canvas })
    const tree = box({ width: 100, height: 100, backgroundColor: '#ffffff' }, [
      box({ width: 100, height: 100, backgroundColor: '#ff0000', zIndex: Number.NaN }),
      box({ width: 100, height: 100, backgroundColor: '#0000ff', zIndex: 1 }),
    ])
    const layout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 100, children: [] },
        { x: 0, y: 0, width: 100, height: 100, children: [] },
      ],
    }

    renderer.render(layout, tree)

    const childFills = ctx.fills.filter(f => f.style === '#ff0000' || f.style === '#0000ff')
    expect(childFills.length).toBe(2)
    expect(childFills[1]!.style).toBe('#0000ff')
  })
})
