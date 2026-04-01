import { describe, it, expect } from 'vitest'
import { syncVirtualWindow } from '../virtual-scroll.js'

describe('syncVirtualWindow', () => {
  it('keeps selection visible while moving down rapidly', () => {
    let start = 0
    for (let selected = 0; selected < 500; selected++) {
      const next = syncVirtualWindow(2000, 12, selected, start)
      start = next.start
      expect(next.selected).toBe(selected)
      expect(next.selected >= next.start && next.selected <= next.end).toBe(true)
    }
  })

  it('keeps selection visible while moving up rapidly', () => {
    let start = 1988
    for (let selected = 1999; selected >= 0; selected -= 3) {
      const next = syncVirtualWindow(2000, 12, selected, start)
      start = next.start
      expect(next.selected).toBe(selected)
      expect(next.selected >= next.start && next.selected <= next.end).toBe(true)
    }
  })

  it('empty list: clamps selection and window to zero extent', () => {
    expect(syncVirtualWindow(0, 10, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(0, 10, 5, 99)).toEqual({ start: 0, end: 0, selected: 0 })
  })

  it('clamps negative totalRows to zero rows', () => {
    expect(syncVirtualWindow(-3, 5, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
  })

  it('clamps windowSize below 1 to a single visible row', () => {
    expect(syncVirtualWindow(5, 0, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(syncVirtualWindow(5, -2, 4, 0)).toEqual({ start: 4, end: 4, selected: 4 })
  })

  it('clamps selected below zero and above last index', () => {
    expect(syncVirtualWindow(8, 3, -10, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 999, 0)).toEqual({ start: 5, end: 7, selected: 7 })
  })

  it('clamps currentStart into valid range then aligns to selection', () => {
    // total 10, window 4 → maxStart 6; bogus currentStart 100 becomes 6, then selection 1 pulls window up
    expect(syncVirtualWindow(10, 4, 1, 100)).toEqual({ start: 1, end: 4, selected: 1 })
    expect(syncVirtualWindow(10, 4, 8, -50)).toEqual({ start: 5, end: 8, selected: 8 })
  })

  it('single row list always spans index 0', () => {
    expect(syncVirtualWindow(1, 5, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
  })

  it('window larger than total rows shows the full list', () => {
    expect(syncVirtualWindow(5, 10, 2, 0)).toEqual({ start: 0, end: 4, selected: 2 })
    expect(syncVirtualWindow(3, 100, 1, 50)).toEqual({ start: 0, end: 2, selected: 1 })
  })

  it('window larger than total rows still scrolls start when currentStart is clamped then selection moves', () => {
    // maxStart is 0 so currentStart is ignored; selection at last row stays visible
    expect(syncVirtualWindow(4, 20, 3, 0)).toEqual({ start: 0, end: 3, selected: 3 })
  })
})
