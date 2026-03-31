import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import type { UIElement, Renderer, KeyboardHitEvent, EventHandlers } from './types.js'
import { toLayoutTree } from './tree.js'
import { dispatchHit } from './hit-test.js'
import { effect } from './signals.js'
import { focusedElement, setFocus, focusNext, focusPrev } from './focus.js'

export interface AppOptions {
  /** Root width for layout computation. */
  width?: number
  /** Root height for layout computation. */
  height?: number
  /** Called when an error occurs during update. */
  onError?: (error: unknown) => void
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

  const app: App = {
    layout: null,
    tree: null,
    update() {
      try {
        app.tree = view()
        const layoutTree = toLayoutTree(app.tree)
        app.layout = computeLayout(layoutTree, {
          width: options.width,
          height: options.height,
        })
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
      const handled = dispatchHit(app.tree, app.layout, eventType, x, y, extra)

      // Auto-focus on click: if the clicked element has keyboard handlers, focus it
      if (eventType === 'onClick' && handled) {
        // The hit-test already fired the handler; focus is set by the element if needed
      }

      return handled
    },
    dispatchKey(eventType, partialEvent) {
      const focused = focusedElement.peek()
      if (!focused) {
        // Tab navigation even without focus
        if (partialEvent.key === 'Tab' && app.tree && app.layout) {
          if (partialEvent.shiftKey) {
            focusPrev(app.tree, app.layout)
          } else {
            focusNext(app.tree, app.layout)
          }
          return true
        }
        return false
      }

      const handler = focused.element.handlers?.[eventType]
      if (handler) {
        const event: KeyboardHitEvent = { ...partialEvent, target: focused.layout }
        handler(event)
        return true
      }

      // Tab moves focus even if the element doesn't handle keyboard
      if (partialEvent.key === 'Tab' && app.tree && app.layout) {
        if (partialEvent.shiftKey) {
          focusPrev(app.tree, app.layout)
        } else {
          focusNext(app.tree, app.layout)
        }
        return true
      }

      return false
    },
    destroy() {
      dispose()
      renderer.destroy()
    },
  }

  const dispose = effect(() => {
    app.update()
  })

  return app
}
