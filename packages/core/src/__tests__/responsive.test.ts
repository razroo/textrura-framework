import { describe, it, expect } from 'vitest'
import { createViewport, breakpoint, responsive, defaultBreakpoints } from '../responsive.js'
import { signal } from '../signals.js'

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
