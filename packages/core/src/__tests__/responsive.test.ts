import { describe, it, expect } from 'vitest'
import { createViewport, breakpoint, responsive, defaultBreakpoints } from '../responsive.js'
import { computed, signal } from '../signals.js'

describe('createViewport', () => {
  it('exposes reactive width and height', () => {
    const vp = createViewport(800, 600)
    expect(vp.width.value).toBe(800)
    expect(vp.height.value).toBe(600)
  })

  it('resize updates both dimensions', () => {
    const vp = createViewport(800, 600)
    vp.resize(1024, 768)
    expect(vp.width.value).toBe(1024)
    expect(vp.height.value).toBe(768)
  })
})

describe('breakpoint', () => {
  const bps = { sm: 0, md: 640, lg: 1024 }

  it('returns smallest breakpoint for small width', () => {
    const w = signal(320)
    const bp = breakpoint(w, bps)
    expect(bp.value).toBe('sm')
  })

  it('returns md for mid-range width', () => {
    const w = signal(800)
    const bp = breakpoint(w, bps)
    expect(bp.value).toBe('md')
  })

  it('returns lg for large width', () => {
    const w = signal(1200)
    const bp = breakpoint(w, bps)
    expect(bp.value).toBe('lg')
  })

  it('returns exact boundary breakpoint', () => {
    const w = signal(640)
    const bp = breakpoint(w, bps)
    expect(bp.value).toBe('md')
  })

  it('reacts to signal changes', () => {
    const w = signal(320)
    const bp = breakpoint(w, bps)
    expect(bp.value).toBe('sm')
    w.set(1024)
    expect(bp.value).toBe('lg')
  })

  it('accepts a computed width source (same dependency tracking as a raw signal)', () => {
    const w = signal(1600)
    const half = computed(() => w.value / 2)
    const bp = breakpoint(half, bps)
    expect(bp.value).toBe('md')
    w.set(400)
    expect(bp.value).toBe('sm')
    w.set(2048)
    expect(bp.value).toBe('lg')
  })
})

describe('responsive', () => {
  const bps = { sm: 0, md: 640, lg: 1024 }

  it('maps breakpoint to value', () => {
    const w = signal(800)
    const cols = responsive(w, { sm: 1, md: 2, lg: 3 }, bps)
    expect(cols.value).toBe(2)
  })

  it('reacts to width changes', () => {
    const w = signal(320)
    const cols = responsive(w, { sm: 1, md: 2, lg: 3 }, bps)
    expect(cols.value).toBe(1)
    w.set(1200)
    expect(cols.value).toBe(3)
  })

  it('accepts a computed width source', () => {
    const w = signal(1600)
    const half = computed(() => w.value / 2)
    const cols = responsive(half, { sm: 1, md: 2, lg: 3 }, bps)
    expect(cols.value).toBe(2)
    w.set(400)
    expect(cols.value).toBe(1)
  })
})

describe('defaultBreakpoints', () => {
  it('has expected keys', () => {
    expect(Object.keys(defaultBreakpoints)).toEqual(['sm', 'md', 'lg', 'xl', '2xl'])
  })

  it('values are ascending', () => {
    const values = Object.values(defaultBreakpoints)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!)
    }
  })
})

describe('breakpoint edge cases', () => {
  const bps = { sm: 0, md: 640, lg: 1024 }

  it('treats unsorted breakpoint map keys like a sorted ascending map (internal sort by min-width)', () => {
    const shuffled = { md: 640, lg: 1024, sm: 0 }
    const w = signal(800)
    expect(breakpoint(w, shuffled).value).toBe('md')
    expect(breakpoint(w, bps).value).toBe('md')
  })

  it('when width is below every minimum, returns the fallback (smallest min-width name)', () => {
    const wNeg = signal(-50)
    expect(breakpoint(wNeg, bps).value).toBe('sm')

    const wNan = signal(Number.NaN)
    expect(breakpoint(wNan, bps).value).toBe('sm')
  })

  it('positive infinity width selects the largest breakpoint', () => {
    const w = signal(Number.POSITIVE_INFINITY)
    expect(breakpoint(w, bps).value).toBe('lg')
  })

  it('maps without a zero minimum still yield deterministic fallback for too-small widths', () => {
    const tight = { a: 100, b: 300 }
    const w = signal(50)
    // No min <= 50; fallback is the name tied to the smallest threshold (100 → "a").
    expect(breakpoint(w, tight).value).toBe('a')
  })
})

