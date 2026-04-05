import { describe, it, expect, beforeEach } from 'vitest'
import { clearFocus } from '../focus.js'
import { signal } from '../signals.js'
import type { KeyboardHitEvent, UIElement } from '../types.js'
import { input as uiInput } from '../../../ui/src/index.js'

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

describe('demo input scenario smoke', () => {
  beforeEach(() => {
    clearFocus()
  })

  it('supports multi-key typing in selected field like marketing demo wiring', () => {
    const inputName = signal('')
    const inputEmail = signal('')
    const inputSearch = signal('')
    const active = signal<'name' | 'email' | 'search' | null>(null)

    function applyInputKey(current: string, key: string): string {
      if (key === 'Backspace') return current.slice(0, -1)
      if (key === 'Delete') return ''
      if (key.length === 1) return current + key
      return current
    }

    function node(
      field: 'name' | 'email' | 'search',
      value: string,
      setValue: (next: string) => void,
    ): UIElement {
      return uiInput(value, field, {
        focused: active.value === field,
        onClick: () => active.set(field),
        onKeyDown: (e) => {
          const next = applyInputKey(value, e.key)
          if (next !== value) setValue(next)
        },
      })
    }

    function render(): { name: UIElement; email: UIElement; search: UIElement } {
      return {
        name: node('name', inputName.value, (next) => inputName.set(next)),
        email: node('email', inputEmail.value, (next) => inputEmail.set(next)),
        search: node('search', inputSearch.value, (next) => inputSearch.set(next)),
      }
    }

    function clickField(field: 'name' | 'email' | 'search'): void {
      const element = render()[field]
      if (element.kind !== 'box') return
      element.handlers?.onClick?.({ x: 0, y: 0, target: {} as KeyboardHitEvent['target'] })
    }

    function typeField(field: 'name' | 'email' | 'search', key: string): void {
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

    clickField('name')
    typeField('name', 'e')
    typeField('name', 'k')

    clickField('email')
    typeField('email', 'a')

    clickField('search')
    typeField('search', 'x')

    expect(inputName.peek()).toBe('ek')
    expect(inputEmail.peek()).toBe('a')
    expect(inputSearch.peek()).toBe('x')
  })

  it('uiInput onSelectAll handles Ctrl+A and Meta+A without calling onKeyDown', () => {
    const order: string[] = []
    const el = uiInput('abc', 'field', {
      focused: true,
      onSelectAll: () => order.push('selectAll'),
      onKeyDown: () => order.push('keyDown'),
    })
    expect(el.kind).toBe('box')

    const base = {
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: {} as KeyboardHitEvent['target'],
    }

    el.handlers?.onKeyDown?.({ ...base, ctrlKey: true })
    expect(order).toEqual(['selectAll'])

    order.length = 0
    el.handlers?.onKeyDown?.({ ...base, key: 'A', metaKey: true })
    expect(order).toEqual(['selectAll'])

    order.length = 0
    el.handlers?.onKeyDown?.({ ...base, ctrlKey: false, metaKey: false })
    expect(order).toEqual(['keyDown'])
  })

  it('uiInput forwards Ctrl+A and Meta+A to onKeyDown when onSelectAll is omitted (custom select-all)', () => {
    const keys: string[] = []
    const el = uiInput('abc', 'field', {
      focused: true,
      onKeyDown: (e) => keys.push(`${e.ctrlKey ? 'ctrl+' : ''}${e.metaKey ? 'meta+' : ''}${e.key}`),
    })
    expect(el.kind).toBe('box')

    const target = {} as KeyboardHitEvent['target']
    el.handlers?.onKeyDown?.({
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      target,
    })
    el.handlers?.onKeyDown?.({
      key: 'A',
      code: 'KeyA',
      shiftKey: true,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      target,
    })

    expect(keys).toEqual(['ctrl+a', 'meta+A'])
  })

  it('disabled uiInput omits pointer and keyboard handlers (no accidental input when non-interactive)', () => {
    let calls = 0
    const el = uiInput('hi', 'field', {
      disabled: true,
      focused: true,
      onClick: () => {
        calls++
      },
      onKeyDown: () => {
        calls++
      },
      onSelectAll: () => {
        calls++
      },
    })
    expect(el.kind).toBe('box')
    expect(el.props.pointerEvents).toBe('none')
    expect(el.handlers?.onClick).toBeUndefined()
    expect(el.handlers?.onKeyDown).toBeUndefined()
    expect(el.handlers?.onCompositionStart).toBeUndefined()
    expect(el.semantic).toEqual({ tag: 'input', ariaDisabled: true })
    expect(calls).toBe(0)
  })
})
