import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPropertyTimeline,
  createTweenTimeline,
  easing,
  getMotionPreference,
  normalizeSpringConfig,
  setMotionPreference,
  transition,
} from '../animation.js'

// Module-level motion preference is shared across the worker; reset so failures or
// ordering changes cannot leak `reduced` into other test files.
afterEach(() => {
  setMotionPreference('full')
})

describe('easing presets', () => {
  it('maps t=0 to 0 and t=1 to 1 for bundled easing curves', () => {
    for (const fn of [easing.linear, easing.easeIn, easing.easeOut, easing.easeInOut] as const) {
      expect(fn(0)).toBe(0)
      expect(fn(1)).toBe(1)
    }
  })

  it('keeps easeInOut monotone on [0, 1]', () => {
    let prev = easing.easeInOut(0)
    for (let i = 1; i <= 100; i++) {
      const t = i / 100
      const next = easing.easeInOut(t)
      expect(next).toBeGreaterThanOrEqual(prev)
      prev = next
    }
  })

  it('easeInOut is symmetric: f(t) + f(1 - t) === 1', () => {
    for (let i = 0; i <= 50; i++) {
      const t = i / 50
      expect(easing.easeInOut(t) + easing.easeInOut(1 - t)).toBeCloseTo(1, 12)
    }
  })
})

describe('normalizeSpringConfig', () => {
  it('uses defaults for non-finite or non-positive mass', () => {
    expect(normalizeSpringConfig({ mass: Number.NaN })).toMatchObject({
      stiffness: 170,
      damping: 26,
      mass: 1,
    })
    expect(normalizeSpringConfig({ mass: Number.POSITIVE_INFINITY })).toMatchObject({ mass: 1 })
    expect(normalizeSpringConfig({ mass: -1 })).toMatchObject({ mass: 1 })
    expect(normalizeSpringConfig({ mass: 0 })).toMatchObject({ mass: 1 })
    expect(normalizeSpringConfig({ mass: '1' as never })).toMatchObject({ mass: 1 })
  })

  it('uses default stiffness when missing, non-finite, zero, or negative', () => {
    expect(normalizeSpringConfig({ stiffness: Number.NaN })).toMatchObject({ stiffness: 170 })
    expect(normalizeSpringConfig({ stiffness: Number.NEGATIVE_INFINITY })).toMatchObject({
      stiffness: 170,
    })
    expect(normalizeSpringConfig({ stiffness: 0 })).toMatchObject({ stiffness: 170 })
    expect(normalizeSpringConfig({ stiffness: -50 })).toMatchObject({ stiffness: 170 })
    expect(normalizeSpringConfig({ stiffness: undefined })).toMatchObject({ stiffness: 170 })
  })

  it('preserves positive finite stiffness', () => {
    expect(normalizeSpringConfig({ stiffness: 42 })).toMatchObject({ stiffness: 42 })
  })

  it('uses default damping when missing, non-finite, or negative; allows zero damping', () => {
    expect(normalizeSpringConfig({ damping: Number.NaN })).toMatchObject({ damping: 26 })
    expect(normalizeSpringConfig({ damping: Number.POSITIVE_INFINITY })).toMatchObject({ damping: 26 })
    expect(normalizeSpringConfig({ damping: -1 })).toMatchObject({ damping: 26 })
    expect(normalizeSpringConfig({ damping: 0 })).toMatchObject({ damping: 0 })
    expect(normalizeSpringConfig({ damping: 12 })).toMatchObject({ damping: 12 })
  })

  it('leaves unrelated fields at defaults when only one option is set', () => {
    expect(normalizeSpringConfig({ mass: 2 })).toEqual({ stiffness: 170, damping: 26, mass: 2 })
    expect(normalizeSpringConfig({})).toEqual({ stiffness: 170, damping: 26, mass: 1 })
  })

  it('uses defaults for BigInt or boxed Number spring fields (strict typeof number)', () => {
    expect(() => normalizeSpringConfig({ mass: 2n as never })).not.toThrow()
    expect(normalizeSpringConfig({ mass: 2n as never })).toEqual({ stiffness: 170, damping: 26, mass: 1 })
    expect(normalizeSpringConfig({ stiffness: 50n as never })).toEqual({
      stiffness: 170,
      damping: 26,
      mass: 1,
    })
    expect(normalizeSpringConfig({ damping: 8n as never })).toEqual({
      stiffness: 170,
      damping: 26,
      mass: 1,
    })
    expect(normalizeSpringConfig({ mass: Object(2) as never })).toMatchObject({ mass: 1 })
    expect(normalizeSpringConfig({ stiffness: Object(100) as never })).toMatchObject({ stiffness: 170 })
    expect(normalizeSpringConfig({ damping: Object(5) as never })).toMatchObject({ damping: 26 })
  })
})

