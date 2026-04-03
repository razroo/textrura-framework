import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TexturaClient } from '@geometra/client'
import { createBrowserCanvasClient } from '../browser-client.js'

const {
  createClientMock,
  enableSelectionMock,
  enableAccessibilityMirrorMock,
  rendererDestroyMock,
  rendererRenderMock,
  selectionCleanupMock,
  accessibilityCleanupMock,
  CanvasRendererMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  enableSelectionMock: vi.fn(),
  enableAccessibilityMirrorMock: vi.fn(),
  rendererDestroyMock: vi.fn(),
  rendererRenderMock: vi.fn(),
  selectionCleanupMock: vi.fn(),
  accessibilityCleanupMock: vi.fn(),
  CanvasRendererMock: vi.fn(),
}))

vi.mock('@geometra/client', () => ({
  createClient: createClientMock,
}))

vi.mock('../renderer.js', () => ({
  CanvasRenderer: CanvasRendererMock,
  enableSelection: enableSelectionMock,
  enableAccessibilityMirror: enableAccessibilityMirrorMock,
}))

type Listener = (event?: unknown) => void

class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener as Listener)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener as Listener)
  }

  dispatch(type: string, event?: unknown): void {
    const list = this.listeners.get(type)
    if (!list) return
    for (const listener of list) listener(event)
  }
}

function makeWindowTarget(): Window {
  return new FakeEventTarget() as unknown as Window
}

describe('createBrowserCanvasClient', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    enableSelectionMock.mockReset()
    enableAccessibilityMirrorMock.mockReset()
    rendererDestroyMock.mockReset()
    rendererRenderMock.mockReset()
    selectionCleanupMock.mockReset()
    accessibilityCleanupMock.mockReset()
    CanvasRendererMock.mockReset()

    CanvasRendererMock.mockImplementation(function MockCanvasRenderer() {
      return {
        destroy: rendererDestroyMock,
        render: rendererRenderMock,
        lastLayout: null,
        lastTree: null,
      }
    })
    enableSelectionMock.mockReturnValue(selectionCleanupMock)
    enableAccessibilityMirrorMock.mockReturnValue(accessibilityCleanupMock)
    createClientMock.mockImplementation(
      () =>
        ({
          layout: null,
          tree: null,
          close: vi.fn(),
        }) satisfies TexturaClient,
    )
  })

  it('wires browser selection, accessibility mirror, focus, and cleanup by default', () => {
    const focus = vi.fn()
    const win = makeWindowTarget()
    const body = {} as HTMLElement
    const doc = { body, defaultView: win } as Document
    const target = new FakeEventTarget()
    const canvas = {
      ownerDocument: doc,
      focus,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      hasAttribute: () => true,
      setAttribute: () => undefined,
    } as unknown as HTMLCanvasElement

    const handle = createBrowserCanvasClient({
      canvas,
      url: 'ws://localhost:3200',
      binaryFraming: true,
    })

    expect(CanvasRendererMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas,
      }),
    )
    expect(enableSelectionMock).toHaveBeenCalledWith(canvas, handle.renderer, undefined)
    expect(enableAccessibilityMirrorMock).toHaveBeenCalledWith(body, handle.renderer, {})
    expect(createClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas,
        renderer: handle.renderer,
        url: 'ws://localhost:3200',
        binaryFraming: true,
      }),
    )

    target.dispatch('pointerdown')
    expect(focus).toHaveBeenCalledTimes(1)

    ;(win as unknown as FakeEventTarget).dispatch('beforeunload')
    expect(accessibilityCleanupMock).toHaveBeenCalledTimes(1)
    expect(selectionCleanupMock).toHaveBeenCalledTimes(1)
    expect(handle.client.close).toHaveBeenCalledTimes(1)

    handle.destroy()
    expect(accessibilityCleanupMock).toHaveBeenCalledTimes(1)
    expect(selectionCleanupMock).toHaveBeenCalledTimes(1)
    expect(handle.client.close).toHaveBeenCalledTimes(1)
  })

  it('supports opting out of mirror/selection helpers and reusing an existing renderer', () => {
    const focus = vi.fn()
    const win = makeWindowTarget()
    const doc = { body: {} as HTMLElement, defaultView: win } as Document
    const target = new FakeEventTarget()
    const canvas = {
      ownerDocument: doc,
      focus,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      hasAttribute: () => true,
      setAttribute: () => undefined,
    } as unknown as HTMLCanvasElement
    const renderer = {
      destroy: rendererDestroyMock,
      render: rendererRenderMock,
      lastLayout: null,
      lastTree: null,
    } as unknown as Parameters<typeof createBrowserCanvasClient>[0]['renderer']

    const handle = createBrowserCanvasClient({
      canvas,
      renderer,
      selection: false,
      accessibilityMirror: false,
      focusOnPointerDown: false,
      autoFocus: true,
      closeOnBeforeUnload: false,
    })

    expect(CanvasRendererMock).not.toHaveBeenCalled()
    expect(enableSelectionMock).not.toHaveBeenCalled()
    expect(enableAccessibilityMirrorMock).not.toHaveBeenCalled()
    expect(focus).toHaveBeenCalledTimes(1)

    target.dispatch('pointerdown')
    expect(focus).toHaveBeenCalledTimes(1)

    handle.destroy()
    expect(handle.client.close).toHaveBeenCalledTimes(1)
  })
})
