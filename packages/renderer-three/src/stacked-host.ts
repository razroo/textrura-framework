import * as THREE from 'three'
import {
  createBrowserCanvasClient,
  type BrowserCanvasClientHandle,
} from '@geometra/renderer-canvas'
import type {
  GeometraHostBrowserCanvasClientOptions,
  ThreeFrameContext,
  ThreeRuntimeContext,
} from './split-host.js'
import {
  GEOMETRA_THREE_HOST_SCENE_DEFAULTS,
  createGeometraThreeWebGLWithSceneBasics,
  disposeGeometraThreeWebGLWithSceneBasics,
  type GeometraThreeSceneBasicsOptions,
} from './three-scene-basics.js'
import { createGeometraHostLayoutSyncRaf } from './layout-sync.js'
import {
  coerceGeometraHudPlacement,
  coerceGeometraHudPointerEvents,
  coerceHostNonNegativeCssPx,
  coerceHostStackingZIndexCss,
  type GeometraHudPlacement,
} from './host-css-coerce.js'
import { resizeGeometraThreePerspectiveView, resolveHostDevicePixelRatio } from './utils.js'

export type { GeometraHudPlacement } from './host-css-coerce.js'

/**
 * Default HUD width, height, corner, and margin for {@link createThreeGeometraStackedHost}; same as
 * those option fallbacks and README.
 */
export const GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS = {
  geometraHudWidth: 420,
  geometraHudHeight: 320,
  geometraHudPlacement: 'bottom-right',
  geometraHudMargin: 12,
} as const satisfies {
  geometraHudWidth: number
  geometraHudHeight: number
  geometraHudPlacement: GeometraHudPlacement
  geometraHudMargin: number
}

export interface ThreeGeometraStackedHostOptions
  extends GeometraHostBrowserCanvasClientOptions,
    GeometraThreeSceneBasicsOptions {
  /** Host element; a full-size stacking context is appended (existing children are left untouched). */
  container: HTMLElement
  /**
   * HUD width in CSS pixels. Default: {@link GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudWidth}.
   * Non-finite or negative values fall back to the default so layout does not emit invalid `px` styles.
   */
  geometraHudWidth?: number
  /**
   * HUD height in CSS pixels. Default: {@link GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudHeight}.
   * Non-finite or negative values fall back to the default.
   */
  geometraHudHeight?: number
  /**
   * HUD corner. Default: {@link GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudPlacement}.
   * Runtime strings (e.g. from JSON or agents) are normalized with {@link coerceGeometraHudPlacement}
   * (trim + case-insensitive match for the four literals; anything else uses the default).
   */
  geometraHudPlacement?: GeometraHudPlacement
  /**
   * Inset from the chosen corner in CSS pixels. Default: {@link GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudMargin}.
   * Non-finite or negative values fall back to the default.
   */
  geometraHudMargin?: number
  /**
   * CSS `pointer-events` on the HUD wrapper (e.g. `'none'` so input falls through to the WebGL canvas).
   * Default: `'auto'`. Blank or whitespace-only strings fall back to the default; use
   * {@link coerceGeometraHudPointerEvents} in custom layouts for the same rules.
   */
  geometraHudPointerEvents?: string
  /**
   * CSS `z-index` on the HUD wrapper when you stack other siblings in {@link ThreeGeometraStackedHostOptions.container}
   * or need a fixed order above the WebGL layer (Three canvas uses `0`). Default: `1`.
   * Non-finite numbers and blank/whitespace-only strings fall back to the default so the HUD keeps a predictable stack order.
   */
  geometraHudZIndex?: string | number
  /**
   * Upper bound for `window.devicePixelRatio` when sizing the WebGL drawing buffer (e.g. `2` on retina
   * to cut memory and fragment cost). When omitted, the full device pixel ratio is used.
   */
  maxDevicePixelRatio?: number
  /**
   * Called once after scene, camera, and renderer are created.
   * Call `ctx.destroy()` to tear down immediately; the render loop will not start if the host is already destroyed.
   * If this callback throws, the host is fully torn down and the error is rethrown.
   */
  onThreeReady?: (ctx: ThreeRuntimeContext) => void
  /**
   * Called every frame before `renderer.render`.
   * Return **`false`** to skip `render` for this frame only (same idea as
   * {@link tickGeometraThreeWebGLWithSceneBasicsFrame}). If you call {@link ThreeRuntimeContext.destroy} here,
   * teardown runs and this frame’s `render` is skipped.
   * If this callback throws, the host is fully torn down and the error is rethrown (same as {@link onThreeReady}).
   */
  onThreeFrame?: (ctx: ThreeFrameContext) => void | false
}

export interface ThreeGeometraStackedHostHandle {
  root: HTMLDivElement
  /** Absolutely positioned wrapper around the Geometra canvas (stacked HUD). */
  geometraHud: HTMLDivElement
  threeCanvas: HTMLCanvasElement
  geometraCanvas: HTMLCanvasElement
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  clock: THREE.Clock
  geometra: BrowserCanvasClientHandle
  /**
   * Stops the render loop, tears down WebGL via {@link disposeGeometraThreeWebGLWithSceneBasics} (clock stop +
   * the same renderer registration headless {@link renderGeometraThreeWebGLWithSceneBasicsFrame} /
   * {@link tickGeometraThreeWebGLWithSceneBasicsFrame} use to skip draws after dispose), disconnects observers,
   * and tears down the Geometra client.
   */
  destroy(): void
}

function fullSizeCanvas(canvas: HTMLCanvasElement): void {
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
}

