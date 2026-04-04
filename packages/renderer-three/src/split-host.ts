import * as THREE from 'three'
import {
  createBrowserCanvasClient,
  type BrowserCanvasClientHandle,
  type BrowserCanvasClientOptions,
} from '@geometra/renderer-canvas'
import {
  GEOMETRA_THREE_HOST_SCENE_DEFAULTS,
  createGeometraThreeWebGLWithSceneBasics,
  disposeGeometraThreeWebGLWithSceneBasics,
  type GeometraThreeSceneBasicsOptions,
} from './three-scene-basics.js'
import { createGeometraHostLayoutSyncRaf } from './layout-sync.js'
import { coerceHostNonNegativeCssPx } from './host-css-coerce.js'
import { resizeGeometraThreePerspectiveView, resolveHostDevicePixelRatio } from './utils.js'

/**
 * Every {@link createBrowserCanvasClient} option except `canvas`, which split/stacked hosts create
 * internally. Includes `url`, `binaryFraming`, optional explicit `window` for tests/iframes, and
 * the rest of {@link BrowserCanvasClientOptions}.
 */
export type GeometraHostBrowserCanvasClientOptions = Omit<BrowserCanvasClientOptions, 'canvas'>

/**
 * Default Geometra column width for {@link createThreeGeometraSplitHost}; same value as the
 * `geometraWidth` option fallback and README.
 */
export const GEOMETRA_SPLIT_HOST_LAYOUT_DEFAULTS = {
  geometraWidth: 420,
} as const

export interface ThreeGeometraSplitHostOptions
  extends GeometraHostBrowserCanvasClientOptions,
    GeometraThreeSceneBasicsOptions {
  /** Host element; a flex row is appended as a child (existing children are left untouched). */
  container: HTMLElement
  /**
   * Geometra column width in CSS pixels. Default: 420 ({@link GEOMETRA_SPLIT_HOST_LAYOUT_DEFAULTS}).
   * Non-finite or negative values fall back to the default so layout does not emit invalid `px` styles.
   */
  geometraWidth?: number
  /** When true, Geometra panel is on the left. Default: false (Three.js left, Geometra right). */
  geometraOnLeft?: boolean
  /**
   * Upper bound for `window.devicePixelRatio` when sizing the WebGL drawing buffer (e.g. `2` on retina
   * to cut memory and fragment cost). When omitted, the full device pixel ratio is used.
   */
  maxDevicePixelRatio?: number
  /**
   * Called once after scene, camera, and renderer are created.
   * Add meshes, lights, controls, etc. Call `ctx.destroy()` to tear down immediately; the render loop
   * will not start if the host is already destroyed. If this callback throws, the host is fully torn
   * down and the error is rethrown.
   */
  onThreeReady?: (ctx: ThreeRuntimeContext) => void
  /**
   * Called every frame before `renderer.render`.
   * Use for animations. Return **`false`** to skip `render` for this frame only (same idea as
   * {@link tickGeometraThreeWebGLWithSceneBasicsFrame}). If you call {@link ThreeRuntimeContext.destroy} here,
   * teardown runs and this frame’s `render` is skipped (avoids rendering after WebGL dispose).
   * If this callback throws, the host is fully torn down and the error is rethrown (same as {@link onThreeReady}).
   */
  onThreeFrame?: (ctx: ThreeFrameContext) => void | false
  /**
   * WebSocket URL for a transparent Geometra overlay canvas on the Three.js panel.
   * When set, a second canvas is absolutely positioned over the Three.js panel and connected
   * to this URL. Use for HUD elements (pills, labels, info panels) rendered by a separate
   * Geometra server view.
   */
  overlayUrl?: string
  /** Renderer options for the overlay canvas. Default: transparent background. */
  overlayRendererOptions?: Record<string, unknown>
  /** CSS pointer-events for the overlay. Default: ‘none’ (click-through). */
  overlayPointerEvents?: string
  /** Binary framing for the overlay WebSocket. Default: same as main client. */
  overlayBinaryFraming?: boolean
}

export interface ThreeRuntimeContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  threeCanvas: HTMLCanvasElement
  /** Same as `ThreeGeometraSplitHostHandle.destroy` — idempotent full teardown. */
  destroy(): void
}

export interface ThreeFrameContext extends ThreeRuntimeContext {
  clock: THREE.Clock
  delta: number
  elapsed: number
}

