import { describe, it, expect } from 'vitest'
import { box } from '@geometra/core'
import { WebGPURenderer } from '../index.js'

class Fake2DContext {
  fillStyle = ''
  calls: Array<{ x: number; y: number; w: number; h: number; color: string }> = []
  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ x, y, w, h, color: this.fillStyle })
  }
}

describe('webgpu renderer smoke', () => {
  it('falls back to 2d clear pass before init', () => {
    const ctx = new Fake2DContext()
    const canvas = {
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? ctx : null),
    } as unknown as HTMLCanvasElement

    const renderer = new WebGPURenderer({ canvas, background: '#112233' })
    const tree = box({ width: 100, height: 40 }, [])
    const layout = { x: 0, y: 0, width: 100, height: 40, children: [] }
    renderer.render(layout as any, tree)

    expect(ctx.calls).toHaveLength(1)
    expect(ctx.calls[0]).toEqual({ x: 0, y: 0, w: 100, h: 40, color: '#112233' })
  })
})
