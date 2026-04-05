import { describe, it, expect } from 'vitest'
import { shouldDeferClientSend } from '../server.js'

describe('server backpressure helper', () => {
  it('defers only when buffered amount exceeds threshold', () => {
    expect(shouldDeferClientSend(0, 1024)).toBe(false)
    expect(shouldDeferClientSend(1024, 1024)).toBe(false)
    expect(shouldDeferClientSend(1025, 1024)).toBe(true)
  })

  it('treats threshold as strict greater-than (including zero-byte threshold)', () => {
    expect(shouldDeferClientSend(0, 0)).toBe(false)
    expect(shouldDeferClientSend(1, 0)).toBe(true)
  })

  it('never defers when either operand is NaN (comparison is false)', () => {
    expect(shouldDeferClientSend(Number.NaN, 1024)).toBe(false)
    expect(shouldDeferClientSend(2048, Number.NaN)).toBe(false)
  })

  it('defers when buffered amount is finite and above threshold, including very large totals', () => {
    expect(shouldDeferClientSend(Number.MAX_SAFE_INTEGER, 0)).toBe(true)
    expect(shouldDeferClientSend(Number.POSITIVE_INFINITY, 1024)).toBe(true)
  })

  it('treats negative buffered amount like zero (never above a non-negative threshold)', () => {
    expect(shouldDeferClientSend(-1, 0)).toBe(false)
    expect(shouldDeferClientSend(-100, 1024)).toBe(false)
  })
})