export interface ThreeGeometraSplitHostHandle {
  root: HTMLDivElement
  threePanel: HTMLDivElement
  geometraPanel: HTMLDivElement
  threeCanvas: HTMLCanvasElement
  geometraCanvas: HTMLCanvasElement
  /** Overlay canvas on the Three.js panel (present when `overlayUrl` was provided). */
  overlayCanvas?: HTMLCanvasElement
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  clock: THREE.Clock
  geometra: BrowserCanvasClientHandle
  /** Overlay Geometra client (present when `overlayUrl` was provided). */
  overlay?: BrowserCanvasClientHandle
  /**
   * Stops the render loop, tears down WebGL via {@link disposeGeometraThreeWebGLWithSceneBasics} (clock stop +
   * the same renderer registration headless {@link renderGeometraThreeWebGLWithSceneBasicsFrame} /
   * {@link tickGeometraThreeWebGLWithSceneBasicsFrame} use to skip draws after dispose), disconnects observers,
   * and tears down the Geometra client and overlay.
   */
  destroy(): void
}

function panelStyle(el: HTMLElement, flex: string): void {
  el.style.flex = flex
  el.style.minWidth = '0'
  el.style.minHeight = '0'
  el.style.position = 'relative'
  el.style.overflow = 'hidden'
}

function fullSizeCanvas(canvas: HTMLCanvasElement): void {
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
}

/**
 * Side-by-side host: Three.js `WebGLRenderer` on one flex pane and Geometra’s streamed canvas UI on the other.
 *
 * This is the recommended **hybrid** layout: 3D stays in Three; chrome and data panes stay in Geometra’s protocol.
 * Geometra’s client still uses `resizeTarget: window` by default; when only the Geometra column changes size,
 * a `ResizeObserver` schedules a synthetic `resize` on `window` so layout width/height track the panel.
 * The host `root` and both flex panes are observed (same idea as {@link createThreeGeometraStackedHost} observing
 * its `root`) so container-driven root box changes still coalesce into the same rAF pass even if a panel callback
 * ordering quirk would otherwise miss a tick.
 * Panel-driven updates coalesce to at most **one** animation frame per burst: a single `requestAnimationFrame`
 * pass runs the Three.js buffer resize and (when needed) that synthetic `resize`, so both flex panes firing
 * in the same frame do not call `renderer.setSize` twice.
 *
 * Real `window` `resize` events schedule the same coalesced Three.js pass **without** an extra synthetic
 * `resize`, so the thin client is not double-notified when the browser already fired `resize`.
 *
 * The Three.js pane listens to `window` `resize` as well so `devicePixelRatio` updates (zoom / display changes)
 * refresh the WebGL drawing buffer without relying on panel `ResizeObserver` alone. Optional
 * {@link ThreeGeometraSplitHostOptions.maxDevicePixelRatio} caps the ratio used for the WebGL buffer.
 *
 * Pass through {@link BrowserCanvasClientOptions} from `@geometra/renderer-canvas` / `@geometra/client`
 * (for example `binaryFraming`, `onError`, `onFrameMetrics`, `onData` for JSON side-channels on the same
 * socket as layout; channel names are defined by your app and the Geometra server).
 */