describe('responsive edge cases', () => {
  const bps = { sm: 0, md: 640, lg: 1024 }

  it('follows breakpoint fallback for NaN width', () => {
    const w = signal(Number.NaN)
    const cols = responsive(w, { sm: 1, md: 2, lg: 3 }, bps)
    expect(cols.value).toBe(1)
  })

  it('resolves to the largest tier when width is positive infinity', () => {
    const w = signal(Number.POSITIVE_INFINITY)
    const cols = responsive(w, { sm: 1, md: 2, lg: 3 }, bps)
    expect(cols.value).toBe(3)
  })

  it('returns undefined when the values map omits the active breakpoint key', () => {
    const w = signal(1200)
    const cols = responsive(
      w,
      { sm: 1, md: 2 } as { sm: number; md: number; lg: number },
      bps,
    )
    expect(cols.value).toBeUndefined()
  })
})

describe('breakpoint duplicate thresholds', () => {
  it('when two names share the same min-width, the earlier name in Object.entries order wins at the boundary', () => {
    const bps = { sm: 0, md: 640, altMd: 640 }
    expect(breakpoint(signal(640), bps).value).toBe('md')
    expect(breakpoint(signal(639), bps).value).toBe('sm')
  })
})

describe('breakpoint non-finite min-width', () => {
  it('ignores NaN thresholds for matching so a valid smaller tier still wins', () => {
    const bps = { sm: 0, md: Number.NaN, lg: 1024 }
    expect(breakpoint(signal(800), bps).value).toBe('sm')
  })

  it('does not let Object.entries order flip the result when NaN sits beside a real tier', () => {
    const w = signal(800)
    const mdFirst = { md: Number.NaN, lg: 1024 }
    const lgFirst = { lg: 1024, md: Number.NaN }
    expect(breakpoint(w, mdFirst).value).toBe('lg')
    expect(breakpoint(w, lgFirst).value).toBe('lg')
  })
})

describe('createViewport edge cases', () => {
  it('coerces non-finite initial dimensions to zero (parity with layout / hit-test guards)', () => {
    const vp = createViewport(Number.NaN, Number.POSITIVE_INFINITY)
    expect(vp.width.value).toBe(0)
    expect(vp.height.value).toBe(0)
    const bps = { sm: 0, md: 640, lg: 1024 }
    expect(breakpoint(vp.width, bps).value).toBe('sm')
    expect(breakpoint(signal(Number.NEGATIVE_INFINITY), bps).value).toBe('sm')
  })

  it('coerces non-finite resize arguments to zero without throwing', () => {
    const vp = createViewport(800, 600)
    vp.resize(Number.NaN, Number.POSITIVE_INFINITY)
    expect(vp.width.value).toBe(0)
    expect(vp.height.value).toBe(0)
    vp.resize(400, 300)
    expect(vp.width.value).toBe(400)
    expect(vp.height.value).toBe(300)
  })

  it('preserves IEEE negative zero on init and resize (finiteNumberOrZero parity with layout math)', () => {
    const vp = createViewport(-0, 10)
    expect(Object.is(vp.width.peek(), -0)).toBe(true)
    expect(vp.height.value).toBe(10)
    vp.resize(5, -0)
    expect(vp.width.value).toBe(5)
    expect(Object.is(vp.height.peek(), -0)).toBe(true)
  })
})
