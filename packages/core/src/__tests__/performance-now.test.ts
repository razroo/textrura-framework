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

  it('accepts null-prototype performance host objects with own now() (no Object.prototype chain)', () => {
    const perf = Object.create(null) as { now: () => number }
    perf.now = () => 13.25
    vi.stubGlobal('performance', perf)
    expect(safePerformanceNowMs()).toBe(13.25)
    expect(readPerformanceNow()).toBe(13.25)
  })

  it('supports Proxy-wrapped performance hosts that forward now() (instrumentation / test doubles)', () => {
    const target = { now: () => 55.5 }
    const proxied = new Proxy(target, {})
    vi.stubGlobal('performance', proxied as unknown as Performance)
    expect(safePerformanceNowMs()).toBe(55.5)
    expect(readPerformanceNow()).toBe(55.5)
  })

  it('returns 0 when performance is a revoked Proxy (now access throws; outer try/catch)', () => {
    const { proxy, revoke } = Proxy.revocable({ now: () => 1 }, {})
    revoke()
    vi.stubGlobal('performance', proxy as unknown as Performance)
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(0)
  })

  it('returns 0 when inherited prototype now is not callable (typeof perf.now must be function)', () => {
    const badProto = Object.create({ now: 404 })
    vi.stubGlobal('performance', badProto)
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(0)
  })

  it('returns 0 when own-property now is explicitly undefined (partial polyfill / corrupt embedder)', () => {
    // @ts-expect-error — exercise Object.prototype-style own field without a callable implementation
    vi.stubGlobal('performance', { now: undefined })
    expect(safePerformanceNowMs()).toBe(0)
    expect(readPerformanceNow()).toBe(0)
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

  it('preserves negative finite now() values (embedders may offset before the time origin)', () => {
    vi.stubGlobal('performance', { now: () => -123.45 })
    expect(safePerformanceNowMs()).toBe(-123.45)
    vi.stubGlobal('performance', { now: () => -Number.MAX_VALUE })
    expect(safePerformanceNowMs()).toBe(-Number.MAX_VALUE)
  })

  it('preserves large positive finite now() at IEEE max magnitude (symmetric with negative MAX_VALUE)', () => {
    vi.stubGlobal('performance', { now: () => Number.MAX_VALUE })
    expect(safePerformanceNowMs()).toBe(Number.MAX_VALUE)
  })

  it('returns 0 when performance or now is missing', () => {
    // @ts-expect-error — exercise partial global
    vi.stubGlobal('performance', {})
    expect(safePerformanceNowMs()).toBe(0)
    // @ts-expect-error — hostile environment
    vi.stubGlobal('performance', { now: 'nope' })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now is a callable that yields NaN with no args (mistaken host: parseFloat, not a clock)', () => {
    vi.stubGlobal('performance', { now: parseFloat })
    expect(Number.isNaN(parseFloat())).toBe(true)
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
    vi.stubGlobal('performance', { now: () => Object(NaN) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    // Boxed −0 is typeof object — must not preserve IEEE −0 (parity with primitive −0 path above and layout-bounds boxed guards).
    vi.stubGlobal('performance', { now: () => Object(-0) as unknown as number })
    const boxedNegZero = safePerformanceNowMs()
    expect(Object.is(boxedNegZero, -0)).toBe(false)
    expect(boxedNegZero).toBe(0)
  })

  it('returns 0 when now() returns a plain object with valueOf (typeof object; no ToPrimitive coercion)', () => {
    vi.stubGlobal('performance', { now: () => ({ valueOf: () => 12 }) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now() returns an object with Symbol.toPrimitive (typeof object; no ToPrimitive coercion)', () => {
    vi.stubGlobal('performance', {
      now: () =>
        ({
          [Symbol.toPrimitive]: () => 99,
        }) as unknown as number,
    })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now() returns an array (typeof object; no numeric coercion)', () => {
    vi.stubGlobal('performance', { now: () => [] as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now() returns Map, WeakMap, Set, WeakSet, WeakRef, Promise, Date, RegExp, ArrayBuffer, or DataView (typeof object; parity with layout-bounds exotic guards)', () => {
    vi.stubGlobal('performance', { now: () => new Map() as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => new WeakMap() as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => new Set() as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => new WeakSet() as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => new WeakRef({}) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => Promise.resolve(0) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => new Date(0) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => /./ as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => new ArrayBuffer(8) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', { now: () => new DataView(new ArrayBuffer(4)) as unknown as number })
    expect(safePerformanceNowMs()).toBe(0)
  })

  it('returns 0 when now is a generator function (call yields an iterator; typeof result is object, not number)', () => {
    function* genNow(): Generator<number, void, void> {
      yield 12
    }
    vi.stubGlobal('performance', { now: genNow as unknown as Performance['now'] })
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

  it('returns 0 when globalThis.performance is a truthy non-object (string/number mistaken host; no callable now)', () => {
    // Truthy primitives are not Performance objects; `typeof perf.now` must not assume an object receiver.
    vi.stubGlobal('performance', 'clock' as unknown as Performance)
    expect(safePerformanceNowMs()).toBe(0)
    vi.stubGlobal('performance', 1 as unknown as Performance)
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
  it('returns 0 when performance is a revoked Proxy (property access throws; same guard as safe path)', () => {
    const { proxy, revoke } = Proxy.revocable({ now: () => 1 }, {})
    revoke()
    vi.stubGlobal('performance', proxy as unknown as Performance)
    expect(readPerformanceNow()).toBe(0)
  })

  it('uses inherited or prototype-chain now() implementations (polyfills may not assign own properties)', () => {
    const viaProto = Object.create({ now: () => 11.5 })
    vi.stubGlobal('performance', viaProto)
    expect(readPerformanceNow()).toBe(11.5)

    class PerfPolyfill {
      now() {
        return 22.25
      }
    }
    vi.stubGlobal('performance', new PerfPolyfill())
    expect(readPerformanceNow()).toBe(22.25)
  })

  it('returns primitive numbers as-is, including NaN and ±Infinity', () => {
    vi.stubGlobal('performance', { now: () => Number.NaN })
    expect(Number.isNaN(readPerformanceNow())).toBe(true)
    vi.stubGlobal('performance', { now: () => Number.POSITIVE_INFINITY })
    expect(readPerformanceNow()).toBe(Number.POSITIVE_INFINITY)
    vi.stubGlobal('performance', { now: () => Number.NEGATIVE_INFINITY })
    expect(readPerformanceNow()).toBe(Number.NEGATIVE_INFINITY)
  })

  it('passes through NaN when now is parseFloat (callable typeof function; broken embedder)', () => {
    vi.stubGlobal('performance', { now: parseFloat })
    expect(Number.isNaN(readPerformanceNow())).toBe(true)
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

  it('passes through negative finite now() values unchanged (callers clamp deltas if needed)', () => {
    vi.stubGlobal('performance', { now: () => -42.25 })
    expect(readPerformanceNow()).toBe(-42.25)
    vi.stubGlobal('performance', { now: () => -Number.MIN_VALUE })
    expect(readPerformanceNow()).toBe(-Number.MIN_VALUE)
  })

  it('maps non-number now() results to 0 without coercion', () => {
    vi.stubGlobal('performance', { now: () => Object(7) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => Object(NaN) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => Object(-0) as unknown as number })
    const boxedNegZero = readPerformanceNow()
    expect(Object.is(boxedNegZero, -0)).toBe(false)
    expect(boxedNegZero).toBe(0)
    vi.stubGlobal('performance', { now: () => 1n as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => '12.5' as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => [] as unknown as number })
    expect(readPerformanceNow()).toBe(0)
  })

  it('maps Map, WeakMap, Set, WeakSet, WeakRef, Promise, Date, RegExp, ArrayBuffer, and DataView now() results to 0 (typeof object; no numeric coercion)', () => {
    vi.stubGlobal('performance', { now: () => new Map() as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => new WeakMap() as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => new Set() as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => new WeakSet() as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => new WeakRef({}) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => Promise.resolve(0) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => new Date(0) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => /./ as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => new ArrayBuffer(8) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', { now: () => new DataView(new ArrayBuffer(4)) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
  })

  it('maps generator now() results to 0 (iterator object; typeof not number)', () => {
    function* genNow(): Generator<number, void, void> {
      yield 12
    }
    vi.stubGlobal('performance', { now: genNow as unknown as Performance['now'] })
    expect(readPerformanceNow()).toBe(0)
  })

  it('maps plain objects with valueOf to 0 (typeof object; no ToPrimitive / numeric coercion)', () => {
    vi.stubGlobal('performance', { now: () => ({ valueOf: () => 12 }) as unknown as number })
    expect(readPerformanceNow()).toBe(0)
  })

  it('maps objects with Symbol.toPrimitive to 0 (typeof object; no ToPrimitive / numeric coercion)', () => {
    vi.stubGlobal('performance', {
      now: () =>
        ({
          [Symbol.toPrimitive]: () => 99,
        }) as unknown as number,
    })
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

  it('returns 0 when globalThis.performance is a truthy non-object (string/number mistaken host; same guard as safe path)', () => {
    vi.stubGlobal('performance', 'clock' as unknown as Performance)
    expect(readPerformanceNow()).toBe(0)
    vi.stubGlobal('performance', 1 as unknown as Performance)
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
