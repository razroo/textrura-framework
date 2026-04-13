import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Pretext measures via OffscreenCanvas in Node (see @chenglou/pretext getMeasureContext).
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

import { init, destroy, computeLayout, isTextNode, clearCache } from '../index.js'
import type { BoxNode, LayoutNode, TextNode } from '../index.js'

beforeAll(async () => {
  await init()
})

afterAll(() => {
  destroy()
})

describe('isTextNode', () => {
  it('is true only when `text` is present and a string', () => {
    const leaf: TextNode = {
      text: 'hi',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 40,
      height: 20,
    }
    expect(isTextNode(leaf)).toBe(true)
    expect(isTextNode({ ...leaf, text: '' })).toBe(true)
  })

  it('is false for box nodes and nodes without string text', () => {
    const boxNode: BoxNode = { width: 10, height: 10, children: [] }
    expect(isTextNode(boxNode as LayoutNode)).toBe(false)

    expect(
      isTextNode({
        text: 1,
        font: '16px sans-serif',
        lineHeight: 20,
        width: 40,
        height: 20,
      } as unknown as LayoutNode),
    ).toBe(false)

    expect(
      isTextNode({
        text: null,
        font: '16px sans-serif',
        lineHeight: 20,
        width: 40,
        height: 20,
      } as unknown as LayoutNode),
    ).toBe(false)

    expect(
      isTextNode({
        text: undefined,
        font: '16px sans-serif',
        lineHeight: 20,
        width: 40,
        height: 20,
      } as unknown as LayoutNode),
    ).toBe(false)

    expect(
      isTextNode({
        text: Object('hi') as unknown as string,
        font: '16px sans-serif',
        lineHeight: 20,
        width: 40,
        height: 20,
      } as unknown as LayoutNode),
    ).toBe(false)
  })

  it('uses `in` semantics so inherited `text` counts (documents engine guard behavior)', () => {
    const proto = { text: 'from-proto' }
    const node = Object.create(proto) as LayoutNode
    Object.assign(node, {
      font: '16px sans-serif',
      lineHeight: 20,
      width: 40,
      height: 20,
    })
    expect(isTextNode(node)).toBe(true)
  })

  it('is false for boxed String primitives (typeof is object; must not match string text leaves)', () => {
    expect(
      isTextNode({
        text: Object('hi') as unknown as string,
        font: '16px sans-serif',
        lineHeight: 20,
        width: 40,
        height: 20,
      } as unknown as LayoutNode),
    ).toBe(false)
  })
})

describe('clearCache', () => {
  it('is callable after init without throwing', () => {
    expect(() => clearCache()).not.toThrow()
  })

  it('does not break subsequent computeLayout (Pretext measurement cache reset)', () => {
    const first = computeLayout({ width: 40, height: 20 })
    expect(first.width).toBe(40)
    clearCache()
    const second = computeLayout({ width: 40, height: 20 })
    expect(second.width).toBe(40)
  })
})

