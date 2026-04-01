import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import { coalescePatches, diffLayout } from '../protocol.js'

describe('server transport stress', () => {
  it('coalesces burst patch streams deterministically', () => {
    type L = ComputedLayout
    const base: L = {
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      children: [
        { x: 1, y: 2, width: 50, height: 20, children: [] },
        { x: 3, y: 4, width: 60, height: 25, children: [] },
      ],
    }
    let prev = base
    let totalCoalesced = 0
    for (let burst = 0; burst < 40; burst++) {
      const next: L = {
        ...prev,
        children: prev.children.map((c, i) => ({
          ...c,
          x: c.x + (i === 0 ? 1 : 0),
          width: c.width + 1,
          children: [],
        })),
      }
      const raw = diffLayout(prev, next)
      // diffLayout never emits duplicate paths; coalescePatches only merges when the
      // same path appears multiple times (e.g. concatenated micro-updates). Duplicate
      // the burst to exercise last-write-wins coalescing deterministically.
      const burst = [...raw, ...raw]
      const merged = coalescePatches(burst)
      totalCoalesced += burst.length - merged.length
      expect(merged.length).toBe(raw.length)
      expect(merged.length).toBeGreaterThan(0)
      prev = next
    }
    expect(totalCoalesced).toBeGreaterThan(0)
  })
})
