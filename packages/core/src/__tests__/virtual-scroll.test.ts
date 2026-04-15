import { describe, it, expect } from 'vitest'
import { inclusiveEndIndex, syncVirtualWindow } from '../virtual-scroll.js'

describe('inclusiveEndIndex', () => {
  it('returns maxIndex when start + safeWindow - 1 overflows to non-finite (IEEE sum; mirrors inclusive rect edges)', () => {
    const maxIndex = 7
    const start = Number.MAX_VALUE
    const safeWindow = Number.MAX_VALUE
    expect(Number.isFinite(start + safeWindow - 1)).toBe(false)
    expect(inclusiveEndIndex(start, maxIndex, safeWindow)).toBe(maxIndex)
  })

  it('returns maxIndex when 1e308-scale operands make spanEnd +Infinity (distinct magnitudes from MAX_VALUE pair)', () => {
    const maxIndex = 12
    const start = 1e308
    const safeWindow = 1e308
    expect(1e308 + 1e308).toBe(Infinity)
    expect(Number.isFinite(start + safeWindow - 1)).toBe(false)
    expect(inclusiveEndIndex(start, maxIndex, safeWindow)).toBe(maxIndex)
  })

  it('returns Math.min(maxIndex, spanEnd) when the span sum stays finite', () => {
    expect(inclusiveEndIndex(2, 99, 5)).toBe(6)
    expect(inclusiveEndIndex(0, 4, 100)).toBe(4)
  })

  it('window of 1 yields end === start when spanEnd stays finite (single visible row; syncVirtualWindow uses window ≥ 1)', () => {
    expect(inclusiveEndIndex(7, 99, 1)).toBe(7)
    expect(inclusiveEndIndex(0, 0, 1)).toBe(0)
    expect(inclusiveEndIndex(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 1, 1)).toBe(Number.MAX_SAFE_INTEGER - 1)
  })

  it('returns maxIndex when spanEnd is -Infinity (e.g. -Infinity start; same non-finite guard as +Infinity overflow)', () => {
    const maxIndex = 12
    expect(Number.isFinite(-Infinity + 5 - 1)).toBe(false)
    expect(inclusiveEndIndex(-Infinity, maxIndex, 5)).toBe(maxIndex)
  })

  it('returns maxIndex when start is +Infinity (finite safeWindow still yields non-finite spanEnd)', () => {
    const maxIndex = 9
    expect(Number.isFinite(Number.POSITIVE_INFINITY + 5 - 1)).toBe(false)
    expect(inclusiveEndIndex(Number.POSITIVE_INFINITY, maxIndex, 5)).toBe(maxIndex)
  })

  it('returns maxIndex when any argument makes spanEnd NaN (NaN start/window poison the sum)', () => {
    expect(inclusiveEndIndex(Number.NaN, 9, 4)).toBe(9)
    expect(inclusiveEndIndex(2, 9, Number.NaN)).toBe(9)
  })

  it('returns 0 when spanEnd is non-finite and maxIndex is also non-finite (no NaN window end)', () => {
    expect(inclusiveEndIndex(Number.NaN, Number.NaN, 4)).toBe(0)
    expect(inclusiveEndIndex(Number.POSITIVE_INFINITY, Number.NaN, 4)).toBe(0)
  })

  it('returns finite spanEnd when maxIndex is non-finite but spanEnd is finite (Math.min would yield NaN or -Infinity)', () => {
    expect(inclusiveEndIndex(0, Number.NaN, 5)).toBe(4)
    expect(inclusiveEndIndex(2, Number.NEGATIVE_INFINITY, 4)).toBe(5)
    expect(Number.isFinite(inclusiveEndIndex(0, Number.NaN, 5))).toBe(true)
  })

  it('returns finite spanEnd when maxIndex is +Infinity (corrupt cap; same non-finite maxIndex branch as NaN)', () => {
    expect(inclusiveEndIndex(0, Number.POSITIVE_INFINITY, 5)).toBe(4)
    expect(inclusiveEndIndex(3, Number.POSITIVE_INFINITY, 4)).toBe(6)
    expect(Number.isFinite(inclusiveEndIndex(0, Number.POSITIVE_INFINITY, 5))).toBe(true)
  })

  it('allows a negative inclusive end when safeWindow is 0 and spanEnd stays finite (callers should pass window ≥ 1)', () => {
    // start 0, window 0 → spanEnd = -1; Math.min(maxIndex, -1) is negative — distinct from syncVirtualWindow (always floors window to ≥ 1).
    expect(inclusiveEndIndex(0, 100, 0)).toBe(-1)
  })

  it('allows a negative inclusive end when safeWindow is negative but spanEnd stays finite (direct callers; syncVirtualWindow never passes window < 1)', () => {
    // 0 + (-5) - 1 = -6; Math.min(100, -6) stays negative — documents behavior for corrupt / mistaken window args.
    expect(inclusiveEndIndex(0, 100, -5)).toBe(-6)
    // 1 + (-1) - 1 = -1; Math.min(20, -1) = -1 (distinct from safeWindow 0, which yields spanEnd -1 only when start is 0).
    expect(inclusiveEndIndex(1, 20, -1)).toBe(-1)
  })

  it('clamps a finite negative maxIndex to 0 before min(spanEnd) so corrupt caps cannot yield a negative end when spanEnd is positive', () => {
    // spanEnd 4 and 5 stay positive; without clamping, Math.min(-3, 4) / Math.min(-1, 5) would be negative.
    expect(inclusiveEndIndex(0, -3, 5)).toBe(0)
    expect(inclusiveEndIndex(2, -1, 4)).toBe(0)
  })
})

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

  it('treats IEEE negative zero totalRows like zero rows (finite signed zero; same empty list as +0)', () => {
    expect(syncVirtualWindow(-0, 5, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(-0, 5, 0, 0)).toEqual(syncVirtualWindow(0, 5, 0, 0))
  })

  it('clamps IEEE negative zero windowSize below 1 to a single visible row (matches +0)', () => {
    expect(syncVirtualWindow(5, -0, 2, 0)).toEqual(syncVirtualWindow(5, 0, 2, 0))
    expect(syncVirtualWindow(5, -0, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
  })

  it('floors IEEE negative zero selected and currentStart like +0 (whole row indices)', () => {
    expect(syncVirtualWindow(10, 3, -0, -0)).toEqual(syncVirtualWindow(10, 3, 0, 0))
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

  it('keeps start/end/selected aligned at Number.MAX_SAFE_INTEGER list scale (window 1; last row visible)', () => {
    const last = Number.MAX_SAFE_INTEGER - 1
    const r = syncVirtualWindow(Number.MAX_SAFE_INTEGER, 1, last, last)
    expect(r.selected).toBe(last)
    expect(r.start).toBe(last)
    expect(r.end).toBe(last)
    expect(r.end - r.start + 1).toBe(1)
  })

  it('stays finite when totalRows and windowSize are both ~1e308 (IEEE-scale virtual lists)', () => {
    // Guards against NaN/Inf window indices when host state uses scientific-magnitude counts (still finite doubles).
    const r = syncVirtualWindow(1e308, 1e308, 5e307, 5e307)
    expect(Number.isFinite(r.start)).toBe(true)
    expect(Number.isFinite(r.end)).toBe(true)
    expect(Number.isFinite(r.selected)).toBe(true)
    expect(r.selected).toBe(5e307)
    expect(r.start).toBe(0)
    expect(r.end).toBe(1e308)
  })

  it('returns only finite start/end/selected for a grid of representative magnitudes (overflow / sanitizer invariant)', () => {
    const vals = [0, -2, 0.9, 4.9, 99.2, 8000.1]
    for (const totalRows of vals) {
      for (const windowSize of vals) {
        for (const selected of vals) {
          for (const currentStart of vals) {
            const r = syncVirtualWindow(totalRows, windowSize, selected, currentStart)
            expect(Number.isFinite(r.start)).toBe(true)
            expect(Number.isFinite(r.end)).toBe(true)
            expect(Number.isFinite(r.selected)).toBe(true)
          }
        }
      }
    }
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
