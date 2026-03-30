import { init, computeLayout } from 'textura'
import type { ComputedLayout } from 'textura'
import type { UIElement, Renderer } from './types.js'
import { toLayoutTree } from './tree.js'
import { dispatchHit } from './hit-test.js'
import { effect } from './signals.js'

export interface AppOptions {
  /** Root width for layout computation. */
  width?: number
  /** Root height for layout computation. */
  height?: number
}

export interface App {
  /** The current computed layout. */
  layout: ComputedLayout | null
  /** The current element tree. */
  tree: UIElement | null
  /** Manually trigger a re-render. */
  update(): void
  /** Dispatch a pointer event at (x, y). */
  dispatch(eventType: 'onClick' | 'onPointerDown' | 'onPointerUp' | 'onPointerMove', x: number, y: number): boolean
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
      app.tree = view()
      const layoutTree = toLayoutTree(app.tree)
      app.layout = computeLayout(layoutTree, {
        width: options.width,
        height: options.height,
      })
      renderer.render(app.layout, app.tree)
    },
    dispatch(eventType, x, y) {
      if (!app.tree || !app.layout) return false
      return dispatchHit(app.tree, app.layout, eventType, x, y)
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
