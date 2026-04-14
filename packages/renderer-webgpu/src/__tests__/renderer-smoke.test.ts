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

  it('pre-init 2d fallback clears 1×1 when root layout width or height is ±Infinity (layoutBoundsAreFinite parity)', () => {
    const ctx = new Fake2DContext()
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas, background: '#445566' })
    const tree = box({ width: 100, height: 40 }, [])
    const base = { x: 0, y: 0, children: [] as [] }

    renderer.render({ ...base, width: Number.POSITIVE_INFINITY, height: 40 }, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#445566' })

    renderer.render({ ...base, width: 100, height: Number.NEGATIVE_INFINITY }, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#445566' })
  })

  it('pre-init 2d fallback clears 1×1 when root layout width or height is negative (layoutBoundsAreFinite parity)', () => {
    const ctx = new Fake2DContext()
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas, background: '#aabbcc' })
    const tree = box({ width: 100, height: 40 }, [])

    renderer.render({ x: 0, y: 0, width: -1, height: 40, children: [] }, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#aabbcc' })

    renderer.render({ x: 0, y: 0, width: 100, height: -0.001, children: [] }, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#aabbcc' })
  })

  it('pre-init 2d fallback clears 1×1 when root layout x or y is non-finite (layoutBoundsAreFinite parity)', () => {
    const ctx = new Fake2DContext()
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas, background: '#ccddee' })
    const tree = box({ width: 100, height: 40 }, [])

    renderer.render({ x: Number.POSITIVE_INFINITY, y: 0, width: 100, height: 40, children: [] }, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#ccddee' })

    renderer.render({ x: 0, y: Number.NEGATIVE_INFINITY, width: 100, height: 40, children: [] }, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#ccddee' })
  })

  it('pre-init 2d fallback clears 1×1 when root width/height are non-numbers (BigInt / boxed Number; layoutBoundsAreFinite parity)', () => {
    const ctx = new Fake2DContext()
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas, background: '#334455' })
    const tree = box({ width: 100, height: 40 }, [])
    const base = { x: 0, y: 0, children: [] as [] }

    renderer.render({ ...base, width: 3n as unknown as number, height: 40 } as ComputedLayout, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#334455' })

    renderer.render({ ...base, width: 100, height: 3n as unknown as number } as ComputedLayout, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#334455' })

    renderer.render({ ...base, width: Object(10) as unknown as number, height: 40 } as ComputedLayout, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#334455' })
  })

  it('pre-init 2d fallback clears 1×1 when root layout children is missing, null, or not an array (layoutBoundsAreFinite parity)', () => {
    const ctx = new Fake2DContext()
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas, background: '#667788' })
    const tree = box({ width: 100, height: 40 }, [])
    const base = { x: 0, y: 0, width: 100, height: 40 }

    renderer.render({ ...base, children: null } as unknown as ComputedLayout, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#667788' })

    renderer.render({ ...base, children: {} as unknown as [] } as unknown as ComputedLayout, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#667788' })

    renderer.render(base as unknown as ComputedLayout, tree)
    expect(ctx.calls.pop()).toEqual({ x: 0, y: 0, w: 1, h: 1, color: '#667788' })
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

  it('renders text leaves without fallback after init', async () => {
    const fakeDevice = {
      createShaderModule: () => ({}),
      createRenderPipeline: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroupLayout: () => ({}),
      createBindGroup: () => ({}),
      createSampler: () => ({}),
      createTexture: () => ({ createView: () => ({}), destroy: () => {} }),
      createCommandEncoder: () => ({
        beginRenderPass: () => ({ setPipeline: () => {}, setVertexBuffer: () => {}, setBindGroup: () => {}, draw: () => {}, end: () => {} }),
        finish: () => ({}),
      }),
      queue: { writeBuffer: () => {}, submit: () => {}, copyExternalImageToTexture: () => {} },
      createBuffer: () => ({ destroy: () => {} }),
    }
    vi.stubGlobal('navigator', {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({
          requestDevice: async () => fakeDevice,
        }),
      },
    } as unknown as Navigator)

    // Stub OffscreenCanvas for text atlas
    vi.stubGlobal('OffscreenCanvas', class {
      width: number
      height: number
      constructor(w: number, h: number) { this.width = w; this.height = h }
      getContext() {
        return {
          font: '',
          textBaseline: '',
          fillStyle: '',
          clearRect: () => {},
          fillText: () => {},
          measureText: (t: string) => ({ width: t.length * 8 }),
        }
      }
    })

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

    // Text is now rendered natively — no fallback needed
    expect(onFallbackNeeded).not.toHaveBeenCalled()
  })

  it('renders border-radius and gradient boxes without fallback after init', async () => {
    const fakeDevice = {
      createShaderModule: () => ({}),
      createRenderPipeline: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroupLayout: () => ({}),
      createBindGroup: () => ({}),
      createSampler: () => ({}),
      createTexture: () => ({ createView: () => ({}), destroy: () => {} }),
      createCommandEncoder: () => ({
        beginRenderPass: () => ({ setPipeline: () => {}, setVertexBuffer: () => {}, setBindGroup: () => {}, draw: () => {}, end: () => {} }),
        finish: () => ({}),
      }),
      queue: { writeBuffer: () => {}, submit: () => {}, copyExternalImageToTexture: () => {} },
      createBuffer: () => ({ destroy: () => {} }),
    }
    vi.stubGlobal('navigator', {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({
          requestDevice: async () => fakeDevice,
        }),
      },
    } as unknown as Navigator)
    vi.stubGlobal('OffscreenCanvas', class {
      width: number
      height: number
      constructor(w: number, h: number) { this.width = w; this.height = h }
      getContext() {
        return {
          font: '', textBaseline: '', fillStyle: '',
          clearRect: () => {}, fillText: () => {}, measureText: () => ({ width: 0 }),
        }
      }
    })

    const context = { configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }) }
    const canvas = {
      width: 0, height: 0,
      getContext: (kind: string) => (kind === 'webgpu' ? context : null),
    } as unknown as HTMLCanvasElement

    const onFallbackNeeded = vi.fn()
    const renderer = new WebGPURenderer({ canvas, onFallbackNeeded })
    await renderer.init()

    const tree = box({
      width: 200,
      height: 100,
      backgroundColor: '#ff0000',
      borderRadius: 12,
    }, [
      box({
        width: 100,
        height: 50,
        gradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { offset: 0, color: '#ff0000' },
            { offset: 1, color: '#0000ff' },
          ],
        },
      }, []),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [{ x: 10, y: 10, width: 100, height: 50, children: [] }],
    }
    renderer.render(layout, tree)

    expect(onFallbackNeeded).not.toHaveBeenCalled()
  })

  it('reports box-shadow as unsupported (still a gap)', async () => {
    const fakeDevice = {
      createShaderModule: () => ({}),
      createRenderPipeline: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroupLayout: () => ({}),
      createBindGroup: () => ({}),
      createSampler: () => ({}),
      createTexture: () => ({ createView: () => ({}), destroy: () => {} }),
      createCommandEncoder: () => ({
        beginRenderPass: () => ({ setPipeline: () => {}, setVertexBuffer: () => {}, setBindGroup: () => {}, draw: () => {}, end: () => {} }),
        finish: () => ({}),
      }),
      queue: { writeBuffer: () => {}, submit: () => {}, copyExternalImageToTexture: () => {} },
      createBuffer: () => ({ destroy: () => {} }),
    }
    vi.stubGlobal('navigator', {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({
          requestDevice: async () => fakeDevice,
        }),
      },
    } as unknown as Navigator)
    vi.stubGlobal('OffscreenCanvas', class {
      width: number; height: number
      constructor(w: number, h: number) { this.width = w; this.height = h }
      getContext() {
        return { font: '', textBaseline: '', fillStyle: '', clearRect: () => {}, fillText: () => {}, measureText: () => ({ width: 0 }) }
      }
    })

    const context = { configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }) }
    const canvas = {
      width: 0, height: 0,
      getContext: (kind: string) => (kind === 'webgpu' ? context : null),
    } as unknown as HTMLCanvasElement

    const onFallbackNeeded = vi.fn()
    const renderer = new WebGPURenderer({ canvas, onFallbackNeeded })
    await renderer.init()

    const tree = box({
      width: 100,
      height: 100,
      backgroundColor: '#ff0000',
      boxShadow: { offsetX: 2, offsetY: 2, blur: 4, color: '#000000' },
    }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 100, children: [] }
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
            createPipelineLayout: () => ({}),
            createBindGroupLayout: () => ({}),
            createSampler: () => ({}),
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

    vi.stubGlobal('OffscreenCanvas', class {
      width: number
      height: number
      constructor(w: number, h: number) { this.width = w; this.height = h }
      getContext() {
        return { font: '', textBaseline: '', fillStyle: '', clearRect: () => {}, fillText: () => {}, measureText: () => ({ width: 0 }) }
      }
    })

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
