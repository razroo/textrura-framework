import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from '../history.js'
import { link } from '../link.js'
import { createRouter } from '../router.js'
import type { RouteNode } from '../tree.js'

describe('declarative link primitive', () => {
  const routes: RouteNode[] = [{ id: 'root', path: '/', children: [{ id: 'about', path: 'about' }] }]

  it('navigates on click', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    const node = link({ to: '/about', router })
    node.handlers?.onClick?.({ x: 0, y: 0, target: {} as any })

    expect(router.getState().location.pathname).toBe('/about')
    expect(node.semantic?.role).toBe('link')
    expect(node.semantic?.tag).toBe('a')
    expect(node.props.cursor).toBe('pointer')
  })

  it('navigates on Enter and Space key activation', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    const node = link({ to: '/about', router })
    node.handlers?.onKeyDown?.({
      key: 'Enter',
      code: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target: {} as any,
    })
    expect(router.getState().location.pathname).toBe('/about')

    router.navigate('/', { replace: true })
    node.handlers?.onKeyDown?.({
      key: ' ',
      code: 'Space',
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target: {} as any,
    })
    expect(router.getState().location.pathname).toBe('/about')
  })

  it('does not navigate for non-activation keys', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    const node = link({ to: '/about', router })
    node.handlers?.onKeyDown?.({
      key: 'Escape',
      code: 'Escape',
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target: {} as any,
    })

    expect(router.getState().location.pathname).toBe('/')
  })
})
