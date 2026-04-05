import { init, computeLayout } from 'textura'
import type { ComputedLayout, ComputeOptions } from 'textura'
import type { UIElement, Renderer, EventHandlers, KeyboardHitEvent } from './types.js'
import { toLayoutTree } from './tree.js'
import { resolveComputeLayoutDirection } from './direction.js'
import { dispatchHit } from './hit-test.js'
import { effect } from './signals.js'
import { focusedElement, setFocus } from './focus.js'
import { collectFontFamiliesFromTree, resolveFontLoadTimeoutMs, waitForFonts } from './fonts.js'
import { dispatchKeyboardEvent, dispatchCompositionEvent } from './keyboard.js'
import { finiteRootExtent } from './layout-bounds.js'
import { safePerformanceNowMs } from './performance-now.js'

export interface AppOptions {
  /**
   * Root width for layout computation. Non-numbers, non-finite values, and negatives are ignored
   * (same as omitting the option) so corrupt options cannot poison Yoga.
   */
  width?: number
  /**
   * Root height for layout computation. Non-numbers, non-finite values, and negatives are ignored
   * (same as omitting the option) so corrupt options cannot poison Yoga.
   */
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
   *
   * Values other than the strings `ltr` and `rtl` (e.g. malformed plain-JS options) are ignored and
   * treated like omission so `computeLayout` still receives a concrete direction.
   *
   * Nested `dir` on descendants is forwarded into Textura for per-subtree flex layout; the layout-tree root
   * still omits `dir` so this option and the resolved root direction stay aligned.
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
  /**
   * Dispatch a pointer event at `(x, y)` using the same coordinate space and optional root offsets as
   * {@link dispatchHit} (nested canvas surfaces, CSS transforms).
   * Non-finite or non-number `x` / `y` return `false` without handlers or focus changes (same
   * `Number.isFinite` rule as {@link dispatchHit}).
   * Non-finite or non-number offsets are treated as `0`.
   *
   * @returns `true` when a handler ran (`handled` from {@link dispatchHit}). For `'onClick'`, focus may
   *   still move via click-to-focus when this returns `false` (keyboard/composition target only).
   */
  dispatch(
    eventType: keyof EventHandlers,
    x: number,
    y: number,
    extra?: Record<string, unknown>,
    offsetX?: number,
    offsetY?: number,
  ): boolean
  /**
   * Dispatch a keyboard event to the focused element (and Tab / Shift+Tab traversal on keydown).
   *
   * @see {@link dispatchKeyboardEvent} for full return semantics (Tab keydown always reports handled).
   */
  dispatchKey(eventType: 'onKeyDown' | 'onKeyUp', event: Omit<KeyboardHitEvent, 'target'>): boolean
  /**
   * Dispatch an IME composition event to the focused element.
   *
   * @see {@link dispatchCompositionEvent}
   */
  dispatchComposition(
    eventType: 'onCompositionStart' | 'onCompositionUpdate' | 'onCompositionEnd',
    event: { data: string },
  ): boolean
  /** Stops the reactive effect and calls {@link Renderer.destroy} on the renderer. */
  destroy(): void
}

/**
 * Mount a reactive UI tree onto a renderer.
 *
 * The `view` function is called inside a reactive effect — any signals
 * read during its execution will trigger automatic re-layout and re-render.
 *
 * After each successful `computeLayout`, optional {@link Renderer.setFrameTimings} is invoked with
 * `{ layoutMs }` (non-negative wall milliseconds from a guarded `performance.now()` when usable, otherwise `0`)
 * immediately before `render`, so hosts can split Yoga/layout time from paint.
 *
 * `tree` and `layout` are assigned together only after `render` completes so a failed frame never leaves
 * a new element tree paired with a stale layout (or layout without a matching paint).
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
        const nextTree = view()
        const layoutTree = toLayoutTree(nextTree)
        const direction = resolveComputeLayoutDirection(options.layoutDirection, nextTree)
        const layoutStart = safePerformanceNowMs()
        const computeOpts: ComputeOptions = { direction }
        const rootW = finiteRootExtent(options.width)
        const rootH = finiteRootExtent(options.height)
        if (rootW !== undefined) computeOpts.width = rootW
        if (rootH !== undefined) computeOpts.height = rootH
        const nextLayout = computeLayout(layoutTree, computeOpts)
        const rawLayoutMs = safePerformanceNowMs() - layoutStart
        const layoutMs = Math.max(0, Number.isFinite(rawLayoutMs) ? rawLayoutMs : 0)
        renderer.setFrameTimings?.({ layoutMs })
        renderer.render(nextLayout, nextTree)
        app.tree = nextTree
        app.layout = nextLayout
      } catch (err) {
        if (options.onError) {
          options.onError(err)
        } else {
          console.error('Geometra render error:', err)
        }
      }
    },
    dispatch(eventType, x, y, extra, offsetX, offsetY) {
      if (!app.tree || !app.layout) return false
      const { handled, focusTarget } = dispatchHit(app.tree, app.layout, eventType, x, y, extra, offsetX, offsetY)
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
