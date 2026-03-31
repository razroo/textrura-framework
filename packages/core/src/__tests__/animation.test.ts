import { describe, it, expect } from 'vitest'
import { createTweenTimeline, easing } from '../animation.js'

describe('animation timeline', () => {
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
})
