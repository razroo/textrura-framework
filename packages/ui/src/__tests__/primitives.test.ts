import { describe, it, expect } from 'vitest'
import type { HitEvent, KeyboardHitEvent } from '../../../core/src/types.js'
import { box, text } from '../../../core/src/index.js'
import { checkbox, radio, tabs } from '../index.js'

describe('@geometra/ui primitives', () => {
  it('checkbox toggles on click and keyboard', () => {
    let seen: boolean | null = null
    const el = checkbox('Email me', {
      checked: false,
      onChange: (next) => {
        seen = next
      },
    })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return

    el.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(seen).toBe(true)

    seen = null
    el.handlers?.onKeyDown?.({
      key: ' ',
      code: 'Space',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: {} as KeyboardHitEvent['target'],
    })
    expect(seen).toBe(true)
  })

  it('radio calls onSelect only when unchecked', () => {
    let selected = 0
    const unchecked = radio('Option A', { checked: false, onSelect: () => selected++ })
    const checked = radio('Option B', { checked: true, onSelect: () => selected++ })

    expect(unchecked.kind).toBe('box')
    expect(checked.kind).toBe('box')
    if (unchecked.kind !== 'box' || checked.kind !== 'box') return

    unchecked.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    checked.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(selected).toBe(1)
  })

  it('tabs renders active content and emits index on click', () => {
    let nextIdx = -1
    const tabEl = tabs(
      [
        { label: 'One', content: text({ text: 'First', font: '13px Inter', lineHeight: 18, color: '#fff' }) },
        { label: 'Two', content: box({ width: 20, height: 10 }, []) },
      ],
      { activeIndex: 0, onTabChange: (idx) => { nextIdx = idx } },
    )
    expect(tabEl.kind).toBe('box')
    if (tabEl.kind !== 'box') return

    const headerRow = tabEl.children[0]
    expect(headerRow?.kind).toBe('box')
    if (!headerRow || headerRow.kind !== 'box') return
    const secondTab = headerRow.children[1]
    expect(secondTab?.kind).toBe('box')
    if (!secondTab || secondTab.kind !== 'box') return
    secondTab.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(nextIdx).toBe(1)

    const panel = tabEl.children[1]
    expect(panel?.kind).toBe('box')
    if (!panel || panel.kind !== 'box') return
    expect(panel.children).toHaveLength(1)
    expect(panel.children[0]?.kind).toBe('text')
  })
})
