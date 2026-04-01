import { describe, it, expect } from 'vitest'
import { enableInputForwarding } from '../renderer.js'
import type { App } from '@geometra/core'

type Listener = (event: unknown) => void

class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener as Listener)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener as Listener)
  }

  dispatch(type: string, event: unknown): void {
    const list = this.listeners.get(type)
    if (!list) return
    for (const listener of list) listener(event)
  }
}

function makeApp(overrides: Partial<App> = {}): App {
  return {
    layout: null,
    tree: null,
    update: () => undefined,
    dispatch: () => false,
    dispatchKey: () => false,
    dispatchComposition: () => false,
    destroy: () => undefined,
    ...overrides,
  }
}

describe('enableInputForwarding', () => {
  it('forwards pointerdown to app onClick dispatch with local coords', () => {
    const canvasTarget = new FakeEventTarget()
    const keyboardTarget = new FakeEventTarget()
    let dispatched: { eventType: string; x: number; y: number } | null = null

    const app = makeApp({
      dispatch: (eventType, x, y) => {
        dispatched = { eventType, x, y }
        return true
      },
    })

    const canvas = {
      addEventListener: canvasTarget.addEventListener.bind(canvasTarget),
      removeEventListener: canvasTarget.removeEventListener.bind(canvasTarget),
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as unknown as HTMLCanvasElement

    const cleanup = enableInputForwarding(canvas, () => app, {
      keyboardTarget: keyboardTarget as unknown as Document,
    })

    canvasTarget.dispatch('pointerdown', { clientX: 26, clientY: 45 })
    expect(dispatched).toEqual({ eventType: 'onClick', x: 16, y: 25 })

    cleanup()
  })

  it('forwards keydown and prevents default only when handled keys require it', () => {
    const canvasTarget = new FakeEventTarget()
    const keyboardTarget = new FakeEventTarget()
    let prevented = false
    let keyCalls = 0

    const app = makeApp({
      dispatchKey: () => {
        keyCalls++
        return true
      },
    })

    const canvas = {
      addEventListener: canvasTarget.addEventListener.bind(canvasTarget),
      removeEventListener: canvasTarget.removeEventListener.bind(canvasTarget),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLCanvasElement

    const cleanup = enableInputForwarding(canvas, () => app, {
      keyboardTarget: keyboardTarget as unknown as Document,
    })

    keyboardTarget.dispatch('keydown', {
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      preventDefault: () => {
        prevented = true
      },
    })
    expect(keyCalls).toBe(1)
    expect(prevented).toBe(true)

    prevented = false
    keyboardTarget.dispatch('keydown', {
      key: 'x',
      code: 'KeyX',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: () => {
        prevented = true
      },
    })
    expect(keyCalls).toBe(2)
    expect(prevented).toBe(false)

    cleanup()
  })

  it('forwards composition lifecycle events to app', () => {
    const canvasTarget = new FakeEventTarget()
    const keyboardTarget = new FakeEventTarget()
    const calls: Array<{ type: string; data: string }> = []

    const app = makeApp({
      dispatchComposition: (eventType, event) => {
        calls.push({ type: eventType, data: event.data })
        return true
      },
    })

    const canvas = {
      addEventListener: canvasTarget.addEventListener.bind(canvasTarget),
      removeEventListener: canvasTarget.removeEventListener.bind(canvasTarget),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLCanvasElement

    const cleanup = enableInputForwarding(canvas, () => app, {
      keyboardTarget: keyboardTarget as unknown as Document,
    })

    keyboardTarget.dispatch('compositionstart', { data: '' })
    keyboardTarget.dispatch('compositionupdate', { data: 'に' })
    keyboardTarget.dispatch('compositionend', { data: 'に' })
    expect(calls).toEqual([
      { type: 'onCompositionStart', data: '' },
      { type: 'onCompositionUpdate', data: 'に' },
      { type: 'onCompositionEnd', data: 'に' },
    ])

    cleanup()
  })

  it('cleanup removes pointer and keyboard forwarding listeners', () => {
    const canvasTarget = new FakeEventTarget()
    const keyboardTarget = new FakeEventTarget()
    let pointerCalls = 0
    let keyCalls = 0

    const app = makeApp({
      dispatch: () => {
        pointerCalls++
        return true
      },
      dispatchKey: () => {
        keyCalls++
        return true
      },
    })

    const canvas = {
      addEventListener: canvasTarget.addEventListener.bind(canvasTarget),
      removeEventListener: canvasTarget.removeEventListener.bind(canvasTarget),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLCanvasElement

    const cleanup = enableInputForwarding(canvas, () => app, {
      keyboardTarget: keyboardTarget as unknown as Document,
    })
    cleanup()

    canvasTarget.dispatch('pointerdown', { clientX: 10, clientY: 10 })
    keyboardTarget.dispatch('keydown', {
      key: 'a',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: () => undefined,
    })
    expect(pointerCalls).toBe(0)
    expect(keyCalls).toBe(0)
  })
})
