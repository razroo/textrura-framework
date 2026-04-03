import { describe, expect, it } from 'vitest'
import type { ComputedLayout } from 'textura'
import { createMemoryHistory, type HistoryUpdate } from '../history.js'
import { link } from '../link.js'
import { createRouter } from '../router.js'
import type { RouteNode } from '../tree.js'

describe('declarative link primitive', () => {
  const routes: RouteNode[] = [{ id: 'root', path: '/', children: [{ id: 'about', path: 'about' }] }]
  const target: ComputedLayout = { x: 0, y: 0, width: 0, height: 0, children: [] }

  it('navigates on click', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    const node = link({ to: '/about', router })
    node.handlers?.onClick?.({ x: 0, y: 0, target })
    await Promise.resolve()

    expect(router.getState().location.pathname).toBe('/about')
    expect(node.semantic?.role).toBe('link')
    expect(node.semantic?.tag).toBe('a')
    expect(node.props.cursor).toBe('pointer')
  })

  it('navigates on Enter and Space key activation', async () => {
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
      target,
    })
    await Promise.resolve()
    expect(router.getState().location.pathname).toBe('/about')

    await router.navigate('/', { replace: true })
    node.handlers?.onKeyDown?.({
      key: ' ',
      code: 'Space',
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target,
    })
    await Promise.resolve()
    expect(router.getState().location.pathname).toBe('/about')
  })

  it('navigates on legacy Spacebar key value (older browsers)', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    const node = link({ to: '/about', router })
    node.handlers?.onKeyDown?.({
      key: 'Spacebar',
      code: 'Space',
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target,
    })
    await Promise.resolve()
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
      target,
    })

    expect(router.getState().location.pathname).toBe('/')
  })

  it('invokes user onClick before navigate and still changes location', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    const order: string[] = []
    const node = link({
      to: '/about',
      router,
      onClick: () => {
        order.push('user')
      },
    })
    node.handlers?.onClick?.({ x: 0, y: 0, target })
    await Promise.resolve()

    expect(order).toEqual(['user'])
    expect(router.getState().location.pathname).toBe('/about')
  })

  it('invokes user onKeyDown before activation navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    const order: string[] = []
    const node = link({
      to: '/about',
      router,
      onKeyDown: () => {
        order.push('user')
      },
    })
    node.handlers?.onKeyDown?.({
      key: 'Enter',
      code: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target,
    })
    await Promise.resolve()

    expect(order).toEqual(['user'])
    expect(router.getState().location.pathname).toBe('/about')
  })

  it('uses history replace when the link sets replace: true (click and keyboard)', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const actions: HistoryUpdate['action'][] = []
    history.listen(u => actions.push(u.action))
    const router = createRouter({ routes, history })
    router.start()

    const node = link({ to: '/about', router, replace: true })
    node.handlers?.onClick?.({ x: 0, y: 0, target })
    await Promise.resolve()
    expect(actions).toEqual(['replace'])
    expect(router.getState().location.pathname).toBe('/about')

    await router.navigate('/', { replace: true })
    expect(router.getState().location.pathname).toBe('/')

    node.handlers?.onKeyDown?.({
      key: 'Enter',
      code: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target,
    })
    await Promise.resolve()
    expect(actions).toEqual(['replace', 'replace', 'replace'])
    expect(router.getState().location.pathname).toBe('/about')
  })
})
