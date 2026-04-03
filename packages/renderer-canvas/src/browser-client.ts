import { createClient, type TexturaClient, type TexturaClientOptions } from '@geometra/client'
import {
  CanvasRenderer,
  enableAccessibilityMirror,
  enableSelection,
  type AccessibilityMirrorOptions,
  type CanvasRendererOptions,
} from './renderer.js'

export interface BrowserCanvasClientOptions extends Omit<TexturaClientOptions, 'renderer' | 'canvas'> {
  /** Canvas element to paint into. */
  canvas: HTMLCanvasElement
  /** Reuse an existing renderer instance instead of creating one. */
  renderer?: CanvasRenderer
  /** Options for the internally created renderer. Ignored when `renderer` is provided. */
  rendererOptions?: Omit<CanvasRendererOptions, 'canvas'>
  /** Enable canvas text selection helpers. Default: true. */
  selection?: boolean | { onSelectionChange?: () => void }
  /** Enable the hidden accessibility DOM mirror. Default: true. */
  accessibilityMirror?: boolean | AccessibilityMirrorOptions
  /** Host element for the hidden accessibility mirror. Default: `document.body`. */
  accessibilityHost?: HTMLElement
  /** Focus the canvas on pointerdown so keyboard input stays in the app. Default: true. */
  focusOnPointerDown?: boolean
  /** Focus the canvas immediately after bootstrap. Default: false. */
  autoFocus?: boolean
  /** Automatically close the client on `beforeunload`. Default: true. */
  closeOnBeforeUnload?: boolean
  /** Optional explicit browser window for tests/custom hosts. */
  window?: Window
}

export interface BrowserCanvasClientHandle {
  canvas: HTMLCanvasElement
  renderer: CanvasRenderer
  client: TexturaClient
  destroy(): void
}

/**
 * Canonical browser bootstrap for Geometra thin-client canvas apps.
 * Wires `CanvasRenderer`, `createClient`, selection, focus, resize, and
 * the accessibility mirror into a single setup path.
 */
export function createBrowserCanvasClient(
  options: BrowserCanvasClientOptions,
): BrowserCanvasClientHandle {
  const {
    canvas,
    renderer: providedRenderer,
    rendererOptions,
    selection = true,
    accessibilityMirror = true,
    accessibilityHost,
    focusOnPointerDown = true,
    autoFocus = false,
    closeOnBeforeUnload = true,
    window: providedWindow,
    ...clientOptions
  } = options

  const doc = canvas.ownerDocument
  const win = providedWindow ?? doc.defaultView
  if (!win) {
    throw new Error('createBrowserCanvasClient requires a browser window')
  }

  let renderer: CanvasRenderer
  if (providedRenderer) {
    renderer = providedRenderer
  } else {
    const userOnImageLoaded = rendererOptions?.onImageLoaded
    renderer = new CanvasRenderer({
      ...rendererOptions,
      canvas,
      onImageLoaded: () => {
        userOnImageLoaded?.()
        if (renderer.lastLayout && renderer.lastTree) {
          renderer.render(renderer.lastLayout, renderer.lastTree)
        }
      },
    })
  }

  const selectionOptions = typeof selection === 'object' ? selection : undefined
  const cleanupSelection =
    selection === false
      ? () => undefined
      : enableSelection(canvas, renderer, selectionOptions?.onSelectionChange)

  const mirrorOptions = typeof accessibilityMirror === 'object' ? accessibilityMirror : {}
  const mirrorHost = accessibilityHost ?? doc.body
  const cleanupAccessibilityMirror =
    accessibilityMirror === false
      ? () => undefined
      : enableAccessibilityMirror(mirrorHost, renderer, mirrorOptions)

  const client = createClient({
    ...clientOptions,
    renderer,
    canvas,
  })

  const focusCanvas = () => {
    canvas.focus()
  }
  if (focusOnPointerDown) {
    canvas.addEventListener('pointerdown', focusCanvas)
  }

  let destroyed = false
  const destroy = () => {
    if (destroyed) return
    destroyed = true
    if (focusOnPointerDown) {
      canvas.removeEventListener('pointerdown', focusCanvas)
    }
    if (closeOnBeforeUnload) {
      win.removeEventListener('beforeunload', destroy)
    }
    cleanupAccessibilityMirror()
    cleanupSelection()
    client.close()
  }

  if (closeOnBeforeUnload) {
    win.addEventListener('beforeunload', destroy)
  }

  if (autoFocus) {
    focusCanvas()
  }

  return {
    canvas,
    renderer,
    client,
    destroy,
  }
}
