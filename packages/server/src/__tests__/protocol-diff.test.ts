import { describe, it, expect } from 'vitest'
import type { ComputedLayout } from 'textura'
import { diffLayout, isProtocolCompatible, coalescePatches } from '../protocol.js'

type TestLayout = ComputedLayout

function cloneLayout(layout: TestLayout): TestLayout {
  return {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    children: layout.children.map(cloneLayout),
  }
}

function applyPatches(layout: TestLayout, patches: ReturnType<typeof diffLayout>): void {
  for (const patch of patches) {
    let node = layout
    for (const idx of patch.path) {
      node = node.children[idx]!
    }
    if (patch.x !== undefined) node.x = patch.x
    if (patch.y !== undefined) node.y = patch.y
    if (patch.width !== undefined) node.width = patch.width
    if (patch.height !== undefined) node.height = patch.height
  }
}

function makeBaseLayout(): TestLayout {
  return {
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    children: [
      { x: 10, y: 20, width: 100, height: 40, children: [] },
      {
        x: 40,
        y: 80,
        width: 200,
        height: 120,
        children: [
          { x: 0, y: 0, width: 80, height: 20, children: [] },
          { x: 0, y: 28, width: 80, height: 20, children: [] },
        ],
      },
    ],
  }
}

describe('diffLayout', () => {
  it('applies patches to reach next layout during burst updates', () => {
    let prev = makeBaseLayout()

    for (let i = 1; i <= 30; i++) {
      const next = cloneLayout(prev)
      next.width += i
      next.children[0]!.x += 1
      next.children[1]!.children[1]!.y += 2
      next.children[1]!.height += 1

      const patches = diffLayout(prev, next)
      const patched = cloneLayout(prev)
      applyPatches(patched, patches)

      expect(patched).toEqual(next)
      prev = next
    }
  })

  it('returns no patches when geometry is unchanged', () => {
    const base = makeBaseLayout()
    const same = cloneLayout(base)
    const patches = diffLayout(base, same)
    expect(patches).toEqual([])
  })

  it('compares children pairwise by index and ignores trailing extras on prev (no removal patches)', () => {
    const prev: TestLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 10, height: 10, children: [] },
        { x: 20, y: 0, width: 30, height: 10, children: [] },
      ],
    }
    const next: TestLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 99, height: 10, children: [] }],
    }
    expect(diffLayout(prev, next)).toEqual([{ path: [0], width: 99 }])
  })

  it('does not emit patches for appended child slots when next has more children than prev', () => {
    const prev: TestLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [{ x: 0, y: 0, width: 10, height: 10, children: [] }],
    }
    const next: TestLayout = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        { x: 0, y: 0, width: 10, height: 10, children: [] },
        { x: 50, y: 0, width: 5, height: 5, children: [] },
      ],
    }
    expect(diffLayout(prev, next)).toEqual([])
  })
})

describe('isProtocolCompatible', () => {
  it('treats undefined/older protocol versions as compatible and newer as incompatible', () => {
    expect(isProtocolCompatible(undefined, 1)).toBe(true)
    expect(isProtocolCompatible(1, 1)).toBe(true)
    expect(isProtocolCompatible(0, 1)).toBe(true)
    expect(isProtocolCompatible(2, 1)).toBe(false)
  })

  it('treats negative peer versions as compatible (numeric ordering vs current)', () => {
    expect(isProtocolCompatible(-1, 1)).toBe(true)
  })

  it('rejects NaN peer version (comparison is false; malformed wire values are not treated as legacy)', () => {
    expect(isProtocolCompatible(Number.NaN, 1)).toBe(false)
  })

  it('rejects positive Infinity peer version (non-finite wire values)', () => {
    expect(isProtocolCompatible(Number.POSITIVE_INFINITY, 1)).toBe(false)
  })

  it('rejects negative Infinity peer version (non-finite wire values; not confused with legacy ordering)', () => {
    expect(isProtocolCompatible(Number.NEGATIVE_INFINITY, 1)).toBe(false)
  })

  it('rejects BigInt peer version without throwing (typeof gate before Number.isFinite)', () => {
    expect(isProtocolCompatible(1n as unknown as number, 1)).toBe(false)
  })

  it('rejects non-number peer versions from malformed wire decode (e.g. string)', () => {
    expect(isProtocolCompatible('1' as unknown as number, 1)).toBe(false)
  })
})

describe('coalescePatches', () => {
  it('returns an empty array for an empty input', () => {
    expect(coalescePatches([])).toEqual([])
  })

  it('coalesces repeated path updates with last-write wins semantics', () => {
    const merged = coalescePatches([
      { path: [1, 2], x: 10 },
      { path: [1, 2], y: 20 },
      { path: [1, 2], x: 30, width: 40 },
      { path: [3], height: 9 },
      { path: [3], y: 5 },
    ])
    expect(merged).toEqual([
      { path: [1, 2], x: 30, y: 20, width: 40 },
      { path: [3], height: 9, y: 5 },
    ])
  })

  it('keeps distinct path keys separate (prefix paths are not merged)', () => {
    const merged = coalescePatches([
      { path: [1], x: 1 },
      { path: [1, 0], y: 2 },
      { path: [1], width: 3 },
    ])
    expect(merged).toEqual([
      { path: [1], x: 1, width: 3 },
      { path: [1, 0], y: 2 },
    ])
  })

  it('preserves first-seen order for unrelated paths', () => {
    const merged = coalescePatches([
      { path: [2], x: 1 },
      { path: [0], y: 2 },
      { path: [1], width: 3 },
    ])
    expect(merged.map(p => p.path)).toEqual([[2], [0], [1]])
  })

  it('clones path arrays on first occurrence so later mutations do not alias', () => {
    const path = [0, 1]
    const merged = coalescePatches([{ path, x: 1 }, { path, y: 2 }])
    path.push(9)
    expect(merged).toEqual([{ path: [0, 1], x: 1, y: 2 }])
  })

  it('ignores explicit undefined fields (they do not clear prior writes)', () => {
    const merged = coalescePatches([
      { path: [0], x: 10, y: 20 },
      { path: [0], x: undefined as unknown as number, width: 5 },
    ])
    expect(merged).toEqual([{ path: [0], x: 10, y: 20, width: 5 }])
  })

  it('coalesces burst updates to the root path (empty path segment)', () => {
    const merged = coalescePatches([
      { path: [], x: 1 },
      { path: [], y: 2 },
      { path: [], height: 99 },
    ])
    expect(merged).toEqual([{ path: [], x: 1, y: 2, height: 99 }])
  })

  it('treats numeric zero as a real field value (last write wins; not "unset")', () => {
    expect(coalescePatches([{ path: [0], x: 10 }, { path: [0], x: 0 }])).toEqual([{ path: [0], x: 0 }])
    expect(
      coalescePatches([
        { path: [1], width: 100, height: 50 },
        { path: [1], width: 0, height: 0 },
      ]),
    ).toEqual([{ path: [1], width: 0, height: 0 }])
  })
})
