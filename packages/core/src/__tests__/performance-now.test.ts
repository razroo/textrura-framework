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

/** `performance` object whose `now` getter throws — exercises try/catch around `typeof perf.now` probes. */
function hostilePerformanceProxyThrowsOnNow(): object {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'now') throw new Error('proxy now')
        return undefined
      },
    },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('safePerformanceNowMs', () => {
  it('returns finite primitive numbers from performance.now()', () => {
    vi.stubGlobal('performance', { now: () => 12.5 })
    expect(safePerformanceNowMs()).toBe(12.5)
  })

  it('uses inherited or prototype-chain now() implementations (polyfills may not assign own properties)', () => {
    const viaProto = Object.create({ now: () => 11.5 })
    vi.stubGlobal('performance', viaProto)
    expect(safePerformanceNowMs()).toBe(11.5)
    expect(readPerformanceNow()).toBe(11.5)

    class PerfPolyfill {
      now() {
        return 22.25
      }
    }
    vi.stubGlobal('performance', new PerfPolyfill())
    expect(safePerformanceNowMs()).toBe(22.25)
    expect(readPerformanceNow()).toBe(22.25)
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

  it('preserves small positive finite now() values including subnormals (only NaN/±Infinity map to 0)', () => {
    vi.stubGlobal('performance', { now: () => Number.MIN_VALUE })
    expect(safePerformanceNowMs()).toBe(Number.MIN_VALUE)
    vi.stubGlobal('performance', { now: () => Number.EPSILON })
    expect(safePerformanceNowMs()).toBe(Number.EPSILON)
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

  it('returns 0 when now() returns a plain object with valueOf (typeof object; no ToPrimitive coercion)', () => {
    vi.stubGlobal('performance', { now: () => ({ valueOf: () => 12 }) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now() returns bigint or string (typeof must be number; no ToNumber coercion)', () => {
    vi.stubGlobal('performance', { now: () => 1n as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => '12.5' as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now() returns boolean or symbol (typeof not number)', () => {
    vi.stubGlobal('performance', { now: () => true as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => Symbol('t') as unknown as number })
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

  it('returns 0 when globalThis.performance is null or other falsy non-objects (embedder / partial globals)', () => {
    // @ts-expect-error — rare but valid: property exists and is null
    vi.stubGlobal('performance', null)
    expect(safePerformanceNowMs()).toBe(0)
    // @ts-expect-error — pathological; must not throw when probing .now
    vi.stubGlobal('performance', false as unknown as Performance)
    expect(safePerformanceNowMs()).toBe(0)
    // @ts-expect-error — numeric zero is falsy; not a Performance object
    vi.stubGlobal('performance', 0 as unknown as Performance)
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when accessing globalThis.performance throws (hostile accessor)', () => {
    withHostilePerformanceGetter(() => {
      expect(safePerformanceNowMs()).toBe(0)
    })
  })

  it('returns 0 when accessing performance.now throws during the typeof probe (hostile Proxy)', () => {
    vi.stubGlobal('performance', hostilePerformanceProxyThrowsOnNow())
    expect(safePerformanceNowMs()).toBe(0)
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

  it('passes through small positive finite now() values including subnormals (read path does not clamp)', () => {
    vi.stubGlobal('performance', { now: () => Number.MIN_VALUE })
    expect(readPerformanceNow()).toBe(Number.MIN_VALUE)
    vi.stubGlobal('performance', { now: () => Number.EPSILON })
    expect(readPerformanceNow()).toBe(Number.EPSILON)
  })

  it('maps non-number now() results to 0 without coercion', () => {
    vi.stubGlobal('performance', { now: () => Object(7) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => 1n as unknown as number })
    expect(readPerformanceNow()).toBe(0)
  })

  it('maps plain objects with valueOf to 0 (typeof object; no ToPrimitive / numeric coercion)', () => {
    vi.stubGlobal('performance', { now: () => ({ valueOf: () => 12 }) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
  })

  it('maps null and undefined now() results to 0 (typeof null is object; typeof undefined is undefined)', () => {
    vi.stubGlobal('performance', { now: () => null as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => undefined as unknown as number })
    expect(readPerformanceNow()).toBe(0)
  })

  it('maps boolean and symbol now() results to 0 (typeof not number)', () => {
    vi.stubGlobal('performance', { now: () => false as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => Symbol('t') as unknown as number })
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

  it('returns 0 when globalThis.performance is null or other falsy non-objects (same guard as safe path)', () => {
    // @ts-expect-error — stub null to exercise guard
    vi.stubGlobal('performance', null)
    expect(readPerformanceNow()).toBe(0)
    // @ts-expect-error — stub false as falsy non-object
    vi.stubGlobal('performance', false as unknown as Performance)
    expect(readPerformanceNow()).toBe(0)
    // @ts-expect-error — stub 0 as falsy non-object
    vi.stubGlobal('performance', 0 as unknown as Performance)
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

  it('returns 0 when accessing performance.now throws during the typeof probe (hostile Proxy)', () => {
    vi.stubGlobal('performance', hostilePerformanceProxyThrowsOnNow())
    expect(readPerformanceNow()).toBe(0)
  })
})