describe('box layout', () => {
  it('single box with fixed dimensions', () => {
    const result = computeLayout({ width: 200, height: 100 })
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.width).toBe(200)
    expect(result.height).toBe(100)
    expect(result.children).toEqual([])
  })

  it('nested box with omitted children matches explicit empty children (leaf box parity)', () => {
    const explicit: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'row',
      children: [{ width: 100, height: 80, children: [] }],
    }
    const omitted: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'row',
      children: [{ width: 100, height: 80 }],
    }
    expect(computeLayout(omitted)).toEqual(computeLayout(explicit))
  })

  it('column layout with two fixed children', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'column',
      children: [
        { width: 300, height: 50 },
        { width: 300, height: 70 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.width).toBe(300)
    expect(result.height).toBe(120)
    expect(result.children.length).toBe(2)
    expect(result.children[0]!.y).toBe(0)
    expect(result.children[0]!.height).toBe(50)
    expect(result.children[1]!.y).toBe(50)
    expect(result.children[1]!.height).toBe(70)
  })

  it('sparse children: null and undefined slots do not throw; placeholders keep indices aligned', () => {
    const dense: BoxNode = {
      width: 200,
      flexDirection: 'row',
      height: 80,
      children: [{ width: 60, height: 40 }],
    }
    const sparseLeading = {
      width: 200,
      flexDirection: 'row',
      height: 80,
      children: [undefined, { width: 60, height: 40 }],
    } as unknown as BoxNode
    const sparseNull = {
      width: 200,
      flexDirection: 'row',
      height: 80,
      children: [null, { width: 60, height: 40 }],
    } as unknown as BoxNode

    const denseResult = computeLayout(dense, { width: 200, height: 80 })
    const leading = computeLayout(sparseLeading, { width: 200, height: 80 })
    const nullSlot = computeLayout(sparseNull, { width: 200, height: 80 })

    expect(leading.children).toHaveLength(2)
    expect(nullSlot.children).toHaveLength(2)
    expect(leading.children[0]!.width).toBe(0)
    expect(leading.children[0]!.height).toBe(0)
    expect(nullSlot.children[0]!.width).toBe(0)
    expect(nullSlot.children[0]!.height).toBe(0)

    expect(leading.children[1]).toEqual(denseResult.children[0])
    expect(nullSlot.children[1]).toEqual(denseResult.children[0])
  })

  it('sparse children: middle hole does not shift following sibling in a column', () => {
    const dense: BoxNode = {
      width: 100,
      flexDirection: 'column',
      children: [{ width: 100, height: 30 }, { width: 100, height: 40 }],
    }
    const sparse: BoxNode = {
      width: 100,
      flexDirection: 'column',
      children: [{ width: 100, height: 30 }, undefined, { width: 100, height: 40 }],
    } as unknown as BoxNode

    const denseResult = computeLayout(dense, { width: 100 })
    const sparseResult = computeLayout(sparse, { width: 100 })

    expect(sparseResult.children).toHaveLength(3)
    expect(sparseResult.children[0]).toEqual(denseResult.children[0])
    expect(sparseResult.children[1]!.width).toBe(0)
    expect(sparseResult.children[1]!.height).toBe(0)
    expect(sparseResult.children[2]).toEqual(denseResult.children[1])
  })

  it('sparse children: middle hole in rtl row keeps surviving siblings aligned with dense rtl row (stable indices)', () => {
    const dense: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'row',
      dir: 'rtl',
      children: [
        { width: 50, height: 40 },
        { width: 50, height: 40 },
      ],
    }
    const sparse: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'row',
      dir: 'rtl',
      children: [{ width: 50, height: 40 }, null, { width: 50, height: 40 }],
    } as unknown as BoxNode

    const opts = { width: 200, height: 80, direction: 'ltr' as const }
    const denseResult = computeLayout(dense, opts)
    const sparseResult = computeLayout(sparse, opts)

    expect(sparseResult.children).toHaveLength(3)
    expect(sparseResult.children[0]!.x).toBe(denseResult.children[0]!.x)
    expect(sparseResult.children[0]!.y).toBe(denseResult.children[0]!.y)
    expect(sparseResult.children[2]!.x).toBe(denseResult.children[1]!.x)
    expect(sparseResult.children[2]!.y).toBe(denseResult.children[1]!.y)
    expect(sparseResult.children[1]!.width).toBe(0)
    expect(sparseResult.children[1]!.height).toBe(0)
  })

  it('applies aspectRatio as width/height when width is definite (Yoga setAspectRatio)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 200,
      flexDirection: 'column',
      alignItems: 'flex-start',
      children: [{ width: 100, aspectRatio: 2 }],
    }
    const result = computeLayout(tree)
    const child = result.children[0]!
    expect(child.width).toBe(100)
    expect(child.height).toBe(50)
  })

  it('applies aspectRatio as width/height when height is definite', () => {
    const tree: BoxNode = {
      width: 200,
      height: 200,
      flexDirection: 'column',
      alignItems: 'flex-start',
      children: [{ height: 50, aspectRatio: 2 }],
    }
    const result = computeLayout(tree)
    const child = result.children[0]!
    expect(child.width).toBe(100)
    expect(child.height).toBe(50)
  })

  it('nested row with dir rtl mirrors flex child order under ltr owner direction', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'rtl',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    const row = result.children[0]!
    expect(row.children[0]!.x).toBeGreaterThan(row.children[1]!.x)
  })

  it('nested row: per-node dir uses strict primitive rtl/ltr (boxed strings inherit; same as owner direction rule)', () => {
    const baseRow = {
      width: 200,
      height: 40,
      flexDirection: 'row' as const,
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const column = {
      width: 200,
      height: 80,
      flexDirection: 'column' as const,
      children: [baseRow],
    }
    const opts = { width: 200, height: 80, direction: 'ltr' as const }
    const omitted = computeLayout(column, opts)
    const boxedRtl = computeLayout(
      { ...column, children: [{ ...baseRow, dir: Object('rtl') as never }] },
      opts,
    )
    const boxedLtr = computeLayout(
      { ...column, children: [{ ...baseRow, dir: Object('ltr') as never }] },
      opts,
    )
    const rowO = omitted.children[0]!
    expect(boxedRtl.children[0]!.children[0]!.x).toBe(rowO.children[0]!.x)
    expect(boxedRtl.children[0]!.children[1]!.x).toBe(rowO.children[1]!.x)
    expect(boxedLtr.children[0]!.children[0]!.x).toBe(rowO.children[0]!.x)
    expect(boxedLtr.children[0]!.children[1]!.x).toBe(rowO.children[1]!.x)
    const primitiveRtl = computeLayout(
      { ...column, children: [{ ...baseRow, dir: 'rtl' }] },
      opts,
    )
    expect(primitiveRtl.children[0]!.children[0]!.x).toBeGreaterThan(
      primitiveRtl.children[0]!.children[1]!.x,
    )
  })

  it('nested row with dir rtl mirrors text-leaf flex order under ltr owner direction', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'rtl',
          children: [
            {
              text: 'a',
              font: '16px sans-serif',
              lineHeight: 20,
              width: 50,
              height: 30,
            },
            {
              text: 'bbbb',
              font: '16px sans-serif',
              lineHeight: 20,
              width: 50,
              height: 30,
            },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    const row = result.children[0]!
    expect(row.children[0]!.x).toBeGreaterThan(row.children[1]!.x)
    expect(row.children[0]!.text).toBe('a')
    expect(row.children[1]!.text).toBe('bbbb')
  })

  it('owner direction rtl mirrors top-level flex row when nodes omit dir (document / root context)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    expect(result.children[0]!.x).toBeGreaterThan(result.children[1]!.x)
  })

  it('owner direction rtl mirrors nested flex row when inner nodes omit dir (inherit document context)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
        },
      ],
    }
    const ltr = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    const rtl = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    const rowL = ltr.children[0]!
    const rowR = rtl.children[0]!
    expect(rowL.children[0]!.x).toBeLessThan(rowL.children[1]!.x)
    expect(rowR.children[0]!.x).toBeGreaterThan(rowR.children[1]!.x)
  })

  it('nested row with explicit dir ltr stays left-to-right under rtl owner direction (per-node override)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'ltr',
          children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    const row = result.children[0]!
    expect(row.children[0]!.x).toBeLessThan(row.children[1]!.x)
  })

  it('owner direction rtl does not invert top-level column main-axis stacking (y order matches ltr)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 200,
      flexDirection: 'column',
      children: [
        { width: 200, height: 30 },
        { width: 200, height: 40 },
      ],
    }
    const ltr = computeLayout(tree, { width: 200, height: 200, direction: 'ltr' })
    const rtl = computeLayout(tree, { width: 200, height: 200, direction: 'rtl' })
    expect(rtl.children[0]!.y).toBe(ltr.children[0]!.y)
    expect(rtl.children[1]!.y).toBe(ltr.children[1]!.y)
    expect(rtl.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(rtl.children[1]!.x).toBe(ltr.children[1]!.x)
  })

  it('malformed owner direction at runtime falls back to LTR (only exact "rtl" mirrors the row)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const ltr = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    const rtl = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    const trimmed = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: 'rtl ' as never,
    })
    const ltrTrimmed = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: 'ltr ' as never,
    })
    const upper = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: 'RTL' as never,
    })
    // Per-node `dir: 'auto'` is valid; owner `ComputeOptions.direction` is only ltr|rtl — stray `'auto'`
    // at the document level (bad cast / confused API) must fall back like other malformed strings.
    const autoOwner = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: 'auto' as never,
    })
    const emptyStrOwner = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: '' as never,
    })
    // Owner direction is only primitive `'rtl'` / `'ltr'` (engine uses `=== 'rtl'`); boxed strings
    // match createApp / resolveComputeLayoutDirection strict checks and must not mirror the row.
    const boxedRtl = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: Object('rtl') as never,
    })
    const boxedLtr = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: Object('ltr') as never,
    })
    // Non-string owner direction (bad casts / exotic deserialization) must not flip to RTL.
    const symOwner = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: Symbol('dir') as never,
    })
    const numOwner = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: 0 as never,
    })
    const nullOwner = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: null as never,
    })
    expect(rtl.children[0]!.x).toBeGreaterThan(rtl.children[1]!.x)
    expect(trimmed.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(trimmed.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(ltrTrimmed.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(ltrTrimmed.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(upper.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(upper.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(autoOwner.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(autoOwner.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(emptyStrOwner.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(emptyStrOwner.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(boxedRtl.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(boxedRtl.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(boxedLtr.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(boxedLtr.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(symOwner.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(symOwner.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(numOwner.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(numOwner.children[1]!.x).toBe(ltr.children[1]!.x)
    expect(nullOwner.children[0]!.x).toBe(ltr.children[0]!.x)
    expect(nullOwner.children[1]!.x).toBe(ltr.children[1]!.x)
  })

  it('text leaf accepts per-node dir for Yoga direction (ltr / rtl / auto / malformed) without throwing', () => {
    const base: TextNode = {
      text: 'hello',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 200,
      height: 40,
    }
    const variants: LayoutNode[] = [
      { ...base },
      { ...base, dir: 'ltr' },
      { ...base, dir: 'rtl' },
      { ...base, dir: 'auto' },
      { ...base, dir: 'bogus' },
      { ...base, dir: null },
    ]
    for (const tree of variants) {
      const r = computeLayout(tree, { width: 220, height: 60 })
      expect(r.text).toBe('hello')
      expect(r.children).toEqual([])
      expect(Number.isFinite(r.width) && r.width >= 0).toBe(true)
      expect(Number.isFinite(r.height) && r.height >= 0).toBe(true)
      expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true)
    }
  })

  it('malformed flex enum strings skip Yoga setters (own-key guard; no prototype keys like toString)', () => {
    const base: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const good = computeLayout(base, { width: 200, height: 80 })
    const trimmedRow = computeLayout(
      { ...base, flexDirection: 'row ' as never },
      { width: 200, height: 80 },
    )
    expect(trimmedRow.children[0]!.x).toBe(good.children[0]!.x)
    expect(trimmedRow.children[1]!.x).toBe(good.children[1]!.x)
    const bogusWrap = computeLayout(
      { ...base, flexWrap: 'wrap ' as never },
      { width: 200, height: 80 },
    )
    expect(bogusWrap.children[0]!.x).toBe(good.children[0]!.x)
    const bogusJustify = computeLayout(
      { ...base, justifyContent: 'center ' as never },
      { width: 200, height: 80 },
    )
    expect(bogusJustify.children[0]!.x).toBe(good.children[0]!.x)
    const bogusAlign = computeLayout(
      { ...base, alignItems: 'flex-end ' as never },
      { width: 200, height: 80 },
    )
    expect(bogusAlign.children[0]!.y).toBe(good.children[0]!.y)
    const bogusAlignContent = computeLayout(
      {
        width: 200,
        height: 80,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'space-between ' as never,
        children: [
          { width: 80, height: 20 },
          { width: 80, height: 20 },
        ],
      },
      { width: 200, height: 80 },
    )
    const alignContentRef = computeLayout(
      {
        width: 200,
        height: 80,
        flexDirection: 'row',
        flexWrap: 'wrap',
        children: [
          { width: 80, height: 20 },
          { width: 80, height: 20 },
        ],
      },
      { width: 200, height: 80 },
    )
    expect(bogusAlignContent.children[0]!.y).toBe(alignContentRef.children[0]!.y)
    const protoKey = computeLayout(
      { ...base, flexDirection: 'toString' as never },
      { width: 200, height: 80 },
    )
    expect(protoKey.children[0]!.x).toBe(good.children[0]!.x)
    const bogusOverflow = computeLayout(
      {
        width: 100,
        height: 50,
        overflow: 'hidden ' as never,
        children: [{ width: 200, height: 20 }],
      },
      { width: 100, height: 80 },
    )
    const overflowRef = computeLayout(
      {
        width: 100,
        height: 50,
        children: [{ width: 200, height: 20 }],
      },
      { width: 100, height: 80 },
    )
    expect(bogusOverflow.height).toBe(overflowRef.height)
    const bogusAlignSelf = computeLayout(
      {
        width: 200,
        height: 40,
        flexDirection: 'row',
        children: [
          { width: 50, height: 30, alignSelf: 'flex-start ' as never },
          { width: 50, height: 30 },
        ],
      },
      { width: 200, height: 80 },
    )
    const alignSelfRef = computeLayout(
      {
        width: 200,
        height: 40,
        flexDirection: 'row',
        children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
      },
      { width: 200, height: 80 },
    )
    expect(bogusAlignSelf.children[0]!.y).toBe(alignSelfRef.children[0]!.y)
  })

  it('explicit undefined owner direction in options matches omitted direction (LTR flex row)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const omitted = computeLayout(tree, { width: 200, height: 80 })
    const explicitUndefined = computeLayout(tree, {
      width: 200,
      height: 80,
      direction: undefined,
    })
    expect(explicitUndefined.children[0]!.x).toBe(omitted.children[0]!.x)
    expect(explicitUndefined.children[1]!.x).toBe(omitted.children[1]!.x)
    expect(explicitUndefined.children[0]!.x).toBeLessThan(explicitUndefined.children[1]!.x)
  })

  it('explicit ltr owner direction matches omitted owner direction (default Yoga owner is LTR)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const omitted = computeLayout(tree, { width: 200, height: 80 })
    const explicitLtr = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    expect(explicitLtr).toEqual(omitted)
  })

  it('explicit ltr owner direction matches omitted owner direction for column flex (default Yoga owner is LTR)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 120,
      flexDirection: 'column',
      gap: 8,
      children: [
        { width: 100, height: 36 },
        { width: 100, height: 36 },
      ],
    }
    const omitted = computeLayout(tree, { width: 200, height: 120 })
    const explicitLtr = computeLayout(tree, { width: 200, height: 120, direction: 'ltr' })
    expect(explicitLtr).toEqual(omitted)
  })

  it('owner direction rtl with only ComputeOptions.direction (no width/height) matches explicit owner extents', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const withExtents = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    const directionOnly = computeLayout(tree, { direction: 'rtl' })
    expect(directionOnly).toEqual(withExtents)
  })

  it('non-finite ComputeOptions width/height are ignored per-axis like undefined (host constraint hardening)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const omitWidth = computeLayout(tree, { height: 80 })
    expect(computeLayout(tree, { width: Number.NaN, height: 80 })).toEqual(omitWidth)
    expect(computeLayout(tree, { width: Number.POSITIVE_INFINITY, height: 80 })).toEqual(omitWidth)
    expect(computeLayout(tree, { width: Number.NEGATIVE_INFINITY, height: 80 })).toEqual(omitWidth)
    expect(computeLayout(tree, { width: '200' as unknown as number, height: 80 })).toEqual(omitWidth)
    expect(computeLayout(tree, { width: 99n as unknown as number, height: 80 })).toEqual(omitWidth)
    expect(computeLayout(tree, { width: Object(200) as unknown as number, height: 80 })).toEqual(omitWidth)

    const omitHeight = computeLayout(tree, { width: 200 })
    expect(computeLayout(tree, { width: 200, height: Number.NaN })).toEqual(omitHeight)
    expect(computeLayout(tree, { width: 200, height: Number.POSITIVE_INFINITY })).toEqual(omitHeight)
    expect(computeLayout(tree, { width: 200, height: Object(80) as unknown as number })).toEqual(omitHeight)

    const omitBoth = computeLayout(tree, {})
    expect(
      computeLayout(tree, {
        width: Number.NaN,
        height: Number.NaN,
      }),
    ).toEqual(omitBoth)
  })

  it('negative ComputeOptions width/height are ignored per-axis like undefined (parity with Geometra root extents)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const omitWidth = computeLayout(tree, { height: 80 })
    expect(computeLayout(tree, { width: -1, height: 80 })).toEqual(omitWidth)
    expect(computeLayout(tree, { width: Number.MIN_VALUE * -1, height: 80 })).toEqual(omitWidth)

    const omitHeight = computeLayout(tree, { width: 200 })
    expect(computeLayout(tree, { width: 200, height: -50 })).toEqual(omitHeight)

    const widthZero = computeLayout(tree, { width: 0, height: 80 })
    expect(computeLayout(tree, { width: -0, height: 80 })).toEqual(widthZero)
  })

  it('root dir rtl on the tree node mirrors a top-level row even when ComputeOptions.direction is ltr', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      dir: 'rtl',
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    expect(result.children[0]!.x).toBeGreaterThan(result.children[1]!.x)
  })

  it('root dir ltr on the tree node keeps ltr flex order even when ComputeOptions.direction is rtl', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      dir: 'ltr',
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    expect(result.children[0]!.x).toBeLessThan(result.children[1]!.x)
  })

  it('root dir auto inherits ComputeOptions.direction for a top-level row (same geometry as omitting dir)', () => {
    const base: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const omittedRtl = computeLayout(base, { width: 200, height: 80, direction: 'rtl' })
    const autoRtl = computeLayout({ ...base, dir: 'auto' }, { width: 200, height: 80, direction: 'rtl' })
    expect(autoRtl.children[0]!.x).toBe(omittedRtl.children[0]!.x)
    expect(autoRtl.children[1]!.x).toBe(omittedRtl.children[1]!.x)
    expect(autoRtl.children[0]!.x).toBeGreaterThan(autoRtl.children[1]!.x)

    const omittedLtr = computeLayout(base, { width: 200, height: 80, direction: 'ltr' })
    const autoLtr = computeLayout({ ...base, dir: 'auto' }, { width: 200, height: 80, direction: 'ltr' })
    expect(autoLtr.children[0]!.x).toBe(omittedLtr.children[0]!.x)
    expect(autoLtr.children[1]!.x).toBe(omittedLtr.children[1]!.x)
    expect(autoLtr.children[0]!.x).toBeLessThan(autoLtr.children[1]!.x)
  })

  it('nested row with dir auto inherits rtl owner direction and mirrors flex children', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'auto',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    const row = result.children[0]!
    expect(row.children[0]!.x).toBeGreaterThan(row.children[1]!.x)
  })

  it('nested row with dir auto under ltr owner keeps ltr flex child order', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'auto',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    const row = result.children[0]!
    expect(row.children[0]!.x).toBeLessThan(row.children[1]!.x)
  })

  it('nested row with dir auto under rtl parent column mirrors flex children even when ComputeOptions.direction is ltr', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      dir: 'rtl',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'auto',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    const row = result.children[0]!
    expect(row.children[0]!.x).toBeGreaterThan(row.children[1]!.x)
  })

  it('dir auto propagates through nested auto column wrappers so a deep row mirrors under rtl document direction', () => {
    const deepRow: BoxNode = {
      width: 200,
      height: 30,
      flexDirection: 'row',
      gap: 10,
      dir: 'auto',
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const tree: BoxNode = {
      width: 200,
      height: 200,
      flexDirection: 'column',
      dir: 'auto',
      children: [
        {
          width: 200,
          height: 120,
          flexDirection: 'column',
          dir: 'auto',
          children: [
            {
              width: 200,
              height: 80,
              flexDirection: 'column',
              dir: 'auto',
              children: [deepRow],
            },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 200, direction: 'rtl' })
    const row = result.children[0]!.children[0]!.children[0]!
    expect(row.children[0]!.x).toBeGreaterThan(row.children[1]!.x)
  })

  it('nested row with explicit dir ltr under rtl owner keeps physical left-to-right main axis (overrides document direction)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'ltr',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    const row = result.children[0]!
    expect(row.children[0]!.x).toBeLessThan(row.children[1]!.x)
  })

  it('nested row with explicit dir rtl under ltr owner mirrors main axis (overrides document direction)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'rtl',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    const row = result.children[0]!
    expect(row.children[0]!.x).toBeGreaterThan(row.children[1]!.x)
  })

  it('nested row with unknown dir inherits owner direction like auto (malformed serialized dir)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'bogus',
          children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
        },
      ],
    }
    const rtl = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
    const rowRtl = rtl.children[0]!
    expect(rowRtl.children[0]!.x).toBeGreaterThan(rowRtl.children[1]!.x)
    const ltr = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
    const rowLtr = ltr.children[0]!
    expect(rowLtr.children[0]!.x).toBeLessThan(rowLtr.children[1]!.x)
  })

  it('nested row with dir null inherits owner direction like auto (JSON null from loose deserialization)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: null,
          children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
        },
      ],
    }
    const bogus: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'bogus',
          children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
        },
      ],
    }
    for (const dir of ['ltr', 'rtl'] as const) {
      const nullRow = computeLayout(tree, { width: 200, height: 80, direction: dir }).children[0]!
      const bogusRow = computeLayout(bogus, { width: 200, height: 80, direction: dir }).children[0]!
      expect(nullRow.children[0]!.x).toBe(bogusRow.children[0]!.x)
      expect(nullRow.children[1]!.x).toBe(bogusRow.children[1]!.x)
    }
  })

  it('nested row with boxed-string dir inherits owner direction (strict equality; no String object coercion)', () => {
    const bogus: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir: 'bogus',
          children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
        },
      ],
    }
    for (const boxed of [Object('rtl'), Object('ltr')] as const) {
      const tree: BoxNode = {
        width: 200,
        height: 80,
        flexDirection: 'column',
        children: [
          {
            width: 200,
            height: 40,
            flexDirection: 'row',
            gap: 10,
            dir: boxed as never,
            children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
          },
        ],
      }
      for (const dir of ['ltr', 'rtl'] as const) {
        const boxedRow = computeLayout(tree, { width: 200, height: 80, direction: dir }).children[0]!
        const bogusRow = computeLayout(bogus, { width: 200, height: 80, direction: dir }).children[0]!
        expect(boxedRow.children[0]!.x).toBe(bogusRow.children[0]!.x)
        expect(boxedRow.children[1]!.x).toBe(bogusRow.children[1]!.x)
      }
    }
  })

  it('nested row with explicit undefined dir matches omitting dir (engine skips setDirection when props.dir is undefined)', () => {
    const baseRow = {
      width: 200,
      height: 40,
      flexDirection: 'row' as const,
      gap: 10,
      children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
    }
    const omitted: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [baseRow],
    }
    const explicitUndefined: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [{ ...baseRow, dir: undefined }],
    }
    for (const dir of ['ltr', 'rtl'] as const) {
      const a = computeLayout(omitted, { width: 200, height: 80, direction: dir }).children[0]!
      const b = computeLayout(explicitUndefined, { width: 200, height: 80, direction: dir }).children[0]!
      expect(b.children[0]!.x).toBe(a.children[0]!.x)
      expect(b.children[1]!.x).toBe(a.children[1]!.x)
    }
  })

  it('nested row with trimmed or cased dir strings inherits owner direction (only exact ltr/rtl are explicit)', () => {
    const makeTree = (dir: string): BoxNode => ({
      width: 200,
      height: 80,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 40,
          flexDirection: 'row',
          gap: 10,
          dir,
          children: [{ width: 50, height: 30 }, { width: 50, height: 30 }],
        },
      ],
    })
    const bogus = makeTree('bogus')
    for (const dir of ['rtl ', 'RTL', 'ltr ']) {
      const tree = makeTree(dir)
      const ltrOwner = computeLayout(tree, { width: 200, height: 80, direction: 'ltr' })
      const rowLtr = ltrOwner.children[0]!
      const bogusLtr = computeLayout(bogus, { width: 200, height: 80, direction: 'ltr' }).children[0]!
      expect(rowLtr.children[0]!.x).toBe(bogusLtr.children[0]!.x)
      expect(rowLtr.children[1]!.x).toBe(bogusLtr.children[1]!.x)
      const rtlOwner = computeLayout(tree, { width: 200, height: 80, direction: 'rtl' })
      const rowRtl = rtlOwner.children[0]!
      const bogusRtl = computeLayout(bogus, { width: 200, height: 80, direction: 'rtl' }).children[0]!
      expect(rowRtl.children[0]!.x).toBe(bogusRtl.children[0]!.x)
      expect(rowRtl.children[1]!.x).toBe(bogusRtl.children[1]!.x)
    }
  })

  it('column with dir rtl aligns flex-start children to the cross-axis start (physical right under ltr owner)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 100,
      flexDirection: 'column',
      alignItems: 'flex-start',
      dir: 'rtl',
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(150)
    expect(result.children[1]!.x).toBe(150)
  })

  it('column with dir ltr keeps flex-start children on the left cross-axis start', () => {
    const tree: BoxNode = {
      width: 200,
      height: 100,
      flexDirection: 'column',
      alignItems: 'flex-start',
      dir: 'ltr',
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[1]!.x).toBe(0)
  })

  it('column-reverse stacks children from the bottom (main axis reversed) while dir rtl keeps cross-axis start on the right', () => {
    const tree: BoxNode = {
      width: 200,
      height: 100,
      flexDirection: 'column-reverse',
      alignItems: 'flex-start',
      dir: 'rtl',
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(150)
    expect(result.children[0]!.y).toBe(70)
    expect(result.children[1]!.x).toBe(150)
    expect(result.children[1]!.y).toBe(40)
  })

  it('column-reverse with dir ltr aligns flex-start children on the left and reverses main-axis order', () => {
    const tree: BoxNode = {
      width: 200,
      height: 100,
      flexDirection: 'column-reverse',
      alignItems: 'flex-start',
      dir: 'ltr',
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[0]!.y).toBe(70)
    expect(result.children[1]!.x).toBe(0)
    expect(result.children[1]!.y).toBe(40)
  })

  it('nested column with dir auto inherits rtl owner direction for cross-axis flex-start (matches explicit dir rtl)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 100,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 100,
          flexDirection: 'column',
          alignItems: 'flex-start',
          dir: 'auto',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 100, direction: 'rtl' })
    const inner = result.children[0]!
    expect(inner.children[0]!.x).toBe(150)
    expect(inner.children[1]!.x).toBe(150)
  })

  it('nested column with dir auto under ltr owner keeps flex-start on the left (matches explicit dir ltr)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 100,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 100,
          flexDirection: 'column',
          alignItems: 'flex-start',
          dir: 'auto',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 100, direction: 'ltr' })
    const inner = result.children[0]!
    expect(inner.children[0]!.x).toBe(0)
    expect(inner.children[1]!.x).toBe(0)
  })

  it('nested column with explicit dir ltr under rtl owner keeps flex-start on the left (overrides document direction)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 100,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 100,
          flexDirection: 'column',
          alignItems: 'flex-start',
          dir: 'ltr',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 100, direction: 'rtl' })
    const inner = result.children[0]!
    expect(inner.children[0]!.x).toBe(0)
    expect(inner.children[1]!.x).toBe(0)
  })

  it('nested column with explicit dir rtl under ltr owner aligns flex-start to the right (overrides document direction)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 100,
      flexDirection: 'column',
      children: [
        {
          width: 200,
          height: 100,
          flexDirection: 'column',
          alignItems: 'flex-start',
          dir: 'rtl',
          children: [
            { width: 50, height: 30 },
            { width: 50, height: 30 },
          ],
        },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 100, direction: 'ltr' })
    const inner = result.children[0]!
    expect(inner.children[0]!.x).toBe(150)
    expect(inner.children[1]!.x).toBe(150)
  })

  it('row with flexWrap wrap and dir rtl mirrors main-axis start on each wrapped line (ltr document owner)', () => {
    const rtlTree: BoxNode = {
      width: 150,
      height: 100,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      dir: 'rtl',
      children: [
        { width: 80, height: 30 },
        { width: 80, height: 30 },
      ],
    }
    const ltrTree: BoxNode = { ...rtlTree, dir: 'ltr' }
    const opts = { width: 150, height: 100, direction: 'ltr' as const }
    const rtl = computeLayout(rtlTree, opts)
    const ltr = computeLayout(ltrTree, opts)
    // 80 + gap + 80 does not fit in 150 — two flex lines
    expect(ltr.children[0]!.y).not.toBe(ltr.children[1]!.y)
    expect(rtl.children[0]!.y).toBe(ltr.children[0]!.y)
    expect(rtl.children[1]!.y).toBe(ltr.children[1]!.y)
    // LTR main-start is physical left; RTL main-start is physical right on every line
    expect(ltr.children[0]!.x).toBe(0)
    expect(ltr.children[1]!.x).toBe(0)
    expect(rtl.children[0]!.x).toBeGreaterThan(ltr.children[0]!.x)
    expect(rtl.children[0]!.x + rtl.children[0]!.width).toBe(150)
    expect(rtl.children[1]!.x).toBe(rtl.children[0]!.x)
  })

  it('column with flexWrap wrap mirrors cross-axis (inline) positions when document owner direction is rtl', () => {
    const tree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'column',
      flexWrap: 'wrap',
      gap: 10,
      children: [
        { width: 50, height: 50 },
        { width: 50, height: 50 },
        { width: 50, height: 50 },
      ],
    }
    const opts = { width: 200, height: 80 } as const
    const ltr = computeLayout(tree, { ...opts, direction: 'ltr' })
    const rtl = computeLayout(tree, { ...opts, direction: 'rtl' })
    expect(ltr.children).toHaveLength(3)
    expect(rtl.children).toHaveLength(3)
    const w = ltr.width
    for (let i = 0; i < 3; i++) {
      const a = ltr.children[i]!
      const b = rtl.children[i]!
      expect(a.y).toBe(b.y)
      expect(a.width).toBe(b.width)
      expect(a.height).toBe(b.height)
      expect(a.x + b.x + a.width).toBe(w)
    }
  })

  it('row with flexWrap wrap-reverse and dir rtl mirrors main-axis x like wrap (cross-axis reversed per line)', () => {
    const rtlTree: BoxNode = {
      width: 150,
      height: 100,
      flexDirection: 'row',
      flexWrap: 'wrap-reverse',
      gap: 10,
      dir: 'rtl',
      children: [
        { width: 80, height: 30 },
        { width: 80, height: 30 },
      ],
    }
    const ltrTree: BoxNode = { ...rtlTree, dir: 'ltr' }
    const opts = { width: 150, height: 100, direction: 'ltr' as const }
    const rtlRev = computeLayout(rtlTree, opts)
    const ltrRev = computeLayout(ltrTree, opts)
    const rtlPlainWrap = computeLayout({ ...rtlTree, flexWrap: 'wrap' }, opts)
    const ltrPlainWrap = computeLayout({ ...ltrTree, flexWrap: 'wrap' }, opts)

    expect(ltrRev.children[0]!.y).not.toBe(ltrRev.children[1]!.y)
    expect(rtlRev.children[0]!.y).toBe(ltrRev.children[0]!.y)
    expect(rtlRev.children[1]!.y).toBe(ltrRev.children[1]!.y)

    // wrap-reverse stacks flex lines on the opposite cross side vs wrap
    expect(ltrRev.children[0]!.y).not.toBe(ltrPlainWrap.children[0]!.y)

    // RTL main-start is physical right on every line; x matches plain wrap for the same dir
    expect(rtlRev.children[0]!.x).toBe(rtlPlainWrap.children[0]!.x)
    expect(rtlRev.children[1]!.x).toBe(rtlPlainWrap.children[1]!.x)
    expect(ltrRev.children[0]!.x).toBe(ltrPlainWrap.children[0]!.x)
    expect(ltrRev.children[1]!.x).toBe(ltrPlainWrap.children[1]!.x)
    expect(rtlRev.children[0]!.x + rtlRev.children[0]!.width).toBe(150)
  })

  it('row-reverse swaps main-axis order relative to row under ltr document owner', () => {
    const rowTree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'row',
      gap: 10,
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const revTree: BoxNode = { ...rowTree, flexDirection: 'row-reverse' }
    const opts = { width: 200, height: 80, direction: 'ltr' as const }
    const row = computeLayout(rowTree, opts)
    const rev = computeLayout(revTree, opts)
    expect(row.children[0]!.x).toBe(0)
    expect(row.children[1]!.x).toBe(60)
    expect(rev.children[0]!.x).toBe(150)
    expect(rev.children[1]!.x).toBe(90)
    expect(rev.children[0]!.x).toBeGreaterThan(rev.children[1]!.x)
  })

  it('row-reverse under rtl document owner matches row under ltr owner (main-start parity)', () => {
    const rowTree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'row',
      gap: 10,
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const revTree: BoxNode = { ...rowTree, flexDirection: 'row-reverse' }
    const ltrDocRow = computeLayout(rowTree, { width: 200, height: 80, direction: 'ltr' })
    const rtlDocRev = computeLayout(revTree, { width: 200, height: 80, direction: 'rtl' })
    expect(rtlDocRev.children[0]!.x).toBe(ltrDocRow.children[0]!.x)
    expect(rtlDocRev.children[1]!.x).toBe(ltrDocRow.children[1]!.x)
  })

  it('row-reverse with dir rtl under ltr owner matches row child positions (inline axis mirrors flex-start)', () => {
    const rowTree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'row',
      gap: 10,
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const revRtl: BoxNode = { ...rowTree, flexDirection: 'row-reverse', dir: 'rtl' }
    const opts = { width: 200, height: 80, direction: 'ltr' as const }
    const row = computeLayout(rowTree, opts)
    const rev = computeLayout(revRtl, opts)
    expect(rev.children[0]!.x).toBe(row.children[0]!.x)
    expect(rev.children[1]!.x).toBe(row.children[1]!.x)
  })

  it('row-reverse with dir ltr under rtl owner matches row under rtl document owner', () => {
    const rowTree: BoxNode = {
      width: 200,
      height: 80,
      flexDirection: 'row',
      gap: 10,
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const revLtr: BoxNode = { ...rowTree, flexDirection: 'row-reverse', dir: 'ltr' }
    const opts = { width: 200, height: 80, direction: 'rtl' as const }
    const row = computeLayout(rowTree, opts)
    const rev = computeLayout(revLtr, opts)
    expect(rev.children[0]!.x).toBe(row.children[0]!.x)
    expect(rev.children[1]!.x).toBe(row.children[1]!.x)
  })

  it('row layout with gap', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      gap: 10,
      children: [
        { width: 100, height: 50 },
        { width: 100, height: 50 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[1]!.x).toBe(110)
  })

  it('row layout with gap under rtl owner direction mirrors main axis and keeps gap between items', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      gap: 10,
      children: [
        { width: 100, height: 50 },
        { width: 100, height: 50 },
      ],
    }
    const ltr = computeLayout(tree, { width: 300, height: 80, direction: 'ltr' })
    const rtl = computeLayout(tree, { width: 300, height: 80, direction: 'rtl' })
    expect(ltr.children[0]!.x).toBe(0)
    expect(ltr.children[1]!.x).toBe(110)
    // Main-start is the physical right edge: first flex line item sits at x = 300 − 100.
    expect(rtl.children[0]!.x).toBe(200)
    expect(rtl.children[1]!.x).toBe(90)
    const gapBetween =
      rtl.children[0]!.x - (rtl.children[1]!.x + rtl.children[1]!.width)
    expect(gapBetween).toBe(10)
  })

  it('column layout with gap under rtl owner direction preserves vertical stack and gap (main axis not mirrored)', () => {
    const tree: BoxNode = {
      width: 200,
      flexDirection: 'column',
      gap: 10,
      children: [
        { width: 100, height: 40 },
        { width: 100, height: 40 },
      ],
    }
    const ltr = computeLayout(tree, { width: 200, height: 200, direction: 'ltr' })
    const rtl = computeLayout(tree, { width: 200, height: 200, direction: 'rtl' })
    expect(ltr.children[0]!.y).toBe(rtl.children[0]!.y)
    expect(ltr.children[1]!.y).toBe(rtl.children[1]!.y)
    const gapLtr = ltr.children[1]!.y - (ltr.children[0]!.y + ltr.children[0]!.height)
    expect(gapLtr).toBe(10)
    const gapRtl = rtl.children[1]!.y - (rtl.children[0]!.y + rtl.children[0]!.height)
    expect(gapRtl).toBe(10)
  })

  it('padding affects child position', () => {
    const tree: BoxNode = {
      width: 300,
      padding: 20,
      children: [{ width: 100, height: 50 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(20)
    expect(result.children[0]!.y).toBe(20)
    expect(result.height).toBe(90)
  })

  it('uniform border offsets child position and expands auto height (Yoga inner content box)', () => {
    const tree: BoxNode = {
      width: 300,
      border: 12,
      children: [{ width: 100, height: 50 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(12)
    expect(result.children[0]!.y).toBe(12)
    expect(result.height).toBe(74)
  })

  it('per-edge borders offset child from the inner corner and expand auto height', () => {
    const tree: BoxNode = {
      width: 300,
      borderLeft: 7,
      borderTop: 9,
      borderRight: 3,
      borderBottom: 5,
      children: [{ width: 100, height: 50 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(7)
    expect(result.children[0]!.y).toBe(9)
    expect(result.height).toBe(64)
  })

  it('row gap is measured from border-inset main-start (uniform border)', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      gap: 10,
      border: 10,
      children: [
        { width: 50, height: 30 },
        { width: 50, height: 30 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(10)
    expect(result.children[1]!.x).toBe(70)
  })

  it('overflow scroll, hidden, visible: fixed-height column keeps parent height; flexShrink 0 child keeps full height', () => {
    for (const overflow of ['scroll', 'hidden', 'visible'] as const) {
      const tree: BoxNode = {
        width: 100,
        height: 80,
        flexDirection: 'column',
        overflow,
        children: [{ width: 100, height: 200, flexShrink: 0 }],
      }
      const result = computeLayout(tree, { width: 100, height: 80 })
      expect(result.height).toBe(80)
      expect(result.children[0]!.height).toBe(200)
      expect(result.children[0]!.y).toBe(0)
    }
  })

  it('unknown overflow string is ignored (layout matches omitting overflow; corrupt props do not throw)', () => {
    const child = { width: 50, height: 20 }
    const baseline: BoxNode = { width: 100, height: 50, children: [child] }
    const weird = {
      width: 100,
      height: 50,
      overflow: 'not-a-mode',
      children: [child],
    } as unknown as BoxNode
    expect(computeLayout(weird)).toEqual(computeLayout(baseline))
  })

  it('non-finite gap, rowGap, and columnGap are ignored like omitting the prop (corrupt JSON / NaN / ±Infinity)', () => {
    const gapChildren: LayoutNode[] = [
      { width: 10, height: 10 },
      { width: 10, height: 10 },
    ]
    const cleanRow: BoxNode = {
      width: 100,
      flexDirection: 'row',
      children: gapChildren,
    }
    const junkRow: BoxNode = {
      width: 100,
      flexDirection: 'row',
      gap: Number.NaN as never,
      rowGap: Number.POSITIVE_INFINITY as never,
      columnGap: Number.NEGATIVE_INFINITY as never,
      children: gapChildren,
    }
    expect(computeLayout(junkRow)).toEqual(computeLayout(cleanRow))

    const cleanCol: BoxNode = {
      width: 40,
      flexDirection: 'column',
      children: gapChildren,
    }
    const junkCol: BoxNode = {
      width: 40,
      flexDirection: 'column',
      gap: Number.NaN as never,
      rowGap: Number.POSITIVE_INFINITY as never,
      columnGap: Number.NEGATIVE_INFINITY as never,
      children: gapChildren,
    }
    expect(computeLayout(junkCol)).toEqual(computeLayout(cleanCol))
  })

  it('bigint gap, rowGap, and columnGap are ignored like omitting the prop (typeof guard; corrupt deserialization)', () => {
    const gapChildren: LayoutNode[] = [
      { width: 10, height: 10 },
      { width: 10, height: 10 },
    ]
    const cleanRow: BoxNode = {
      width: 100,
      flexDirection: 'row',
      children: gapChildren,
    }
    const junkRow: BoxNode = {
      width: 100,
      flexDirection: 'row',
      gap: 3n as never,
      rowGap: 2n as never,
      columnGap: 1n as never,
      children: gapChildren,
    }
    expect(computeLayout(junkRow)).toEqual(computeLayout(cleanRow))
  })

  it('non-finite flexGrow, flexShrink, and numeric flexBasis match omitting those props (Yoga-stable)', () => {
    const rowBaseline: BoxNode = {
      width: 300,
      flexDirection: 'row',
      children: [
        { width: 100, height: 50, flexGrow: 0 },
        { height: 50 },
      ],
    }
    const rowWeird: BoxNode = {
      width: 300,
      flexDirection: 'row',
      children: [
        { width: 100, height: 50, flexGrow: 0 },
        {
          height: 50,
          flexGrow: Number.NaN as never,
          flexShrink: Number.POSITIVE_INFINITY as never,
          flexBasis: Number.NEGATIVE_INFINITY as never,
        },
      ],
    }
    expect(computeLayout(rowWeird)).toEqual(computeLayout(rowBaseline))

    const shrinkBaseline: BoxNode = {
      width: 100,
      flexDirection: 'row',
      children: [
        { width: 80, height: 20, flexShrink: 1 },
        { width: 80, height: 20, flexShrink: 0 },
      ],
    }
    const shrinkWeird: BoxNode = {
      width: 100,
      flexDirection: 'row',
      children: [
        { width: 80, height: 20, flexShrink: Number.NaN as never },
        { width: 80, height: 20, flexShrink: 0 },
      ],
    }
    expect(computeLayout(shrinkWeird)).toEqual(computeLayout(shrinkBaseline))
  })

  it('flexGrow distributes space', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      children: [
        { width: 100, height: 50, flexGrow: 0 },
        { height: 50, flexGrow: 1 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.width).toBe(100)
    expect(result.children[1]!.width).toBe(200)
  })

  it('absolute positioning', () => {
    const tree: BoxNode = {
      width: 300,
      height: 300,
      children: [
        {
          position: 'absolute',
          top: 10,
          left: 10,
          width: 50,
          height: 50,
        },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(10)
    expect(result.children[0]!.y).toBe(10)
    expect(result.children[0]!.width).toBe(50)
  })

  it('absolute positioning uses physical left/top regardless of parent dir and owner direction', () => {
    const absChild: BoxNode = {
      position: 'absolute',
      top: 10,
      left: 10,
      width: 50,
      height: 50,
    }
    const opts = { width: 300, height: 300 } as const
    for (const parentDir of ['ltr', 'rtl'] as const) {
      for (const owner of ['ltr', 'rtl'] as const) {
        const tree: BoxNode = {
          width: 300,
          height: 300,
          dir: parentDir,
          children: [absChild],
        }
        const result = computeLayout(tree, { ...opts, direction: owner })
        expect(result.children[0]!.x).toBe(10)
        expect(result.children[0]!.y).toBe(10)
        expect(result.children[0]!.width).toBe(50)
        expect(result.children[0]!.height).toBe(50)
      }
    }
  })

  it('justify content space-between', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      justifyContent: 'space-between',
      children: [
        { width: 50, height: 50 },
        { width: 50, height: 50 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[1]!.x).toBe(250)
  })

  it('justify content space-around', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      justifyContent: 'space-around',
      children: [
        { width: 50, height: 50 },
        { width: 50, height: 50 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(50)
    expect(result.children[1]!.x).toBe(200)
  })

  it('justify content space-evenly', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      children: [
        { width: 50, height: 50 },
        { width: 50, height: 50 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(67)
    expect(result.children[1]!.x).toBe(183)
  })

  it('row with dir rtl mirrors justifyContent space-around main axis under ltr owner', () => {
    const base = {
      width: 300,
      height: 50,
      flexDirection: 'row' as const,
      justifyContent: 'space-around' as const,
      children: [{ width: 50, height: 50 }, { width: 50, height: 50 }],
    }
    const ltr = computeLayout({ ...base, dir: 'ltr' }, { width: 300, height: 50, direction: 'ltr' })
    expect(ltr.children[0]!.x).toBe(50)
    expect(ltr.children[1]!.x).toBe(200)

    const rtl = computeLayout({ ...base, dir: 'rtl' }, { width: 300, height: 50, direction: 'ltr' })
    expect(rtl.children[0]!.x).toBe(200)
    expect(rtl.children[1]!.x).toBe(50)
  })

  it('row with dir rtl mirrors justifyContent flex-end main axis under ltr owner', () => {
    const base = {
      width: 300,
      height: 50,
      flexDirection: 'row' as const,
      justifyContent: 'flex-end' as const,
      children: [{ width: 50, height: 50 }, { width: 50, height: 50 }],
    }
    const ltr = computeLayout({ ...base, dir: 'ltr' }, { width: 300, height: 50, direction: 'ltr' })
    expect(ltr.children[0]!.x).toBe(200)
    expect(ltr.children[1]!.x).toBe(250)

    const rtl = computeLayout({ ...base, dir: 'rtl' }, { width: 300, height: 50, direction: 'ltr' })
    expect(rtl.children[0]!.x).toBe(50)
    expect(rtl.children[1]!.x).toBe(0)
  })

  it('row with dir rtl mirrors justifyContent space-between main axis under ltr owner', () => {
    const base = {
      width: 300,
      height: 50,
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      children: [{ width: 50, height: 50 }, { width: 50, height: 50 }],
    }
    const ltr = computeLayout({ ...base, dir: 'ltr' }, { width: 300, height: 50, direction: 'ltr' })
    expect(ltr.children[0]!.x).toBe(0)
    expect(ltr.children[1]!.x).toBe(250)

    const rtl = computeLayout({ ...base, dir: 'rtl' }, { width: 300, height: 50, direction: 'ltr' })
    expect(rtl.children[0]!.x).toBe(250)
    expect(rtl.children[1]!.x).toBe(0)
  })

  it('align items center', () => {
    const tree: BoxNode = {
      width: 300,
      height: 100,
      flexDirection: 'row',
      alignItems: 'center',
      children: [{ width: 50, height: 30 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.y).toBe(35)
  })

  it('margin creates space between siblings', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'column',
      children: [
        { width: 100, height: 50 },
        { width: 100, height: 50, marginTop: 20 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[1]!.y).toBe(70)
    expect(result.height).toBe(120)
  })

  it('row: marginLeft and marginRight auto split leftover main-axis space (centers fixed-width child)', () => {
    const tree: BoxNode = {
      width: 300,
      height: 50,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      children: [{ width: 100, height: 40, marginLeft: 'auto', marginRight: 'auto' }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(100)
    expect(result.children[0]!.width).toBe(100)
  })

  it('row under rtl: marginHorizontal auto still centers the child on the main axis', () => {
    const tree: BoxNode = {
      width: 300,
      height: 50,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      children: [{ width: 100, height: 40, marginHorizontal: 'auto' }],
    }
    const result = computeLayout(tree, { width: 300, height: 50, direction: 'rtl' })
    expect(result.children[0]!.x).toBe(100)
  })

  it('nested flex containers', () => {
    const tree: BoxNode = {
      width: 400,
      flexDirection: 'column',
      children: [
        {
          flexDirection: 'row',
          gap: 10,
          children: [
            { width: 100, height: 60 },
            { width: 100, height: 60 },
          ],
        },
        { width: 200, height: 40 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.height).toBe(60)
    expect(result.children[1]!.y).toBe(60)
    expect(result.height).toBe(100)
  })
})

// Text measurement uses OffscreenCanvas (polyfilled above in Node; real canvas in browsers).
describe('text layout (Pretext + canvas measureText)', () => {
  it('text node measures height from content', () => {
    const tree: TextNode = {
      text: 'Hello world',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 400,
    }
    const result = computeLayout(tree)
    expect(result.width).toBe(400)
    expect(result.height).toBe(20)
    expect(result.text).toBe('Hello world')
    expect(result.lineCount).toBe(1)
  })

  it('text leaf accepts per-node dir (ltr, rtl, auto, unknown) without throwing; ASCII geometry matches omitting dir under uniform mock measureText', () => {
    const base: TextNode = {
      text: 'Hello',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 200,
    }
    const omitted = computeLayout(base)
    const pick = (r: {
      x: number
      y: number
      width: number
      height: number
      children: unknown[]
      lineCount?: number
      text?: string
    }) => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      lineCount: r.lineCount,
      text: r.text,
      childrenLen: r.children.length,
    })
    const expected = pick(omitted)
    expect(pick(computeLayout({ ...base, dir: 'ltr' }))).toEqual(expected)
    expect(pick(computeLayout({ ...base, dir: 'rtl' }))).toEqual(expected)
    expect(pick(computeLayout({ ...base, dir: 'auto' }))).toEqual(expected)
    // Malformed serialized dir maps to Yoga Inherit (same as auto on a root text leaf under default LTR owner).
    expect(pick(computeLayout({ ...base, dir: 'bogus' }))).toEqual(expected)
  })

  it('text wraps to multiple lines in narrow container', () => {
    const longText =
      'This is a fairly long paragraph of text that should definitely wrap to multiple lines when constrained to a narrow width.'
    const tree: TextNode = {
      text: longText,
      font: '16px sans-serif',
      lineHeight: 20,
      whiteSpace: 'normal',
      width: 100,
    }
    const result = computeLayout(tree)
    expect(result.lineCount!).toBeGreaterThan(1)
    expect(result.height).toBe(result.lineCount! * 20)
  })

  it('text inside a flex container', () => {
    const tree: BoxNode = {
      width: 400,
      padding: 10,
      flexDirection: 'column',
      gap: 8,
      children: [
        { text: 'Title', font: '24px sans-serif', lineHeight: 30 } satisfies TextNode,
        { text: 'Body text', font: '16px sans-serif', lineHeight: 20 } satisfies TextNode,
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.y).toBe(10)
    expect(result.children[0]!.height).toBe(30)
    expect(result.children[1]!.y).toBe(48)
    expect(result.children[1]!.height).toBe(20)
    expect(result.height).toBe(78)
  })

  it('text in row layout gets intrinsic width, not container width', () => {
    const tree: BoxNode = {
      width: 600,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 10,
      paddingRight: 10,
      children: [
        { text: 'Hello', font: '13px sans-serif', lineHeight: 18 } satisfies TextNode,
        { width: 2, height: 14 },
      ],
    }
    const result = computeLayout(tree)
    const textChild = result.children[0]!
    const caretChild = result.children[1]!
    expect(textChild.width).toBeLessThan(100)
    expect(caretChild.x).toBeLessThan(120)
  })

  it('text leaves accept explicit dir on the node (rtl) without breaking layout', () => {
    const tree: TextNode = {
      text: 'Hi',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 80,
      dir: 'rtl',
    }
    const result = computeLayout(tree)
    expect(result.width).toBe(80)
    expect(result.height).toBe(20)
    expect(Number.isFinite(result.x)).toBe(true)
    expect(Number.isFinite(result.y)).toBe(true)
  })

  it('row with dir rtl mirrors text siblings like box children (RTL through Textura props)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      gap: 10,
      dir: 'rtl',
      children: [
        { text: 'AA', font: '16px sans-serif', lineHeight: 20, width: 40 } satisfies TextNode,
        { text: 'BB', font: '16px sans-serif', lineHeight: 20, width: 40 } satisfies TextNode,
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 40, direction: 'ltr' })
    const first = result.children[0]!
    const second = result.children[1]!
    expect(first.x).toBeGreaterThan(second.x)
  })

  it('column with dir rtl and flex-start align mirrors cross-axis child positions (owner ltr)', () => {
    const base: BoxNode = {
      width: 200,
      height: 120,
      flexDirection: 'column',
      alignItems: 'flex-start',
      children: [
        { width: 80, height: 40 },
        { width: 80, height: 40 },
      ],
    }
    const ltr = computeLayout({ ...base, dir: 'ltr' }, { width: 200, height: 120, direction: 'ltr' })
    const rtl = computeLayout({ ...base, dir: 'rtl' }, { width: 200, height: 120, direction: 'ltr' })
    expect(ltr.children[0]!.x).toBe(0)
    expect(ltr.children[1]!.x).toBe(0)
    expect(rtl.children[0]!.x).toBe(120)
    expect(rtl.children[1]!.x).toBe(120)
    expect(rtl.children[0]!.y).toBe(ltr.children[0]!.y)
    expect(rtl.children[1]!.y).toBe(ltr.children[1]!.y)
  })

  it('column with dir rtl and flex-end align mirrors cross-axis end edge vs ltr (owner ltr)', () => {
    const base: BoxNode = {
      width: 200,
      height: 120,
      flexDirection: 'column',
      alignItems: 'flex-end',
      children: [
        { width: 80, height: 40 },
        { width: 80, height: 40 },
      ],
    }
    const ltr = computeLayout({ ...base, dir: 'ltr' }, { width: 200, height: 120, direction: 'ltr' })
    const rtl = computeLayout({ ...base, dir: 'rtl' }, { width: 200, height: 120, direction: 'ltr' })
    expect(ltr.children[0]!.x).toBe(120)
    expect(ltr.children[1]!.x).toBe(120)
    expect(rtl.children[0]!.x).toBe(0)
    expect(rtl.children[1]!.x).toBe(0)
    expect(rtl.children[0]!.y).toBe(ltr.children[0]!.y)
    expect(rtl.children[1]!.y).toBe(ltr.children[1]!.y)
  })

  it('text leaf with unknown dir at runtime inherits like auto (parity with nested row bogus-dir test)', () => {
    const tree = {
      text: 'x',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 50,
      dir: 'bogus',
    } satisfies TextNode
    const rtl = computeLayout(tree, { width: 200, height: 40, direction: 'rtl' })
    const ltr = computeLayout(tree, { width: 200, height: 40, direction: 'ltr' })
    expect(rtl.width).toBe(50)
    expect(ltr.width).toBe(50)
    expect(rtl.height).toBe(ltr.height)
  })

  it('row: flexGrow with flexBasis 0 fills remaining main-axis space (flex-1 / basis-0 pattern)', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      children: [
        { width: 40, height: 40 },
        { flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 40 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.width).toBe(40)
    expect(result.children[1]!.width).toBe(160)
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[1]!.x).toBe(40)
  })

  it('row: flexGrow with flexBasis auto grows from declared width as flex base', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      children: [
        { width: 40, height: 40 },
        { width: 30, flexGrow: 1, flexShrink: 1, flexBasis: 'auto', height: 40 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.width).toBe(40)
    expect(result.children[1]!.width).toBe(160)
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[1]!.x).toBe(40)
  })

  it('row: minWidth raises a child width below the minimum', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      children: [
        { width: 20, height: 40, minWidth: 80 },
        { width: 40, height: 40 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.width).toBe(80)
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[1]!.x).toBe(80)
    expect(result.children[1]!.width).toBe(40)
  })

  it('row: maxWidth clamps a declared width', () => {
    const tree: BoxNode = {
      width: 300,
      height: 40,
      flexDirection: 'row',
      children: [{ width: 200, height: 40, maxWidth: 100 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.width).toBe(100)
  })

  it('column: minHeight raises a child height below the minimum', () => {
    const tree: BoxNode = {
      width: 100,
      height: 200,
      flexDirection: 'column',
      children: [{ width: 100, height: 10, minHeight: 60 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.height).toBe(60)
  })

  it('column: maxHeight clamps a declared height', () => {
    const tree: BoxNode = {
      width: 100,
      height: 300,
      flexDirection: 'column',
      children: [{ width: 100, height: 200, maxHeight: 80 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.height).toBe(80)
  })
})

describe('display none (Yoga Display.None)', () => {
  it('row: display none child has zero size and does not consume main-axis space; next sibling starts at origin', () => {
    const tree: BoxNode = {
      width: 200,
      height: 40,
      flexDirection: 'row',
      children: [
        { width: 60, height: 40, display: 'none' },
        { width: 50, height: 40 },
      ],
    }
    const result = computeLayout(tree, { width: 200, height: 40 })
    expect(result.children[0]!.width).toBe(0)
    expect(result.children[0]!.height).toBe(0)
    expect(result.children[1]!.x).toBe(0)
    expect(result.children[1]!.width).toBe(50)
  })

  it('column: display none child has zero size; following sibling stacks without a gap from the hidden node', () => {
    const tree: BoxNode = {
      width: 100,
      height: 120,
      flexDirection: 'column',
      gap: 4,
      children: [
        { width: 100, height: 30, display: 'none' },
        { width: 100, height: 24 },
      ],
    }
    const result = computeLayout(tree, { width: 100, height: 120 })
    expect(result.children[0]!.height).toBe(0)
    expect(result.children[1]!.y).toBe(0)
    expect(result.children[1]!.height).toBe(24)
  })

  it('explicit display flex keeps default flex participation (baseline vs none)', () => {
    const noneFirst: BoxNode = {
      width: 120,
      height: 30,
      flexDirection: 'row',
      children: [
        { width: 40, height: 20, display: 'none' },
        { width: 40, height: 20 },
      ],
    }
    const flexFirst: BoxNode = {
      width: 120,
      height: 30,
      flexDirection: 'row',
      children: [
        { width: 40, height: 20, display: 'flex' },
        { width: 40, height: 20 },
      ],
    }
    const hidden = computeLayout(noneFirst, { width: 120, height: 30 })
    const visible = computeLayout(flexFirst, { width: 120, height: 30 })
    expect(hidden.children[1]!.x).toBe(0)
    expect(visible.children[1]!.x).toBe(40)
  })

  it('malformed display string falls back to flex (only none opts out)', () => {
    const tree: BoxNode = {
      width: 100,
      height: 40,
      flexDirection: 'row',
      children: [
        { width: 30, height: 40, display: 'hidden' as never },
        { width: 30, height: 40 },
      ],
    }
    const result = computeLayout(tree, { width: 100, height: 40 })
    expect(result.children[1]!.x).toBe(30)
  })
})

describe('logical-axis props', () => {
  it('paddingInlineStart applies to left in LTR', () => {
    const tree: BoxNode = {
      width: 100,
      height: 40,
      paddingInlineStart: 10,
      children: [{ width: 20, height: 20 }],
    }
    const result = computeLayout(tree, { width: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(10)
  })

  it('paddingInlineStart applies to right in RTL (child pushed to right)', () => {
    const tree: BoxNode = {
      width: 100,
      height: 40,
      dir: 'rtl',
      paddingInlineStart: 10,
      children: [{ width: 20, height: 20 }],
    }
    const result = computeLayout(tree, { width: 100, direction: 'rtl' })
    // In RTL, inline-start = right side, so child is pushed away from right edge
    expect(result.children[0]!.x).toBe(100 - 10 - 20)
  })

  it('paddingInlineEnd applies to right in LTR', () => {
    const tree: BoxNode = {
      width: 100,
      height: 40,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingInlineEnd: 15,
      children: [{ width: 20, height: 20 }],
    }
    const result = computeLayout(tree, { width: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(100 - 15 - 20)
  })

  it('marginInlineStart offsets child in LTR', () => {
    const tree: BoxNode = {
      width: 100,
      height: 40,
      children: [{ width: 20, height: 20, marginInlineStart: 12 }],
    }
    const result = computeLayout(tree, { width: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(12)
  })

  it('marginInlineStart offsets child from right in RTL', () => {
    const tree: BoxNode = {
      width: 100,
      height: 40,
      dir: 'rtl',
      children: [{ width: 20, height: 20, marginInlineStart: 12 }],
    }
    const result = computeLayout(tree, { width: 100, direction: 'rtl' })
    expect(result.children[0]!.x).toBe(100 - 12 - 20)
  })

  it('borderInlineStart reserves space in LTR', () => {
    const tree: BoxNode = {
      width: 100,
      height: 40,
      borderInlineStart: 5,
      children: [{ width: 20, height: 20 }],
    }
    const result = computeLayout(tree, { width: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(5)
  })

  it('insetInlineStart positions absolutely in LTR', () => {
    const tree: BoxNode = {
      width: 100,
      height: 100,
      children: [{ width: 20, height: 20, position: 'absolute', insetInlineStart: 30 }],
    }
    const result = computeLayout(tree, { width: 100, direction: 'ltr' })
    expect(result.children[0]!.x).toBe(30)
  })

  it('insetInlineStart positions absolutely from right in RTL', () => {
    const tree: BoxNode = {
      width: 100,
      height: 100,
      dir: 'rtl',
      children: [{ width: 20, height: 20, position: 'absolute', insetInlineStart: 30 }],
    }
    const result = computeLayout(tree, { width: 100, direction: 'rtl' })
    expect(result.children[0]!.x).toBe(100 - 30 - 20)
  })

  it('paddingBlockStart and paddingBlockEnd apply to top and bottom', () => {
    const tree: BoxNode = {
      width: 100,
      height: 100,
      paddingBlockStart: 8,
      paddingBlockEnd: 12,
      children: [{ width: 20, height: 20 }],
    }
    const result = computeLayout(tree, { width: 100 })
    expect(result.children[0]!.y).toBe(8)
  })

  it('marginBlockStart applies to top', () => {
    const tree: BoxNode = {
      width: 100,
      height: 100,
      children: [{ width: 20, height: 20, marginBlockStart: 7 }],
    }
    const result = computeLayout(tree, { width: 100 })
    expect(result.children[0]!.y).toBe(7)
  })

  it('insetBlockStart positions absolutely from top', () => {
    const tree: BoxNode = {
      width: 100,
      height: 100,
      children: [{ width: 20, height: 20, position: 'absolute', insetBlockStart: 25 }],
    }
    const result = computeLayout(tree, { width: 100 })
    expect(result.children[0]!.y).toBe(25)
  })
})

describe('engine init contract', () => {
  it('computeLayout throws a clear error when Yoga config is missing (caller must init after destroy)', async () => {
    destroy()
    expect(() => computeLayout({ width: 1, height: 1 })).toThrow(/textura: call init\(\) first/)
    await init()
  })
})
