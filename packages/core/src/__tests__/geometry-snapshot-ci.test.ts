import { describe, it, expect } from 'vitest'
import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import { box, image, text } from '../elements.js'
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

  it('stable row with gap and two text children (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 80, padding: 12, flexDirection: 'row', gap: 8 },
      [
        text({ text: 'A', font: '16px sans-serif', lineHeight: 20 }),
        text({ text: 'B', font: '16px sans-serif', lineHeight: 20 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row-reverse with gap and two text children (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 80, padding: 12, flexDirection: 'row-reverse', gap: 8 },
      [
        text({ text: 'A', font: '16px sans-serif', lineHeight: 20 }),
        text({ text: 'B', font: '16px sans-serif', lineHeight: 20 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable rtl root row mirrors two text children (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 80, padding: 12, flexDirection: 'row', gap: 8 },
      [
        text({ text: 'A', font: '16px sans-serif', lineHeight: 20 }),
        text({ text: 'B', font: '16px sans-serif', lineHeight: 20 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), {
      width: 200,
      height: 80,
      direction: 'rtl',
    })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable ltr document: descendant dir rtl on inner flex row does not mirror Yoga (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20 } as const
    const tree = box(
      { width: 200, height: 80, padding: 12 },
      [
        box(
          { width: 176, height: 56, flexDirection: 'row', gap: 8, dir: 'rtl' },
          [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
        ),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable rtl root: inner flex row with dir auto inherits rtl document direction (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20 } as const
    const tree = box(
      { width: 200, height: 80, padding: 12 },
      [
        box(
          { width: 176, height: 56, flexDirection: 'row', gap: 8, dir: 'auto' },
          [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
        ),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), {
      width: 200,
      height: 80,
      direction: 'rtl',
    })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable ltr row with per-node rtl and ltr text dir (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 40, height: 20 } as const
    const tree = box(
      { width: 200, height: 80, padding: 12, flexDirection: 'row', gap: 8 },
      [
        text({ text: 'L', ...item, dir: 'ltr' }),
        text({ text: 'R', ...item, dir: 'rtl' }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable ltr row with dir auto on Latin and Hebrew text (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 40, height: 20 } as const
    const tree = box(
      { width: 200, height: 80, padding: 12, flexDirection: 'row', gap: 8 },
      [
        text({ text: 'A', ...item, dir: 'auto' }),
        text({ text: 'שלום', ...item, dir: 'auto' }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with space-between and two text children (rounded)', async () => {
    await init()
    const tree = box(
      {
        width: 200,
        height: 80,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
      },
      [
        text({ text: 'L', font: '16px sans-serif', lineHeight: 20 }),
        text({ text: 'R', font: '16px sans-serif', lineHeight: 20 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with justifyContent center and two fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 24, height: 20 } as const
    const tree = box(
      {
        width: 200,
        height: 80,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
      },
      [
        text({ text: 'A', ...item }),
        text({ text: 'B', ...item }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable rtl row with space-between and two text children (rounded)', async () => {
    await init()
    const tree = box(
      {
        width: 200,
        height: 80,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
      },
      [
        text({ text: 'L', font: '16px sans-serif', lineHeight: 20 }),
        text({ text: 'R', font: '16px sans-serif', lineHeight: 20 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), {
      width: 200,
      height: 80,
      direction: 'rtl',
    })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable column flex with gap and two text children (rounded)', async () => {
    await init()
    const tree = box(
      { width: 160, height: 120, padding: 10, flexDirection: 'column', gap: 6 },
      [
        text({ text: 'Top', font: '14px sans-serif', lineHeight: 18 }),
        text({ text: 'Bottom', font: '14px sans-serif', lineHeight: 18 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 160, height: 120 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable column-reverse flex with gap and two text children (rounded)', async () => {
    await init()
    const tree = box(
      { width: 160, height: 120, padding: 10, flexDirection: 'column-reverse', gap: 6 },
      [
        text({ text: 'Top', font: '14px sans-serif', lineHeight: 18 }),
        text({ text: 'Bottom', font: '14px sans-serif', lineHeight: 18 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 160, height: 120 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable column with mixed alignSelf on fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '14px sans-serif', lineHeight: 18, width: 60, height: 18 } as const
    const tree = box(
      {
        width: 160,
        height: 120,
        padding: 8,
        flexDirection: 'column',
        gap: 4,
        alignItems: 'stretch',
      },
      [
        text({ text: 'Start', ...item, alignSelf: 'flex-start' }),
        text({ text: 'Center', ...item, alignSelf: 'center' }),
        text({ text: 'End', ...item, alignSelf: 'flex-end' }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 160, height: 120 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable rtl root column stacks two text children (rounded)', async () => {
    await init()
    const tree = box(
      { width: 160, height: 120, padding: 10, flexDirection: 'column', gap: 6 },
      [
        text({ text: 'Top', font: '14px sans-serif', lineHeight: 18 }),
        text({ text: 'Bottom', font: '14px sans-serif', lineHeight: 18 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), {
      width: 160,
      height: 120,
      direction: 'rtl',
    })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable rtl root column-reverse stacks two text children (rounded)', async () => {
    await init()
    const tree = box(
      { width: 160, height: 120, padding: 10, flexDirection: 'column-reverse', gap: 6 },
      [
        text({ text: 'Top', font: '14px sans-serif', lineHeight: 18 }),
        text({ text: 'Bottom', font: '14px sans-serif', lineHeight: 18 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), {
      width: 160,
      height: 120,
      direction: 'rtl',
    })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable wrapped row with three fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 40, height: 20 } as const
    const tree = box(
      { width: 100, height: 120, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
      [
        text({ text: 'One', ...item }),
        text({ text: 'Two', ...item }),
        text({ text: 'Thr', ...item }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 100, height: 120 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with fixed-width text and flexGrow sibling (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, height: 20 } as const
    const tree = box(
      { width: 180, height: 60, padding: 8, flexDirection: 'row', gap: 4 },
      [
        text({ text: 'Fix', ...item, width: 28 }),
        text({ text: 'Grow', ...item, flexGrow: 1 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 180, height: 60 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with text and image siblings (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 80, padding: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
      [
        text({ text: 'Pic', font: '16px sans-serif', lineHeight: 20, width: 36, height: 20 }),
        image({ src: '/a.png', width: 48, height: 48 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable column with in-flow text and absolutely positioned box (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 100, padding: 6, flexDirection: 'column', gap: 4 },
      [
        text({ text: 'Hello', font: '14px sans-serif', lineHeight: 18, width: 80, height: 18 }),
        box({
          position: 'absolute',
          top: 14,
          left: 22,
          width: 44,
          height: 28,
        }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 100 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with alignItems flex-end and mixed-height text children (rounded)', async () => {
    await init()
    const base = { font: '16px sans-serif', lineHeight: 20, width: 32, height: 20 } as const
    const tree = box(
      {
        width: 200,
        height: 80,
        padding: 8,
        flexDirection: 'row',
        gap: 6,
        alignItems: 'flex-end',
      },
      [
        text({ text: 'Lo', ...base }),
        text({ text: 'Tall', ...base, height: 40 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with horizontal margin on fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 24, height: 20, marginHorizontal: 6 } as const
    const tree = box(
      { width: 200, height: 50, padding: 8, flexDirection: 'row', gap: 4 },
      [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 50 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })
})
