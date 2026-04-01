import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import { box, text } from '../elements.js'
import { dispatchHit } from '../hit-test.js'
import { getInputCaretGeometry } from '../text-input.js'
import type { TextNodeInfo } from '../selection.js'

function nowMs(): number {
  return performance.now()
}

describe('core perf smoke', () => {
  it('hit-testing stays fast on medium trees', () => {
    const leaves = Array.from({ length: 300 }, (_, i) =>
      box({ width: 40, height: 20, onClick: () => i }, []),
    )
    const tree = box({ width: 1000, height: 1000 }, leaves)
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 1000, height: 1000,
      children: leaves.map((_l, i) => ({
        x: (i % 30) * 32,
        y: Math.floor(i / 30) * 22,
        width: 40,
        height: 20,
        children: [],
      })),
    }

    // Warm up once to reduce one-time JIT noise.
    for (let i = 0; i < 500; i++) {
      dispatchHit(tree, layout, 'onClick', (i % 30) * 32 + 1, (i % 10) * 22 + 1)
    }

    let best = Number.POSITIVE_INFINITY
    for (let run = 0; run < 3; run++) {
      const start = nowMs()
      for (let i = 0; i < 2000; i++) {
        dispatchHit(tree, layout, 'onClick', (i % 30) * 32 + 1, (i % 10) * 22 + 1)
      }
      best = Math.min(best, nowMs() - start)
    }

    expect(best).toBeGreaterThan(0)
    // Wall-clock bound: catches large regressions; allows CI/dev machine variance.
    expect(best).toBeLessThanOrEqual(500)
  })

  it('caret geometry lookup scales across many measured lines', () => {
    const lines = Array.from({ length: 200 }, (_, i) => ({
      text: `line-${i}`,
      x: 10,
      y: 20 + i * 18,
      charOffsets: [0, 6, 12, 18, 24, 30],
      charWidths: [6, 6, 6, 6, 6, 6],
    }))
    const textNode: TextNodeInfo = {
      element: text({ text: lines.map(l => l.text).join(''), font: '14px Inter', lineHeight: 18 }),
      direction: 'ltr',
      x: 0,
      y: 0,
      width: 400,
      height: 3600,
      index: 0,
      lines,
    }

    const start = nowMs()
    for (let i = 0; i < 5000; i++) {
      getInputCaretGeometry([textNode], {
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