describe('motion preference', () => {
  it('normalizes non-reduced runtime values to full', () => {
    setMotionPreference('reduced')
    expect(getMotionPreference()).toBe('reduced')
    setMotionPreference('' as never)
    expect(getMotionPreference()).toBe('full')
    setMotionPreference('reduced')
    setMotionPreference(undefined as never)
    expect(getMotionPreference()).toBe('full')
    setMotionPreference('bogus' as never)
    expect(getMotionPreference()).toBe('full')
    setMotionPreference('full')
  })
})

describe('transition()', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('jumps to target when duration is non-finite (no NaN, no infinite RAF)', () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    expect(transition(0, 200, Number.NaN, easing.linear).peek()).toBe(200)
    expect(transition(0, 40, Number.POSITIVE_INFINITY, easing.linear).peek()).toBe(40)
    expect(pending).toHaveLength(0)

    // BigInt is not a finite number for Number.isFinite → same instant jump as NaN/±Infinity (no RAF).
    expect(() => transition(0, 55, 400n as never, easing.linear)).not.toThrow()
    expect(transition(0, 55, 400n as never, easing.linear).peek()).toBe(55)
    expect(pending).toHaveLength(0)
  })

  it('clamps non-positive finite duration to 1 ms scale like createTweenTimeline', async () => {
    vi.resetModules()
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    let mockNow = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)

    const { transition: transitionFresh } = await import('../animation.js')
    const s = transitionFresh(0, 100, 0, easing.linear)
    expect(s.peek()).toBe(0)
    expect(pending.length).toBeGreaterThanOrEqual(1)

    while (pending.length) {
      mockNow += 1
      pending.shift()!(0)
    }
    expect(s.peek()).toBe(100)

    const sNeg = transitionFresh(100, 0, -50, easing.linear)
    expect(sNeg.peek()).toBe(100)
    expect(pending.length).toBeGreaterThanOrEqual(1)
    while (pending.length) {
      mockNow += 1
      pending.shift()!(0)
    }
    expect(sNeg.peek()).toBe(0)
  })

  it('still schedules RAF under reduced motion unless respectReducedMotion is true', async () => {
    vi.resetModules()
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const anim = await import('../animation.js')
    anim.setMotionPreference('reduced')

    const animated = anim.transition(0, 200, 400, anim.easing.linear)
    expect(animated.peek()).toBe(0)
    expect(pending.length).toBeGreaterThan(0)

    const jumped = anim.transition(0, 99, 400, anim.easing.linear, { respectReducedMotion: true })
    expect(jumped.peek()).toBe(99)

    const explicitOff = anim.transition(0, 50, 200, anim.easing.linear, { respectReducedMotion: false })
    expect(explicitOff.peek()).toBe(0)
    expect(pending.length).toBeGreaterThan(1)

    anim.setMotionPreference('full')
  })
})

