import { afterEach, describe, it, expect, vi } from 'vitest'
import { createApp } from '../app.js'
import { box, image, scene3d, text } from '../elements.js'
import { clearFocus, focusedElement } from '../focus.js'
import { layoutBoundsAreFinite } from '../layout-bounds.js'
import { signal } from '../signals.js'
import type { HitEvent, Renderer } from '../types.js'

describe('createApp layout direction (Textura computeLayout)', () => {
  it('passes resolved root dir:rtl into layout so flex rows mirror child order', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50 },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('treats root dir:auto as ltr for Yoga (fixed parent context) so flex rows stay left-to-right', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50 },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeLessThan(b!.x)
  })

  it('honors AppOptions.layoutDirection over the root element dir', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'ltr' },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeLessThan(b!.x)
  })

  it('ignores non-ltr/rtl layoutDirection at runtime and derives direction from the root (plain JS / corrupt options)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'auto' as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores boxed-string layoutDirection (Object("ltr")) and derives direction from the root', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: Object('ltr') as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores BigInt layoutDirection (strict equality only) and derives direction from the root', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 0n as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('ignores JSON null layoutDirection and derives direction from the root (parity with other invalid options)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: null as never },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('applies AppOptions.layoutDirection rtl when the root has no explicit dir (document-level RTL)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'rtl' },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('applies AppOptions.layoutDirection rtl when the root dir is auto (document RTL vs inherited ltr on the node)', async () => {
    const layouts: Array<{ children: Array<{ x: number }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ x: number }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      renderer,
      { width: 100, height: 50, layoutDirection: 'rtl' },
    )

    expect(layouts).toHaveLength(1)
    const [a, b] = layouts[0]!.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('mirrors nested flex rows when a descendant sets dir:rtl (per-node Yoga direction)', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column' }, [
          box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
            box({ width: 30, height: 20 }),
            box({ width: 30, height: 20 }),
          ]),
        ]),
      renderer,
      { width: 100, height: 80 },
    )

    expect(layouts).toHaveLength(1)
    const row = layouts[0]!.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('nested row with dir:auto inherits rtl from layoutDirection through a column (Yoga inherit chain)', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column' }, [
          box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
            box({ width: 30, height: 20 }),
            box({ width: 30, height: 20 }),
          ]),
        ]),
      renderer,
      { width: 100, height: 80, layoutDirection: 'rtl' },
    )

    expect(layouts).toHaveLength(1)
    const row = layouts[0]!.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })

  it('nested row with dir:auto inherits rtl from explicit root dir:rtl (no AppOptions.layoutDirection)', async () => {
    const layouts: Array<{ children: Array<{ children: Array<{ x: number }> }> }> = []
    const renderer: Renderer = {
      render(layout) {
        layouts.push(layout as { children: Array<{ children: Array<{ x: number }> }> })
      },
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 60, flexDirection: 'column', dir: 'rtl' }, [
          box({ width: 100, height: 40, flexDirection: 'row', dir: 'auto' }, [
            box({ width: 30, height: 20 }),
            box({ width: 30, height: 20 }),
          ]),
        ]),
      renderer,
      { width: 100, height: 80 },
    )

    expect(layouts).toHaveLength(1)
    const row = layouts[0]!.children[0]!
    const [a, b] = row.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })
})

