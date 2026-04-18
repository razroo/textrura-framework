import { afterEach, describe, it, expect } from 'vitest'
import { focusedElement, setFocus, setMotionPreference } from '../../../core/src/index.js'
import { animatedDialog, animatedSheet, animatedToast, createOverlayTransition } from '../index.js'

afterEach(() => {
  setMotionPreference('full')
  focusedElement.set(null)
})

describe('createOverlayTransition', () => {
  it('throws when fewer than two keyframes provided', () => {
    expect(() => createOverlayTransition({ keyframes: [{ at: 0, values: { opacity: 0 } }] }))
      .toThrow(/at least two keyframes/)
  })

  it('advances elapsed on step until the enter transition completes', () => {
    const t = createOverlayTransition({
      keyframes: [
        { at: 0, values: { opacity: 0 } },
        { at: 100, values: { opacity: 1 } },
      ],
    })
    expect(t.isMounted.peek()).toBe(false)
    t.open()
    expect(t.isMounted.peek()).toBe(true)
    expect(t.isOpen.peek()).toBe(false)
    t.step(50)
    expect(t.isOpen.peek()).toBe(false)
    t.step(60)
    expect(t.isOpen.peek()).toBe(true)
  })
})

describe('createOverlayTransition focus restoration', () => {
  it('restores focusedElement to the pre-open value when the exit transition completes', () => {
    const fakeTarget = {
      element: { kind: 'box', props: {}, children: [], handlers: { onKeyDown: () => {} } },
      layout: { x: 0, y: 0, width: 10, height: 10, children: [] },
    } as never
    setFocus(fakeTarget.element, fakeTarget.layout)
    const pre = focusedElement.peek()
    expect(pre).not.toBeNull()

    const t = createOverlayTransition({
      keyframes: [
        { at: 0, values: { opacity: 0 } },
        { at: 100, values: { opacity: 1 } },
      ],
      restoreFocusOnClose: true,
    })
    t.open()
    // Simulate focus moving into the dialog after open:
    focusedElement.set(null)
    t.step(200) // finish enter
    expect(t.isOpen.peek()).toBe(true)

    t.close()
    t.step(200) // finish exit
    expect(t.isMounted.peek()).toBe(false)
    expect(focusedElement.peek()).toBe(pre)
  })

  it('skips focus restoration entirely when restoreFocusOnClose is false', () => {
    const t = createOverlayTransition({
      keyframes: [
        { at: 0, values: { opacity: 0 } },
        { at: 100, values: { opacity: 1 } },
      ],
      restoreFocusOnClose: false,
    })
    t.open()
    focusedElement.set({ element: {} as never, layout: {} as never })
    t.close()
    t.step(200)
    // Focus was not captured, so nothing is written back. The value we set
    // during the open phase is preserved.
    expect(focusedElement.peek()).not.toBeNull()
  })

  it('restores focus immediately under reduced motion (close path has no frame loop)', () => {
    const fake = { element: { kind: 'box', props: {}, children: [], handlers: { onKeyDown: () => {} } } as never, layout: {} as never }
    setFocus(fake.element, fake.layout)
    setMotionPreference('reduced')

    const t = createOverlayTransition({
      keyframes: [
        { at: 0, values: { opacity: 0 } },
        { at: 100, values: { opacity: 1 } },
      ],
      restoreFocusOnClose: true,
      initialOpen: false,
    })
    // open() under reduced motion captures focus then jumps straight to open.
    t.open()
    // Close should restore immediately without step() calls.
    focusedElement.set(null)
    t.close()
    expect(focusedElement.peek()?.element).toBe(fake.element)
  })
})

