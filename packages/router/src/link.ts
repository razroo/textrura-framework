import { box, type BoxElement, type HitEvent, type KeyboardHitEvent, type SemanticProps, type StyleProps, type UIElement } from '@geometra/core'
import type { FlexProps } from 'textura'
import type { Router } from './router.js'

export type LinkProps = FlexProps &
  StyleProps & {
    to: string
    router: Pick<Router, 'navigate'>
    replace?: boolean
    key?: string
    semantic?: SemanticProps
    onClick?: (event: HitEvent) => void
    onKeyDown?: (event: KeyboardHitEvent) => void
  }

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === 'NumpadEnter' || key === ' ' || key === 'Spacebar'
}

/** True when Enter/Space should perform default link navigation (no ctrl/meta/alt chord). */
function isUnmodifiedActivation(event: KeyboardHitEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey
}

/**
 * Declarative navigation target: a focusable box with link semantics (`role: link`, `tag: a`) and
 * `cursor: pointer` unless overridden.
 *
 * - **Pointer**: `onClick` calls your handler first, then `router.navigate(to, { replace })`.
 * - **Keyboard**: `onKeyDown` runs first; **Enter**, **NumpadEnter**, **Space** (`' '`), and legacy **Spacebar**
 *   then navigate when **Ctrl / Meta / Alt** are not held (modified chords skip in-app navigation so hosts can bind alternatives).
 *
 * Layout and style props are forwarded to {@link import('@geometra/core').box} like any other box element.
 */
export function link(props: LinkProps, children: UIElement[] = []): BoxElement {
  const {
    to,
    router,
    replace,
    key,
    semantic,
    onClick,
    onKeyDown,
    cursor,
    ...styleAndLayout
  } = props

  return box(
    {
      ...styleAndLayout,
      cursor: cursor ?? 'pointer',
      key,
      semantic: {
        ...semantic,
        tag: semantic?.tag ?? 'a',
        role: semantic?.role ?? 'link',
      },
      onClick: (event) => {
        onClick?.(event)
        router.navigate(to, { replace })
      },
      onKeyDown: (event) => {
        onKeyDown?.(event)
        if (isActivationKey(event.key) && isUnmodifiedActivation(event)) {
          router.navigate(to, { replace })
        }
      },
    },
    children,
  )
}