describe('createApp non-box roots (layout + direction resolution)', () => {
  it('computes finite layout for text, image, and scene3d roots (no flex children)', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        text({
          text: 'hi',
          font: '16px sans-serif',
          lineHeight: 20,
          width: 120,
          height: 24,
          dir: 'rtl',
        }),
      renderer,
      { width: 200, height: 80 },
    )
    expect(renderer.render).toHaveBeenCalledTimes(1)
    const textLayout = renderer.render.mock.calls[0]![0]
    expect(layoutBoundsAreFinite(textLayout)).toBe(true)

    renderer.render.mockClear()
    await createApp(
      () => image({ src: '/x.png', width: 64, height: 48, dir: 'ltr' }),
      renderer,
      { width: 200, height: 80 },
    )
    expect(renderer.render).toHaveBeenCalledTimes(1)
    const imageLayout = renderer.render.mock.calls[0]![0]
    expect(layoutBoundsAreFinite(imageLayout)).toBe(true)

    renderer.render.mockClear()
    await createApp(
      () => scene3d({ width: 80, height: 60, objects: [], dir: 'auto' }),
      renderer,
      { width: 200, height: 80 },
    )
    expect(renderer.render).toHaveBeenCalledTimes(1)
    const sceneLayout = renderer.render.mock.calls[0]![0]
    expect(layoutBoundsAreFinite(sceneLayout)).toBe(true)
  })

  it('exposes the live non-box tree on the app after mount', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () =>
        text({
          text: 'x',
          font: '14px sans-serif',
          lineHeight: 18,
          width: 10,
          height: 18,
        }),
      renderer,
      { width: 100, height: 50 },
    )
    expect(app.tree?.kind).toBe('text')
  })
})

describe('createApp root width/height sanitization', () => {
  it('normalizes signed-zero root extents like +0 (hostile options cannot pass -0 into computeLayout)', async () => {
    const render = vi.fn()
    const renderer: Renderer = { render, destroy: vi.fn() }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: -0,
      height: -0,
    })
    expect(render).toHaveBeenCalledTimes(1)
    const negZeroLayout = render.mock.calls[0]![0] as { width: number; height: number }
    expect(Object.is(negZeroLayout.width, -0)).toBe(false)
    expect(Object.is(negZeroLayout.height, -0)).toBe(false)

    render.mockClear()
    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: 0,
      height: 0,
    })
    expect(render).toHaveBeenCalledTimes(1)
    const zeroLayout = render.mock.calls[0]![0] as { width: number; height: number }
    expect(zeroLayout.width).toBe(negZeroLayout.width)
    expect(zeroLayout.height).toBe(negZeroLayout.height)
  })

  it('omits NaN, ±Infinity, negative, and non-number root extents so computeLayout stays finite', async () => {
    const render = vi.fn()
    const renderer: Renderer = { render, destroy: vi.fn() }

    for (const badWidth of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      -0.001,
      '100' as unknown as number,
      1n as unknown as number,
      Object(100) as unknown as number,
    ]) {
      render.mockClear()
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
        width: badWidth,
        height: 50,
      })
      expect(render).toHaveBeenCalledTimes(1)
      const layout = render.mock.calls[0]![0] as { width: number; height: number }
      expect(Number.isFinite(layout.width)).toBe(true)
      expect(Number.isFinite(layout.height)).toBe(true)
    }

    for (const badHeight of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      -0.001,
      '50' as unknown as number,
      1n as unknown as number,
      Object(50) as unknown as number,
    ]) {
      render.mockClear()
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
        width: 100,
        height: badHeight,
      })
      expect(render).toHaveBeenCalledTimes(1)
      const layout = render.mock.calls[0]![0] as { width: number; height: number }
      expect(Number.isFinite(layout.width)).toBe(true)
      expect(Number.isFinite(layout.height)).toBe(true)
    }
  })
})

