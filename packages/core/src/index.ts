// Reactivity
export { signal, computed, effect, batch } from './signals.js'
export type { Signal, Computed } from './signals.js'

// Element constructors
export { box, text, image } from './elements.js'

// App mount
export { createApp } from './app.js'
export type { App, AppOptions } from './app.js'

// Tree conversion
export { toLayoutTree } from './tree.js'
export { resolveDirectionValue, resolveElementDirection } from './direction.js'
export type { ResolvedDirection } from './direction.js'

// Hit testing
export { dispatchHit, getCursorAtPoint, hasInteractiveHitAtPoint } from './hit-test.js'
export type { HitDispatchResult } from './hit-test.js'

// Web fonts (browser)
export {
  extractFontFamiliesFromCSSFont,
  collectFontFamiliesFromTree,
  waitForFonts,
} from './fonts.js'

// Focus management
export { focusedElement, setFocus, clearFocus, focusNext, focusPrev } from './focus.js'
export { trapFocusStep } from './focus-trap.js'
export { dispatchKeyboardEvent } from './keyboard.js'
export { dispatchCompositionEvent } from './keyboard.js'

// Text selection
export { collectTextNodes, getSelectedText, hitTestText } from './selection.js'
export type { TextNodeInfo, TextLineInfo, SelectionRange } from './selection.js'

// Animation
export {
  transition,
  spring,
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

// Virtual scroll helpers
export { syncVirtualWindow } from './virtual-scroll.js'
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
  StyleProps,
  Direction,
  DirectionProps,
  SemanticProps,
  EventHandlers,
  HitEvent,
  KeyboardHitEvent,
  CompositionHitEvent,
  Component,
  Renderer,
} from './types.js'
