/**
 * @packageDocumentation
 * Public entry for `@geometra/core`: reactive primitives, element constructors (`box`, `text`, {@link bodyText},
 * `image`, `scene3d`), app mount, layout-tree
 * conversion, hit-testing, shared layout coordinate helpers ({@link finiteNumberOrZero}, {@link isFinitePlainNumber},
 * {@link layoutBoundsAreFinite}, {@link scrollSafeChildOffsets}, {@link pointInInclusiveLayoutRect}), focus and
 * keyboard/composition dispatch, text selection and input, web font
 * helpers, {@link streamText} for coalesced token streams, viewport/breakpoint helpers ({@link createViewport},
 * {@link breakpoint}, {@link responsive}), animation helpers, and virtual list windowing ({@link syncVirtualWindow},
 * {@link inclusiveEndIndex}, {@link VirtualWindowState}), SEO and accessibility snapshots,
 * {@link import('./focus-candidates.js').hasFocusCandidateHandlers} for parity with Tab / click-to-focus
 * routing, and shared element types (`UIElement`, `Renderer`, `FrameTimings`, …).
 *
 * Geometra keeps a single declarative tree across canvas, terminal, and server-driven clients; this file
 * is the supported import surface. Optional `Renderer.setFrameTimings` receives layout wall time after
 * Yoga so inspectors and telemetry can split layout from paint.
 */

// Reactivity
export { signal, computed, effect, batch } from './signals.js'
export type { Signal, Computed } from './signals.js'

// Element constructors
export { box, text, bodyText, image, scene3d } from './elements.js'

// Scene3d object helpers
export { sphere, points, line, ring, ambientLight, directionalLight, group } from './elements.js'

// App mount
export { createApp } from './app.js'
export type { App, AppOptions } from './app.js'

// Tree conversion
export { toLayoutTree } from './tree.js'
export {
  resolveDirectionValue,
  resolveElementDirection,
  resolveComputeLayoutDirection,
} from './direction.js'
export type { ResolvedDirection } from './direction.js'

// Hit testing
export { dispatchHit, getCursorAtPoint, hasInteractiveHitAtPoint, hitPathAtPoint } from './hit-test.js'
export type { HitDispatchResult } from './hit-test.js'
export {
  finiteNumberOrZero,
  finiteRootExtent,
  isFinitePlainNumber,
  layoutBoundsAreFinite,
  pointInInclusiveLayoutRect,
  scrollSafeChildOffsets,
} from './layout-bounds.js'
export { safePerformanceNowMs, readPerformanceNow } from './performance-now.js'

// Web fonts (browser)
export {
  extractFontFamiliesFromCSSFont,
  collectFontFamiliesFromTree,
  resolveFontLoadTimeoutMs,
  waitForFonts,
} from './fonts.js'

// Focus management
export { focusedElement, setFocus, clearFocus, focusNext, focusPrev, collectFocusOrder } from './focus.js'
export type { FocusTarget } from './focus.js'
export { hasFocusCandidateHandlers } from './focus-candidates.js'
export { trapFocusStep } from './focus-trap.js'
export { dispatchCompositionEvent, dispatchKeyboardEvent } from './keyboard.js'

// Text selection
export { collectTextNodes, getSelectedText, hitTestText } from './selection.js'
export type { TextNodeInfo, TextLineInfo, SelectionRange } from './selection.js'

// Find in canvas text
export { findInTextNodes } from './find.js'

// Animation
export {
  transition,
  spring,
  normalizeSpringConfig,
  easing,
  animationLoop,
  createTweenTimeline,
  createPropertyTimeline,
  setMotionPreference,
  getMotionPreference,
} from './animation.js'
export type {
  EasingFn,
  TweenPlaybackState,
  TweenTimeline,
  PropertyTimeline,
  MotionPreference,
} from './animation.js'

// Streaming text
export { streamText } from './stream-text.js'
export type { StreamText } from './stream-text.js'

// Responsive helpers
export {
  createViewport,
  breakpoint,
  responsive,
  defaultBreakpoints,
} from './responsive.js'
export type { Viewport, BreakpointMap } from './responsive.js'

// Virtual scroll helpers
export { inclusiveEndIndex, syncVirtualWindow } from './virtual-scroll.js'
export type { VirtualWindowState } from './virtual-scroll.js'

// SEO
export { toSemanticHTML } from './seo.js'
export type { SemanticHTMLOptions } from './seo.js'

// Runtime accessibility
export { toAccessibilityTree } from './a11y.js'
export type { AccessibilityNode, AccessibilityBounds } from './a11y.js'

// Text input foundation
export {
  isCollapsedSelection,
  getInputSelectionText,
  replaceInputSelection,
  insertInputText,
  backspaceInput,
  deleteInput,
  moveInputCaret,
  moveInputCaretByWord,
  moveInputCaretToLineBoundary,
  getInputCaretGeometry,
} from './text-input.js'
export type { TextInputState, TextInputEditResult, CaretGeometry } from './text-input.js'
export {
  createTextInputHistory,
  pushTextInputHistory,
  undoTextInputHistory,
  redoTextInputHistory,
} from './text-input-history.js'
export type { TextInputHistoryState } from './text-input-history.js'

// Types
export type {
  UIElement,
  BoxElement,
  TextElement,
  ImageElement,
  Scene3dElement,
  Scene3dObject,
  Scene3dSphere,
  Scene3dPoints,
  Scene3dLine,
  Scene3dRing,
  Scene3dAmbientLight,
  Scene3dDirectionalLight,
  Scene3dGroup,
  OrbitControlsConfig,
  StyleProps,
  BorderRadiusCorners,
  CursorProp,
  Direction,
  DirectionProps,
  SemanticProps,
  EventHandlers,
  HitEvent,
  KeyboardHitEvent,
  CompositionHitEvent,
  Component,
  FrameTimings,
  Renderer,
} from './types.js'
