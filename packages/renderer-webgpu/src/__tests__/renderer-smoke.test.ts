import { afterEach, describe, it, expect, vi } from 'vitest'
import type { ComputedLayout } from 'textura'
import { box, text } from '@geometra/core'
import { WebGPURenderer } from '../index.js'

class Fake2DContext {
  fillStyle = ''
  calls: Array<{ x: number; y: number; w: number; h: number; color: string }> = []
  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ x, y, w, h, color: this.fillStyle })
  }
}

describe('webgpu renderer smoke', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to 2d clear pass before init', () => {
    const ctx = new Fake2DContext()
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas, background: '#112233' })
    const tree = box({ width: 100, height: 40 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 40, children: [] }
    renderer.render(layout, tree)

    expect(ctx.calls).toHaveLength(1)
    expect(ctx.calls[0]).toEqual({ x: 0, y: 0, w: 100, h: 40, color: '#112233' })
  })

  it('pre-init 2d fallback clears 1×1 when root layout bounds are non-finite (NaN width)', () => {
    const ctx = new Fake2DContext()
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas, background: '#112233' })
    const tree = box({ width: 100, height: 40 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: Number.NaN, height: 40, children: [] }
    renderer.render(layout, tree)

    expect(ctx.calls).toHaveLength(1)
    expect(ctx.calls[0]).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#112233' })
  })

  it('reports unsupported when navigator has no gpu', () => {
    vi.stubGlobal('navigator', {} as Navigator)
    expect(WebGPURenderer.isSupported()).toBe(false)
  })

  it('init throws when WebGPU is not supported', async () => {
    vi.stubGlobal('navigator', {} as Navigator)
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement
    const renderer = new WebGPURenderer({ canvas })
    await expect(renderer.init()).rejects.toThrow('WebGPU is not supported')
  })

  it('throws when pre-init render cannot acquire a 2d fallback context', () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement
    const renderer = new WebGPURenderer({ canvas })
    const tree = box({ width: 10, height: 10 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 10, height: 10, children: [] }
    expect(() => renderer.render(layout, tree)).toThrow(
      'WebGPURenderer is not initialized. Call init() first.',
    )
  })

  it('notifies onFallbackNeeded for text leaves after init (MVP collects solid boxes only)', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({
          requestDevice: async () => ({
            createShaderModule: () => ({}),
            createRenderPipeline: () => ({}),
            createCommandEncoder: () => ({
              beginRenderPass: () => ({ setPipeline: () => {}, setVertexBuffer: () => {}, draw: () => {}, end: () => {} }),
              finish: () => ({}),
            }),
            queue: { writeBuffer: () => {}, submit: () => {} },
            createBuffer: () => ({ destroy: () => {} }),
          }),
        }),
      },
    } as unknown as Navigator)

    const currentTexture = { createView: () => ({}) }
    const context = {
      configure: () => {},
      getCurrentTexture: () => currentTexture,
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === 'webgpu' ? context : null),
    } as unknown as HTMLCanvasElement

    const onFallbackNeeded = vi.fn()
    const renderer = new WebGPURenderer({ canvas, onFallbackNeeded })
    await renderer.init()

    const tree = box({ width: 100, height: 40 }, [
      text({ text: 'hi', font: '14px sans-serif', lineHeight: 18, width: 20, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [{ x: 0, y: 0, width: 20, height: 18, children: [] }],
    }
    renderer.render(layout, tree)

    expect(onFallbackNeeded).toHaveBeenCalledWith(1)
  })

  it('after init, clamps canvas backing store to 1×1 when root layout width is NaN', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({
          requestDevice: async () => ({
            createShaderModule: () => ({}),
            createRenderPipeline: () => ({}),
            createCommandEncoder: () => ({
              beginRenderPass: () => ({ setPipeline: () => {}, setVertexBuffer: () => {}, draw: () => {}, end: () => {} }),
              finish: () => ({}),
            }),
            queue: { writeBuffer: () => {}, submit: () => {} },
            createBuffer: () => ({ destroy: () => {} }),
          }),
        }),
      },
    } as unknown as Navigator)

    const currentTexture = { createView: () => ({}) }
    const context = {
      configure: () => {},
      getCurrentTexture: () => currentTexture,
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === 'webgpu' ? context : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas })
    await renderer.init()

    const tree = box({ width: 100, height: 40, backgroundColor: '#ff0000' }, [])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: Number.NaN,
      height: 40,
      children: [],
    }
    expect(() => renderer.render(layout, tree)).not.toThrow()
    expect(canvas.width).toBe(1)
    expect(canvas.height).toBe(1)
  })
})