export function createThreeGeometraSplitHost(
  options: ThreeGeometraSplitHostOptions,
): ThreeGeometraSplitHostHandle {
  const {
    container,
    geometraWidth: geometraWidthOpt = GEOMETRA_SPLIT_HOST_LAYOUT_DEFAULTS.geometraWidth,
    geometraOnLeft = false,
    maxDevicePixelRatio,
    threeBackground = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.threeBackground,
    cameraFov = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.cameraFov,
    cameraNear = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.cameraNear,
    cameraFar = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.cameraFar,
    cameraPosition = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.cameraPosition,
    onThreeReady,
    onThreeFrame,
    overlayUrl,
    overlayRendererOptions,
    overlayPointerEvents = 'none',
    overlayBinaryFraming,
    window: providedWindow,
    ...browserOptions
  } = options

  const geometraWidth = coerceHostNonNegativeCssPx(
    geometraWidthOpt,
    GEOMETRA_SPLIT_HOST_LAYOUT_DEFAULTS.geometraWidth,
  )

  const doc = container.ownerDocument
  const win = providedWindow ?? doc.defaultView
  if (!win) {
    throw new Error('createThreeGeometraSplitHost requires a browser window')
  }

  const root = doc.createElement('div')
  root.style.display = 'flex'
  root.style.flexDirection = 'row'
  root.style.width = '100%'
  root.style.height = '100%'
  root.style.minHeight = '0'
  root.style.minWidth = '0'
  container.appendChild(root)

  const threePanel = doc.createElement('div')
  panelStyle(threePanel, '1 1 0%')

  const geometraPanel = doc.createElement('div')
  panelStyle(geometraPanel, '0 0 auto')
  geometraPanel.style.width = `${geometraWidth}px`
  geometraPanel.style.flexShrink = '0'

  if (geometraOnLeft) {
    root.append(geometraPanel, threePanel)
  } else {
    root.append(threePanel, geometraPanel)
  }

  const threeCanvas = doc.createElement('canvas')
  fullSizeCanvas(threeCanvas)
  threePanel.appendChild(threeCanvas)

  // Overlay canvas on the Three.js panel (optional)
  let overlayCanvasEl: HTMLCanvasElement | undefined
  if (overlayUrl) {
    overlayCanvasEl = doc.createElement('canvas')
    overlayCanvasEl.style.display = 'block'
    overlayCanvasEl.style.position = 'absolute'
    overlayCanvasEl.style.left = '0'
    overlayCanvasEl.style.top = '0'
    overlayCanvasEl.style.width = '100%'
    overlayCanvasEl.style.height = '100%'
    overlayCanvasEl.style.pointerEvents = overlayPointerEvents
    overlayCanvasEl.style.zIndex = '1'
    threePanel.appendChild(overlayCanvasEl)
  }

  const geometraCanvas = doc.createElement('canvas')
  fullSizeCanvas(geometraCanvas)
  geometraPanel.appendChild(geometraCanvas)

  const { renderer: glRenderer, scene, camera, clock } = createGeometraThreeWebGLWithSceneBasics(
    threeCanvas,
    {
      threeBackground,
      cameraFov,
      cameraNear,
      cameraFar,
      cameraPosition,
    },
  )

  const resizeThree = () => {
    resizeGeometraThreePerspectiveView(
      glRenderer,
      camera,
      threePanel.clientWidth,
      threePanel.clientHeight,
      resolveHostDevicePixelRatio(win.devicePixelRatio || 1, maxDevicePixelRatio),
    )
  }

  let destroyed = false

  const layoutSync = createGeometraHostLayoutSyncRaf(win, {
    isDestroyed: () => destroyed,
    syncLayout: resizeThree,
    dispatchGeometraResize: () => {
      win.dispatchEvent(new Event('resize'))
    },
  })

  const onWindowResize = () => {
    layoutSync.schedule(false)
  }
  win.addEventListener('resize', onWindowResize, { passive: true })

  resizeThree()

  const geometraHandle = (() => {
    try {
      return createBrowserCanvasClient({
        ...browserOptions,
        canvas: geometraCanvas,
        window: win,
      })
    } catch (err) {
      layoutSync.cancel()
      win.removeEventListener('resize', onWindowResize)
      disposeGeometraThreeWebGLWithSceneBasics({ renderer: glRenderer, clock })
      root.remove()
      throw err
    }
  })()

  // Overlay Geometra client (optional)
  let overlayHandle: BrowserCanvasClientHandle | undefined
  if (overlayUrl && overlayCanvasEl) {
    try {
      overlayHandle = createBrowserCanvasClient({
        url: overlayUrl,
        binaryFraming: overlayBinaryFraming ?? browserOptions.binaryFraming,
        canvas: overlayCanvasEl,
        window: win,
        rendererOptions: {
          background: 'transparent',
          ...(overlayRendererOptions as object),
        },
      })
    } catch (err) {
      layoutSync.cancel()
      win.removeEventListener('resize', onWindowResize)
      geometraHandle.destroy()
      disposeGeometraThreeWebGLWithSceneBasics({ renderer: glRenderer, clock })
      root.remove()
      throw err
    }
  }

  const roContainer = new ResizeObserver(() => {
    layoutSync.schedule(true)
  })
  roContainer.observe(root)
  roContainer.observe(threePanel)
  roContainer.observe(geometraPanel)

  let rafId: number | undefined

  const destroy = () => {
    if (destroyed) return
    destroyed = true
    if (rafId !== undefined) {
      win.cancelAnimationFrame(rafId)
      rafId = undefined
    }
    layoutSync.cancel()
    win.removeEventListener('resize', onWindowResize)
    roContainer.disconnect()
    overlayHandle?.destroy()
    geometraHandle.destroy()
    disposeGeometraThreeWebGLWithSceneBasics({ renderer: glRenderer, clock })
    root.remove()
  }

  const ctxBase: ThreeRuntimeContext = {
    renderer: glRenderer,
    scene,
    camera,
    threeCanvas,
    destroy,
  }

  try {
    onThreeReady?.(ctxBase)
  } catch (err) {
    destroy()
    throw err
  }

  const loop = () => {
    if (destroyed) return
    rafId = win.requestAnimationFrame(loop)
    const delta = clock.getDelta()
    const elapsed = clock.elapsedTime
    try {
      if (onThreeFrame?.({ ...ctxBase, clock, delta, elapsed }) === false) {
        return
      }
    } catch (err) {
      destroy()
      throw err
    }
    if (destroyed) return
    glRenderer.render(scene, camera)
  }

  if (!destroyed) {
    rafId = win.requestAnimationFrame(loop)
  }

  return {
    root,
    threePanel,
    geometraPanel,
    threeCanvas,
    geometraCanvas,
    overlayCanvas: overlayCanvasEl,
    renderer: glRenderer,
    scene,
    camera,
    clock,
    geometra: geometraHandle,
    overlay: overlayHandle,
    destroy,
  }
}
