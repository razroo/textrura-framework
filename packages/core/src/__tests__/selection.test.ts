import { describe, it, expect } from 'vitest'
import { collectTextNodes, getSelectedText, hitTestText } from '../selection.js'
import { text } from '../elements.js'
import { box } from '../elements.js'

describe('collectTextNodes', () => {
  it('collects text elements (selectable by default)', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Hello', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
      text({ text: 'World', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 18, children: [] },
        { x: 0, y: 18, width: 100, height: 18, children: [] },
      ],
    }

    const results: any[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(2)
    expect(results[0].element.props.text).toBe('Hello')
    expect(results[1].element.props.text).toBe('World')
  })

  it('skips selectable:false', () => {
    const el = box({ width: 200, height: 100 }, [
      text({ text: 'Visible', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18, selectable: false }),
      text({ text: 'Selectable', font: '14px sans-serif', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 18, children: [] },
        { x: 0, y: 18, width: 100, height: 18, children: [] },
      ],
    }

    const results: any[] = []
    collectTextNodes(el, layout, 0, 0, results)
    expect(results).toHaveLength(1)
    expect(results[0].element.props.text).toBe('Selectable')
  })
})

describe('getSelectedText', () => {
  const makeNodes = () => [
    { element: { kind: 'text' as const, props: { text: 'Hello World', font: '14px sans-serif', lineHeight: 18 } }, x: 0, y: 0, width: 100, height: 18, lines: [], index: 0 },
    { element: { kind: 'text' as const, props: { text: 'Second line', font: '14px sans-serif', lineHeight: 18 } }, x: 0, y: 18, width: 100, height: 18, lines: [], index: 1 },
  ]

  it('extracts from single node', () => {
    const nodes = makeNodes()
    const result = getSelectedText(
      { anchorNode: 0, anchorOffset: 0, focusNode: 0, focusOffset: 5 },
      nodes as any,
    )
    expect(result).toBe('Hello')
  })

  it('works across multiple nodes', () => {
    const nodes = makeNodes()
    const result = getSelectedText(
      { anchorNode: 0, anchorOffset: 6, focusNode: 1, focusOffset: 6 },
      nodes as any,
    )
    expect(result).toBe('World\nSecond')
  })

  it('handles reversed anchor/focus', () => {
    const nodes = makeNodes()
    const result = getSelectedText(
      { anchorNode: 1, anchorOffset: 6, focusNode: 0, focusOffset: 6 },
      nodes as any,
    )
    expect(result).toBe('World\nSecond')
  })
})
