import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import { diffLayout } from '../protocol.js'

type L = ComputedLayout

function nowMs(): number {
  return performance.now()
}

function makeTree(depth: number, breadth: number, seed = 0): L {
  const node: L = {
    x: seed % 17,
    y: seed % 13,
    width: 100 + (seed % 29),
    height: 40 + (seed % 19),
    children: [],
  }
  if (depth === 0) return node
  for (let i = 0; i < breadth; i++) {
    node.children.push(makeTree(depth - 1, breadth, seed + i + 1))
  }
  return node
}

function mutateLayout(node: L): L {
  return {
    x: node.x + 1,
    y: node.y + 2,
    width: node.width + 1,
    height: node.height + 1,
    children: node.children.map((c, i) => (i % 2 === 0
      ? mutateLayout(c)
      : { ...c, x: c.x + 1, children: c.children.map(gc => ({ ...gc })) })),
  }
}

function mutateLayoutWorstCase(node: L): L {
  return {
    x: node.x + 2,
    y: node.y + 2,
    width: node.width + 2,
    height: node.height + 2,
    children: node.children.map(mutateLayoutWorstCase),
  }
}

describe('protocol perf smoke', () => {
  it('diffLayout handles rapid geometry bursts', () => {
    let prev = makeTree(4, 4)
    const start = nowMs()
    for (let i = 0; i < 60; i++) {
      const next = mutateLayout(prev)
      const patches = diffLayout(prev, next)
      expect(patches.length).toBeGreaterThan(0)
      prev = next
    }
    const elapsed = nowMs() - start
    expect(elapsed).toBeGreaterThan(0)
    expect(elapsed).toBeLessThanOrEqual(500)
  })

  it('handles large tree worst-case churn within smoke threshold', () => {
    let prev = makeTree(5, 4)
    const start = nowMs()
    for (let i = 0; i < 12; i++) {
      const next = mutateLayoutWorstCase(prev)
      const patches = diffLayout(prev, next)
      expect(patches.length).toBeGreaterThan(100)
      prev = next
    }
    const elapsed = nowMs() - start
    expect(elapsed).toBeLessThanOrEqual(900)
  })
})
