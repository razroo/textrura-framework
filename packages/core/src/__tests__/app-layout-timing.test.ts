import { describe, it, expect, vi } from 'vitest'
import { createApp } from '../app.js'
import { box } from '../elements.js'
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
})
