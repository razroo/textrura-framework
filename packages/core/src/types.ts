import type { FlexProps, ComputedLayout } from 'textura'

/** Text direction model used by UI elements. */
export type Direction = 'ltr' | 'rtl' | 'auto'

/** Optional direction metadata carried on UI props. */
export interface DirectionProps {
  dir?: Direction
}

/** Style properties for visual rendering (not layout). */
export interface StyleProps {
  backgroundColor?: string
  color?: string
  borderColor?: string
  borderRadius?: number
  borderWidth?: number
  opacity?: number
  /** Cursor to show when hovering this element. */
  cursor?: 'default' | 'pointer' | 'grab' | 'grabbing' | 'text' | 'not-allowed' | 'crosshair' | 'move'
  /** Z-index for paint ordering among siblings. Higher values paint on top. */
  zIndex?: number
  /**
   * Pointer hit targeting. `'none'` skips this box for pointer handlers and cursor resolution;
   * hits pass through to geometry behind it. Descendants still receive hits unless they also set `'none'`.
   */
  pointerEvents?: 'auto' | 'none'
  /** Overflow behavior for children. */
  overflow?: 'visible' | 'hidden' | 'scroll'
  /** Horizontal scroll offset (used with overflow: 'scroll'). */
  scrollX?: number
  /** Vertical scroll offset (used with overflow: 'scroll'). */
  scrollY?: number
  /** Box shadow. */
  boxShadow?: { offsetX: number; offsetY: number; blur: number; color: string }
  /** Linear gradient background (overrides backgroundColor when set). */
  gradient?: {
    type: 'linear'
    /** Angle in degrees. Default: 180 (top to bottom). */
    angle?: number
    stops: Array<{ offset: number; color: string }>
  }
}

/** Semantic properties for SEO and accessibility. */
export interface SemanticProps {
  /** HTML tag to use in semantic HTML output (e.g. 'h1', 'p', 'nav', 'article'). */
  tag?: string
  /** ARIA role for accessibility (e.g. 'heading', 'navigation', 'button'). */
  role?: string
  /** Alt text for images or decorative elements. */
  alt?: string
  /** Aria-label for screen readers. */
  ariaLabel?: string
  /** State: disabled. */
  ariaDisabled?: boolean
  /** State: expanded/collapsed. */
  ariaExpanded?: boolean
  /** State: selected. */
  ariaSelected?: boolean
}

/** A text node in the component tree. */
export interface TextElement {
  kind: 'text'
  props: FlexProps & StyleProps & DirectionProps & {
    text: string
    font: string
    lineHeight: number
    whiteSpace?: 'normal' | 'pre-wrap'
    /** Text is selectable by default. Set to false to disable. */
    selectable?: boolean
  }
  key?: string
  /** Semantic hints for SEO/a11y. */
  semantic?: SemanticProps
}

/** A box (container) node in the component tree. */
export interface BoxElement {
  kind: 'box'
  props: FlexProps & StyleProps & DirectionProps
  children: UIElement[]
  key?: string
  /** Optional event handlers — resolved via hit-testing. */
  handlers?: EventHandlers
  /** Semantic hints for SEO/a11y. */
  semantic?: SemanticProps
}

/** An image element in the component tree. */
export interface ImageElement {
  kind: 'image'
  props: FlexProps & StyleProps & DirectionProps & {
    src: string
    alt?: string
    objectFit?: 'fill' | 'contain' | 'cover'
  }
  key?: string
  semantic?: SemanticProps
}

/** Union of all element types. */
export type UIElement = TextElement | BoxElement | ImageElement

/** Supported event handlers on box elements. */
export interface EventHandlers {
  onClick?: (e: HitEvent) => void
  onPointerDown?: (e: HitEvent) => void
  onPointerUp?: (e: HitEvent) => void
  onPointerMove?: (e: HitEvent) => void
  onWheel?: (e: HitEvent & { deltaX: number; deltaY: number }) => void
  onKeyDown?: (e: KeyboardHitEvent) => void
  onKeyUp?: (e: KeyboardHitEvent) => void
  onCompositionStart?: (e: CompositionHitEvent) => void
  onCompositionUpdate?: (e: CompositionHitEvent) => void
  onCompositionEnd?: (e: CompositionHitEvent) => void
}

/** Event delivered to handlers after hit-testing. */
export interface HitEvent {
  x: number
  y: number
  /** Pointer x relative to the hit target's local box. */
  localX?: number
  /** Pointer y relative to the hit target's local box. */
  localY?: number
  target: ComputedLayout
}

/** Keyboard event delivered to the focused element. */
export interface KeyboardHitEvent {
  key: string
  code: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  target: ComputedLayout
}

/** IME/composition event delivered to the focused element. */
export interface CompositionHitEvent {
  data: string
  target: ComputedLayout
}

/** A component function receives props and returns a UIElement tree. */
export type Component<P = Record<string, never>> = (props: P) => UIElement

/** Optional per-frame timings supplied by the host (e.g. `createApp` after Yoga). */
export interface FrameTimings {
  /** Wall time for `computeLayout` (or equivalent) in milliseconds. */
  layoutMs: number
}

/** Interface that all render backends implement. */
export interface Renderer {
  /** Render a computed layout frame. */
  render(layout: ComputedLayout, tree: UIElement): void
  /** Clean up renderer resources. */
  destroy(): void
  /**
   * When present, called by `createApp` after layout and before `render`
   * so backends (e.g. canvas inspector) can show layout vs paint split.
   */
  setFrameTimings?(timings: FrameTimings): void
}
