import { describe, it, expect } from 'vitest'
import {
  createPropertyTimeline,
  createTweenTimeline,
  easing,
  getMotionPreference,
  normalizeSpringConfig,
  setMotionPreference,
  transition,
} from '../animation.js'

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
