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

  it('clamps a negative finite maxIndex to 0 when spanEnd overflows (parity with finite-span Math.max(0, maxIndex))', () => {
    const start = Number.MAX_VALUE
    const safeWindow = Number.MAX_VALUE
    expect(Number.isFinite(start + safeWindow - 1)).toBe(false)
    expect(inclusiveEndIndex(start, -2, safeWindow)).toBe(0)
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

  it('returns maxIndex when safeWindow is +Infinity (spanEnd overflows; syncVirtualWindow never passes infinite window)', () => {
    expect(Number.isFinite(0 + Number.POSITIVE_INFINITY - 1)).toBe(false)
    expect(inclusiveEndIndex(0, 12, Number.POSITIVE_INFINITY)).toBe(12)
    expect(inclusiveEndIndex(4, 99, Number.POSITIVE_INFINITY)).toBe(99)
    expect(inclusiveEndIndex(0, -3, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('returns maxIndex when safeWindow is -Infinity (non-finite window; isFinitePlainNumber is false before addition)', () => {
    expect(Number.isFinite(Number.NEGATIVE_INFINITY)).toBe(false)
    expect(Number.isFinite(0 + Number.NEGATIVE_INFINITY - 1)).toBe(false)
    expect(inclusiveEndIndex(0, 12, Number.NEGATIVE_INFINITY)).toBe(12)
    expect(inclusiveEndIndex(4, 99, Number.NEGATIVE_INFINITY)).toBe(99)
    expect(inclusiveEndIndex(0, -3, Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('returns maxIndex when any argument makes spanEnd NaN (NaN start/window poison the sum)', () => {
    expect(inclusiveEndIndex(Number.NaN, 9, 4)).toBe(9)
    expect(inclusiveEndIndex(2, 9, Number.NaN)).toBe(9)
  })

  it('rejects bigint start or safeWindow without bigint+number addition (typeof guard; + would throw)', () => {
    expect(() => inclusiveEndIndex(1n as unknown as number, 4, 3)).not.toThrow()
    expect(inclusiveEndIndex(1n as unknown as number, 4, 3)).toBe(4)
    expect(() => inclusiveEndIndex(2, 9, 3n as unknown as number)).not.toThrow()
    expect(inclusiveEndIndex(2, 9, 3n as unknown as number)).toBe(9)
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

  it('allows a negative inclusive end when start is negative enough that spanEnd stays negative while maxIndex is still positive (direct callers)', () => {
    // Distinct from safeWindow ≤ 0: here window is a modest positive count but start pulls the span below zero.
    // -20 + 10 - 1 = -11; Math.min(Math.max(0, 5), -11) = -11.
    expect(inclusiveEndIndex(-20, 5, 10)).toBe(-11)
  })

  it('clamps a finite negative maxIndex to 0 before min(spanEnd) so corrupt caps cannot yield a negative end when spanEnd is positive', () => {
    // spanEnd 4 and 5 stay positive; without clamping, Math.min(-3, 4) / Math.min(-1, 5) would be negative.
    expect(inclusiveEndIndex(0, -3, 5)).toBe(0)
    expect(inclusiveEndIndex(2, -1, 4)).toBe(0)
  })

  it('clamps negative subnormal maxIndex to 0 (IEEE cap slightly below zero; parity with layout-bounds negative subnormals)', () => {
    const negSub = -Number.MIN_VALUE
    expect(negSub).toBeLessThan(0)
    expect(inclusiveEndIndex(0, negSub, 5)).toBe(0)
    expect(inclusiveEndIndex(2, negSub, 4)).toBe(0)
  })

  it('clamps IEEE −0 maxIndex to +0 before Math.min with finite spanEnd (distinct object identity from +0; serializers / float edge cases)', () => {
    const negZero: unknown = -0
    expect(Object.is(negZero, 0)).toBe(false)
    expect(inclusiveEndIndex(0, negZero as number, 5)).toBe(0)
    expect(inclusiveEndIndex(2, negZero as number, 4)).toBe(0)
  })

  it('treats IEEE −0 start like +0 for finite span math (isFinitePlainNumber(−0); parity with layout-bounds signed zero)', () => {
    const negZero: unknown = -0
    expect(Object.is(negZero, 0)).toBe(false)
    // spanEnd = −0 + 4 − 1 = 3; cap 10 → inclusive end 3 (same as start 0).
    expect(inclusiveEndIndex(negZero as number, 10, 4)).toBe(inclusiveEndIndex(0, 10, 4))
    expect(inclusiveEndIndex(negZero as number, 10, 4)).toBe(3)
  })

  it('treats IEEE −0 safeWindow like +0 for spanEnd (0 + (−0) − 1 = −1; direct callers; syncVirtualWindow floors window to ≥ 1)', () => {
    const negZero: unknown = -0
    expect(Object.is(negZero, 0)).toBe(false)
    expect(inclusiveEndIndex(0, 100, negZero as number)).toBe(inclusiveEndIndex(0, 100, 0))
    expect(inclusiveEndIndex(0, 100, negZero as number)).toBe(-1)
  })

  it('direct callers: fractional positive maxIndex passes through Math.max(0, maxIdx) then Math.min with spanEnd (syncVirtualWindow uses integer caps only)', () => {
    // spanEnd = 0 + 5 - 1 = 4; cap 2.7 is below spanEnd
    expect(inclusiveEndIndex(0, 2.7, 5)).toBe(2.7)
    // spanEnd = 2 + 4 - 1 = 5; cap 4.5 limits the inclusive end
    expect(inclusiveEndIndex(2, 4.5, 4)).toBe(4.5)
  })

  it('direct callers: fractional negative maxIndex between -1 and 0 clamps to 0 before Math.min (corrupt non-integer cap)', () => {
    expect(inclusiveEndIndex(0, -0.25, 5)).toBe(0)
    expect(inclusiveEndIndex(2, -0.99, 4)).toBe(0)
  })

  it('does not throw on BigInt or boxed operands; matches NaN / non-number paths (typeof guard before + and Number.isFinite)', () => {
    const z = 0n as unknown as number
    const one = 1n as unknown as number
    expect(() => inclusiveEndIndex(one, 9, 4)).not.toThrow()
    expect(inclusiveEndIndex(one, 9, 4)).toBe(inclusiveEndIndex(Number.NaN, 9, 4))
    expect(() => inclusiveEndIndex(2, 9, one)).not.toThrow()
    expect(inclusiveEndIndex(2, 9, one)).toBe(inclusiveEndIndex(2, 9, Number.NaN))
    expect(() => inclusiveEndIndex(0, one, 5)).not.toThrow()
    expect(inclusiveEndIndex(0, one, 5)).toBe(inclusiveEndIndex(0, Number.NaN, 5))
    expect(() => inclusiveEndIndex(z, 3, 4)).not.toThrow()
    expect(inclusiveEndIndex(z, 3, 4)).toBe(inclusiveEndIndex(Number.NaN, 3, 4))
    const boxed = Object(3) as unknown as number
    expect(() => inclusiveEndIndex(boxed, 5, 4)).not.toThrow()
    expect(inclusiveEndIndex(boxed, 5, 4)).toBe(inclusiveEndIndex(Number.NaN, 5, 4))
  })

  it('treats boxed maxIndex like a non-number cap (typeof guard; finite spanEnd matches NaN maxIndex branch)', () => {
    const boxedMax = Object(9) as unknown as number
    expect(typeof boxedMax === 'number').toBe(false)
    expect(inclusiveEndIndex(0, boxedMax, 5)).toBe(inclusiveEndIndex(0, Number.NaN, 5))
    expect(inclusiveEndIndex(2, boxedMax, 4)).toBe(inclusiveEndIndex(2, Number.NaN, 4))
  })

  it('treats boxed safeWindow like NaN (spanEnd non-finite; same fallback as corrupt window magnitude)', () => {
    const boxedW = Object(5) as unknown as number
    expect(typeof boxedW === 'number').toBe(false)
    expect(inclusiveEndIndex(0, 9, boxedW)).toBe(inclusiveEndIndex(0, 9, Number.NaN))
    expect(inclusiveEndIndex(4, 99, boxedW)).toBe(inclusiveEndIndex(4, 99, Number.NaN))
  })

  it('treats JSON number-as-string operands like non-numbers (typeof guard; no numeric coercion)', () => {
    const strStart = '0' as unknown as number
    const strWindow = '5' as unknown as number
    const strCap = '9' as unknown as number
    expect(typeof strStart === 'number').toBe(false)
    expect(typeof strWindow === 'number').toBe(false)
    expect(typeof strCap === 'number').toBe(false)
    // Span math skipped → non-finite spanEnd; finite maxIndex clamps to the cap (same as corrupt start/window).
    expect(inclusiveEndIndex(strStart, 4, 5)).toBe(4)
    expect(inclusiveEndIndex(0, 4, strWindow)).toBe(4)
    // maxIndex string → absent cap when span is finite; same branch as NaN maxIndex.
    expect(inclusiveEndIndex(0, strCap, 5)).toBe(inclusiveEndIndex(0, Number.NaN, 5))
    expect(inclusiveEndIndex(2, strCap, 4)).toBe(inclusiveEndIndex(2, Number.NaN, 4))
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

  it('floors strictly fractional totalRows in (0, 1) to zero rows (intRowMetric; no visible items until at least one whole row)', () => {
    expect(syncVirtualWindow(Number.EPSILON, 5, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(0.25, 10, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(0.99, 3, 5, 0)).toEqual({ start: 0, end: 0, selected: 0 })
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

  it('floors strictly positive sub-unit windowSize (e.g. EPSILON, 0.25) to 0 then clamps to one visible row', () => {
    const base = syncVirtualWindow(20, 1, 5, 0)
    expect(syncVirtualWindow(20, Number.EPSILON, 5, 0)).toEqual(base)
    expect(syncVirtualWindow(20, 0.25, 5, 0)).toEqual(base)
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

  it('keeps selection aligned at MAX_SAFE_INTEGER row counts with window 1 (large-list index math stays integer-safe)', () => {
    const total = Number.MAX_SAFE_INTEGER
    const last = total - 1
    // Last row selected from window at 0: must scroll so the sole visible row is the last index.
    expect(syncVirtualWindow(total, 1, last, 0)).toEqual({ start: last, end: last, selected: last })
    // First row with viewport parked at the former last index: pull window back without NaN/Infinity indices.
    expect(syncVirtualWindow(total, 1, 0, last)).toEqual({ start: 0, end: 0, selected: 0 })
  })

  it('floors totalRows strictly between MAX_SAFE_INTEGER and MAX_SAFE_INTEGER+1 to MAX_SAFE_INTEGER rows (unsafe integer + fractional; intRowMetric)', () => {
    const between = Number.MAX_SAFE_INTEGER + 0.5
    expect(between).toBeGreaterThan(Number.MAX_SAFE_INTEGER)
    expect(Number.isSafeInteger(between)).toBe(false)
    const totalInt = Number.MAX_SAFE_INTEGER
    const last = totalInt - 1
    // Same row budget and selection as an integer total at MAX_SAFE_INTEGER; guards double-only magnitudes past the safe-integer line.
    expect(syncVirtualWindow(between, 1, last, 0)).toEqual(syncVirtualWindow(totalInt, 1, last, 0))
    const w2 = syncVirtualWindow(between, 2, last, 0)
    expect(w2).toEqual(syncVirtualWindow(totalInt, 2, last, 0))
    expect(w2.selected).toBe(last)
    expect(w2.end).toBe(last)
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

  it('treats currentStart that overflows double range to Infinity like explicit ±Infinity (parity with JSON / corrupt float edges)', () => {
    expect(Number.MAX_VALUE * 2).toBe(Infinity)
    expect(syncVirtualWindow(10, 4, 5, Number.MAX_VALUE * 2)).toEqual(
      syncVirtualWindow(10, 4, 5, Number.POSITIVE_INFINITY),
    )
    expect(syncVirtualWindow(10, 4, 5, Number.MAX_VALUE * 2)).toEqual(syncVirtualWindow(10, 4, 5, 0))
  })

  it('treats non-finite totalRows as zero rows (empty list semantics)', () => {
    expect(syncVirtualWindow(Number.POSITIVE_INFINITY, 5, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(Number.NEGATIVE_INFINITY, 5, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
  })

  it('treats JSON exponent overflow and double overflow as non-finite (parity with layout-bounds / corrupt transport)', () => {
    const posOverflow = Number.parseFloat('1e400')
    const negOverflow = Number.parseFloat('-1e400')
    expect(posOverflow).toBe(Infinity)
    expect(negOverflow).toBe(-Infinity)
    expect(Number.MAX_VALUE * 2).toBe(Infinity)
    // totalRows: any non-finite magnitude → empty list (same as explicit ±Infinity).
    expect(syncVirtualWindow(posOverflow, 5, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(negOverflow, 5, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(Number.MAX_VALUE * 2, 5, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    // windowSize: overflow coerces via finiteOr fallback → visible height 1; selection still valid.
    expect(syncVirtualWindow(8, posOverflow, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, Number.MAX_VALUE * 2, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
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

  it('treats ArrayBuffer, Uint8Array, and plain functions as non-numbers on any axis (typeof not number; embedder mistakes)', () => {
    const buf = new ArrayBuffer(0) as unknown as number
    const u8 = new Uint8Array([3]) as unknown as number
    const fn = (() => 5) as unknown as number
    expect(syncVirtualWindow(buf, 3, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, buf, 2, 0)).toEqual(syncVirtualWindow(8, 1, 2, 0))
    expect(syncVirtualWindow(8, 3, 2, buf)).toEqual({ start: 0, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, u8, 2, 0)).toEqual(syncVirtualWindow(8, 1, 2, 0))
    expect(syncVirtualWindow(8, 3, u8, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(fn, 3, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, fn, 2, 0)).toEqual(syncVirtualWindow(8, 1, 2, 0))
    expect(syncVirtualWindow(8, 3, fn, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, fn)).toEqual({ start: 0, end: 2, selected: 2 })
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
    // Non-zero bigint must not coerce to a row count / index (distinct from 0n looking like “empty”).
    const many = 100n as unknown as number
    expect(syncVirtualWindow(many, 10, 0, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, many, 2, 0)).toEqual(syncVirtualWindow(8, 1, 2, 0))
    expect(syncVirtualWindow(8, 3, many, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, many)).toEqual({ start: 0, end: 2, selected: 2 })
  })

  it('treats Symbol arguments like non-numbers on every axis (parity with layoutBoundsAreFinite / protocol guards)', () => {
    const sym = Symbol('vs') as unknown as number
    expect(() => syncVirtualWindow(sym, 3, 2, 0)).not.toThrow()
    expect(syncVirtualWindow(sym, 3, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(() => syncVirtualWindow(8, sym, 2, 0)).not.toThrow()
    expect(syncVirtualWindow(8, sym, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(() => syncVirtualWindow(8, 3, sym, 0)).not.toThrow()
    expect(syncVirtualWindow(8, 3, sym, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(() => syncVirtualWindow(8, 3, 2, sym)).not.toThrow()
    expect(syncVirtualWindow(8, 3, 2, sym)).toEqual({ start: 0, end: 2, selected: 2 })
  })

  it('treats boxed Number objects like non-numbers on every axis (typeof guard; no ToNumber coercion)', () => {
    const five = Object(5) as unknown as number
    expect(syncVirtualWindow(five, 3, 2, 0)).toEqual({ start: 0, end: 0, selected: 0 })
    expect(syncVirtualWindow(8, five, 2, 0)).toEqual({ start: 2, end: 2, selected: 2 })
    expect(syncVirtualWindow(8, 3, five, 0)).toEqual({ start: 0, end: 2, selected: 0 })
    expect(syncVirtualWindow(8, 3, 2, five)).toEqual({ start: 0, end: 2, selected: 2 })
    // Boxed fractional must not unwrap to 2.7 → floor(2) visible rows; finiteOr fallback is 1 (same as corrupt non-number window).
    const boxedFrac = Object(2.7) as unknown as number
    expect(syncVirtualWindow(8, boxedFrac, 3, 0)).toEqual(syncVirtualWindow(8, 1, 3, 0))
    expect(syncVirtualWindow(8, boxedFrac, 3, 0)).not.toEqual(syncVirtualWindow(8, 2, 3, 0))
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

  it('at MAX_SAFE_INTEGER row count with a modest window, scrolls the window so the last row stays visible (nextSelected > end branch; no overflow in nextSelected − safeWindow + 1)', () => {
    const totalRows = Number.MAX_SAFE_INTEGER
    const windowSize = 100
    const last = totalRows - 1
    const r = syncVirtualWindow(totalRows, windowSize, last, 0)
    expect(r.selected).toBe(last)
    expect(Number.isFinite(r.start)).toBe(true)
    expect(Number.isFinite(r.end)).toBe(true)
    expect(r.start).toBe(last - windowSize + 1)
    expect(r.end).toBe(last)
    expect(r.selected).toBeGreaterThanOrEqual(r.start)
    expect(r.selected).toBeLessThanOrEqual(r.end)
    expect(r.end - r.start + 1).toBe(windowSize)
  })

  it('at MAX_SAFE_INTEGER row count with window 2, pins exactly the last two rows when the last row is selected (safe-integer nextSelected > end path)', () => {
    const totalRows = Number.MAX_SAFE_INTEGER
    const windowSize = 2
    const last = totalRows - 1
    const r = syncVirtualWindow(totalRows, windowSize, last, 0)
    expect(r.selected).toBe(last)
    expect(r.start).toBe(last - 1)
    expect(r.end).toBe(last)
    expect(r.end - r.start + 1).toBe(windowSize)
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
              expect(r.start).toBeLessThanOrEqual(r.end)
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

  it('fractional totalRows matches the same window state as Math.max(0, Math.floor(totalRows)) (intRowMetric parity)', () => {
    const pairs: Array<[number, number]> = [
      [-9.2, 0],
      [-0.25, 0],
      [0.1, 0],
      [0.99, 0],
      [3.2, 3],
      [3.999, 3],
      [12.25, 12],
    ]
    for (const [totalRows, intTotal] of pairs) {
      for (let windowSize = 1; windowSize <= 10; windowSize++) {
        for (let selected = 0; selected <= 18; selected++) {
          for (let currentStart = 0; currentStart <= 18; currentStart++) {
            expect(syncVirtualWindow(totalRows, windowSize, selected, currentStart)).toEqual(
              syncVirtualWindow(intTotal, windowSize, selected, currentStart),
            )
          }
        }
      }
    }
  })
})
