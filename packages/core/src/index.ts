// Reactivity
export { signal, computed, effect, batch } from './signals.js'
export type { Signal, Computed } from './signals.js'

// Element constructors
export { box, text } from './elements.js'

// App mount
export { createApp } from './app.js'
export type { App, AppOptions } from './app.js'

// Tree conversion
export { toLayoutTree } from './tree.js'

// Hit testing
export { dispatchHit } from './hit-test.js'

// Text selection
export { collectTextNodes, getSelectedText, hitTestText } from './selection.js'
export type { TextNodeInfo, TextLineInfo, SelectionRange } from './selection.js'

// SEO
export { toSemanticHTML } from './seo.js'
export type { SemanticHTMLOptions } from './seo.js'

// Types
export type {
  UIElement,
  BoxElement,
  TextElement,
  StyleProps,
  SemanticProps,
  EventHandlers,
  HitEvent,
  Component,
  Renderer,
} from './types.js'