function applyHudPlacement(
  wrap: HTMLDivElement,
  placement: GeometraHudPlacement,
  marginPx: number,
): void {
  const m = `${marginPx}px`
  wrap.style.left = ''
  wrap.style.right = ''
  wrap.style.top = ''
  wrap.style.bottom = ''
  switch (placement) {
    case 'bottom-right':
      wrap.style.right = m
      wrap.style.bottom = m
      break
    case 'bottom-left':
      wrap.style.left = m
      wrap.style.bottom = m
      break
    case 'top-right':
      wrap.style.right = m
      wrap.style.top = m
      break
    case 'top-left':
      wrap.style.left = m
      wrap.style.top = m
      break
  }
}

/**
 * Stacked host: full-viewport Three.js `WebGLRenderer` with a positioned Geometra canvas **HUD** on top.
 *
 * Pointer routing follows normal hit-testing: events hit the Geometra canvas where it overlaps the WebGL layer
 * (HUD `z-index` above the Three canvas, which uses `0`); elsewhere, the Three canvas receives input. Override with
 * {@link ThreeGeometraStackedHostOptions.geometraHudPointerEvents} (e.g. `'none'` for a click-through HUD) or
 * {@link ThreeGeometraStackedHostOptions.geometraHudZIndex} when you add other positioned siblings.
 *
 * Geometra’s client still uses `resizeTarget: window` by default; when only the HUD box changes size,
 * a coalesced synthetic `resize` is dispatched on `window` (same pattern as {@link createThreeGeometraSplitHost}).
 * `ResizeObserver` callbacks and real `window` `resize` share one rAF-coalesced Three.js buffer pass; the
 * synthetic `resize` is emitted only from observer-driven layout changes, not from real window resizes.
 * The Three.js layer listens to `window` `resize` for `devicePixelRatio` changes and uses the host `root` size
 * for the drawing buffer. Optional {@link ThreeGeometraStackedHostOptions.maxDevicePixelRatio} caps the ratio
 * used for the WebGL buffer.
 */
export function createThreeGeometraStackedHost(
  options: ThreeGeometraStackedHostOptions,
): ThreeGeometraStackedHostHandle {
  const {
    container,
    geometraHudWidth: geometraHudWidthOpt = GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudWidth,
    geometraHudHeight: geometraHudHeightOpt = GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudHeight,
    geometraHudPlacement: geometraHudPlacementOpt = GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudPlacement,
    geometraHudMargin: geometraHudMarginOpt = GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudMargin,
    geometraHudPointerEvents: geometraHudPointerEventsOpt = 'auto',
    geometraHudZIndex = 1,
    maxDevicePixelRatio,
    threeBackground = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.threeBackground,
    cameraFov = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.cameraFov,
    cameraNear = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.cameraNear,
    cameraFar = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.cameraFar,
    cameraPosition = GEOMETRA_THREE_HOST_SCENE_DEFAULTS.cameraPosition,
    onThreeReady,
    onThreeFrame,
    window: providedWindow,
    ...browserOptions
  } = options

  const geometraHudWidth = coerceHostNonNegativeCssPx(
    geometraHudWidthOpt,
    GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudWidth,
  )
  const geometraHudHeight = coerceHostNonNegativeCssPx(
    geometraHudHeightOpt,
    GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudHeight,
  )
  const geometraHudMargin = coerceHostNonNegativeCssPx(
    geometraHudMarginOpt,
    GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudMargin,
  )
  const geometraHudPlacement = coerceGeometraHudPlacement(
    geometraHudPlacementOpt as string | undefined,
    GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS.geometraHudPlacement,
  )
  const geometraHudPointerEvents = coerceGeometraHudPointerEvents(geometraHudPointerEventsOpt, 'auto')

  const doc = container.ownerDocument
  const win = providedWindow ?? doc.defaultView
  if (!win) {
    throw new Error('createThreeGeometraStackedHost requires a browser window')
  }

  const root = doc.createElement('div')
  root.style.position = 'relative'
  root.style.width = '100%'
  root.style.height = '100%'
  root.style.minHeight = '0'
  root.style.minWidth = '0'
  root.style.overflow = 'hidden'
  container.appendChild(root)

  const threeCanvas = doc.createElement('canvas')
  fullSizeCanvas(threeCanvas)
  threeCanvas.style.position = 'absolute'
  threeCanvas.style.left = '0'
  threeCanvas.style.top = '0'
  threeCanvas.style.width = '100%'
  threeCanvas.style.height = '100%'
  threeCanvas.style.zIndex = '0'
  root.appendChild(threeCanvas)

  const geometraHud = doc.createElement('div')
  geometraHud.style.position = 'absolute'
  geometraHud.style.zIndex = coerceHostStackingZIndexCss(geometraHudZIndex, 1)
  geometraHud.style.width = `${geometraHudWidth}px`
  geometraHud.style.height = `${geometraHudHeight}px`
  geometraHud.style.minWidth = '0'
  geometraHud.style.minHeight = '0'
  geometraHud.style.overflow = 'hidden'
  geometraHud.style.pointerEvents = geometraHudPointerEvents
  applyHudPlacement(geometraHud, geometraHudPlacement, geometraHudMargin)
  root.appendChild(geometraHud)

  const geometraCanvas = doc.createElement('canvas')
  fullSizeCanvas(geometraCanvas)
  geometraHud.appendChild(geometraCanvas)

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
      root.clientWidth,
      root.clientHeight,
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

  const roRoot = new ResizeObserver(() => {
    layoutSync.schedule(true)
  })
  roRoot.observe(root)

  const roHud = new ResizeObserver(() => {
    layoutSync.schedule(true)
  })
  roHud.observe(geometraHud)

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
    roRoot.disconnect()
    roHud.disconnect()
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
    geometraHud,
    threeCanvas,
    geometraCanvas,
    renderer: glRenderer,
    scene,
    camera,
    clock,
    geometra: geometraHandle,
    destroy,
  }
}
