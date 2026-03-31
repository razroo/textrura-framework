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
})

describe('computed', () => {
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
})

describe('effect', () => {
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
})

describe('batch', () => {
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
})
