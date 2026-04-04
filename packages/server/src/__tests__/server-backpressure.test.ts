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
})
