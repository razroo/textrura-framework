import type { FlexProps } from 'textura'
import type {
  StyleProps,
  BoxElement,
  TextElement,
  ImageElement,
  UIElement,
  EventHandlers,
  SemanticProps,
  DirectionProps,
} from './types.js'

type BoxProps = FlexProps & StyleProps & DirectionProps & EventHandlers & { key?: string; semantic?: SemanticProps }
type TextProps = FlexProps & StyleProps & DirectionProps & {
  text: string
  font: string
  lineHeight: number
  whiteSpace?: 'normal' | 'pre-wrap'
  selectable?: boolean
  key?: string
  semantic?: SemanticProps
}
type ImageProps = FlexProps & StyleProps & DirectionProps & {
  src: string
  alt?: string
  objectFit?: 'fill' | 'contain' | 'cover'
  key?: string
  semantic?: SemanticProps
}

/**
 * Create a box (container) element.
 * Handlers, `semantic`, and `key` are runtime metadata; flex and layout fields are consumed by `toLayoutTree()`.
 * Optional `dir` (`ltr` | `rtl` | `auto`) sets resolved direction for this subtree for focus, hit-testing, and text
 * interaction; `auto` inherits from the parent context. It is stripped in {@link import('./tree.js').toLayoutTree}
 * (Yoga root direction uses {@link import('./app.js').createApp}'s `layoutDirection` when provided).
 */
export function box(props: BoxProps, children: UIElement[] = []): BoxElement {
  const {
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onWheel,
    onKeyDown,
    onKeyUp,
    onCompositionStart,
    onCompositionUpdate,
    onCompositionEnd,
    key,
    semantic,
    ...rest
  } = props
  const handlers: EventHandlers = {}
  if (onClick) handlers.onClick = onClick
  if (onPointerDown) handlers.onPointerDown = onPointerDown
  if (onPointerUp) handlers.onPointerUp = onPointerUp
  if (onPointerMove) handlers.onPointerMove = onPointerMove
  if (onWheel) handlers.onWheel = onWheel
  if (onKeyDown) handlers.onKeyDown = onKeyDown
  if (onKeyUp) handlers.onKeyUp = onKeyUp
  if (onCompositionStart) handlers.onCompositionStart = onCompositionStart
  if (onCompositionUpdate) handlers.onCompositionUpdate = onCompositionUpdate
  if (onCompositionEnd) handlers.onCompositionEnd = onCompositionEnd

  return {
    kind: 'box',
    props: rest,
    children,
    key,
    handlers: Object.keys(handlers).length > 0 ? handlers : undefined,
    semantic,
  }
}

/**
 * Create a text leaf element.
 * `selectable` and `semantic` are runtime/rendering concerns; remaining props feed `toLayoutTree()` and Textura.
 * Optional `dir` participates in the same resolved-direction model as boxes (caret, selection, bidi); it is not part
 * of the Yoga layout snapshot.
 */
export function text(props: TextProps): TextElement {
  const { key, semantic, ...rest } = props
  return { kind: 'text', props: rest, key, semantic }
}

/**
 * Create an image element.
 * `semantic` and `key` are runtime metadata. Flex and sizing props feed {@link import('./tree.js').toLayoutTree}
 * for Yoga/Textura; `src`, `alt`, and `objectFit` remain on the live element for renderers and a11y but are
 * stripped from the layout snapshot (Textura measures boxes from width/height, not bitmaps).
 * Optional `dir` is used for resolved direction alongside siblings and ancestors; it is stripped from the layout snapshot.
 */
export function image(props: ImageProps): ImageElement {
  const { key, semantic, ...rest } = props
  return { kind: 'image', props: rest, key, semantic }
}