describe('animatedDialog (refactored over createOverlayTransition)', () => {
  it('retains all public fields from the old direct implementation', () => {
    const dlg = animatedDialog({ title: 'Hi', body: 'Body' })
    expect(typeof dlg.view).toBe('function')
    expect(typeof dlg.open).toBe('function')
    expect(typeof dlg.close).toBe('function')
    expect(typeof dlg.step).toBe('function')
    expect(dlg.isMounted).toBeTruthy()
    expect(dlg.isOpen).toBeTruthy()
    expect(dlg.timeline).toBeTruthy()
  })

  it('captures focus on open by default and restores on close-complete', () => {
    const fake = { element: { kind: 'box', props: {}, children: [], handlers: { onKeyDown: () => {} } } as never, layout: {} as never }
    setFocus(fake.element, fake.layout)
    const dlg = animatedDialog({ title: 'Hi', body: 'Body', durationMs: 100 })
    dlg.open()
    focusedElement.set(null)
    dlg.step(150)
    dlg.close()
    dlg.step(150)
    expect(focusedElement.peek()?.element).toBe(fake.element)
  })

  it('respects opt-out via restoreFocusOnClose: false', () => {
    const fake = { element: { kind: 'box', props: {}, children: [], handlers: { onKeyDown: () => {} } } as never, layout: {} as never }
    setFocus(fake.element, fake.layout)
    const dlg = animatedDialog({ title: 'Hi', body: 'Body', durationMs: 100, restoreFocusOnClose: false })
    dlg.open()
    focusedElement.set(null)
    dlg.step(150)
    dlg.close()
    dlg.step(150)
    expect(focusedElement.peek()).toBeNull()
  })
})

describe('animatedSheet', () => {
  it('emits the axis key matching the requested side (right → left offset)', () => {
    const sheet = animatedSheet({
      content: { kind: 'box', props: {}, children: [] } as never,
      side: 'right',
      size: 320,
      durationMs: 100,
    })
    sheet.open()
    sheet.step(150)
    const v = sheet.view() as { props: { left: number; width: number } }
    // Fully open: left offset returns to 0; width pinned to size.
    expect(v.props.left).toBe(0)
    expect(v.props.width).toBe(320)
  })

  it('bottom sheet uses top axis and begins fully offset', () => {
    const sheet = animatedSheet({
      content: { kind: 'box', props: {}, children: [] } as never,
      side: 'bottom',
      size: 200,
      durationMs: 100,
    })
    sheet.open()
    // Before stepping, elapsed is 0 → top offset equals startOffset (positive size).
    const v = sheet.view() as { props: { top: number; height: number } }
    expect(v.props.top).toBe(200)
    expect(v.props.height).toBe(200)
  })

  it('returns a zero-size placeholder when unmounted', () => {
    const sheet = animatedSheet({ content: { kind: 'box', props: {}, children: [] } as never, side: 'left' })
    const v = sheet.view() as { props: { width: number; height: number } }
    expect(v.props.width).toBe(0)
    expect(v.props.height).toBe(0)
  })
})

describe('animatedToast', () => {
  it('auto-closes after autoCloseMs elapsed while fully open', () => {
    const t = animatedToast({
      message: 'Saved',
      durationMs: 100,
      autoCloseMs: 500,
    })
    t.open()
    // Enter
    t.step(150)
    expect(t.isOpen.peek()).toBe(true)
    // Open period — timer accumulates
    t.step(300)
    expect(t.isOpen.peek()).toBe(true)
    t.step(300) // total open time 600ms > 500ms autoClose
    expect(t.isOpen.peek()).toBe(false)
    // Exit
    t.step(150)
    expect(t.isMounted.peek()).toBe(false)
  })

  it('does not auto-close when autoCloseMs is omitted', () => {
    const t = animatedToast({ message: 'Saved', durationMs: 100 })
    t.open()
    t.step(1000)
    expect(t.isOpen.peek()).toBe(true)
  })

  it('renders status role and respects variant palette', () => {
    const t = animatedToast({ message: 'Heads up', variant: 'warning', durationMs: 50 })
    t.open()
    t.step(100)
    const v = t.view() as { semantic?: { role: string }; props: { backgroundColor: string } }
    expect(v.semantic?.role).toBe('status')
    expect(v.props.backgroundColor).toBe('#3a331f')
  })
})
