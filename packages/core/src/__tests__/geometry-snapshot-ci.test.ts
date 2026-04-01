import { describe, it, expect } from 'vitest'
import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import { box, text } from '../elements.js'
import { toLayoutTree } from '../tree.js'

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext(type: string) {
      if (type !== '2d') return null
      return {
        font: '',
        measureText(value: string) {
          return { width: value.length * 8 }
        },
      }
    }
  }
}

function roundLayout(l: ComputedLayout): unknown {
  const r = (n: number) => Math.round(n * 1000) / 1000
  return {
    x: r(l.x),
    y: r(l.y),
    width: r(l.width),
    height: r(l.height),
    children: l.children.map(roundLayout),
  }
}

describe('geometry snapshot CI', () => {
  it('stable box-only layout (rounded)', async () => {
    await init()
    const tree = box({ width: 120, height: 64, padding: 8 }, [])
    const layout = computeLayout(toLayoutTree(tree), { width: 120, height: 64 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable text-in-padded-box layout (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 80, padding: 12 },
      [text({ text: 'Hi', font: '16px sans-serif', lineHeight: 20 })],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })
})
