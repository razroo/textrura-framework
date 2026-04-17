import { describe, it, expect } from 'vitest'
import type { KeyboardHitEvent, PointerSample } from '../../../core/src/index.js'
import { swipeableList } from '../index.js'

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

function sample(id: number, x: number, y: number, timestampMs: number): PointerSample {
  return { id, x, y, timestampMs }
}

describe('swipeableList', () => {
  it('renders a track sized for every item and offsets by currentIndex', () => {
    const list = swipeableList({
      items: ['a', 'b', 'c'],
      renderItem: (item) => ({ kind: 'text', text: item, font: '14px ui', lineHeight: 18 } as never),
      width: 100,
      height: 50,
    })

    const view = list.view()
    expect(view.kind).toBe('box')
    expect((view as { props: { width: number; height: number; overflow: string } }).props)
      .toMatchObject({ width: 100, height: 50, overflow: 'hidden' })

    const track = (view as { children: Array<{ props: { width: number; left: number } }> }).children[0]!
    expect(track.props.width).toBe(300)
    expect(track.props.left).toBe(0)

    list.goTo(2)
    const shifted = (list.view() as { children: Array<{ props: { left: number } }> }).children[0]!
    expect(shifted.props.left).toBe(-200)
  })

  it('clamps goTo to [0, items.length - 1] and dedupes identical indices', () => {
    const events: number[] = []
    const list = swipeableList({
      items: ['a', 'b', 'c'],
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      width: 100,
      onIndexChange: i => events.push(i),
    })
    list.goTo(10)
    list.goTo(10) // same index, no duplicate event
    list.goTo(-5)
    expect(events).toEqual([2, 0])
    expect(list.currentIndex.peek()).toBe(0)
  })

  it('next/prev step by one within bounds', () => {
    const list = swipeableList({
      items: ['a', 'b', 'c'],
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      width: 100,
    })
    list.next()
    expect(list.currentIndex.peek()).toBe(1)
    list.next()
    list.next() // clamped
    expect(list.currentIndex.peek()).toBe(2)
    list.prev()
    expect(list.currentIndex.peek()).toBe(1)
  })

  it('pan past half an item width snaps to the next item', () => {
    const list = swipeableList({
      items: ['a', 'b', 'c'],
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      width: 100,
      minDragDistance: 0,
      flickVelocity: Infinity, // disable flick boost so we isolate snap behavior
    })
    const [pan] = list.recognizers
    pan!.pointerDown(sample(1, 200, 10, 0))
    pan!.pointerMove(sample(1, 140, 10, 500)) // dragged 60px left → snap forward
    pan!.pointerUp(sample(1, 140, 10, 600))
    expect(list.currentIndex.peek()).toBe(1)
  })

  it('fast flick advances one item even with a short drag', () => {
    const list = swipeableList({
      items: ['a', 'b', 'c'],
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      width: 100,
      minDragDistance: 0,
      flickVelocity: 0.2,
    })
    const [pan] = list.recognizers
    pan!.pointerDown(sample(1, 200, 10, 0))
    pan!.pointerMove(sample(1, 180, 10, 5)) // 20px in 5ms = 4 px/ms, well above flick threshold
    pan!.pointerUp(sample(1, 180, 10, 10))
    expect(list.currentIndex.peek()).toBe(1)
  })

  it('keyboard: arrow/PageUp/Down step by one; Home/End jump to edges', () => {
    const list = swipeableList({
      items: ['a', 'b', 'c', 'd'],
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      width: 100,
    })
    const container = list.view() as { handlers: { onKeyDown: (e: KeyboardHitEvent) => void } }
    expect(container.handlers?.onKeyDown).toBeTypeOf('function')

    container.handlers.onKeyDown(keyEvent('ArrowRight'))
    expect(list.currentIndex.peek()).toBe(1)
    container.handlers.onKeyDown(keyEvent('PageDown'))
    expect(list.currentIndex.peek()).toBe(2)
    container.handlers.onKeyDown(keyEvent('ArrowLeft'))
    expect(list.currentIndex.peek()).toBe(1)
    container.handlers.onKeyDown(keyEvent('PageUp'))
    expect(list.currentIndex.peek()).toBe(0)
    container.handlers.onKeyDown(keyEvent('End'))
    expect(list.currentIndex.peek()).toBe(3)
    container.handlers.onKeyDown(keyEvent('Home'))
    expect(list.currentIndex.peek()).toBe(0)
  })

  it('keyboard: unrelated keys are ignored', () => {
    const list = swipeableList({
      items: ['a', 'b', 'c'],
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      width: 100,
    })
    const container = list.view() as { handlers: { onKeyDown: (e: KeyboardHitEvent) => void } }
    container.handlers.onKeyDown(keyEvent('Enter'))
    container.handlers.onKeyDown(keyEvent('a'))
    expect(list.currentIndex.peek()).toBe(0)
  })

  it('pointerCancel resets drag offset without committing', () => {
    const list = swipeableList({
      items: ['a', 'b', 'c'],
      renderItem: () => ({ kind: 'text', text: '', font: '14px ui', lineHeight: 18 } as never),
      width: 100,
      minDragDistance: 0,
    })
    const [pan] = list.recognizers
    pan!.pointerDown(sample(1, 200, 10, 0))
    pan!.pointerMove(sample(1, 80, 10, 100)) // drag far left
    pan!.pointerCancel(1)
    expect(list.currentIndex.peek()).toBe(0)
  })
})
