import { describe, it, expect } from 'vitest'
import { signal, computed, effect, batch } from '../signals.js'

describe('signal', () => {
  it('get/set works', () => {
    const s = signal(1)
    expect(s.value).toBe(1)
    s.set(2)
    expect(s.value).toBe(2)
  })

  it('peek() returns value without subscribing', () => {
    const s = signal(10)
    let runs = 0
    effect(() => {
      // Only read via peek — should not subscribe
      s.peek()
      runs++
    })
    expect(runs).toBe(1)
    s.set(20)
    // Effect should NOT have re-run because we used peek
    expect(runs).toBe(1)
  })

  it('set with same value (Object.is) is a no-op', () => {
    const s = signal(5)
    let runs = 0
    effect(() => {
      void s.value
      runs++
    })
    expect(runs).toBe(1)
    s.set(5)
    expect(runs).toBe(1)
  })

  it('treats +0 and -0 as distinct for set (Object.is)', () => {
    const s = signal(0)
    let runs = 0
    effect(() => {
      void s.value
      runs++
    })
    expect(runs).toBe(1)
    s.set(-0)
    expect(runs).toBe(2)
    expect(Object.is(s.peek(), -0)).toBe(true)
    s.set(-0)
    expect(runs).toBe(2)
  })

  it('drops stale signal subscriptions when the effect branch changes', () => {
    const gate = signal(true)
    const a = signal(0)
    const b = signal(0)
    const seen: string[] = []
    effect(() => {
      if (gate.value) {
        seen.push(`a:${a.value}`)
      } else {
        seen.push(`b:${b.value}`)
      }
    })
    expect(seen).toEqual(['a:0'])
    seen.length = 0
    a.set(1)
    expect(seen).toEqual(['a:1'])
    seen.length = 0
    gate.set(false)
    expect(seen).toEqual(['b:0'])
    seen.length = 0
    a.set(2)
    expect(seen).toEqual([])
    b.set(1)
    expect(seen).toEqual(['b:1'])
  })
})

describe('computed', () => {
  it('chains through another computed', () => {
    const s = signal(2)
    const doubled = computed(() => s.value * 2)
    const quadrupled = computed(() => doubled.value * 2)
    expect(quadrupled.value).toBe(8)
    s.set(3)
    expect(quadrupled.value).toBe(12)
  })

  it('lazy evaluation and caching', () => {
    let evalCount = 0
    const s = signal(3)
    const c = computed(() => {
      evalCount++
      return s.value * 2
    })

    // Not evaluated until first access
    expect(evalCount).toBe(0)

    expect(c.value).toBe(6)
    expect(evalCount).toBe(1)

    // Cached on second access without change
    expect(c.value).toBe(6)
    expect(evalCount).toBe(1)

    // Re-evaluates after dependency changes
    s.set(4)
    expect(c.value).toBe(8)
    expect(evalCount).toBe(2)
  })

  it('notifies subscribers when a dependency changes even if the recomputed value is unchanged', () => {
    const s = signal(1)
    const c = computed(() => s.value * 0)
    let evalCount = 0
    const stable = computed(() => {
      evalCount++
      return c.value
    })
    expect(stable.value).toBe(0)
    expect(evalCount).toBe(1)
    s.set(2)
    expect(stable.value).toBe(0)
    expect(evalCount).toBe(2)
  })

  it('drops inner signal deps when the computed branch changes', () => {
    const gate = signal(true)
    const x = signal(1)
    const y = signal(10)
    let evalCount = 0
    const c = computed(() => {
      evalCount++
      return gate.value ? x.value : y.value
    })

    expect(c.value).toBe(1)
    expect(evalCount).toBe(1)
    x.set(2)
    expect(c.value).toBe(2)
    expect(evalCount).toBe(2)
    gate.set(false)
    expect(c.value).toBe(10)
    expect(evalCount).toBe(3)
    x.set(99)
    expect(c.value).toBe(10)
    expect(evalCount).toBe(3)
    y.set(11)
    expect(c.value).toBe(11)
    expect(evalCount).toBe(4)
  })
})

