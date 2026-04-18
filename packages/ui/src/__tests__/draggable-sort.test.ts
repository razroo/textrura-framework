import { describe, it, expect } from 'vitest'
import type { KeyboardHitEvent, PointerSample } from '../../../core/src/index.js'
import { draggableSort } from '../index.js'

function keyEvent(key: string): KeyboardHitEvent {
  return {
    key,
    code: key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: { x: 0, y: 0, width: 0, height: 0, children: [] },
  }
}

function pointer(id: number, x: number, y: number, timestampMs: number): PointerSample {
  return { id, x, y, timestampMs }
}

describe('draggableSort', () => {
  it('exposes initial order as a live signal', () => {
    const list = draggableSort({
      items: ['a', 'b', 'c'],
      itemHeight: 40,
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
    })
    expect(list.order.peek()).toEqual(['a', 'b', 'c'])
    expect(list.draggingIndex.peek()).toBe(null)
  })

  it('move/moveUp/moveDown reorder without any pointer input', () => {
    const events: Array<{ from: number; to: number; next: string[] }> = []
    const list = draggableSort({
      items: ['a', 'b', 'c', 'd'],
      itemHeight: 40,
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      onReorder: (from, to, next) => events.push({ from, to, next: next as string[] }),
    })
    list.moveDown(0)
    expect(list.order.peek()).toEqual(['b', 'a', 'c', 'd'])
    list.moveUp(2)
    expect(list.order.peek()).toEqual(['b', 'c', 'a', 'd'])
    list.move(3, 0)
    expect(list.order.peek()).toEqual(['d', 'b', 'c', 'a'])
    expect(events).toEqual([
      { from: 0, to: 1, next: ['b', 'a', 'c', 'd'] },
      { from: 2, to: 1, next: ['b', 'c', 'a', 'd'] },
      { from: 3, to: 0, next: ['d', 'b', 'c', 'a'] },
    ])
  })

  it('move at edges is a no-op and does not fire onReorder', () => {
    const events: number[] = []
    const list = draggableSort({
      items: ['a', 'b', 'c'],
      itemHeight: 40,
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      onReorder: (from) => events.push(from),
    })
    list.moveUp(0) // already at top
    list.moveDown(2) // already at bottom
    expect(list.order.peek()).toEqual(['a', 'b', 'c'])
    expect(events).toEqual([])
  })

  it('each row carries an onClick that latches pendingIndex, and the pan recognizer picks it up', () => {
    const list = draggableSort({
      items: ['a', 'b', 'c', 'd'],
      itemHeight: 40,
      minDragDistance: 0,
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
    })
    const view = list.view() as { children: Array<{ handlers: { onClick: () => void } }> }
    // Simulate a pointerdown on row 0 dispatching that row's onClick (the
    // renderer dispatches onClick on pointerdown — see renderer.ts).
    view.children[0]!.handlers.onClick()

    const [pan] = list.recognizers
    pan!.pointerDown(pointer(1, 10, 10, 0))
    // First move crosses minDistance; pan recognizer fires onStart and
    // captures the pending index. onMove does NOT fire on this same sample
    // (matching PanRecognizer semantics), so a second move is needed to
    // actually drive the reorder.
    pan!.pointerMove(pointer(1, 10, 11, 10))
    expect(list.draggingIndex.peek()).toBe(0)
    pan!.pointerMove(pointer(1, 10, 90, 50)) // +80 px down from the start = 2 slots
    expect(list.draggingIndex.peek()).toBe(2)
    expect(list.order.peek()).toEqual(['b', 'c', 'a', 'd'])
    pan!.pointerUp(pointer(1, 10, 90, 80))
    expect(list.draggingIndex.peek()).toBe(null)
    expect(list.order.peek()).toEqual(['b', 'c', 'a', 'd'])
  })

  it('pan without a preceding click latch is a no-op (no row reorders)', () => {
    const list = draggableSort({
      items: ['a', 'b', 'c'],
      itemHeight: 40,
      minDragDistance: 0,
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
    })
    const [pan] = list.recognizers
    pan!.pointerDown(pointer(1, 10, 10, 0))
    pan!.pointerMove(pointer(1, 10, 100, 50))
    pan!.pointerUp(pointer(1, 10, 100, 80))
    expect(list.order.peek()).toEqual(['a', 'b', 'c'])
    expect(list.draggingIndex.peek()).toBe(null)
  })

  it('pointerCancel clears the drag without committing', () => {
    const list = draggableSort({
      items: ['a', 'b', 'c'],
      itemHeight: 40,
      minDragDistance: 0,
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
    })
    const view = list.view() as { children: Array<{ handlers: { onClick: () => void } }> }
    view.children[0]!.handlers.onClick()
    const [pan] = list.recognizers
    pan!.pointerDown(pointer(1, 10, 10, 0))
    pan!.pointerMove(pointer(1, 10, 11, 10)) // onStart latch
    pan!.pointerMove(pointer(1, 10, 90, 50)) // onMove reorders
    expect(list.draggingIndex.peek()).toBe(2)
    pan!.pointerCancel(1)
    expect(list.draggingIndex.peek()).toBe(null)
    // Note: interim reorder is NOT rolled back — once moved, the order stays.
    // Undo is a caller concern; the gesture guarantee is "you see the live
    // reorder as you drag."
  })

  it('keyboard: ArrowDown moves focused row down; Home/End jump to edges', () => {
    const list = draggableSort({
      items: ['a', 'b', 'c', 'd'],
      itemHeight: 40,
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
    })
    const view = list.view() as { children: Array<{ handlers: { onKeyDown: (e: KeyboardHitEvent) => void } }> }
    view.children[0]!.handlers.onKeyDown(keyEvent('ArrowDown'))
    expect(list.order.peek()).toEqual(['b', 'a', 'c', 'd'])
    // `a` is now at index 1; call its new row's handler.
    const v2 = list.view() as { children: Array<{ handlers: { onKeyDown: (e: KeyboardHitEvent) => void } }> }
    v2.children[1]!.handlers.onKeyDown(keyEvent('End'))
    expect(list.order.peek()).toEqual(['b', 'c', 'd', 'a'])
    const v3 = list.view() as { children: Array<{ handlers: { onKeyDown: (e: KeyboardHitEvent) => void } }> }
    v3.children[3]!.handlers.onKeyDown(keyEvent('Home'))
    expect(list.order.peek()).toEqual(['a', 'b', 'c', 'd'])
  })
})
