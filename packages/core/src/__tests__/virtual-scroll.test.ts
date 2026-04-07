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

  it('floors fractional windowSize so start/end stay whole row indices (matches integer window semantics)', () => {
    expect(syncVirtualWindow(10, 2.9, 5, 0)).toEqual(syncVirtualWindow(10, 2, 5, 0))
    expect(syncVirtualWindow(8, 1.25, 3, 0)).toEqual(syncVirtualWindow(8, 1, 3, 0))
    const r = syncVirtualWindow(20, 3.99, 11, 0)
    expect(Number.isInteger(r.start)).toBe(true)
    expect(Number.isInteger(r.end)).toBe(true)
    expect(r.end - r.start).toBeLessThanOrEqual(3)
  })

  it('floors fractional totalRows, selected, and currentStart to whole row indices', () => {
    // 4.9 rows → 4 rows (indices 0..3); selection 3.9 floors to 3
    expect(syncVirtualWindow(4.9, 2, 3.9, 0)).toEqual({ start: 2, end: 3, selected: 3 })
    // Same as integer 4-row list with selected 3
    expect(syncVirtualWindow(4.9, 2, 3.9, 0)).toEqual(syncVirtualWindow(4, 2, 3, 0))
    // currentStart 1.9 floors to 1 before clamp/scroll
    expect(syncVirtualWindow(10, 3, 5, 1.9)).toEqual(syncVirtualWindow(10, 3, 5, 1))
    const r = syncVirtualWindow(6.2, 4, 2.7, 0.25)
    expect(Number.isInteger(r.start)).toBe(true)
    expect(Number.isInteger(r.end)).toBe(true)
    expect(Number.isInteger(r.selected)).toBe(true)
    expect(r.selected).toBe(2)
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

  it('treats non-finite numeric inputs as safe defaults so state never propagates NaN', () => {
    expect(syncVirtualWindow(Number.NaN, 5, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    // windowSize NaN → visible height 1; window scrolls so selected row 2 is the sole visible row
    expect(syncVirtualWindow(8, Number.NaN, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, 3, Number.NaN, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    // ±Infinity on selected uses the same finiteOr fallback as NaN (not confused with a large index)
    expect(syncVirtualWindow(8, 3, Number.POSITIVE_INFINITY, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, Number.NEGATIVE_INFINITY, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, Number.POSITIVE_INFINITY)).toEqual({ start: 0, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, 3, 2, Number.NEGATIVE_INFINITY)).toEqual({ start: 0, end: 2, selected: 2 })
  })

  it('treats non-finite totalRows as zero rows (empty list semantics)', () => {
    expect(syncVirtualWindow(Number.POSITIVE_INFINITY, 5, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(Number.NEGATIVE_INFINITY, 5, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
  })

  it('treats non-finite windowSize as a single visible row', () => {
    expect(syncVirtualWindow(8, Number.POSITIVE_INFINITY, 3, 0)).toEqual({ start: 3, end: 3, selected: 3 })
    expect(syncVirtualWindow(8, Number.NEGATIVE_INFINITY, 1, 0)).toEqual({ start: 1, end: 1, selected: 1 })
  })

  it('treats non-number arguments as non-finite (defensive against bad serialized props)', () => {
    // typeof + Number.isFinite: strings, BigInt, and objects never count as finite numbers.
    expect(syncVirtualWindow('10' as unknown as number, 3, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, '3' as unknown as number, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, 3, '2' as unknown as number, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, '1' as unknown as number)).toEqual({ start: 0, end: 2, selected: 2 })
    expect(syncVirtualWindow({} as unknown as number, 5, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, null as unknown as number)).toEqual({ start: 0, end: 2, selected: 2 })
  })

  it('treats explicit undefined on any axis like a non-number (optional-arg / loose calls)', () => {
    expect(syncVirtualWindow(undefined as unknown as number, 5, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, undefined as unknown as number, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, 3, undefined as unknown as number, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, undefined as unknown as number)).toEqual({ start: 0, end: 2, selected: 2 })
  })

  it('treats BigInt arguments like non-numbers on every axis (aligned with layoutBoundsAreFinite)', () => {
    const z = 0n as unknown as number
    expect(syncVirtualWindow(z, 3, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, z, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, 3, z, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, z)).toEqual({ start: 0, end: 2, selected: 2 })
  })

  it('treats boxed Number objects like non-numbers on every axis (typeof guard; no ToNumber coercion)', () => {
    const five = Object(5) as unknown as number
    expect(syncVirtualWindow(five, 3, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, five, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, 3, five, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, five)).toEqual({ start: 0, end: 2, selected: 2 })
  })

  it('returns finite start and end when window size is an extreme finite float (no NaN window indices)', () => {
    const r = syncVirtualWindow(1000, Number.MAX_VALUE, 500, 0)
    expect(Number.isFinite(r.start)).toBe(true)
    expect(Number.isFinite(r.end)).toBe(true)
    expect(r.selected).toBe(500)
    expect(r.start).toBe(0)
    expect(r.end).toBe(999)
  })

  it('when the window is larger than the list, the inclusive visible span still covers at most totalRows indices', () => {
    const r = syncVirtualWindow(5, 12, 2, 0)
    expect(r.end - r.start + 1).toBeLessThanOrEqual(5)
    expect(r.selected).toBe(2)
  })

  it('at IEEE extremes with window smaller than total, keeps start + safeWindow within the floored row budget', () => {
    const total = 1e308
    const windowSize = 9e307
    const safeTotal = Math.max(0, Math.floor(total))
    const safeWindow = Math.max(1, Math.floor(windowSize))
    expect(safeTotal).toBeGreaterThanOrEqual(safeWindow)
    const r = syncVirtualWindow(total, windowSize, 4e307, 4e307)
    expect(Number.isFinite(r.start)).toBe(true)
    expect(Number.isFinite(r.end)).toBe(true)
    expect(r.start + safeWindow).toBeLessThanOrEqual(safeTotal)
  })

  it(
    'keeps selection inside the visible window and bounds visible span for a grid of small inputs',
    () => {
      for (let total = 0; total <= 12; total++) {
        for (let windowSize = 1; windowSize <= 15; windowSize++) {
          for (let selected = 0; selected <= 15; selected++) {
            for (let currentStart = 0; currentStart <= 15; currentStart++) {
              const r = syncVirtualWindow(total, windowSize, selected, currentStart)
              if (total <= 0) {
                expect(r).toEqual({ start: 0, end: 0, selected: 0 })
                continue
              }
              const maxIndex = total - 1
              const cap = Math.max(1, windowSize)
              expect(r.selected).toBeGreaterThanOrEqual(0)
              expect(r.selected).toBeLessThanOrEqual(maxIndex)
              expect(r.start).toBeGreaterThanOrEqual(0)
              expect(r.end).toBeLessThanOrEqual(maxIndex)
              expect(r.selected).toBeGreaterThanOrEqual(r.start)
              expect(r.selected).toBeLessThanOrEqual(r.end)
              expect(r.end - r.start + 1).toBeLessThanOrEqual(Math.min(cap, total))
            }
          }
        }
      }
    },
    30_000,
  )
})
