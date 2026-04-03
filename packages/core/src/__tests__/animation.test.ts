import { describe, it, expect } from 'vitest'
import {
  createPropertyTimeline,
  createTweenTimeline,
  easing,
  getMotionPreference,
  setMotionPreference,
  transition,
} from '../animation.js'

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
