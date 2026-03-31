import { describe, it, expect, beforeEach } from 'vitest'
import { box, createApp } from '../../../core/src/index.js'
import { clearFocus } from '../../../core/src/focus.js'
import { signal } from '../../../core/src/signals.js'
import type { CompositionHitEvent, HitEvent, KeyboardHitEvent, Renderer, UIElement } from '../../../core/src/types.js'
import { input } from '../index.js'

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  // Minimal text-measurement mock for Node test environment.
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

class CaptureRenderer implements Renderer {
  lastTree: UIElement | null = null
  lastLayout: unknown = null
  render(_layout: unknown, tree: UIElement): void {
    this.lastLayout = _layout
    this.lastTree = tree
  }
  destroy(): void {
    // no-op
  }
}

describe('@geometra/ui input', () => {
  beforeEach(() => {
    clearFocus()
  })

  it('forwards click, keyboard, and composition handlers', () => {
    let clicks = 0
    let keys = ''
    let composition = ''

    const el = input('', 'Name', {
      onClick: () => {
        clicks++
      },
      onKeyDown: (e) => {
        if (e.key.length === 1) keys += e.key
      },
      onCompositionEnd: (e) => {
        composition += e.data
      },
    })

    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return

    el.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    el.handlers?.onKeyDown?.({
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: {} as KeyboardHitEvent['target'],
    })
    el.handlers?.onCompositionEnd?.({ data: 'に', target: {} as CompositionHitEvent['target'] })

    expect(clicks).toBe(1)
    expect(keys).toBe('a')
    expect(composition).toBe('に')
  })

  it('applies focused visuals and caret only when focused option is true', () => {
    const unfocused = input('abc', 'Name')
    const focused = input('abc', 'Name', { focused: true })

    expect(unfocused.kind).toBe('box')
    expect(focused.kind).toBe('box')

    if (unfocused.kind !== 'box' || focused.kind !== 'box') return
    expect(unfocused.props.borderColor).toBe('#334155')
    expect(focused.props.borderColor).toBe('#38bdf8')
    expect(unfocused.children.length).toBe(1)
    expect(focused.children.length).toBe(2)
  })

  it('supports multiple controlled inputs without cross-field typing', () => {
    const first = signal('')
    const second = signal('')
    const active = signal<'first' | 'second' | null>(null)

    function controlled(field: 'first' | 'second', value: string, setValue: (next: string) => void): UIElement {
      return input(value, field, {
        focused: active.value === field,
        onClick: () => active.set(field),
        onKeyDown: (e) => {
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            setValue(value + e.key)
          }
        },
      })
    }

    function render(): { first: UIElement; second: UIElement } {
      return {
        first: controlled('first', first.value, (next) => first.set(next)),
        second: controlled('second', second.value, (next) => second.set(next)),
      }
    }

    function clickField(field: 'first' | 'second'): void {
      const element = render()[field]
      if (element.kind !== 'box') return
      element.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    }

    function keyField(field: 'first' | 'second', key: string): void {
      const element = render()[field]
      if (element.kind !== 'box') return
      element.handlers?.onKeyDown?.({
        key,
        code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: {} as KeyboardHitEvent['target'],
      })
    }

    clickField('first')
    keyField('first', 'a')
    keyField('first', 'b')

    clickField('second')
    keyField('second', 'x')
    keyField('second', 'y')

    clickField('first')
    keyField('first', 'c')

    expect(first.peek()).toBe('abc')
    expect(second.peek()).toBe('xy')
  })

  it('shows caret on focused input and moves it on focus change', async () => {
    const active = signal<'name' | 'email' | null>(null)
    const renderer = new CaptureRenderer()

    const app = await createApp(
      () =>
        box({ width: 280, height: 140, flexDirection: 'column', gap: 12 }, [
          input('', 'Name', { focused: active.value === 'name', onClick: () => active.set('name') }),
          input('', 'Email', { focused: active.value === 'email', onClick: () => active.set('email') }),
        ]),
      renderer,
      { width: 280, height: 140 },
    )

    function getCaretPositions(tree: UIElement | null, layout: unknown, ox = 0, oy = 0): Array<{ x: number; y: number }> {
      if (!tree || !layout || tree.kind !== 'box') return []
      const node = layout as { x: number; y: number; children?: unknown[] }
      const absX = ox + node.x
      const absY = oy + node.y
      const own = tree.props.backgroundColor === '#38bdf8' && tree.props.width === 1.5
        ? [{ x: absX, y: absY }]
        : []
      const childrenLayouts = node.children ?? []
      const childPositions = tree.children.flatMap((child, idx) =>
        getCaretPositions(child, childrenLayouts[idx], absX, absY),
      )
      return [...own, ...childPositions]
    }

    expect(getCaretPositions(renderer.lastTree, renderer.lastLayout)).toHaveLength(0)

    app.dispatch('onClick', 10, 10)
    const firstCaret = getCaretPositions(renderer.lastTree, renderer.lastLayout)
    expect(firstCaret).toHaveLength(1)

    app.dispatch('onClick', 10, 70)
    const secondCaret = getCaretPositions(renderer.lastTree, renderer.lastLayout)
    expect(secondCaret).toHaveLength(1)
    // Focus moved to a different input row, so caret y-position should change.
    expect(secondCaret[0]!.y).toBeGreaterThan(firstCaret[0]!.y)

    app.destroy()
  })

  it('positions caret based on caretOffset within same input', async () => {
    const offset = signal(0)
    const renderer = new CaptureRenderer()

    const app = await createApp(
      () =>
        box({ width: 280, height: 80 }, [
          input('Charlie', 'Name', { focused: true, caretOffset: offset.value }),
        ]),
      renderer,
      { width: 280, height: 80 },
    )

    function getCaretPositions(tree: UIElement | null, layout: unknown, ox = 0, oy = 0): Array<{ x: number; y: number }> {
      if (!tree || !layout || tree.kind !== 'box') return []
      const node = layout as { x: number; y: number; children?: unknown[] }
      const absX = ox + node.x
      const absY = oy + node.y
      const own = tree.props.backgroundColor === '#38bdf8' && tree.props.width === 1.5
        ? [{ x: absX, y: absY }]
        : []
      const childrenLayouts = node.children ?? []
      const childPositions = tree.children.flatMap((child, idx) =>
        getCaretPositions(child, childrenLayouts[idx], absX, absY),
      )
      return [...own, ...childPositions]
    }

    const atStart = getCaretPositions(renderer.lastTree, renderer.lastLayout)
    expect(atStart).toHaveLength(1)

    offset.set(3)
    const atMiddle = getCaretPositions(renderer.lastTree, renderer.lastLayout)
    expect(atMiddle).toHaveLength(1)
    expect(atMiddle[0]!.x).toBeGreaterThan(atStart[0]!.x)

    offset.set(7)
    const atEnd = getCaretPositions(renderer.lastTree, renderer.lastLayout)
    expect(atEnd).toHaveLength(1)
    expect(atEnd[0]!.x).toBeGreaterThan(atMiddle[0]!.x)

    app.destroy()
  })
})
