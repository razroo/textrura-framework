import { describe, it, expect } from 'vitest'
import { box, text, setFocus, clearFocus } from '@geometra/core'
import { CanvasRenderer } from '../renderer.js'

class FakeGradient {
  stops: Array<{ offset: number; color: string }> = []
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color })
  }
}

class FakeCtx {
  ops: string[] = []
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
  scale(): void { this.ops.push('scale') }
  setTransform(): void { this.ops.push('setTransform') }
  fillRect(): void { this.ops.push('fillRect') }
  beginPath(): void { this.ops.push('beginPath') }
  rect(): void { this.ops.push('rect') }
  clip(): void { this.ops.push('clip') }
  save(): void { this.ops.push('save') }
  restore(): void { this.ops.push('restore') }
  strokeRect(): void { this.ops.push('strokeRect') }
  fillText(): void { this.ops.push('fillText') }
  measureText(s: string): { width: number } { return { width: s.length * 8 } }
  createLinearGradient(): FakeGradient {
    this.ops.push('createLinearGradient')
    return new FakeGradient()
  }
}

describe('canvas visual operation snapshots', () => {
  it('emits operations for selection, focus ring, gradient, and clipping', () => {
    ;(globalThis as any).window = { devicePixelRatio: 1 }
    const ctx = new FakeCtx()
    const canvas = {
      style: {} as Record<string, string>,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement

    const focused = box({ onKeyDown: () => undefined, width: 120, height: 30 }, [
      text({ text: 'Focused text', font: '14px Inter', lineHeight: 18 }),
    ])
    const tree = box({ gradient: { type: 'linear', stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] } }, [
      box({ overflow: 'hidden', width: 200, height: 80 }, [focused]),
    ])
    const layout = {
      x: 0, y: 0, width: 260, height: 120,
      children: [{
        x: 20, y: 20, width: 200, height: 80,
        children: [{ x: 0, y: 0, width: 120, height: 30, children: [{ x: 0, y: 0, width: 100, height: 18, children: [] }] }],
      }],
    }

    const renderer = new CanvasRenderer({ canvas, showFocusRing: true })
    renderer.selection = { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 6 }
    setFocus(focused, layout.children[0]!.children[0]! as any)
    renderer.render(layout as any, tree)
    clearFocus()

    expect(ctx.ops).toContain('createLinearGradient')
    expect(ctx.ops).toContain('clip')
    expect(ctx.ops).toContain('fillText')
    expect(ctx.ops).toContain('strokeRect')
    expect(ctx.ops).toMatchInlineSnapshot(`
      [
        "scale",
        "fillRect",
        "createLinearGradient",
        "fillRect",
        "save",
        "beginPath",
        "rect",
        "clip",
        "fillRect",
        "fillText",
        "fillText",
        "restore",
        "save",
        "beginPath",
        "rect",
        "clip",
        "save",
        "strokeRect",
        "restore",
        "restore",
        "setTransform",
      ]
    `)
  })
})
