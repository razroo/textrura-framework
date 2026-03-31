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

// Hit testing
export { dispatchHit, getCursorAtPoint } from './hit-test.js'
export type { HitDispatchResult } from './hit-test.js'

// Web fonts (browser)
export {
  extractFontFamiliesFromCSSFont,
  collectFontFamiliesFromTree,
  waitForFonts,
} from './fonts.js'

// Focus management
export { focusedElement, setFocus, clearFocus, focusNext, focusPrev } from './focus.js'

// Text selection
export { collectTextNodes, getSelectedText, hitTestText } from './selection.js'
export type { TextNodeInfo, TextLineInfo, SelectionRange } from './selection.js'

// Animation
export { transition, spring, easing, animationLoop } from './animation.js'
export type { EasingFn } from './animation.js'

// SEO
export { toSemanticHTML } from './seo.js'
export type { SemanticHTMLOptions } from './seo.js'

// Runtime accessibility
export { toAccessibilityTree } from './a11y.js'
export type { AccessibilityNode, AccessibilityBounds } from './a11y.js'

// Types
export type {
  UIElement,
  BoxElement,
  TextElement,
  ImageElement,
  StyleProps,
  SemanticProps,
  EventHandlers,
  HitEvent,
  KeyboardHitEvent,
  Component,
  Renderer,
} from './types.js'
