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

  it('returns no patches when prev and next are the same layout reference (shared immutable subtree)', () => {
    const layout = makeBaseLayout()
    expect(diffLayout(layout, layout)).toEqual([])
  })

  it('skips walking a child subtree when both sides reuse the same child reference', () => {
    const shared: TestLayout = { x: 0, y: 0, width: 50, height: 20, children: [] }
    const prev: TestLayout = { x: 0, y: 0, width: 100, height: 100, children: [shared] }
    const next: TestLayout = { x: 5, y: 0, width: 100, height: 100, children: [shared] }
    expect(diffLayout(prev, next)).toEqual([{ path: [], x: 5 }])
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

  it('diffs root-only layouts (empty children) in one patch at path []', () => {
    const prev: TestLayout = { x: 0, y: 0, width: 100, height: 50, children: [] }
    const next: TestLayout = { x: 1, y: 2, width: 100, height: 60, children: [] }
    expect(diffLayout(prev, next)).toEqual([{ path: [], x: 1, y: 2, height: 60 }])
  })

  it('returns no patches for identical root-only layouts', () => {
    const leaf: TestLayout = { x: 10, y: 20, width: 200, height: 40, children: [] }
    expect(diffLayout(leaf, { ...leaf })).toEqual([])
  })

  it('diffs a single-child subtree whose leaves have empty children', () => {
    const prev: TestLayout = {
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      children: [{ x: 5, y: 5, width: 90, height: 30, children: [] }],
    }
    const next: TestLayout = {
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      children: [{ x: 5, y: 8, width: 91, height: 30, children: [] }],
    }
    expect(diffLayout(prev, next)).toEqual([
      { path: [0], y: 8, width: 91 },
    ])
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

  it('rejects boxed number peer versions (typeof object; no coercion)', () => {
    expect(isProtocolCompatible(Object(1) as unknown as number, 1)).toBe(false)
    expect(isProtocolCompatible(Object(0) as unknown as number, 1)).toBe(false)
  })

  it('treats NaN currentVersion as incompatible with any defined peer (<= is always false)', () => {
    expect(isProtocolCompatible(0, Number.NaN)).toBe(false)
    expect(isProtocolCompatible(1, Number.NaN)).toBe(false)
    // Legacy undefined peer still short-circuits before the numeric compare
    expect(isProtocolCompatible(undefined, Number.NaN)).toBe(true)
  })

  it('uses raw <= ordering for infinite currentVersion (finite peers pass against +Infinity, fail against -Infinity)', () => {
    expect(isProtocolCompatible(0, Number.POSITIVE_INFINITY)).toBe(true)
    expect(isProtocolCompatible(1, Number.POSITIVE_INFINITY)).toBe(true)
    expect(isProtocolCompatible(0, Number.NEGATIVE_INFINITY)).toBe(false)
    expect(isProtocolCompatible(1, Number.NEGATIVE_INFINITY)).toBe(false)
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

  it('merges interleaved updates to the same path without reordering relative to other paths', () => {
    const merged = coalescePatches([
      { path: [0], x: 1 },
      { path: [1], y: 2 },
      { path: [0], width: 3 },
    ])
    expect(merged).toEqual([
      { path: [0], x: 1, width: 3 },
      { path: [1], y: 2 },
    ])
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

  it('ignores non-finite and non-number geometry fields so corrupt tail patches cannot clobber good coords', () => {
    expect(
      coalescePatches([
        { path: [0], x: 10, y: 1 },
        { path: [0], x: Number.NaN, y: Number.POSITIVE_INFINITY, width: 3 },
        { path: [0], x: null as unknown as number, y: null as unknown as number },
      ]),
    ).toEqual([{ path: [0], x: 10, y: 1, width: 3 }])

    expect(
      coalescePatches([
        { path: [1], x: Number.NaN },
        { path: [1], x: 7 },
      ]),
    ).toEqual([{ path: [1], x: 7 }])
  })

  it('ignores boxed Number and bigint geometry fields (only finite primitive numbers merge)', () => {
    expect(
      coalescePatches([
        { path: [0], x: 10, y: 1 },
        {
          path: [0],
          x: Object(20) as unknown as number,
          y: Object(30) as unknown as number,
          width: 5n as unknown as number,
          height: Object(40) as unknown as number,
        },
      ]),
    ).toEqual([{ path: [0], x: 10, y: 1 }])

    expect(
      coalescePatches([
        { path: [1], x: Object(1) as unknown as number },
        { path: [1], x: 2 },
      ]),
    ).toEqual([{ path: [1], x: 2 }])
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

  it('keeps path keys unambiguous: [12,3] vs [1,23] do not collide when stringified with dots', () => {
    const merged = coalescePatches([
      { path: [12, 3], x: 1 },
      { path: [1, 23], y: 2 },
    ])
    expect(merged).toEqual([
      { path: [12, 3], x: 1 },
      { path: [1, 23], y: 2 },
    ])
  })

  it('does not alias a dense path to a sparse path (join emits empty segments for holes)', () => {
    // Malformed / hand-built patches only: diffLayout always builds dense paths.
    const dense = [1, 2, 3]
    const sparse: number[] = []
    sparse[0] = 1
    sparse[2] = 3
    expect(sparse.length).toBe(3)
    expect(1 in sparse).toBe(false)
    expect(dense.join('.')).toBe('1.2.3')
    expect(sparse.join('.')).toBe('1..3')

    const merged = coalescePatches([
      { path: dense, x: 1 },
      { path: sparse, y: 2 },
    ])
    // First insert clones with [...path]; iterator turns the hole into an explicit `undefined` slot.
    expect(merged).toEqual([
      { path: [1, 2, 3], x: 1 },
      { path: [1, undefined, 3], y: 2 },
    ])
  })

  it('accepts a path-only first patch; later entries add fields (hand-built / burst edge)', () => {
    expect(coalescePatches([{ path: [0, 1] }, { path: [0, 1], x: 3, y: 4 }])).toEqual([
      { path: [0, 1], x: 3, y: 4 },
    ])
  })

  it('path-only follow-up does not clear prior coalesced fields', () => {
    expect(coalescePatches([{ path: [0], x: 1, height: 9 }, { path: [0] }])).toEqual([
      { path: [0], x: 1, height: 9 },
    ])
  })

  it('skips null/undefined entries and patches without an array path (hand-built / corrupt streams)', () => {
    expect(
      coalescePatches([
        null as unknown as LayoutPatch,
        undefined as unknown as LayoutPatch,
        { path: null as unknown as number[], x: 1 },
        { path: undefined as unknown as number[], y: 2 },
        { path: '0' as unknown as number[], width: 9 },
        { path: [1], height: 3 },
      ]),
    ).toEqual([{ path: [1], height: 3 }])
  })

  it('skips corrupt entries without throwing so valid patches in the same batch still coalesce', () => {
    expect(() =>
      coalescePatches([
        { path: [0], x: 1 },
        { path: Object.create(null) as unknown as number[] },
        { path: [0], y: 2 },
      ]),
    ).not.toThrow()
    expect(
      coalescePatches([
        { path: [0], x: 1 },
        { path: Object.create(null) as unknown as number[] },
        { path: [0], y: 2 },
      ]),
    ).toEqual([{ path: [0], x: 1, y: 2 }])
  })
})
