import { afterEach, describe, expect, it, vi } from 'vitest'

describe('animationLoop', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function loadAnimationLoop() {
    vi.resetModules()
    const { animationLoop } = await import('../animation.js')
    return animationLoop
  }

  it('passes elapsed time in seconds between ticks and stops when the callback returns false', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let mockNow = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    const dts: number[] = []
    let frames = 0

    animationLoop(dt => {
      dts.push(dt)
      frames++
      mockNow += 50
      return frames < 4
    })

    while (pending.length) {
      const batch = pending.splice(0, pending.length)
      for (const cb of batch) cb(0)
    }

    expect(frames).toBe(4)
    expect(dts[0]).toBe(0)
    expect(dts[1]).toBeCloseTo(0.05, 6)
    expect(dts[2]).toBeCloseTo(0.05, 6)
    expect(dts[3]).toBeCloseTo(0.05, 6)
  })

  it('clamps negative elapsed time to zero when the clock moves backward between ticks', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let mockNow = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    const dts: number[] = []
    let frames = 0

    animationLoop(dt => {
      dts.push(dt)
      frames++
      if (frames === 1) {
        mockNow += 100
      } else if (frames === 2) {
        mockNow -= 500
      } else {
        mockNow += 50
      }
      return frames < 4
    })

    while (pending.length) {
      const batch = pending.splice(0, pending.length)
      for (const cb of batch) cb(0)
    }

    expect(frames).toBe(4)
    expect(dts[0]).toBe(0)
    expect(dts[1]).toBeCloseTo(0.1, 6)
    expect(dts[2]).toBe(0)
    expect(dts[3]).toBeCloseTo(0.05, 6)
  })

  it('ignores non-finite Date.now samples so dt stays finite and lastTime is not poisoned', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let mockNow = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    const dts: number[] = []
    let frames = 0

    animationLoop(dt => {
      expect(Number.isFinite(dt)).toBe(true)
      dts.push(dt)
      frames++
      if (frames === 1) {
        mockNow += 100
      } else if (frames === 2) {
        mockNow = Number.NaN
      } else if (frames === 3) {
        mockNow = Number.POSITIVE_INFINITY
      } else {
        mockNow = 10_250
      }
      return frames < 5
    })

    while (pending.length) {
      const batch = pending.splice(0, pending.length)
      for (const cb of batch) cb(0)
    }

    expect(frames).toBe(5)
    expect(dts[0]).toBe(0)
    expect(dts[1]).toBeCloseTo(0.1, 6)
    expect(dts[2]).toBe(0)
    expect(dts[3]).toBe(0)
    // After bad samples, clock resumes from the last good anchor (10_100), not NaN/Infinity.
    expect(dts[4]).toBeCloseTo(0.15, 6)
  })

  it('returning false on the first tick does not schedule another frame', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let mockNow = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    let ticks = 0
    animationLoop(() => {
      ticks++
      mockNow += 16
      return false
    })

    expect(pending).toHaveLength(1)
    pending.shift()!(0)
    expect(ticks).toBe(1)
    expect(pending).toHaveLength(0)
  })

  it('stop() prevents further callbacks even when another frame was already scheduled', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    const cancel = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancel)

    let mockNow = 0
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    let count = 0
    const stop = animationLoop(() => {
      count++
      mockNow += 16
      return true
    })

    expect(pending).toHaveLength(1)
    pending.shift()!(0)
    expect(count).toBe(1)
    expect(pending).toHaveLength(1)

    stop()
    expect(cancel).toHaveBeenCalled()

    while (pending.length) {
      const batch = pending.splice(0, pending.length)
      for (const cb of batch) cb(0)
    }

    expect(count).toBe(1)
  })

  it('stop() is idempotent: repeated calls cancel at most once', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    const cancel = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancel)

    let mockNow = 0
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    const stop = animationLoop(() => {
      mockNow += 16
      return true
    })

    expect(pending).toHaveLength(1)
    stop()
    stop()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('stops the loop and rethrows when the callback throws (no further frames scheduled)', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let mockNow = 0
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    let ticks = 0
    const stop = animationLoop(() => {
      ticks++
      mockNow += 16
      throw new Error('tick boom')
    })

    expect(pending).toHaveLength(1)
    expect(() => pending.shift()!(0)).toThrow('tick boom')
    expect(ticks).toBe(1)
    expect(pending).toHaveLength(0)

    const cancel = globalThis.cancelAnimationFrame as ReturnType<typeof vi.fn>
    stop()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('stops after throw on a later tick (first frame scheduled a second, then error)', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let mockNow = 0
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    let ticks = 0
    animationLoop(() => {
      ticks++
      mockNow += 16
      if (ticks === 2) throw new Error('second tick')
      return true
    })

    expect(pending).toHaveLength(1)
    pending.shift()!(0)
    expect(ticks).toBe(1)
    expect(pending).toHaveLength(1)
    expect(() => pending.shift()!(0)).toThrow('second tick')
    expect(ticks).toBe(2)
    expect(pending).toHaveLength(0)
  })

  it('stop() after the callback returned false is a no-op (no extra cancelAnimationFrame)', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    const cancel = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancel)

    let mockNow = 0
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const animationLoop = await loadAnimationLoop()
    let frames = 0
    const stop = animationLoop(() => {
      frames++
      mockNow += 16
      return false
    })

    expect(pending).toHaveLength(1)
    pending.shift()!(0)
    expect(frames).toBe(1)
    expect(pending).toHaveLength(0)

    stop()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('falls back to setTimeout when requestAnimationFrame is null (broken polyfill / host)', async () => {
    vi.stubGlobal('requestAnimationFrame', null as unknown as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', null as unknown as typeof cancelAnimationFrame)
    vi.useFakeTimers()

    let mockNow = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    vi.resetModules()
    const { animationLoop } = await import('../animation.js')

    const dts: number[] = []
    let frames = 0
    animationLoop(dt => {
      dts.push(dt)
      frames++
      mockNow += 50
      return frames < 3
    })

    try {
      await vi.runAllTimersAsync()
      expect(frames).toBe(3)
      expect(dts[0]).toBe(0)
      expect(dts[1]).toBeCloseTo(0.05, 6)
      expect(dts[2]).toBeCloseTo(0.05, 6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to setTimeout when requestAnimationFrame is missing (SSR / headless)', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined as unknown as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', undefined as unknown as typeof cancelAnimationFrame)
    vi.useFakeTimers()

    let mockNow = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    vi.resetModules()
    const { animationLoop } = await import('../animation.js')

    const dts: number[] = []
    let frames = 0
    animationLoop(dt => {
      dts.push(dt)
      frames++
      mockNow += 50
      return frames < 4
    })

    try {
      await vi.runAllTimersAsync()
      expect(frames).toBe(4)
      expect(dts[0]).toBe(0)
      expect(dts[1]).toBeCloseTo(0.05, 6)
      expect(dts[2]).toBeCloseTo(0.05, 6)
      expect(dts[3]).toBeCloseTo(0.05, 6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to setTimeout when requestAnimationFrame is non-callable (broken polyfill object)', async () => {
    vi.stubGlobal('requestAnimationFrame', {} as unknown as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', 0 as unknown as typeof cancelAnimationFrame)
    vi.useFakeTimers()

    let mockNow = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    vi.resetModules()
    const { animationLoop } = await import('../animation.js')

    const dts: number[] = []
    let frames = 0
    animationLoop(dt => {
      dts.push(dt)
      frames++
      mockNow += 50
      return frames < 3
    })

    try {
      await vi.runAllTimersAsync()
      expect(frames).toBe(3)
      expect(dts[0]).toBe(0)
      expect(dts[1]).toBeCloseTo(0.05, 6)
      expect(dts[2]).toBeCloseTo(0.05, 6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stop() clears a pending setTimeout frame when RAF APIs are missing', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined as unknown as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', undefined as unknown as typeof cancelAnimationFrame)
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    let mockNow = 0
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    vi.resetModules()
    const { animationLoop } = await import('../animation.js')

    let ticks = 0
    const stop = animationLoop(() => {
      ticks++
      mockNow += 16
      return true
    })

    try {
      await vi.runOnlyPendingTimersAsync()
      expect(ticks).toBe(1)

      stop()
      expect(clearSpy).toHaveBeenCalled()
    } finally {
      clearSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})
