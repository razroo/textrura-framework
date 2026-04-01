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
})
