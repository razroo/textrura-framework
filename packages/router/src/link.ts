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
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}

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
        if (isActivationKey(event.key)) {
          router.navigate(to, { replace })
        }
      },
    },
    children,
  )
}
