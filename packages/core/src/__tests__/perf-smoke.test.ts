import { describe, it, expect } from 'vitest'
import { box, text } from '../elements.js'
import { dispatchHit } from '../hit-test.js'
import { getInputCaretGeometry } from '../text-input.js'

function nowMs(): number {
  return performance.now()
}

describe('core perf smoke', () => {
  it('hit-testing stays fast on medium trees', () => {
    const leaves = Array.from({ length: 300 }, (_, i) =>
      box({ width: 40, height: 20, onClick: () => i }, []),
    )
    const tree = box({ width: 1000, height: 1000 }, leaves)
    const layout = {
      x: 0, y: 0, width: 1000, height: 1000,
      children: leaves.map((_l, i) => ({
        x: (i % 30) * 32,
        y: Math.floor(i / 30) * 22,
        width: 40,
        height: 20,
        children: [],
      })),
    }

    const start = nowMs()
    for (let i = 0; i < 2000; i++) {
      dispatchHit(tree, layout as any, 'onClick', (i % 30) * 32 + 1, (i % 10) * 22 + 1)
    }
    const elapsed = nowMs() - start

    expect(elapsed).toBeGreaterThan(0)
    expect(elapsed).toBeLessThanOrEqual(200)
  })

  it('caret geometry lookup scales across many measured lines', () => {
    const lines = Array.from({ length: 200 }, (_, i) => ({
      text: `line-${i}`,
      x: 10,
      y: 20 + i * 18,
      charOffsets: [0, 6, 12, 18, 24, 30],
      charWidths: [6, 6, 6, 6, 6, 6],
    }))
    const textNode = {
      element: text({ text: lines.map(l => l.text).join(''), font: '14px Inter', lineHeight: 18 }),
      x: 0,
      y: 0,
      width: 400,
      height: 3600,
      index: 0,
      lines,
    }

    const start = nowMs()
    for (let i = 0; i < 5000; i++) {
      getInputCaretGeometry([textNode] as any, {
        anchorNode: 0,
        anchorOffset: i % 800,
        focusNode: 0,
        focusOffset: i % 800,
      })
    }
    const elapsed = nowMs() - start
    expect(elapsed).toBeGreaterThan(0)
    expect(elapsed).toBeLessThanOrEqual(300)
  })
})
