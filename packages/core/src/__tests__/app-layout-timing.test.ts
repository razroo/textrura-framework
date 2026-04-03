import { afterEach, describe, it, expect, vi } from 'vitest'
import { createApp } from '../app.js'
import { box, text } from '../elements.js'
import { clearFocus, focusedElement } from '../focus.js'
import { signal } from '../signals.js'
import type { Renderer } from '../types.js'

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

  it('does not mirror nested flex rows from dir:rtl on a descendant — document direction stays ltr', async () => {
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
    expect(a!.x).toBeLessThan(b!.x)
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
})
