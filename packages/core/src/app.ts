import { init, computeLayout } from 'textura'
import type { ComputedLayout, ComputeOptions } from 'textura'
import type { UIElement, Renderer, EventHandlers, KeyboardHitEvent } from './types.js'
import { toLayoutTree } from './tree.js'
import { resolveElementDirection } from './direction.js'
import { dispatchHit } from './hit-test.js'
import { effect } from './signals.js'
import { focusedElement, setFocus } from './focus.js'
import { collectFontFamiliesFromTree, resolveFontLoadTimeoutMs, waitForFonts } from './fonts.js'
import { dispatchKeyboardEvent, dispatchCompositionEvent } from './keyboard.js'

function resolveComputeLayoutDirection(
  layoutDirection: AppOptions['layoutDirection'],
  root: UIElement,
): 'ltr' | 'rtl' {
  if (layoutDirection === 'ltr' || layoutDirection === 'rtl') {
    return layoutDirection
  }
  return resolveElementDirection(root, 'ltr')
}

/** Only finite, non-negative numbers become Textura root constraints; otherwise the key is omitted (unconstrained). */
function finiteRootExtent(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const v = Object.is(value, -0) ? 0 : value
  return v >= 0 ? v : undefined
}

/**
 * Monotonic layout timing without throwing when `performance` is partial or hostile
 * (missing `now`, non-function `now`, or a throwing implementation).
 */
function safePerformanceNowMs(): number {
  try {
    const perf = globalThis.performance
    if (perf && typeof perf.now === 'function') {
      const t = perf.now()
      return typeof t === 'number' && Number.isFinite(t) ? t : 0
    }
  } catch {
    // ignore
  }
  return 0
}

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
        const direction = resolveComputeLayoutDirection(options.layoutDirection, app.tree)
        const layoutStart = safePerformanceNowMs()
        const computeOpts: ComputeOptions = { direction }
        const rootW = finiteRootExtent(options.width)
        const rootH = finiteRootExtent(options.height)
        if (rootW !== undefined) computeOpts.width = rootW
        if (rootH !== undefined) computeOpts.height = rootH
        app.layout = computeLayout(layoutTree, computeOpts)
        const rawLayoutMs = safePerformanceNowMs() - layoutStart
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
