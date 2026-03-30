import type { FlexProps, ComputedLayout } from 'textura'

/** Style properties for visual rendering (not layout). */
export interface StyleProps {
  backgroundColor?: string
  color?: string
  borderColor?: string
  borderRadius?: number
  opacity?: number
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
}

/** A text node in the component tree. */
export interface TextElement {
  kind: 'text'
  props: FlexProps & StyleProps & {
    text: string
    font: string
    lineHeight: number
    whiteSpace?: 'normal' | 'pre-wrap'
    /** Enable text selection on this element. */
    selectable?: boolean
  }
  key?: string
  /** Semantic hints for SEO/a11y. */
  semantic?: SemanticProps
}

/** A box (container) node in the component tree. */
export interface BoxElement {
  kind: 'box'
  props: FlexProps & StyleProps
  children: UIElement[]
  key?: string
  /** Optional event handlers — resolved via hit-testing. */
  handlers?: EventHandlers
  /** Semantic hints for SEO/a11y. */
  semantic?: SemanticProps
}

/** Union of all element types. */
export type UIElement = TextElement | BoxElement

/** Supported event handlers on box elements. */
export interface EventHandlers {
  onClick?: (e: HitEvent) => void
  onPointerDown?: (e: HitEvent) => void
  onPointerUp?: (e: HitEvent) => void
  onPointerMove?: (e: HitEvent) => void
}

/** Event delivered to handlers after hit-testing. */
export interface HitEvent {
  x: number
  y: number
  target: ComputedLayout
}

/** A component function receives props and returns a UIElement tree. */
export type Component<P = Record<string, never>> = (props: P) => UIElement

/** Interface that all render backends implement. */
export interface Renderer {
  /** Render a computed layout frame. */
  render(layout: ComputedLayout, tree: UIElement): void
  /** Clean up renderer resources. */
  destroy(): void
}