describe('createApp layout timing', () => {
  it('invokes renderer.setFrameTimings with layoutMs before render', async () => {
    const order: string[] = []
    const renderer: Renderer = {
      setFrameTimings(t) {
        order.push(`timings:${t.layoutMs >= 0 ? 'ok' : 'bad'}`)
      },
      render() {
        order.push('render')
      },
      destroy() {},
    }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })

    expect(order).toEqual(['timings:ok', 'render'])
  })

  it('passes non-negative layoutMs', async () => {
    const seen: number[] = []
    const renderer: Renderer = {
      setFrameTimings(t) {
        seen.push(t.layoutMs)
      },
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
    })

    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(seen.every(ms => ms >= 0)).toBe(true)
  })

  it('passes the measured layout delta when performance.now advances monotonically', async () => {
    let step = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
      step++
      return step === 1 ? 1_000 : 1_012.5
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 12.5 })
    } finally {
      spy.mockRestore()
    }
  })

  it('does not require setFrameTimings; render still runs', async () => {
    const render = vi.fn()
    const renderer: Renderer = {
      render,
      destroy: vi.fn(),
    }

    await createApp(() => box({ width: 40, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
    })

    expect(render).toHaveBeenCalled()
  })

  it('passes layoutMs 0 for setFrameTimings when global performance is undefined', async () => {
    vi.stubGlobal('performance', undefined)
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }

      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })

      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('passes layoutMs 0 when performance.now is missing or not a function', async () => {
    for (const perf of [{}, { now: 'bad' as unknown as () => number }] as const) {
      vi.stubGlobal('performance', perf)
      try {
        const setFrameTimings = vi.fn()
        const renderer: Renderer = {
          setFrameTimings,
          render: vi.fn(),
          destroy: vi.fn(),
        }
        await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
        expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })

  it('passes layoutMs 0 when performance.now throws or returns non-finite numbers', async () => {
    vi.stubGlobal('performance', {
      now() {
        throw new Error('broken clock')
      },
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      vi.unstubAllGlobals()
    }

    vi.stubGlobal('performance', {
      now: () => Number.NaN,
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('clamps negative layout deltas to 0 when performance.now uses negative finite values (hostile polyfill)', async () => {
    let step = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
      step++
      return step === 1 ? -50 : -100
    })
    try {
      const setFrameTimings = vi.fn()
      const renderer: Renderer = {
        setFrameTimings,
        render: vi.fn(),
        destroy: vi.fn(),
      }
      await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
      expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
    } finally {
      spy.mockRestore()
    }
  })

  it('clamps negative or non-finite layout deltas to 0 for setFrameTimings', async () => {
    const mkRenderer = (): Renderer => ({
      setFrameTimings: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn(),
    })

    {
      let step = 0
      const spy = vi.spyOn(performance, 'now').mockImplementation(() => (++step === 1 ? 1000 : 100))
      try {
        const renderer = mkRenderer()
        await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
        expect(renderer.setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
      } finally {
        spy.mockRestore()
      }
    }

    {
      let step = 0
      const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
        step++
        return step === 1 ? 50 : Number.NaN
      })
      try {
        const renderer = mkRenderer()
        await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
        expect(renderer.setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
      } finally {
        spy.mockRestore()
      }
    }

    {
      let step = 0
      const spy = vi.spyOn(performance, 'now').mockImplementation(() => {
        step++
        return step === 1 ? 0 : Number.POSITIVE_INFINITY
      })
      try {
        const renderer = mkRenderer()
        await createApp(() => box({ width: 40, height: 20 }, []), renderer, { width: 100, height: 50 })
        expect(renderer.setFrameTimings).toHaveBeenCalledWith({ layoutMs: 0 })
      } finally {
        spy.mockRestore()
      }
    }
  })

  it('invokes setFrameTimings on each reactive re-layout when the view depends on a signal', async () => {
    const setFrameTimings = vi.fn()
    const render = vi.fn()
    const renderer: Renderer = {
      setFrameTimings,
      render,
      destroy: vi.fn(),
    }
    const width = signal(40)
    await createApp(() => box({ width: width.value, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
    })

    expect(setFrameTimings).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(1)

    width.set(44)
    expect(setFrameTimings).toHaveBeenCalledTimes(2)
    expect(render).toHaveBeenCalledTimes(2)
    expect(setFrameTimings.mock.calls[1]![0]).toMatchObject({
      layoutMs: expect.any(Number),
    })
    expect(setFrameTimings.mock.calls[1]![0].layoutMs).toBeGreaterThanOrEqual(0)
  })
})

describe('createApp dispatch guards', () => {
  const tabDown = {
    key: 'Tab',
    code: 'Tab',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
  } as const

  it('returns false from dispatch when tree or layout is null', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () => box({ width: 10, height: 10, onClick: () => {} }, []),
      renderer,
      { width: 100, height: 100 },
    )

    const savedTree = app.tree
    const savedLayout = app.layout
    expect(savedTree).not.toBeNull()
    expect(savedLayout).not.toBeNull()

    app.layout = null
    expect(app.dispatch('onClick', 5, 5)).toBe(false)

    app.layout = savedLayout
    app.tree = null
    expect(app.dispatch('onClick', 5, 5)).toBe(false)

    app.tree = savedTree
    app.layout = savedLayout
    expect(app.dispatch('onClick', 5, 5)).toBe(true)
  })

  it('returns false from dispatch when root layout fails layoutBoundsAreFinite (corrupt geometry)', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () => box({ width: 10, height: 10, onClick: () => {} }, []),
      renderer,
      { width: 100, height: 100 },
    )

    const savedLayout = app.layout!
    expect(savedLayout).not.toBeNull()

    app.layout = { ...savedLayout, width: -1 }
    expect(app.dispatch('onClick', 5, 5)).toBe(false)

    app.layout = { ...savedLayout, height: -0.001 }
    expect(app.dispatch('onClick', 5, 5)).toBe(false)

    app.layout = savedLayout
    expect(app.dispatch('onClick', 5, 5)).toBe(true)
  })

  it('forwards optional offsetX and offsetY to dispatchHit for nested surface coordinates', async () => {
    let fired = false
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const child = box({
      width: 40,
      height: 40,
      onClick: () => {
        fired = true
      },
    })
    const app = await createApp(() => box({ width: 100, height: 100 }, [child]), renderer, {
      width: 200,
      height: 200,
    })

    expect(app.dispatch('onClick', 70, 30, undefined, 50, 0)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 70, 30)).toBe(false)
    expect(fired).toBe(false)
  })

  it('forwards optional extra fields to dispatchHit (shallow-merged onto HitEvent)', async () => {
    let received: HitEvent | null = null
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const child = box({
      width: 40,
      height: 40,
      onPointerDown: e => {
        received = e
      },
    })
    const app = await createApp(() => box({ width: 100, height: 100 }, [child]), renderer, {
      width: 200,
      height: 200,
    })

    expect(app.dispatch('onPointerDown', 20, 20, { button: 2, shiftKey: true })).toBe(true)
    expect(received).not.toBeNull()
    expect(received!.x).toBe(20)
    expect(received!.y).toBe(20)
    expect(received!.localX).toBe(20)
    expect(received!.localY).toBe(20)
    const withExtras = received as HitEvent & { button?: number; shiftKey?: boolean }
    expect(withExtras.button).toBe(2)
    expect(withExtras.shiftKey).toBe(true)

    app.destroy()
  })

  it('treats non-finite and non-number dispatch offsets like dispatchHit (finiteNumber)', async () => {
    let fired = false
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const child = box({
      width: 40,
      height: 40,
      onClick: () => {
        fired = true
      },
    })
    const app = await createApp(() => box({ width: 100, height: 100 }, [child]), renderer, {
      width: 200,
      height: 200,
    })

    expect(app.dispatch('onClick', 70, 30, undefined, 50, 0)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 70, 30, undefined, Number.NaN, 0)).toBe(false)
    expect(fired).toBe(false)
    expect(app.dispatch('onClick', 20, 30, undefined, Number.NaN, 0)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 70, 30, undefined, 50n as unknown as number, 0)).toBe(false)
    expect(fired).toBe(false)
    expect(app.dispatch('onClick', 20, 30, undefined, 50n as unknown as number, 0)).toBe(true)
    expect(fired).toBe(true)
  })

  it('treats non-finite and non-number dispatch offsetY like dispatchHit (finiteNumber)', async () => {
    let fired = false
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const child = box({
      width: 40,
      height: 40,
      onClick: () => {
        fired = true
      },
    })
    const app = await createApp(() => box({ width: 100, height: 100 }, [child]), renderer, {
      width: 200,
      height: 200,
    })

    expect(app.dispatch('onClick', 30, 70, undefined, 0, 50)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 30, 70, undefined, 0, Number.NaN)).toBe(false)
    expect(fired).toBe(false)
    expect(app.dispatch('onClick', 30, 20, undefined, 0, Number.NaN)).toBe(true)
    expect(fired).toBe(true)

    fired = false
    expect(app.dispatch('onClick', 30, 70, undefined, 0, 50n as unknown as number)).toBe(false)
    expect(fired).toBe(false)
    expect(app.dispatch('onClick', 30, 20, undefined, 0, 50n as unknown as number)).toBe(true)
    expect(fired).toBe(true)
  })

  it('returns false from dispatch when pointer coordinates are non-finite without click-to-focus', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () => box({ width: 100, height: 100, onKeyDown: () => {}, onClick: () => {} }, []),
      renderer,
      { width: 100, height: 100 },
    )

    clearFocus()
    expect(focusedElement.value).toBeNull()

    expect(app.dispatch('onClick', Number.NaN, 50)).toBe(false)
    expect(focusedElement.value).toBeNull()

    expect(app.dispatch('onClick', 50, Number.POSITIVE_INFINITY)).toBe(false)
    expect(focusedElement.value).toBeNull()

    expect(app.dispatch('onPointerDown', Number.NEGATIVE_INFINITY, 50)).toBe(false)

    expect(app.dispatch('onClick', 50, 50)).toBe(true)
    expect(focusedElement.value).not.toBeNull()
  })

  it('returns false from dispatch when pointer coordinates are non-numbers (matches dispatchHit)', async () => {
    let clicks = 0
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () =>
        box({ width: 100, height: 100, onKeyDown: () => {}, onClick: () => {
          clicks++
        } }, []),
      renderer,
      { width: 100, height: 100 },
    )

    clearFocus()
    expect(focusedElement.value).toBeNull()

    const str50 = '50' as unknown as number
    expect(() => app.dispatch('onClick', str50, 50)).not.toThrow()
    expect(app.dispatch('onClick', str50, 50)).toBe(false)
    expect(clicks).toBe(0)
    expect(focusedElement.value).toBeNull()

    expect(app.dispatch('onClick', 50, str50)).toBe(false)
    expect(clicks).toBe(0)

    const bx = 1n as unknown as number
    expect(() => app.dispatch('onPointerDown', bx, 50)).not.toThrow()
    expect(app.dispatch('onPointerDown', bx, 50)).toBe(false)

    expect(app.dispatch('onClick', 50, 50)).toBe(true)
    expect(clicks).toBe(1)
    expect(focusedElement.value).not.toBeNull()
  })

  it('returns false from dispatchKey and dispatchComposition when tree or layout is null', async () => {
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const app = await createApp(
      () =>
        box({ width: 10, height: 10, onClick: () => {}, onKeyDown: () => {}, onCompositionStart: () => {} }, []),
      renderer,
      { width: 100, height: 100 },
    )

    const savedTree = app.tree
    const savedLayout = app.layout
    expect(savedTree).not.toBeNull()
    expect(savedLayout).not.toBeNull()

    app.layout = null
    expect(app.dispatchKey('onKeyDown', tabDown)).toBe(false)
    expect(app.dispatchComposition('onCompositionStart', { data: '' })).toBe(false)

    app.layout = savedLayout
    app.tree = null
    expect(app.dispatchKey('onKeyDown', tabDown)).toBe(false)
    expect(app.dispatchComposition('onCompositionStart', { data: '' })).toBe(false)
  })
})

