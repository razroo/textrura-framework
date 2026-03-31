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

/** Create a box (container) element. */
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

/** Create a text leaf element. */
export function text(props: TextProps): TextElement {
  const { key, semantic, ...rest } = props
  return { kind: 'text', props: rest, key, semantic }
}

/** Create an image element. */
export function image(props: ImageProps): ImageElement {
  const { key, semantic, ...rest } = props
  return { kind: 'image', props: rest, key, semantic }
}
