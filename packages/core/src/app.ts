import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import type { UIElement, Renderer, EventHandlers, KeyboardHitEvent } from './types.js'
import { toLayoutTree } from './tree.js'
import { resolveElementDirection } from './direction.js'
import { dispatchHit } from './hit-test.js'
import { effect } from './signals.js'
import { focusedElement, setFocus } from './focus.js'
import { collectFontFamiliesFromTree, resolveFontLoadTimeoutMs, waitForFonts } from './fonts.js'
import { dispatchKeyboardEvent, dispatchCompositionEvent } from './keyboard.js'

export interface AppOptions {
  /** Root width for layout computation. */
  width?: number
  /** Root height for layout computation. */
  height?: number
  /** Called when an error occurs during update. */
  onError?: (error: unknown) => void
  /**
   * Await `document.fonts` for families used in the initial view (browser only).
   * Reduces first-paint layout shift for web fonts.
   */
  waitForFonts?: boolean
  /**
   * Max time to wait for fonts when `waitForFonts` is true. Default `10_000`.
   * Non-finite or negative values fall back to the default (same rules as `waitForFonts` in `fonts.js`).
   */
  fontLoadTimeoutMs?: number
  /**
   * Yoga / Textura root layout direction. When omitted, derived from the root element’s resolved
   * `dir` prop (parent context defaults to `ltr`), so RTL roots mirror flex rows correctly.
   */
  layoutDirection?: 'ltr' | 'rtl'
}

export interface App {
  /** The current computed layout. */
  layout: ComputedLayout | null
  /** The current element tree. */
  tree: UIElement | null
  /** Manually trigger a re-render. */
  update(): void
  /** Dispatch a pointer event at (x, y). */
  dispatch(eventType: keyof EventHandlers, x: number, y: number, extra?: Record<string, unknown>): boolean
  /** Dispatch a keyboard event to the focused element. */
  dispatchKey(eventType: 'onKeyDown' | 'onKeyUp', event: Omit<KeyboardHitEvent, 'target'>): boolean
  /** Dispatch an IME composition event to the focused element. */
  dispatchComposition(
    eventType: 'onCompositionStart' | 'onCompositionUpdate' | 'onCompositionEnd',
    event: { data: string },
  ): boolean
  /** Tear down the app. */
  destroy(): void
}

/**
 * Mount a reactive UI tree onto a renderer.
 *
 * The `view` function is called inside a reactive effect — any signals
 * read during its execution will trigger automatic re-layout and re-render.
 */
export async function createApp(
  view: () => UIElement,
  renderer: Renderer,
  options: AppOptions = {},
): Promise<App> {
  await init()

  if (options.waitForFonts && typeof document !== 'undefined') {
    try {
      const initialTree = view()
      await waitForFonts(
        collectFontFamiliesFromTree(initialTree),
        resolveFontLoadTimeoutMs(options.fontLoadTimeoutMs, 10_000),
      )
    } catch (err) {
      if (options.onError) {
        options.onError(err)
      } else {
        console.error('Geometra render error:', err)
      }
      throw err
    }
  }

  const app: App = {
    layout: null,
    tree: null,
    update() {
      try {
        app.tree = view()
        const layoutTree = toLayoutTree(app.tree)
        const direction =
          options.layoutDirection ?? resolveElementDirection(app.tree, 'ltr')
        const layoutStart = typeof performance !== 'undefined' ? performance.now() : 0
        app.layout = computeLayout(layoutTree, {
          width: options.width,
          height: options.height,
          direction,
        })
        const rawLayoutMs =
          typeof performance !== 'undefined' ? performance.now() - layoutStart : 0
        const layoutMs = Math.max(0, Number.isFinite(rawLayoutMs) ? rawLayoutMs : 0)
        renderer.setFrameTimings?.({ layoutMs })
        renderer.render(app.layout, app.tree)
      } catch (err) {
        if (options.onError) {
          options.onError(err)
        } else {
          console.error('Geometra render error:', err)
        }
      }
    },
    dispatch(eventType, x, y, extra) {
      if (!app.tree || !app.layout) return false
      const { handled, focusTarget } = dispatchHit(app.tree, app.layout, eventType, x, y, extra)
      if (eventType === 'onClick' && focusTarget) {
        setFocus(focusTarget.element, focusTarget.layout)
      }
      return handled
    },
    dispatchKey(eventType, partialEvent) {
      if (!app.tree || !app.layout) return false
      return dispatchKeyboardEvent(app.tree, app.layout, eventType, partialEvent)
    },
    dispatchComposition(eventType, partialEvent) {
      if (!app.tree || !app.layout) return false
      return dispatchCompositionEvent(app.tree, app.layout, eventType, partialEvent)
    },
    destroy() {
      dispose()
      renderer.destroy()
    },
  }

  const dispose = effect(() => {
    void focusedElement.value
    app.update()
  })

  return app
}