describe('animation timeline', () => {
  it('supports reduced-motion policy for transition and timeline helpers', () => {
    setMotionPreference('reduced')
    expect(getMotionPreference()).toBe('reduced')

    const reducedTransition = transition(0, 50, 1000, easing.linear, { respectReducedMotion: true })
    expect(reducedTransition.peek()).toBe(50)

    const reducedTimeline = createTweenTimeline(0)
    reducedTimeline.to(80, 1000, easing.linear)
    expect(reducedTimeline.value.peek()).toBe(80)
    expect(reducedTimeline.state()).toBe('finished')

    setMotionPreference('full')
  })

  it('jumps createPropertyTimeline targets immediately under reduced motion', () => {
    setMotionPreference('reduced')
    const props = createPropertyTimeline({ x: 0, y: 0, opacity: 0 })
    props.to({ x: 100, y: 50, opacity: 1 }, 800, easing.linear)
    expect(props.values.x.peek()).toBe(100)
    expect(props.values.y.peek()).toBe(50)
    expect(props.values.opacity.peek()).toBe(1)
    expect(props.state()).toBe('finished')
    props.step(200)
    expect(props.values.x.peek()).toBe(100)
    expect(props.values.y.peek()).toBe(50)
    setMotionPreference('full')
  })

  it('lazily targeted keys jump immediately under reduced motion (ensureTimeline path)', () => {
    setMotionPreference('reduced')
    const props = createPropertyTimeline({ x: 0 })
    expect(props.values).not.toHaveProperty('z')
    props.to({ x: 40, z: 99 }, 600, easing.linear)
    expect(props.values.x.peek()).toBe(40)
    expect(props.values.z.peek()).toBe(99)
    expect(props.state()).toBe('finished')
    props.step(200)
    expect(props.values.x.peek()).toBe(40)
    expect(props.values.z.peek()).toBe(99)
    setMotionPreference('full')
  })

  it('clamps non-positive duration to 1ms so step() always has a defined progress scale', () => {
    const timeline = createTweenTimeline(0)
    timeline.to(100, 0, easing.linear)
    expect(timeline.step(0)).toBe(0)
    expect(timeline.step(1)).toBe(100)
    expect(timeline.state()).toBe('finished')

    const timelineNeg = createTweenTimeline(0)
    timelineNeg.to(50, -200, easing.linear)
    expect(timelineNeg.step(0)).toBe(0)
    expect(timelineNeg.step(1)).toBe(50)
    expect(timelineNeg.state()).toBe('finished')
  })

  it('clamps negative finite step deltas to 0 so clock skew cannot rewind elapsed time', () => {
    const timeline = createTweenTimeline(0)
    timeline.to(100, 1000, easing.linear)
    expect(timeline.step(500)).toBe(50)
    expect(timeline.step(-100)).toBe(50)
    expect(timeline.value.peek()).toBe(50)
    expect(timeline.state()).toBe('running')
    expect(timeline.step(500)).toBe(100)
    expect(timeline.state()).toBe('finished')

    const props = createPropertyTimeline({ x: 0 })
    props.to({ x: 100 }, 1000, easing.linear)
    expect(props.step(400).x).toBe(40)
    expect(props.step(-200).x).toBe(40)
    expect(props.values.x.peek()).toBe(40)
  })

  it('treats non-finite step deltas as 0 so elapsed and values stay finite', () => {
    const timeline = createTweenTimeline(0)
    timeline.to(100, 1000, easing.linear)
    expect(timeline.step(500)).toBe(50)
    expect(timeline.step(Number.NaN)).toBe(50)
    expect(timeline.value.peek()).toBe(50)
    expect(timeline.state()).toBe('running')
    expect(timeline.step(Number.POSITIVE_INFINITY)).toBe(50)

    expect(() => timeline.step('10' as unknown as number)).not.toThrow()
    expect(timeline.step('10' as unknown as number)).toBe(50)
    expect(timeline.value.peek()).toBe(50)
    expect(() => timeline.step(1n as unknown as number)).not.toThrow()
    expect(timeline.step(1n as unknown as number)).toBe(50)
    expect(() => timeline.step(Object(16) as unknown as number)).not.toThrow()
    expect(timeline.step(Object(16) as unknown as number)).toBe(50)

    const props = createPropertyTimeline({ x: 0 })
    props.to({ x: 100 }, 1000, easing.linear)
    props.step(400)
    expect(props.values.x.peek()).toBe(40)
    expect(props.step(Number.NaN).x).toBe(40)
    expect(props.values.x.peek()).toBe(40)
    expect(() => props.step('9' as unknown as number)).not.toThrow()
    expect(props.step('9' as unknown as number).x).toBe(40)
    expect(props.values.x.peek()).toBe(40)
  })

  it('jumps to target when duration is non-finite (aligned with transition)', () => {
    const nan = createTweenTimeline(0)
    nan.to(42, Number.NaN, easing.linear)
    expect(nan.value.peek()).toBe(42)
    expect(nan.state()).toBe('finished')
    expect(nan.step(100)).toBe(42)

    const inf = createTweenTimeline(10)
    inf.to(99, Number.POSITIVE_INFINITY, easing.linear)
    expect(inf.value.peek()).toBe(99)
    expect(inf.state()).toBe('finished')

    const props = createPropertyTimeline({ x: 0 })
    props.to({ x: 7 }, Number.NaN)
    expect(props.values.x.peek()).toBe(7)
    expect(props.state()).toBe('finished')

    const bigintDur = createTweenTimeline(3)
    bigintDur.to(50, 400n as never, easing.linear)
    expect(bigintDur.value.peek()).toBe(50)
    expect(bigintDur.state()).toBe('finished')

    const propsBig = createPropertyTimeline({ x: 0 })
    propsBig.to({ x: 8 }, 2n as never)
    expect(propsBig.values.x.peek()).toBe(8)
    expect(propsBig.state()).toBe('finished')
  })

  it('normalizes non-finite initial values to 0 so interpolation stays finite', () => {
    const nan = createTweenTimeline(Number.NaN)
    expect(nan.value.peek()).toBe(0)
    nan.to(10, 100, easing.linear)
    expect(nan.step(50)).toBe(5)

    const negInf = createTweenTimeline(Number.NEGATIVE_INFINITY)
    expect(negInf.value.peek()).toBe(0)

    const props = createPropertyTimeline({ x: Number.NaN, y: 1 })
    expect(props.values.x.peek()).toBe(0)
    expect(props.values.y.peek()).toBe(1)
  })

  it('normalizes non-finite to() targets so step() never produces NaN', () => {
    const timeline = createTweenTimeline(0)
    timeline.to(Number.NaN, 100, easing.linear)
    expect(timeline.step(50)).toBe(0)
    expect(timeline.value.peek()).toBe(0)
    expect(Number.isNaN(timeline.value.peek())).toBe(false)
    expect(timeline.step(50)).toBe(0)
    expect(timeline.state()).toBe('finished')

    const fromTen = createTweenTimeline(10)
    fromTen.to(Number.POSITIVE_INFINITY, 100, easing.linear)
    expect(fromTen.step(50)).toBe(5)
    expect(Number.isFinite(fromTen.value.peek())).toBe(true)

    const props = createPropertyTimeline({ x: 0 })
    props.to({ x: Number.NaN }, 200, easing.linear)
    expect(props.step(100).x).toBe(0)
    expect(props.values.x.peek()).toBe(0)
    expect(Number.isNaN(props.values.x.peek())).toBe(false)
    props.step(100)
    expect(props.state()).toBe('finished')
  })

  it('steps deterministically to completion', () => {
    const timeline = createTweenTimeline(0)
    timeline.to(100, 1000, easing.linear)

    expect(timeline.state()).toBe('running')
    expect(timeline.step(250)).toBe(25)
    expect(timeline.value.peek()).toBe(25)
    expect(timeline.step(250)).toBe(50)
    expect(timeline.step(500)).toBe(100)
    expect(timeline.state()).toBe('finished')
  })

  it('supports interrupt semantics with new targets', () => {
    const timeline = createTweenTimeline(0)
    timeline.to(100, 1000, easing.linear)
    timeline.step(400)
    expect(timeline.value.peek()).toBe(40)

    timeline.to(10, 200, easing.linear)
    expect(timeline.state()).toBe('running')
    expect(timeline.step(100)).toBe(25)
    expect(timeline.step(100)).toBe(10)
    expect(timeline.state()).toBe('finished')
  })

  it('supports pause, resume, and cancel', () => {
    const timeline = createTweenTimeline(5)
    timeline.to(25, 200, easing.linear)
    timeline.step(100)
    expect(timeline.value.peek()).toBe(15)

    timeline.pause()
    expect(timeline.state()).toBe('paused')
    timeline.step(100)
    expect(timeline.value.peek()).toBe(15)

    timeline.resume()
    expect(timeline.state()).toBe('running')
    timeline.cancel()
    expect(timeline.state()).toBe('cancelled')
    timeline.step(100)
    expect(timeline.value.peek()).toBe(15)
  })

  it('lazily adds properties at 0 when first targeted in to()', () => {
    const props = createPropertyTimeline({ x: 0 })
    props.to({ x: 100, z: 50 }, 200, easing.linear)
    expect(props.values.z.peek()).toBe(0)

    let next = props.step(100)
    expect(next.x).toBe(50)
    expect(next.z).toBe(25)

    next = props.step(100)
    expect(next.x).toBe(100)
    expect(next.z).toBe(50)
    expect(props.state()).toBe('finished')
  })

  it('animates multiple geometry/paint properties deterministically', () => {
    const props = createPropertyTimeline({ x: 0, y: 0, width: 100, opacity: 0 })
    props.to({ x: 40, y: 20, width: 140, opacity: 1 }, 400, easing.linear)

    let next = props.step(200)
    expect(next.x).toBe(20)
    expect(next.y).toBe(10)
    expect(next.width).toBe(120)
    expect(next.opacity).toBe(0.5)
    expect(props.state()).toBe('running')

    next = props.step(200)
    expect(next.x).toBe(40)
    expect(next.y).toBe(20)
    expect(next.width).toBe(140)
    expect(next.opacity).toBe(1)
    expect(props.state()).toBe('finished')
  })

  it('stays deterministic under rapid interrupt bursts', () => {
    const props = createPropertyTimeline({ x: 0, opacity: 0 })
    for (let i = 0; i < 25; i++) {
      props.to({ x: i * 10, opacity: (i % 10) / 10 }, 100, easing.linear)
      props.step(20)
      props.step(20)
    }
    const snapshot = props.step(60)
    expect(snapshot.x).toBeGreaterThanOrEqual(0)
    expect(snapshot.opacity).toBeGreaterThanOrEqual(0)
    expect(snapshot.opacity).toBeLessThanOrEqual(1)
    expect(props.state()).toBe('finished')
  })
})

