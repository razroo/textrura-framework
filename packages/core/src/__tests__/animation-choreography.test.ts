import { afterEach, describe, expect, it } from 'vitest'
import {
  createKeyframeTimeline,
  createTweenTimeline,
  parallel,
  sequence,
  setMotionPreference,
  stagger,
} from '../index.js'

afterEach(() => {
  setMotionPreference('full')
})

describe('sequence', () => {
  it('advances only the current child and forwards to the next when it finishes', () => {
    const a = createTweenTimeline(0)
    const b = createTweenTimeline(0)
    a.to(10, 100)
    b.to(20, 100)
    const seq = sequence([a, b])

    seq.step(50)
    // easeInOut(0.5) === 0.5 (symmetry); 10 * 0.5 = 5.
    expect(a.value.peek()).toBeCloseTo(5, 5)
    expect(b.value.peek()).toBe(0)
    expect(seq.state()).toBe('running')

    seq.step(60) // finishes a; b does not yet start on this step
    expect(a.state()).toBe('finished')
    expect(seq.state()).toBe('running')

    seq.step(100) // finishes b
    expect(b.state()).toBe('finished')
    expect(seq.state()).toBe('finished')
  })

  it('reports idle for an empty sequence', () => {
    const seq = sequence([])
    expect(seq.state()).toBe('idle')
    seq.step(10)
    expect(seq.state()).toBe('idle')
  })

  it('cancel cascades to children', () => {
    const a = createTweenTimeline(0)
    a.to(10, 100)
    const seq = sequence([a])
    seq.cancel()
    expect(a.state()).toBe('cancelled')
    expect(seq.state()).toBe('cancelled')
  })
})

describe('parallel', () => {
  it('steps every child by the same delta', () => {
    const a = createTweenTimeline(0)
    const b = createTweenTimeline(0)
    a.to(100, 100)
    b.to(200, 100)
    const par = parallel([a, b])
    par.step(100)
    expect(a.state()).toBe('finished')
    expect(b.state()).toBe('finished')
    expect(par.state()).toBe('finished')
  })

  it('aggregates running > finished', () => {
    const a = createTweenTimeline(0)
    const b = createTweenTimeline(0)
    a.to(10, 100)
    b.to(10, 200)
    const par = parallel([a, b])
    par.step(100)
    expect(a.state()).toBe('finished')
    expect(b.state()).toBe('running')
    expect(par.state()).toBe('running')
  })

  it('treats non-finite and negative deltaMs as 0', () => {
    const a = createTweenTimeline(0)
    a.to(10, 100)
    const par = parallel([a])
    par.step(Number.NaN)
    par.step(-50)
    expect(a.value.peek()).toBe(0)
  })
})

describe('stagger', () => {
  it('starts children at configured offsets', () => {
    const a = createTweenTimeline(0)
    const b = createTweenTimeline(0)
    a.to(10, 100)
    b.to(10, 100)
    const stag = stagger([a, b], 50)
    stag.step(25) // neither child has begun moving (a at 0, b at -25)
    stag.step(25) // total 50: a now at 50ms
    expect(b.value.peek()).toBe(0)
  })

  it('clamps negative or non-finite delayMs to 0 (all start together)', () => {
    const a = createTweenTimeline(0)
    const b = createTweenTimeline(0)
    a.to(10, 100)
    b.to(10, 100)
    const stag = stagger([a, b], Number.NaN)
    stag.step(100)
    expect(a.state()).toBe('finished')
    expect(b.state()).toBe('finished')
  })
})

describe('createKeyframeTimeline', () => {
  it('throws on empty keyframe list', () => {
    expect(() => createKeyframeTimeline([])).toThrow(/at least one keyframe/)
  })

  it('samples interpolated values across keyframes', () => {
    const tl = createKeyframeTimeline([
      { at: 0, values: { x: 0 } },
      { at: 100, values: { x: 100 } },
    ])
    tl.scrubTo(0.5)
    const sample = tl.values.x!.peek()
    // default easeInOut at t=0.5 returns 0.5
    expect(sample).toBeCloseTo(50, 5)
  })

  it('scrubTo clamps values outside [0, 1]', () => {
    const tl = createKeyframeTimeline([
      { at: 0, values: { x: 0 } },
      { at: 100, values: { x: 100 } },
    ])
    tl.scrubTo(-1)
    expect(tl.values.x!.peek()).toBe(0)
    tl.scrubTo(5)
    expect(tl.values.x!.peek()).toBe(100)
  })

  it('step advances until duration then reports finished', () => {
    const tl = createKeyframeTimeline([
      { at: 0, values: { opacity: 0 } },
      { at: 200, values: { opacity: 1 } },
    ])
    tl.step(100)
    expect(tl.state()).toBe('running')
    tl.step(200)
    expect(tl.state()).toBe('finished')
    expect(tl.values.opacity!.peek()).toBeCloseTo(1, 5)
  })

  it('respects reduced motion by jumping to the final pose', () => {
    setMotionPreference('reduced')
    const tl = createKeyframeTimeline([
      { at: 0, values: { x: 0 } },
      { at: 100, values: { x: 100 } },
    ])
    expect(tl.state()).toBe('finished')
    expect(tl.values.x!.peek()).toBe(100)
  })

  it('normalizes non-finite keyframe values to 0', () => {
    const tl = createKeyframeTimeline([
      { at: 0, values: { x: Number.NaN } },
      { at: 100, values: { x: 100 } },
    ])
    tl.scrubTo(0)
    expect(tl.values.x!.peek()).toBe(0)
  })

  it('single-keyframe timeline is finished immediately and holds the only pose', () => {
    const tl = createKeyframeTimeline([{ at: 0, values: { x: 42 } }])
    expect(tl.state()).toBe('finished')
    expect(tl.values.x!.peek()).toBe(42)
    tl.step(1000)
    expect(tl.values.x!.peek()).toBe(42)
  })
})
