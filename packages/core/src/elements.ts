import type { FlexProps } from 'textura'
import type { StyleProps, BoxElement, TextElement, UIElement, EventHandlers } from './types.js'

type BoxProps = FlexProps & StyleProps & EventHandlers & { key?: string }
type TextProps = FlexProps & StyleProps & {
  text: string
  font: string
  lineHeight: number
  whiteSpace?: 'normal' | 'pre-wrap'
  key?: string
}

/** Create a box (container) element. */
export function box(props: BoxProps, children: UIElement[] = []): BoxElement {
  const { onClick, onPointerDown, onPointerUp, onPointerMove, key, ...rest } = props
  const handlers: EventHandlers = {}
  if (onClick) handlers.onClick = onClick
  if (onPointerDown) handlers.onPointerDown = onPointerDown
  if (onPointerUp) handlers.onPointerUp = onPointerUp
  if (onPointerMove) handlers.onPointerMove = onPointerMove

  return {
    kind: 'box',
    props: rest,
    children,
    key,
    handlers: Object.keys(handlers).length > 0 ? handlers : undefined,
  }
}

/** Create a text leaf element. */
export function text(props: TextProps): TextElement {
  const { key, ...rest } = props
  return { kind: 'text', props: rest, key }
}