describe('spring', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function loadSpringAndSignal() {
    vi.resetModules()
    const { spring } = await import('../animation.js')
    const { signal } = await import('../signals.js')
    return { spring, signal }
  }

  /** `spring()` always schedules a perpetual `checkTarget` poll; drain with a hard step cap. */
  function drainRafQueue(pending: FrameRequestCallback[], maxSteps: number) {
    for (let i = 0; i < maxSteps && pending.length > 0; i++) {
      pending.shift()!(0)
    }
  }

  it('follows target.value after set() under mocked rAF (physics converges)', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { spring, signal } = await loadSpringAndSignal()
    const target = signal(0)
    const out = spring(target, { stiffness: 800, damping: 48, mass: 1 })

    expect(out.peek()).toBe(0)

    target.set(100)
    drainRafQueue(pending, 50_000)

    expect(out.peek()).toBeCloseTo(100, 1)
  })

  it('retargets when the signal changes again before settling', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { spring, signal } = await loadSpringAndSignal()
    const target = signal(0)
    const out = spring(target, { stiffness: 500, damping: 40, mass: 1 })

    target.set(80)
    drainRafQueue(pending, 8_000)

    target.set(20)
    drainRafQueue(pending, 50_000)

    expect(out.peek()).toBeCloseTo(20, 1)
  })

  it('leaves the output at the initial target when no further sets occur', async () => {
    const pending: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending.push(cb)
      return pending.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { spring, signal } = await loadSpringAndSignal()
    const target = signal(42)
    const out = spring(target, { stiffness: 200, damping: 24, mass: 1 })

    drainRafQueue(pending, 2_000)
    expect(out.peek()).toBe(42)
  })
})
