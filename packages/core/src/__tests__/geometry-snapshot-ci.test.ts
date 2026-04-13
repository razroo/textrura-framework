import { describe, it, expect } from 'vitest'
import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import { box, image, scene3d, sphere, text } from '../elements.js'
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

  it('stable rtl root row-reverse with gap and two text children (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 80, padding: 12, flexDirection: 'row-reverse', gap: 8 },
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

  it('stable ltr document: descendant dir rtl on inner flex row mirrors child order (rounded)', async () => {
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

  it('stable ltr document: inner flex row-reverse with dir rtl mirrors two text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20 } as const
    const tree = box(
      { width: 200, height: 80, padding: 12 },
      [
        box(
          { width: 176, height: 56, flexDirection: 'row-reverse', gap: 8, dir: 'rtl' },
          [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
        ),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable ltr document: inner flex row with non-ltr/rtl dir uses Yoga inherit (ltr from parent) (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20 } as const
    const tree = box(
      { width: 200, height: 80, padding: 12 },
      [
        box(
          {
            width: 176,
            height: 56,
            flexDirection: 'row',
            gap: 8,
            // Serialized or hand-built trees may carry unknown strings; Textura maps these to Inherit.
            dir: 'bogus' as never,
          },
          [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
        ),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable ltr document: descendant dir rtl on inner flex column (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20 } as const
    const tree = box(
      { width: 200, height: 120, padding: 12 },
      [
        box(
          { width: 176, height: 96, flexDirection: 'column', gap: 6, dir: 'rtl' },
          [
            text({ text: 'Top', ...item }),
            text({ text: 'Bottom', ...item }),
          ],
        ),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 120 })
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

  it('stable rtl document: inner flex row with dir ltr keeps ltr main axis (overrides owner) (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20 } as const
    const tree = box(
      { width: 200, height: 80, padding: 12 },
      [
        box(
          { width: 176, height: 56, flexDirection: 'row', gap: 8, dir: 'ltr' },
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

  it('stable rtl document: inner flex row-reverse with dir auto inherits rtl (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20 } as const
    const tree = box(
      { width: 200, height: 80, padding: 12 },
      [
        box(
          { width: 176, height: 56, flexDirection: 'row-reverse', gap: 8, dir: 'auto' },
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

  it('stable row with justifyContent flex-end and two fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 24, height: 20 } as const
    const tree = box(
      {
        width: 200,
        height: 80,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
      },
      [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 80 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable rtl root row with justifyContent flex-end and two fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 24, height: 20 } as const
    const tree = box(
      {
        width: 200,
        height: 80,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
      },
      [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
    )
    const layout = computeLayout(toLayoutTree(tree), {
      width: 200,
      height: 80,
      direction: 'rtl',
    })
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

  it('stable rtl root column with space-between and two text children (rounded)', async () => {
    await init()
    const tree = box(
      {
        width: 160,
        height: 120,
        padding: 10,
        flexDirection: 'column',
        justifyContent: 'space-between',
      },
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

  it('stable rtl root wrapped row with three fixed-width text children (rounded)', async () => {
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
    const layout = computeLayout(toLayoutTree(tree), {
      width: 100,
      height: 120,
      direction: 'rtl',
    })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable rtl root wrapped row-reverse with three fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 40, height: 20 } as const
    const tree = box(
      { width: 100, height: 120, flexDirection: 'row', flexWrap: 'wrap-reverse', gap: 4 },
      [
        text({ text: 'One', ...item }),
        text({ text: 'Two', ...item }),
        text({ text: 'Thr', ...item }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), {
      width: 100,
      height: 120,
      direction: 'rtl',
    })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable wrapped row with alignContent space-between and four fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 40, height: 20 } as const
    const tree = box(
      {
        width: 100,
        height: 100,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'space-between',
        gap: 4,
      },
      [
        text({ text: '1', ...item }),
        text({ text: '2', ...item }),
        text({ text: '3', ...item }),
        text({ text: '4', ...item }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 100, height: 100 })
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

  it('stable row with text and scene3d siblings (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 80, padding: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
      [
        text({ text: '3D', font: '16px sans-serif', lineHeight: 20, width: 36, height: 20 }),
        scene3d({ width: 48, height: 48, objects: [sphere({ radius: 1 })] }),
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

  it('stable column with in-flow text and relatively positioned box with top/left (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 100, padding: 6, flexDirection: 'column', gap: 4 },
      [
        text({ text: 'Hello', font: '14px sans-serif', lineHeight: 18, width: 80, height: 18 }),
        box({
          position: 'relative',
          top: 5,
          left: 7,
          width: 44,
          height: 26,
        }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 100 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable column with in-flow text and absolutely positioned box via right/bottom (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 100, padding: 6, flexDirection: 'column', gap: 4 },
      [
        text({ text: 'Hello', font: '14px sans-serif', lineHeight: 18, width: 80, height: 18 }),
        box({
          position: 'absolute',
          right: 12,
          bottom: 10,
          width: 48,
          height: 26,
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

  it('stable row with alignItems baseline and mixed font sizes (rounded)', async () => {
    await init()
    const tree = box(
      {
        width: 200,
        height: 80,
        padding: 8,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'baseline',
      },
      [
        text({ text: 'Ab', font: '14px sans-serif', lineHeight: 18, width: 40, height: 18 }),
        text({ text: 'Cd', font: '20px sans-serif', lineHeight: 24, width: 48, height: 24 }),
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

  it('stable column with vertical margin on fixed-width text children (rounded)', async () => {
    await init()
    const item = {
      font: '16px sans-serif',
      lineHeight: 20,
      width: 24,
      height: 20,
      marginTop: 5,
      marginBottom: 5,
    } as const
    const tree = box(
      { width: 200, height: 140, padding: 8, flexDirection: 'column', gap: 4 },
      [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 140 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable column with asymmetric per-edge padding and text child (rounded)', async () => {
    await init()
    const tree = box(
      {
        width: 200,
        height: 100,
        paddingLeft: 14,
        paddingRight: 6,
        paddingTop: 10,
        paddingBottom: 4,
        flexDirection: 'column',
        gap: 6,
      },
      [text({ text: 'Body', font: '14px sans-serif', lineHeight: 18, width: 160, height: 18 })],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 100 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row where minWidth exceeds width on first text and second text flexGrows (rounded)', async () => {
    await init()
    const base = { font: '16px sans-serif', lineHeight: 20, height: 20 } as const
    const tree = box(
      { width: 200, height: 56, padding: 8, flexDirection: 'row', gap: 6 },
      [
        text({ text: 'Min', ...base, width: 40, minWidth: 72 }),
        text({ text: 'Grow', ...base, flexGrow: 1 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 56 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with maxWidth capping a text child and flexGrow sibling (rounded)', async () => {
    await init()
    const base = { font: '16px sans-serif', lineHeight: 20, height: 20 } as const
    const tree = box(
      { width: 220, height: 56, padding: 8, flexDirection: 'row', gap: 6 },
      [
        text({ text: 'Capped', ...base, width: 120, maxWidth: 64 }),
        text({ text: 'Rest', ...base, flexGrow: 1 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 220, height: 56 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable narrow row: flexShrink on fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 56, height: 20, flexShrink: 1 } as const
    const tree = box(
      { width: 100, height: 44, padding: 6, flexDirection: 'row', gap: 8 },
      [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 100, height: 44 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row: equal flexGrow with flexBasis 0 splits free space between text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, height: 20, flexBasis: 0, flexGrow: 1 } as const
    const tree = box(
      { width: 220, height: 52, padding: 8, flexDirection: 'row', gap: 10 },
      [text({ text: 'Left', ...item }), text({ text: 'Right', ...item })],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 220, height: 52 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with square aspectRatio box and text sibling (rounded)', async () => {
    await init()
    const tree = box(
      { width: 200, height: 100, padding: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
      [
        box({ width: 40, aspectRatio: 1 }),
        text({ text: 'Side', font: '16px sans-serif', lineHeight: 20, width: 48, height: 20 }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 100 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable row with columnGap only and two fixed-width text children (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 32, height: 20 } as const
    const tree = box(
      { width: 200, height: 50, padding: 8, flexDirection: 'row', columnGap: 14 },
      [text({ text: 'A', ...item }), text({ text: 'B', ...item })],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 200, height: 50 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })

  it('stable wrapped row with distinct rowGap and columnGap (rounded)', async () => {
    await init()
    const item = { font: '16px sans-serif', lineHeight: 20, width: 44, height: 20 } as const
    const tree = box(
      {
        width: 100,
        height: 100,
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 12,
        columnGap: 5,
      },
      [
        text({ text: '1', ...item }),
        text({ text: '2', ...item }),
        text({ text: '3', ...item }),
      ],
    )
    const layout = computeLayout(toLayoutTree(tree), { width: 100, height: 100 })
    expect(roundLayout(layout)).toMatchSnapshot()
  })
})
