/**
 * `@geometra/renderer-three` — split/stacked Three.js + Geometra canvas hosts, WebGL sizing helpers
 * ({@link resizeGeometraThreePerspectiveView}, {@link toPlainGeometraThreeViewSizingState}, {@link isPlainGeometraThreeViewSizingState}, {@link resizeGeometraThreeDrawingBufferView} / {@link resizeGeometraThreeDrawingBufferViewHeadless}, DPR capping, {@link GEOMETRA_HEADLESS_RAW_DEVICE_PIXEL_RATIO}, {@link resolveHeadlessHostDevicePixelRatio}, {@link createGeometraThreePerspectiveResizeHandlerHeadless}), shared scene defaults
 * ({@link createGeometraThreeSceneBasics}, {@link resolveGeometraThreeSceneBasicsOptions}, {@link toPlainGeometraThreeSceneBasicsOptions},
 * {@link createGeometraThreeSceneBasicsFromPlain},
 * {@link createGeometraThreeWebGLWithSceneBasics}, {@link createGeometraThreeWebGLWithSceneBasicsFromPlain},
 * {@link resizeGeometraThreeWebGLWithSceneBasicsView}, {@link resizeGeometraThreeWebGLWithSceneBasicsViewHeadless},
 * {@link resizeGeometraThreeWebGLWithSceneBasicsViewFromPlainViewSizing},
 * {@link toPlainGeometraThreeViewSizingStateHeadless},
 * {@link renderGeometraThreeWebGLWithSceneBasicsFrame},
 * {@link tickGeometraThreeWebGLWithSceneBasicsFrame} (`onFrame` may return `false` to skip `render` and make the tick return `false`; {@link disposeGeometraThreeWebGLWithSceneBasics} inside `onFrame` skips `render` too, like host {@link ThreeRuntimeContext.destroy}; if `onFrame` throws, the error propagates and `render` is not called, matching split/stacked {@link ThreeGeometraSplitHostOptions.onThreeFrame} ordering), {@link resizeTickGeometraThreeWebGLWithSceneBasics} (resize + tick with explicit raw DPR), {@link resizeTickGeometraThreeWebGLWithSceneBasicsFromPlainViewSizing} (resize + tick from plain {@link PlainGeometraThreeViewSizingState}), {@link resizeTickGeometraThreeWebGLWithSceneBasicsFromPlainHostSnapshot} (same from full {@link PlainGeometraThreeHostSnapshot} / composite JSON), {@link resizeTickGeometraThreeWebGLWithSceneBasicsHeadless} (same with raw DPR **1**), {@link disposeGeometraThreeWebGLWithSceneBasics} (optional `clock` stops timing after dispose),
 * {@link toPlainGeometraThreeHostSnapshot}, {@link toPlainGeometraThreeHostSnapshotHeadless},
 * {@link toPlainGeometraThreeHostSnapshotFromViewSizing}, {@link mergePlainGeometraThreeHostSnapshot},
 * {@link toPlainGeometraSplitHostLayoutOptions} / {@link toPlainGeometraStackedHostLayoutOptions},
 * {@link toPlainGeometraThreeSplitHostSnapshot} / {@link toPlainGeometraThreeStackedHostSnapshot} (and headless variants)
 * for JSON-stable split/stacked layout plus viewport/scene in one object ({@link isGeometraHybridHostKind}, {@link coerceGeometraHybridHostKind}, {@link GEOMETRA_HYBRID_HOST_KINDS},
 * {@link isPlainGeometraThreeHostSnapshot}, {@link isPlainGeometraThreeSceneBasicsOptions}, {@link isPlainGeometraSplitHostLayoutOptions}, {@link isPlainGeometraStackedHostLayoutOptions},
 * {@link isPlainGeometraThreeSplitHostSnapshot}, {@link isPlainGeometraThreeStackedHostSnapshot}, {@link isPlainGeometraHybridHostKind}),
 * {@link toPlainGeometraStackedHudRect} for stacked HUD box math (same insets as {@link createThreeGeometraStackedHost}), and
 * {@link createGeometraHostLayoutSyncRaf} for custom hybrid layouts, {@link coerceHostStackingZIndexCss},
 * {@link coerceGeometraHudPointerEvents}, and {@link coerceGeometraHudPlacement} for stacked-overlay stacking and
 * HUD corner rules, and {@link GEOMETRA_SPLIT_HOST_LAYOUT_DEFAULTS} /
 * {@link GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS} for host layout defaults (custom layouts, logs, agent payloads).
 */

