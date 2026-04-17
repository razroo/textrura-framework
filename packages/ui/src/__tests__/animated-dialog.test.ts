import { afterEach, describe, it, expect } from 'vitest'
import { setMotionPreference } from '../../../core/src/index.js'
import { animatedDialog } from '../index.js'

afterEach(() => {
  setMotionPreference('full')
})

describe('animatedDialog', () => {
  it('starts closed, mounts on open(), and reports fully-open after duration', () => {
    const dlg = animatedDialog({ title: 'Hi', body: 'Body', durationMs: 100 })
    expect(dlg.isMounted.peek()).toBe(false)
    expect(dlg.isOpen.peek()).toBe(false)

    dlg.open()
    expect(dlg.isMounted.peek()).toBe(true)
    expect(dlg.isOpen.peek()).toBe(false) // not yet

    dlg.step(50)
    expect(dlg.isOpen.peek()).toBe(false)
    dlg.step(60) // cumulative 110 ms > 100 ms duration
    expect(dlg.isOpen.peek()).toBe(true)
    expect(dlg.isMounted.peek()).toBe(true)
  })

  it('close() flips isOpen immediately and unmounts after exit transition', () => {
    const dlg = animatedDialog({ title: 'Hi', body: 'Body', initialOpen: true, durationMs: 100 })
    expect(dlg.isMounted.peek()).toBe(true)
    expect(dlg.isOpen.peek()).toBe(true)

    dlg.close()
    expect(dlg.isOpen.peek()).toBe(false)
    expect(dlg.isMounted.peek()).toBe(true) // still mounted while exiting

    dlg.step(60)
    expect(dlg.isMounted.peek()).toBe(true)
    dlg.step(60)
    expect(dlg.isMounted.peek()).toBe(false)
  })

  it('interrupting an open mid-flight with close() does not snap progress', () => {
    const dlg = animatedDialog({ title: 'Hi', body: 'Body', durationMs: 100 })
    dlg.open()
    dlg.step(40) // opacity ~ easeInOut(0.4) ≈ 0.352
    const opacityAfterEnter = dlg.timeline.values.opacity!.peek()
    expect(opacityAfterEnter).toBeGreaterThan(0)
    expect(opacityAfterEnter).toBeLessThan(1)

    dlg.close()
    dlg.step(20) // elapsed goes back from 40 → 20
    const opacityMidExit = dlg.timeline.values.opacity!.peek()
    expect(opacityMidExit).toBeLessThan(opacityAfterEnter) // moving back toward 0
    expect(opacityMidExit).toBeGreaterThan(0)
  })

  it('open() on an already-opening dialog is a no-op', () => {
    const dlg = animatedDialog({ title: 'Hi', body: 'Body', durationMs: 100 })
    dlg.open()
    dlg.step(50)
    const elapsedBefore = dlg.timeline.values.opacity!.peek()
    dlg.open() // should not restart
    dlg.step(0)
    expect(dlg.timeline.values.opacity!.peek()).toBe(elapsedBefore)
  })

  it('respects reduced motion: enter completes in one step', () => {
    setMotionPreference('reduced')
    const dlg = animatedDialog({ title: 'Hi', body: 'Body', durationMs: 500 })
    dlg.open()
    dlg.step(1)
    // With reduced motion, the keyframe timeline jumps to the final pose on init.
    // Our open() moves elapsed from 0 by 1ms — timeline still reports final pose
    // because its state is 'finished' from construction under reduced motion.
    expect(dlg.timeline.values.opacity!.peek()).toBe(1)
  })

  it('view returns a zero-size placeholder when unmounted and a populated dialog when mounted', () => {
    const dlg = animatedDialog({ title: 'Hi', body: 'Body', durationMs: 100 })
    const unmounted = dlg.view() as { kind: string; props: { width: number; height: number } }
    expect(unmounted.kind).toBe('box')
    expect(unmounted.props.width).toBe(0)
    expect(unmounted.props.height).toBe(0)

    dlg.open()
    const mounted = dlg.view() as { kind: string; props: { opacity: number }; children: unknown[] }
    expect(mounted.kind).toBe('box')
    expect(typeof mounted.props.opacity).toBe('number')
    expect(mounted.children.length).toBe(3) // title, body, actions row
  })
})
