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
})
