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

import { init, destroy, computeLayout } from '../index.js'
import type { BoxNode, TextNode } from '../index.js'

beforeAll(async () => {
  await init()
})

afterAll(() => {
  destroy()
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
          dir: 'bogus' as never,
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
})
