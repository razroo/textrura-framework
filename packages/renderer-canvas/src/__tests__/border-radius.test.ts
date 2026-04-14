import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import { box } from '@geometra/core'
import { CanvasRenderer } from '../renderer.js'

class FakeCtx {
  ops: Array<{ op: string; args?: number[] }> = []
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  font = '12px sans-serif'
  textBaseline = 'top'
  globalAlpha = 1
  shadowOffsetX = 0
  shadowOffsetY = 0
  shadowBlur = 0
  shadowColor = ''
  scale(): void { this.ops.push({ op: 'scale' }) }
  setTransform(): void { this.ops.push({ op: 'setTransform' }) }
  fillRect(): void { this.ops.push({ op: 'fillRect' }) }
  fill(): void { this.ops.push({ op: 'fill' }) }
  stroke(): void { this.ops.push({ op: 'stroke' }) }
  beginPath(): void { this.ops.push({ op: 'beginPath' }) }
  closePath(): void { this.ops.push({ op: 'closePath' }) }
  rect(): void { this.ops.push({ op: 'rect' }) }
  clip(): void { this.ops.push({ op: 'clip' }) }
  save(): void { this.ops.push({ op: 'save' }) }
  restore(): void { this.ops.push({ op: 'restore' }) }
  moveTo(x: number, y: number): void { this.ops.push({ op: 'moveTo', args: [x, y] }) }
  lineTo(x: number, y: number): void { this.ops.push({ op: 'lineTo', args: [x, y] }) }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.ops.push({ op: 'quadraticCurveTo', args: [cx, cy, x, y] })
  }
  strokeRect(): void { this.ops.push({ op: 'strokeRect' }) }
  fillText(): void { this.ops.push({ op: 'fillText' }) }
  measureText(s: string): { width: number } { return { width: s.length * 8 } }
}

function setWindowDpr(dpr: number): void {
  Object.defineProperty(globalThis, 'window', {
    value: { devicePixelRatio: dpr },
    configurable: true,
    writable: true,
  })
}

describe('canvas border-radius', () => {
  it('uniform number radius produces equal corner arcs', () => {
    setWindowDpr(1)
    const ctx = new FakeCtx()
    const canvas = { style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement
    const tree = box({ width: 100, height: 80, backgroundColor: '#ff0000', borderRadius: 10 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 80, children: [] }

    const renderer = new CanvasRenderer({ canvas })
    renderer.render(layout, tree)

    const moveTo = ctx.ops.find((o) => o.op === 'moveTo')
    expect(moveTo?.args).toEqual([10, 0]) // first corner arc starts at uniform r
  })

  it('per-corner object applies different radii per corner', () => {
    setWindowDpr(1)
    const ctx = new FakeCtx()
    const canvas = { style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement
    const tree = box({
      width: 100,
      height: 80,
      backgroundColor: '#ff0000',
      borderRadius: { topLeft: 20, topRight: 4, bottomRight: 8, bottomLeft: 12 },
    }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 80, children: [] }

    const renderer = new CanvasRenderer({ canvas })
    renderer.render(layout, tree)

    // First moveTo is at x=topLeft, y=0
    const moveTo = ctx.ops.find((o) => o.op === 'moveTo')
    expect(moveTo?.args).toEqual([20, 0])

    // The final lineTo before the top-left quadraticCurveTo should be at x=0, y=topLeft
    const lineTos = ctx.ops.filter((o) => o.op === 'lineTo')
    // Path order: moveTo(tl, 0) -> lineTo(w-tr, 0) -> quadraticCurveTo(w, 0, w, tr) -> lineTo(w, h-br) -> quadraticCurveTo(w, h, w-br, h) -> lineTo(bl, h) -> quadraticCurveTo(0, h, 0, h-bl) -> lineTo(0, tl) -> quadraticCurveTo(0, 0, tl, 0)
    expect(lineTos).toHaveLength(4)
    expect(lineTos[0]?.args).toEqual([100 - 4, 0]) // lineTo(w - tr, 0)
    expect(lineTos[1]?.args).toEqual([100, 80 - 8]) // lineTo(w, h - br)
    expect(lineTos[2]?.args).toEqual([12, 80]) // lineTo(bl, h)
    expect(lineTos[3]?.args).toEqual([0, 20]) // lineTo(0, tl)
  })

  it('omitted corners default to 0', () => {
    setWindowDpr(1)
    const ctx = new FakeCtx()
    const canvas = { style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement
    const tree = box({
      width: 100,
      height: 80,
      backgroundColor: '#ff0000',
      borderRadius: { topLeft: 16 }, // others default to 0
    }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 80, children: [] }

    const renderer = new CanvasRenderer({ canvas })
    renderer.render(layout, tree)

    const moveTo = ctx.ops.find((o) => o.op === 'moveTo')
    expect(moveTo?.args).toEqual([16, 0])

    const lineTos = ctx.ops.filter((o) => o.op === 'lineTo')
    expect(lineTos[0]?.args).toEqual([100, 0]) // tr = 0, so line goes fully to corner
  })

  it('clamps radius to half of smaller dimension', () => {
    setWindowDpr(1)
    const ctx = new FakeCtx()
    const canvas = { style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement
    const tree = box({
      width: 40,
      height: 60,
      backgroundColor: '#ff0000',
      borderRadius: 999, // clamp to min(w, h) / 2 = 20
    }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 40, height: 60, children: [] }

    const renderer = new CanvasRenderer({ canvas })
    renderer.render(layout, tree)

    const moveTo = ctx.ops.find((o) => o.op === 'moveTo')
    expect(moveTo?.args).toEqual([20, 0])
  })
})
