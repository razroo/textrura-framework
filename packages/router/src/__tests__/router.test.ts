import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from '../history.js'
import { createRouter, type RouterState } from '../router.js'
import { json, redirect, response } from '../responses.js'
import type { RouteNode } from '../tree.js'

describe('createRouter lifecycle', () => {
  const routes: RouteNode[] = [
    {
      id: 'root',
      path: '/',
      children: [{ id: 'users', path: 'users/:id' }],
    },
  ]

  it('starts and emits initial route state', () => {
    const history = createMemoryHistory({ initialEntries: ['/users/10'] })
    const router = createRouter({ routes, history })

    const seen: RouterState[] = []
    const unsubscribe = router.subscribe((state) => seen.push(state))

    router.start()

    expect(seen.length).toBeGreaterThan(0)
    const latest = seen[seen.length - 1]
    expect(latest?.location.pathname).toBe('/users/10')
    expect(latest?.matches?.params).toEqual({ id: '10' })

    unsubscribe()
    router.dispose()
  })

  it('navigates with push by default', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routes, history })
    router.start()

    await router.navigate('/users/42')

    const state = router.getState()
    expect(state.location.pathname).toBe('/users/42')
    expect(state.matches?.params).toEqual({ id: '42' })
    expect(state.navigation).toBe('idle')
  })

  it('supports replace navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    await router.navigate('/users/2', { replace: true })
    history.go(-1)

    expect(router.getState().location.pathname).toBe('/users/2')
  })

  it('stops reacting after dispose', () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()
    router.dispose()

    history.push('/users/2')

    expect(router.getState().location.pathname).toBe('/users/1')
  })

  it('exposes active route helper', () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    expect(router.isActive('/users/1')).toBe(true)
    expect(router.isActive('/users/2')).toBe(false)
  })

  it('exposes pending route helper during in-flight navigation', async () => {
    const pushed: string[] = []
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const realPush = history.push.bind(history)
    history.push = (to: string) => {
      pushed.push(to)
      // Delay actual history update to simulate in-flight navigation.
    }

    const router = createRouter({ routes, history })
    router.start()
    const navigatePromise = router.navigate('/users/9')

    expect(router.isPending('/users/9')).toBe(true)
    expect(router.isPending('/users/1')).toBe(false)

    // Complete pending navigation and ensure pending state clears.
    realPush(pushed[0]!)
    await navigatePromise
    expect(router.isPending('/users/9')).toBe(false)
    expect(router.isActive('/users/9')).toBe(true)
  })

  it('supports blockers that can cancel navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    const unblock = router.addBlocker(({ to }) => to !== '/users/2')
    const blocked = await router.navigate('/users/2')
    const allowed = await router.navigate('/users/3')

    expect(blocked).toBe(false)
    expect(allowed).toBe(true)
    expect(router.getState().location.pathname).toBe('/users/3')

    unblock()
  })

  it('supports async blockers for transition confirmation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    router.addBlocker(async ({ to }) => {
      await Promise.resolve()
      return to === '/users/4'
    })

    const blocked = await router.navigate('/users/5')
    const allowed = await router.navigate('/users/4')

    expect(blocked).toBe(false)
    expect(allowed).toBe(true)
    expect(router.getState().location.pathname).toBe('/users/4')
  })

  it('applies default scroll and focus restoration after navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const restored: string[] = []
    const router = createRouter({
      routes,
      history,
      restoration: {
        restoreScroll: ({ from, to }) => restored.push(`scroll:${from.pathname}->${to.pathname}`),
        restoreFocus: ({ from, to }) => restored.push(`focus:${from.pathname}->${to.pathname}`),
      },
    })
    router.start()

    await router.navigate('/users/2')

    expect(restored).toEqual(['scroll:/users/1->/users/2', 'focus:/users/1->/users/2'])
  })

  it('supports per-navigation restoration opt-out', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const restored: string[] = []
    const router = createRouter({
      routes,
      history,
      restoration: {
        restoreScroll: () => restored.push('scroll'),
        restoreFocus: () => restored.push('focus'),
      },
    })
    router.start()

    await router.navigate('/users/2', { restoreScroll: false, restoreFocus: false })

    expect(restored).toEqual([])
  })

  it('loads route data with params, query, and request context', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/10?tab=profile'] })
    const loaderRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: ({ params, query, requestContext }) => ({
              id: params.id,
              tab: query.tab,
              auth: (requestContext as { auth: string }).auth,
            }),
          },
        ],
      },
    ]
    const router = createRouter({
      routes: loaderRoutes,
      history,
      requestContext: () => ({ auth: 'token-1' }),
    })

    await new Promise<void>((resolve) => {
      const unsubscribe = router.subscribe((state) => {
        if (state.loaderData.users) {
          unsubscribe()
          resolve()
        }
      })
      router.start()
    })

    expect(router.getState().loaderData.users).toEqual({
      id: '10',
      tab: 'profile',
      auth: 'token-1',
    })
  })

  it('updates loader data after navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1?q=old'] })
    const loaderRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: ({ params, query }) => ({ id: params.id, q: query.q }),
          },
        ],
      },
    ]
    const router = createRouter({ routes: loaderRoutes, history })
    router.start()

    await router.navigate('/users/2?q=new')

    expect(router.getState().loaderData.users).toEqual({
      id: '2',
      q: 'new',
    })
  })

  it('runs route actions for mutation workflows', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const writes: Array<{ id: string; value: string }> = []
    const actionRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            action: ({ params, submission }) => {
              writes.push({
                id: params.id ?? '',
                value: String((submission.data as { value?: string })?.value ?? ''),
              })
              return { ok: true, id: params.id ?? '' }
            },
          },
        ],
      },
    ]
    const router = createRouter({ routes: actionRoutes, history })
    router.start()

    const success = await router.submitAction('users', {
      method: 'POST',
      data: { value: 'updated' },
    })

    expect(success).toBe(true)
    expect(writes).toEqual([{ id: '1', value: 'updated' }])
    expect(router.getState().actionData.users).toEqual({ ok: true, id: '1' })
  })

  it('supports optimistic action updates and rollback on failure', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const optimisticRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            action: ({ submission }) => {
              if ((submission.data as { fail?: boolean })?.fail) {
                throw new Error('mutation failed')
              }
              return { ok: true }
            },
          },
        ],
      },
    ]
    const router = createRouter({ routes: optimisticRoutes, history })
    router.start()
    await router.revalidate()

    const ok = await router.submitAction(
      'users',
      { method: 'POST', data: { fail: false } },
      {
        optimistic: {
          apply: (state) => ({
            ...state,
            actionData: { ...state.actionData, users: { optimistic: true } },
          }),
        },
      },
    )
    expect(ok).toBe(true)
    expect(router.getState().actionData.users).toEqual({ ok: true })

    const failed = await router.submitAction(
      'users',
      { method: 'POST', data: { fail: true } },
      {
        optimistic: {
          apply: (state) => ({
            ...state,
            actionData: { ...state.actionData, users: { optimistic: 'temp' } },
          }),
        },
      },
    )
    expect(failed).toBe(false)
    expect(router.getState().actionData.users).toEqual({ ok: true })
  })

  it('returns false when submitting action for unknown route', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const router = createRouter({ routes, history })
    router.start()

    const success = await router.submitAction('missing', { method: 'POST', data: { x: 1 } })
    expect(success).toBe(false)
  })

  it('revalidates loaders after successful actions', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const records = { value: 'before' }
    const routesWithRevalidation: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: ({ params }) => ({ id: params.id, value: records.value }),
            action: ({ submission }) => {
              records.value = String((submission.data as { value?: string })?.value ?? records.value)
              return { ok: true }
            },
          },
        ],
      },
    ]
    const router = createRouter({ routes: routesWithRevalidation, history })
    router.start()
    await router.revalidate()
    expect(router.getState().loaderData.users).toEqual({ id: '1', value: 'before' })

    await router.submitAction('users', { method: 'POST', data: { value: 'after' } })
    expect(router.getState().loaderData.users).toEqual({ id: '1', value: 'after' })
  })

  it('supports explicit manual revalidate', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const store = { count: 1 }
    const revalidateRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: ({ params }) => ({ id: params.id, count: store.count }),
          },
        ],
      },
    ]
    const router = createRouter({ routes: revalidateRoutes, history })
    router.start()
    await router.revalidate()
    expect(router.getState().loaderData.users).toEqual({ id: '1', count: 1 })

    store.count = 2
    const ok = await router.revalidate()

    expect(ok).toBe(true)
    expect(router.getState().loaderData.users).toEqual({ id: '1', count: 2 })
  })

  it('marks current route pending during manual revalidate', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const revalidateRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: () =>
              new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 20)),
          },
        ],
      },
    ]
    const router = createRouter({ routes: revalidateRoutes, history })
    router.start()
    await router.revalidate()

    const pending = router.revalidate()
    expect(router.getState().loading).toBe(true)
    expect(router.getState().pending).toBe(true)
    expect(router.isPending('/users/1')).toBe(true)
    await pending
    expect(router.getState().pending).toBe(false)
  })

  it('supports loader redirects via helper', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const redirectRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: () => redirect('/login', { replace: true }),
          },
          {
            id: 'login',
            path: 'login',
            loader: () => response({ page: 'login' }, { status: 200 }),
          },
        ],
      },
    ]
    const router = createRouter({ routes: redirectRoutes, history })
    router.start()

    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(router.getState().location.pathname).toBe('/login')
    expect(router.getState().loaderData.login).toEqual({
      kind: 'response',
      status: 200,
      headers: undefined,
      data: { page: 'login' },
    })
  })

  it('supports action redirects and response helpers', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const actionRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            action: ({ submission }) => {
              if ((submission.data as { next?: string })?.next === 'login') {
                return redirect('/login')
              }
              return json({ ok: true }, { status: 201 })
            },
          },
          {
            id: 'login',
            path: 'login',
          },
        ],
      },
    ]
    const router = createRouter({ routes: actionRoutes, history })
    router.start()

    const wrote = await router.submitAction('users', { method: 'POST', data: { next: 'none' } })
    expect(wrote).toBe(true)
    expect(router.getState().actionData.users).toEqual({
      kind: 'response',
      status: 201,
      headers: { 'content-type': 'application/json' },
      data: { ok: true },
    })

    const redirected = await router.submitAction('users', { method: 'POST', data: { next: 'login' } })
    expect(redirected).toBe(true)
    expect(router.getState().location.pathname).toBe('/login')
  })

  it('cancels in-flight loader work on interrupted transitions', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const abortedIds: string[] = []
    const cancelRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: ({ params, signal }) =>
              new Promise((resolve, reject) => {
                const timeout = setTimeout(() => resolve({ id: params.id }), 40)
                signal.addEventListener('abort', () => {
                  clearTimeout(timeout)
                  abortedIds.push(params.id ?? '')
                  const error = new Error('aborted')
                  error.name = 'AbortError'
                  reject(error)
                })
              }),
          },
        ],
      },
    ]
    const router = createRouter({ routes: cancelRoutes, history })
    router.start()

    const first = router.navigate('/users/1')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = router.navigate('/users/2')

    expect(await first).toBe(false)
    expect(await second).toBe(true)
    expect(abortedIds).toContain('1')
    expect(router.getState().location.pathname).toBe('/users/2')
    expect(router.getState().loaderData.users).toEqual({ id: '2' })
  })

  it('exposes pending/loading states during navigation lifecycle', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const routesWithDelay: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: ({ params }) =>
              new Promise((resolve) => setTimeout(() => resolve({ id: params.id }), 20)),
          },
        ],
      },
    ]
    const router = createRouter({ routes: routesWithDelay, history })
    router.start()

    const navPromise = router.navigate('/users/5')
    expect(router.getState().pending).toBe(true)
    expect(['navigating', 'loading']).toContain(router.getState().navigation)
    expect(router.isPending('/users/5')).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.getState().loading).toBe(true)
    expect(router.getState().navigation).toBe('loading')
    expect(router.isPending('/users/5')).toBe(true)

    await navPromise
    expect(router.getState().pending).toBe(false)
    expect(router.getState().loading).toBe(false)
    expect(router.getState().navigation).toBe('idle')
    expect(router.isPending('/users/5')).toBe(false)
  })

  it('exposes submitting state during action execution', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const control: { resolve?: () => void } = {}
    const actionRoutes: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            action: () =>
              new Promise((resolve) => {
                control.resolve = () => resolve({ ok: true })
              }),
          },
        ],
      },
    ]
    const router = createRouter({ routes: actionRoutes, history })
    router.start()
    await router.revalidate()

    const submitPromise = router.submitAction('users', { method: 'POST' })
    await Promise.resolve()
    expect(router.getState().submitting).toBe(true)
    expect(router.getState().pending).toBe(true)
    expect(router.getState().navigation).toBe('submitting')

    control.resolve?.()
    await submitPromise
    expect(router.getState().submitting).toBe(false)
    expect(router.getState().pending).toBe(false)
    expect(router.getState().navigation).toBe('idle')
  })

  it('transitions from submitting to loading when action revalidates', async () => {
    const history = createMemoryHistory({ initialEntries: ['/users/1'] })
    const routesWithAction: RouteNode[] = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'users',
            path: 'users/:id',
            loader: () =>
              new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 20)),
            action: () => ({ ok: true }),
          },
        ],
      },
    ]
    const router = createRouter({ routes: routesWithAction, history })
    router.start()
    await router.revalidate()

    const submit = router.submitAction('users', { method: 'POST' })
    await Promise.resolve()
    expect(router.getState().submitting).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.getState().loading).toBe(true)
    await submit
    expect(router.getState().navigation).toBe('idle')
  })
})