export {
  createThreeGeometraSplitHost,
  GEOMETRA_SPLIT_HOST_LAYOUT_DEFAULTS,
  type GeometraHostBrowserCanvasClientOptions,
  type ThreeGeometraSplitHostHandle,
  type ThreeGeometraSplitHostOptions,
  type ThreeFrameContext,
  type ThreeRuntimeContext,
} from './split-host.js'
export {
  createThreeGeometraStackedHost,
  GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS,
  type ThreeGeometraStackedHostHandle,
  type ThreeGeometraStackedHostOptions,
} from './stacked-host.js'
export {
  GEOMETRA_HEADLESS_RAW_DEVICE_PIXEL_RATIO,
  createGeometraThreePerspectiveResizeHandler,
  createGeometraThreePerspectiveResizeHandlerHeadless,
  geometraHostPerspectiveAspectFromCss,
  isPlainGeometraThreeViewSizingState,
  normalizeGeometraLayoutPixels,
  resizeGeometraThreeDrawingBufferView,
  resizeGeometraThreeDrawingBufferViewHeadless,
  resizeGeometraThreePerspectiveView,
  resolveHeadlessHostDevicePixelRatio,
  resolveHostDevicePixelRatio,
  setWebGLDrawingBufferSize,
  syncGeometraThreePerspectiveFromBuffer,
  toPlainGeometraThreeViewSizingState,
  toPlainGeometraThreeViewSizingStateHeadless,
  type PlainGeometraThreeViewSizingState,
} from './utils.js'
export {
  GEOMETRA_HOST_WEBGL_RENDERER_OPTIONS,
  GEOMETRA_THREE_HOST_SCENE_DEFAULTS,
  createGeometraHostWebGLRendererParams,
  createGeometraThreeSceneBasics,
  createGeometraThreeSceneBasicsFromPlain,
  resolveGeometraThreeSceneBasicsOptions,
  toPlainGeometraThreeSceneBasicsOptions,
  toPlainGeometraThreeHostSnapshot,
  toPlainGeometraThreeHostSnapshotHeadless,
  toPlainGeometraThreeHostSnapshotFromViewSizing,
  mergePlainGeometraThreeHostSnapshot,
  createGeometraThreeWebGLRenderer,
  createGeometraThreeWebGLWithSceneBasics,
  createGeometraThreeWebGLWithSceneBasicsFromPlain,
  disposeGeometraThreeWebGLWithSceneBasics,
  isPlainGeometraThreeHostSnapshot,
  isPlainGeometraThreeSceneBasicsOptions,
  renderGeometraThreeWebGLWithSceneBasicsFrame,
  tickGeometraThreeWebGLWithSceneBasicsFrame,
  resizeGeometraThreeWebGLWithSceneBasicsView,
  resizeGeometraThreeWebGLWithSceneBasicsViewHeadless,
  resizeGeometraThreeWebGLWithSceneBasicsViewFromPlainViewSizing,
  resizeTickGeometraThreeWebGLWithSceneBasics,
  resizeTickGeometraThreeWebGLWithSceneBasicsFromPlainViewSizing,
  resizeTickGeometraThreeWebGLWithSceneBasicsFromPlainHostSnapshot,
  resizeTickGeometraThreeWebGLWithSceneBasicsHeadless,
  type GeometraThreeSceneBasics,
  type GeometraThreeSceneBasicsOptions,
  type PlainGeometraThreeSceneBasicsOptions,
  type PlainGeometraThreeHostSnapshot,
  type GeometraThreeWebGLWithSceneBasics,
  type GeometraThreeWebGLWithSceneBasicsTickContext,
} from './three-scene-basics.js'
export {
  createGeometraHostLayoutSyncRaf,
  type GeometraHostLayoutSyncRaf,
  type GeometraHostLayoutSyncRafOptions,
} from './layout-sync.js'
export {
  coerceGeometraHudPlacement,
  coerceGeometraHudPointerEvents,
  coerceHostNonNegativeCssPx,
  coerceHostStackingZIndexCss,
} from './host-css-coerce.js'
export type { GeometraHudPlacement } from './host-css-coerce.js'
export {
  GEOMETRA_HYBRID_HOST_KINDS,
  coerceGeometraHybridHostKind,
  isGeometraHybridHostKind,
  isPlainGeometraHybridHostKind,
  isPlainGeometraSplitHostLayoutOptions,
  isPlainGeometraStackedHostLayoutOptions,
  isPlainGeometraThreeSplitHostSnapshot,
  isPlainGeometraThreeStackedHostSnapshot,
  toPlainGeometraSplitHostLayoutOptions,
  toPlainGeometraStackedHostLayoutOptions,
  toPlainGeometraThreeSplitHostSnapshot,
  toPlainGeometraThreeSplitHostSnapshotHeadless,
  toPlainGeometraThreeStackedHostSnapshot,
  toPlainGeometraThreeStackedHostSnapshotHeadless,
  toPlainGeometraStackedHudRect,
  type GeometraHybridHostKind,
  type GeometraStackedHudRectLayoutInput,
  type PlainGeometraStackedHudRect,
  type PlainGeometraSplitHostLayoutOptions,
  type PlainGeometraStackedHostLayoutOptions,
  type PlainGeometraThreeSplitHostSnapshot,
  type PlainGeometraThreeStackedHostSnapshot,
  type ToPlainGeometraSplitHostLayoutOptionsInput,
  type ToPlainGeometraStackedHostLayoutOptionsInput,
} from './host-layout-plain.js'

/**
 * WebSocket **data channel** id for tracker snapshot JSON on the GEOM socket (re-exported from
 * `@geometra/client`). Use in `onData` handlers passed through {@link createThreeGeometraSplitHost} /
 * {@link createThreeGeometraStackedHost} so comparisons stay aligned with the thin client and agent
 * payloads without importing `@geometra/client` only for this string.
 *
 * The runtime value is **`geom.tracker.snapshot`**; `npm run release:gate` asserts it still matches
 * the installed `@geometra/client` package.
 */
export { GEOM_DATA_CHANNEL_TRACKER_SNAPSHOT } from '@geometra/client'

export { Scene3dManager } from './scene3d-manager.js'
