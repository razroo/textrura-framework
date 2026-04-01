import { afterEach, describe, it, expect, vi } from 'vitest'
import { createApp } from '../app.js'
import { box, text } from '../elements.js'
import type { Renderer } from '../types.js'

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
})
