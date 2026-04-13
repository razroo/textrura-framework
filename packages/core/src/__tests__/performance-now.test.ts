import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPerformanceNow, safePerformanceNowMs } from '../performance-now.js'

/** Temporarily replace `globalThis.performance` with a getter that throws (outer try/catch in SUT). */
function withHostilePerformanceGetter(run: () => void): void {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'performance')
  try {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      get() {
        throw new Error('hostile performance')
      },
    })
    run()
  } finally {
    if (prev) {
      Object.defineProperty(globalThis, 'performance', prev)
    } else {
      Reflect.deleteProperty(globalThis, 'performance')
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('safePerformanceNowMs', () => {
  it('returns finite primitive numbers from performance.now()', () => {
    vi.stubGlobal('performance', { now: () => 12.5 })
    expect(safePerformanceNowMs()).toBe(12.5)
  })

  it('maps NaN and non-finite now() results to 0', () => {
    vi.stubGlobal('performance', { now: () => Number.NaN })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => Number.POSITIVE_INFINITY })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => Number.NEGATIVE_INFINITY })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('preserves IEEE −0 when now() returns primitive −0', () => {
    vi.stubGlobal('performance', { now: () => -0 })
    const t = safePerformanceNowMs()
    expect(Object.is(t, -0)).toBe(true)
  })

  it('returns 0 when performance or now is missing', () => {
    // @ts-expect-error — exercise partial global
    vi.stubGlobal('performance', {})
    expect(safePerformanceNowMs()).toBe(0)
    // @ts-expect-error — hostile environment
    vi.stubGlobal('performance', { now: 'nope' })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when performance.now throws', () => {
    vi.stubGlobal('performance', {
      now: () => {
        throw new Error('clock')
      },
    })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when reading performance.now throws (hostile accessor before typeof/call)', () => {
    vi.stubGlobal('performance', {
      get now() {
        throw new Error('hostile')
      },
    })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now() returns a non-primitive number (boxed Number)', () => {
    vi.stubGlobal('performance', { now: () => Object(3.14) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now() returns bigint or string (typeof must be number; no ToNumber coercion)', () => {
    vi.stubGlobal('performance', { now: () => 1n as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => '12.5' as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now() returns null or undefined (typeof null is object; no loose equality to number)', () => {
    vi.stubGlobal('performance', { now: () => null as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => undefined as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when globalThis.performance is undefined', () => {
    // @ts-expect-error — simulate host without Performance API
    vi.stubGlobal('performance', undefined)
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when accessing globalThis.performance throws (hostile accessor)', () => {
    withHostilePerformanceGetter(() => {
      expect(safePerformanceNowMs()).toBe(0)
    })
  })
})

describe('readPerformanceNow', () => {
  it('returns primitive numbers as-is, including NaN and ±Infinity', () => {
    vi.stubGlobal('performance', { now: () => Number.NaN })
    expect(Number.isNaN(readPerformanceNow())).toBe(true)
    vi.stubGlobal('performance', { now: () => Number.POSITIVE_INFINITY })
    expect(readPerformanceNow()).toBe(Number.POSITIVE_INFINITY)
    vi.stubGlobal('performance', { now: () => Number.NEGATIVE_INFINITY })
    expect(readPerformanceNow()).toBe(Number.NEGATIVE_INFINITY)
  })

  it('preserves IEEE −0 when now() returns primitive −0 (same as safe path; deltas may care about sign bit)', () => {
    vi.stubGlobal('performance', { now: () => -0 })
    const t = readPerformanceNow()
    expect(Object.is(t, -0)).toBe(true)
  })

  it('maps non-number now() results to 0 without coercion', () => {
    vi.stubGlobal('performance', { now: () => Object(7) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => 1n as unknown as number })
    expect(readPerformanceNow()).toBe(0)
  })

  it('maps null and undefined now() results to 0 (typeof null is object; typeof undefined is undefined)', () => {
    vi.stubGlobal('performance', { now: () => null as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => undefined as unknown as number })
    expect(readPerformanceNow()).toBe(0)
  })

  it('returns 0 when performance is missing, now is not a function, or globalThis.performance is undefined', () => {
    // @ts-expect-error — partial global
    vi.stubGlobal('performance', {})
    expect(readPerformanceNow()).toBe(0)
    // @ts-expect-error — hostile environment
    vi.stubGlobal('performance', { now: 'nope' })
    expect(readPerformanceNow()).toBe(0)
    // @ts-expect-error — simulate host without Performance API
    vi.stubGlobal('performance', undefined)
    expect(readPerformanceNow()).toBe(0)
  })

  it('returns 0 when performance.now throws', () => {
    vi.stubGlobal('performance', {
      now: () => {
        throw new Error('clock')
      },
    })
    expect(readPerformanceNow()).toBe(0)
  })

  it('returns 0 when reading performance.now throws (hostile accessor before typeof/call)', () => {
    vi.stubGlobal('performance', {
      get now() {
        throw new Error('hostile')
      },
    })
    expect(readPerformanceNow()).toBe(0)
  })

  it('returns 0 when accessing globalThis.performance throws (hostile accessor)', () => {
    withHostilePerformanceGetter(() => {
      expect(readPerformanceNow()).toBe(0)
    })
  })
})