describe('effect', () => {
  it('tracks dependencies through a computed', () => {
    const s = signal(1)
    const c = computed(() => s.value + 1)
    const seen: number[] = []
    effect(() => {
      seen.push(c.value)
    })
    expect(seen).toEqual([2])
    s.set(5)
    expect(seen).toEqual([2, 6])
  })

  it('re-runs when a computed notifies even if the derived value is still equal', () => {
    const s = signal(1)
    const c = computed(() => s.value * 0)
    const seen: number[] = []
    effect(() => {
      seen.push(c.value)
    })
    expect(seen).toEqual([0])
    s.set(2)
    expect(seen).toEqual([0, 0])
  })

  it('drops stale computed subscription when the effect stops reading it', () => {
    const gate = signal(true)
    const s = signal(0)
    const c = computed(() => s.value * 2)
    const seen: number[] = []
    effect(() => {
      if (gate.value) {
        seen.push(c.value)
      } else {
        seen.push(-1)
      }
    })
    expect(seen).toEqual([0])
    seen.length = 0
    s.set(1)
    expect(seen).toEqual([2])
    seen.length = 0
    gate.set(false)
    expect(seen).toEqual([-1])
    seen.length = 0
    s.set(2)
    expect(seen).toEqual([])
  })

  it('runs immediately and re-runs on dependency change', () => {
    const s = signal('hello')
    const values: string[] = []
    effect(() => {
      values.push(s.value)
    })
    expect(values).toEqual(['hello'])
    s.set('world')
    expect(values).toEqual(['hello', 'world'])
  })

  it('dispose stops re-running', () => {
    const s = signal(0)
    let runs = 0
    const dispose = effect(() => {
      void s.value
      runs++
    })
    expect(runs).toBe(1)
    dispose()
    s.set(1)
    expect(runs).toBe(1)
  })

  it('propagates synchronous errors from the initial run (no dispose returned)', () => {
    expect(() =>
      effect(() => {
        throw new Error('first-run')
      }),
    ).toThrow('first-run')
  })

  it('propagates errors from a re-run to the dependency update caller', () => {
    const s = signal(0)
    effect(() => {
      if (s.value > 0) throw new Error('re-run')
      void s.value
    })
    expect(() => s.set(1)).toThrow('re-run')
  })
})

describe('batch', () => {
  it('empty batch does not flush subscribers', () => {
    const a = signal(1)
    let runs = 0
    effect(() => {
      void a.value
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {})
    expect(runs).toBe(1)
  })

  it('defers notifications until flush', () => {
    const a = signal(1)
    const b = signal(2)
    const sums: number[] = []

    effect(() => {
      sums.push(a.value + b.value)
    })
    expect(sums).toEqual([3])

    batch(() => {
      a.set(10)
      b.set(20)
      // Effect should not have run yet
      expect(sums).toEqual([3])
    })

    // After batch completes, effect runs once with both updates
    expect(sums).toEqual([3, 30])
  })

  it('nested batches flush only when the outermost batch ends', () => {
    const a = signal(1)
    const b = signal(2)
    const sums: number[] = []

    effect(() => {
      sums.push(a.value + b.value)
    })
    expect(sums).toEqual([3])

    batch(() => {
      a.set(10)
      batch(() => {
        b.set(20)
        expect(sums).toEqual([3])
      })
      expect(sums).toEqual([3])
    })

    expect(sums).toEqual([3, 30])
  })

  it('flushes deferred subscribers when the batch callback throws', () => {
    const a = signal(1)
    let runs = 0
    effect(() => {
      void a.value
      runs++
    })
    expect(runs).toBe(1)

    expect(() =>
      batch(() => {
        a.set(99)
        throw new Error('fail')
      }),
    ).toThrow('fail')

    expect(a.peek()).toBe(99)
    expect(runs).toBe(2)
  })

  it('nested batch: throw from inner still flushes once the outer batch unwinds', () => {
    const a = signal(1)
    const b = signal(2)
    const sums: number[] = []

    effect(() => {
      sums.push(a.value + b.value)
    })
    expect(sums).toEqual([3])

    expect(() =>
      batch(() => {
        a.set(10)
        batch(() => {
          b.set(20)
          throw new Error('inner')
        })
      }),
    ).toThrow('inner')

    expect(sums).toEqual([3, 30])

    b.set(21)
    expect(sums).toEqual([3, 30, 31])
  })

  it('dedupes the same subscriber when multiple deps update in one batch', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0
    effect(() => {
      void a.value
      void b.value
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      a.set(10)
      b.set(20)
    })
    expect(runs).toBe(2)
  })

  it('signal set from a flushing subscriber runs nested subscribers synchronously (outside batch queue)', () => {
    const a = signal(0)
    const steps: string[] = []
    effect(() => {
      steps.push(`a:${a.value}`)
      if (a.peek() === 1) {
        a.set(2)
      }
    })
    expect(steps).toEqual(['a:0'])
    batch(() => {
      a.set(1)
    })
    expect(steps).toEqual(['a:0', 'a:1', 'a:2'])
  })
})