describe('createApp destroy', () => {
  it('stops reactive re-layout after destroy so signal updates do not render', async () => {
    const setFrameTimings = vi.fn()
    const render = vi.fn()
    const renderer: Renderer = {
      setFrameTimings,
      render,
      destroy: vi.fn(),
    }
    const width = signal(40)
    const app = await createApp(() => box({ width: width.value, height: 20 }, []), renderer, {
      width: 100,
      height: 50,
    })

    expect(setFrameTimings).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(1)

    app.destroy()

    width.set(99)
    expect(setFrameTimings).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(1)
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('createApp onError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('invokes onError and skips render and setFrameTimings when the view throws during initial update', async () => {
    const onError = vi.fn()
    const render = vi.fn()
    const setFrameTimings = vi.fn()
    const renderer: Renderer = {
      setFrameTimings,
      render,
      destroy: vi.fn(),
    }
    const err = new Error('view failed')
    await createApp(
      () => {
        throw err
      },
      renderer,
      { width: 100, height: 50, onError },
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
    expect(render).not.toHaveBeenCalled()
    expect(setFrameTimings).not.toHaveBeenCalled()
  })

  it('invokes onError when render throws after layout; setFrameTimings runs before render', async () => {
    const onError = vi.fn()
    const err = new Error('render failed')
    const setFrameTimings = vi.fn()
    const renderer: Renderer = {
      setFrameTimings,
      render() {
        throw err
      },
      destroy: vi.fn(),
    }

    await createApp(() => box({ width: 10, height: 10 }, []), renderer, {
      width: 100,
      height: 50,
      onError,
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
    expect(setFrameTimings).toHaveBeenCalledTimes(1)
    expect(setFrameTimings).toHaveBeenCalledWith({ layoutMs: expect.any(Number) })
  })

  it('allows a later manual update after the view first throws', async () => {
    const onError = vi.fn()
    const render = vi.fn()
    const renderer: Renderer = {
      render,
      destroy: vi.fn(),
    }
    let pass = false
    const app = await createApp(
      () => {
        if (!pass) throw new Error('not yet')
        return box({ width: 10, height: 10 }, [])
      },
      renderer,
      { width: 100, height: 50, onError },
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(render).not.toHaveBeenCalled()

    pass = true
    app.update()

    expect(render).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('logs with console.error when the view throws and onError is omitted', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    await createApp(
      () => {
        throw new Error('boom')
      },
      renderer,
      { width: 100, height: 50 },
    )

    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0]![0]).toBe('Geometra render error:')
    expect(spy.mock.calls[0]![1]).toBeInstanceOf(Error)
    expect((spy.mock.calls[0]![1] as Error).message).toBe('boom')
  })
})

describe('createApp waitForFonts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('awaits document.fonts.load for families from the initial view before the reactive effect runs', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })

    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 50 }, [
          text({
            text: 'hi',
            font: '14px CustomFace, sans-serif',
            lineHeight: 20,
            width: 10,
            height: 20,
          }),
        ]),
      renderer,
      { width: 200, height: 100, waitForFonts: true },
    )

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('16px CustomFace')
  })

  it('skips document.fonts.load when the initial view has no loadable custom families', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })

    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 50 }, [
          text({
            text: 'hi',
            font: '14px sans-serif, serif',
            lineHeight: 20,
            width: 10,
            height: 20,
          }),
        ]),
      renderer,
      { width: 200, height: 100, waitForFonts: true },
    )

    expect(load).not.toHaveBeenCalled()
    expect(renderer.render).toHaveBeenCalled()
  })

  it('skips font loading when document.fonts.load is missing so createApp still renders', async () => {
    vi.stubGlobal('document', { fonts: {} })

    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }

    await createApp(
      () =>
        box({ width: 100, height: 50 }, [
          text({
            text: 'hi',
            font: '14px CustomFace, sans-serif',
            lineHeight: 20,
            width: 10,
            height: 20,
          }),
        ]),
      renderer,
      { width: 200, height: 100, waitForFonts: true },
    )

    expect(renderer.render).toHaveBeenCalled()
  })

  it('invokes onError and rejects when the view throws during waitForFonts preflight', async () => {
    const onError = vi.fn()
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    const err = new Error('preflight view failed')
    await expect(
      createApp(
        () => {
          throw err
        },
        renderer,
        { width: 100, height: 50, waitForFonts: true, onError },
      ),
    ).rejects.toThrow('preflight view failed')

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
    expect(load).not.toHaveBeenCalled()
    expect(renderer.render).not.toHaveBeenCalled()
  })

  it('logs with console.error when the view throws during waitForFonts preflight and onError is omitted', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    await expect(
      createApp(
        () => {
          throw new Error('preflight boom')
        },
        renderer,
        { width: 100, height: 50, waitForFonts: true },
      ),
    ).rejects.toThrow('preflight boom')

    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0]![0]).toBe('Geometra render error:')
    expect(spy.mock.calls[0]![1]).toBeInstanceOf(Error)
    expect((spy.mock.calls[0]![1] as Error).message).toBe('preflight boom')
    expect(load).not.toHaveBeenCalled()
    expect(renderer.render).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('forwards fontLoadTimeoutMs to waitForFonts before the first render', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    try {
      const p = createApp(
        () =>
          box({ width: 100, height: 50 }, [
            text({
              text: 'hi',
              font: '14px SlowFace, sans-serif',
              lineHeight: 20,
              width: 10,
              height: 20,
            }),
          ]),
        renderer,
        { width: 200, height: 100, waitForFonts: true, fontLoadTimeoutMs: 80 },
      )
      await vi.advanceTimersByTimeAsync(79)
      await expect(
        Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
      ).resolves.toBe('not-yet')
      await vi.advanceTimersByTimeAsync(1)
      await p
      expect(load).toHaveBeenCalledWith('16px SlowFace')
      expect(renderer.render).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('treats invalid fontLoadTimeoutMs like waitForFonts (NaN falls back to 10_000 ms)', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    try {
      const p = createApp(
        () =>
          box({ width: 100, height: 50 }, [
            text({
              text: 'hi',
              font: '14px SlowFace, sans-serif',
              lineHeight: 20,
              width: 10,
              height: 20,
            }),
          ]),
        renderer,
        { width: 200, height: 100, waitForFonts: true, fontLoadTimeoutMs: Number.NaN },
      )
      await vi.advanceTimersByTimeAsync(9_999)
      await expect(
        Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
      ).resolves.toBe('not-yet')
      await vi.advanceTimersByTimeAsync(1)
      await p
      expect(load).toHaveBeenCalledWith('16px SlowFace')
      expect(renderer.render).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('treats non-finite fontLoadTimeoutMs like waitForFonts (±Infinity falls back to 10_000 ms)', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const renderer: Renderer = {
      render: vi.fn(),
      destroy: vi.fn(),
    }
    try {
      for (const fontLoadTimeoutMs of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const) {
        load.mockClear()
        renderer.render.mockClear()
        const p = createApp(
          () =>
            box({ width: 100, height: 50 }, [
              text({
                text: 'hi',
                font: '14px SlowFace, sans-serif',
                lineHeight: 20,
                width: 10,
                height: 20,
              }),
            ]),
          renderer,
          { width: 200, height: 100, waitForFonts: true, fontLoadTimeoutMs },
        )
        await vi.advanceTimersByTimeAsync(9_999)
        await expect(
          Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
        ).resolves.toBe('not-yet')
        await vi.advanceTimersByTimeAsync(1)
        await p
        expect(load).toHaveBeenCalledWith('16px SlowFace')
        expect(renderer.render).toHaveBeenCalled()
      }
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})
