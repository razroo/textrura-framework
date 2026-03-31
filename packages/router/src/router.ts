import { createMemoryHistory, type HistoryAdapter, type RouterLocation, type Unsubscribe } from './history.js'
import { matchRouteTree, type RouteBranchMatch, type RouteNode } from './tree.js'
import { parseQuery, type ParsedQuery } from './query.js'
import type { RouteActionSubmission } from './tree.js'
import { isRedirectResult } from './responses.js'

export type RouterNavigationState = 'idle' | 'navigating' | 'loading' | 'submitting'
export type NavigationOptions = {
  replace?: boolean
  restoreScroll?: boolean
  restoreFocus?: boolean
}

export type RouterState<T = unknown, TRequestContext = unknown> = {
  location: RouterLocation
  matches: RouteBranchMatch<T, TRequestContext> | null
  navigation: RouterNavigationState
  pending: boolean
  submitting: boolean
  loading: boolean
  loaderData: Record<string, unknown>
  actionData: Record<string, unknown>
}

export type RouterSubscriber<T = unknown, TRequestContext = unknown> = (
  state: RouterState<T, TRequestContext>,
) => void
export type NavigationBlocker = (context: {
  from: RouterLocation
  to: string
  replace: boolean
}) => boolean | Promise<boolean>

export type NavigationRestorationContext<T = unknown, TRequestContext = unknown> = {
  from: RouterLocation
  to: RouterLocation
  matches: RouteBranchMatch<T, TRequestContext> | null
  replace: boolean
}

export type RouterRestorationPolicy<T = unknown, TRequestContext = unknown> = {
  restoreScroll?: (context: NavigationRestorationContext<T, TRequestContext>) => void
  restoreFocus?: (context: NavigationRestorationContext<T, TRequestContext>) => void
}

export type OptimisticMutation<T = unknown, TRequestContext = unknown> = {
  apply: (state: RouterState<T, TRequestContext>) => RouterState<T, TRequestContext>
  rollback?: (
    state: RouterState<T, TRequestContext>,
    error: unknown,
    previousState: RouterState<T, TRequestContext>,
  ) => RouterState<T, TRequestContext>
}

export type SubmitActionOptions<T = unknown, TRequestContext = unknown> = {
  optimistic?: OptimisticMutation<T, TRequestContext>
}

export interface Router<T = unknown, TRequestContext = unknown> {
  start(): void
  navigate(to: string, options?: NavigationOptions): Promise<boolean>
  submitAction(
    routeId: string,
    submission?: RouteActionSubmission,
    options?: SubmitActionOptions<T, TRequestContext>,
  ): Promise<boolean>
  revalidate(): Promise<boolean>
  subscribe(listener: RouterSubscriber<T, TRequestContext>): Unsubscribe
  dispose(): void
  getState(): RouterState<T, TRequestContext>
  isActive(to: string): boolean
  isPending(to: string): boolean
  addBlocker(blocker: NavigationBlocker): Unsubscribe
}

export type CreateRouterOptions<T = unknown, TRequestContext = unknown> = {
  routes: RouteNode<T, TRequestContext>[]
  history?: HistoryAdapter
  restoration?: RouterRestorationPolicy<T, TRequestContext>
  requestContext?: TRequestContext | (() => TRequestContext | Promise<TRequestContext>)
}

type ResolvedState<T = unknown, TRequestContext = unknown> = {
  location: RouterLocation
  matches: RouteBranchMatch<T, TRequestContext> | null
  loaderData: Record<string, unknown>
  redirect: { to: string; replace: boolean } | null
}

function withNavigationState<T, TRequestContext>(
  state: RouterState<T, TRequestContext>,
  navigation: RouterNavigationState,
): RouterState<T, TRequestContext> {
  return {
    ...state,
    navigation,
    pending: navigation !== 'idle',
    submitting: navigation === 'submitting',
    loading: navigation === 'loading',
  }
}

function createAbortError(): Error {
  const error = new Error('Navigation aborted')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError'
}

function createRouteDataKey(route: { id?: string }, index: number): string {
  return route.id ?? `__route_${index}`
}

async function resolveState<T, TRequestContext>(
  routes: RouteNode<T, TRequestContext>[],
  location: RouterLocation,
  signal: AbortSignal,
  requestContextProvider?: TRequestContext | (() => TRequestContext | Promise<TRequestContext>),
): Promise<ResolvedState<T, TRequestContext>> {
  if (signal.aborted) throw createAbortError()
  const matches = matchRouteTree(routes, location.pathname)
  const loaderData: Record<string, unknown> = {}
  let redirect: { to: string; replace: boolean } | null = null

  if (matches) {
    const query: ParsedQuery = parseQuery(location.search)
    const requestContext =
      typeof requestContextProvider === 'function'
        ? await (requestContextProvider as () => TRequestContext | Promise<TRequestContext>)()
        : (requestContextProvider as TRequestContext)

    for (let i = 0; i < matches.matches.length; i += 1) {
      const route = matches.matches[i]
      if (!route?.loader) continue
      const key = createRouteDataKey(route, i)
      const result = await route.loader({
        params: matches.params,
        query,
        location,
        requestContext,
        signal,
        route,
      })
      if (signal.aborted) throw createAbortError()
      if (isRedirectResult(result)) {
        redirect = { to: result.to, replace: result.replace ?? false }
        break
      }
      loaderData[key] = result
    }
  }

  return {
    location,
    matches,
    loaderData,
    redirect,
  }
}

export function createRouter<T, TRequestContext = unknown>(
  options: CreateRouterOptions<T, TRequestContext>,
): Router<T, TRequestContext> {
  const history = options.history ?? createMemoryHistory()
  const routes = options.routes

  let started = false
  let disposed = false
  let unlisten: Unsubscribe | null = null
  let state: RouterState<T, TRequestContext> = {
    location: history.location,
    matches: matchRouteTree(routes, history.location.pathname),
    navigation: 'idle',
    pending: false,
    submitting: false,
    loading: false,
    loaderData: {},
    actionData: {},
  }
  let pendingTo: string | null = null
  let pendingNavigation:
    | (Required<Pick<NavigationOptions, 'replace' | 'restoreScroll' | 'restoreFocus'>> & {
      from: RouterLocation
      to: string
      resolve: (value: boolean) => void
    })
    | null = null
  const listeners = new Set<RouterSubscriber<T, TRequestContext>>()
  const blockers = new Set<NavigationBlocker>()
  let resolutionVersion = 0
  let inFlightController: AbortController | null = null

  const emit = (): void => {
    for (const listener of listeners) listener(state)
  }

  const getRequestContext = async (): Promise<TRequestContext> => {
    return typeof options.requestContext === 'function'
      ? await (options.requestContext as () => TRequestContext | Promise<TRequestContext>)()
      : (options.requestContext as TRequestContext)
  }

  const applyResolvedLocation = async (
    location: RouterLocation,
    previousNavigation: typeof pendingNavigation,
  ): Promise<void> => {
    const version = ++resolutionVersion
    inFlightController?.abort()
    const controller = new AbortController()
    inFlightController = controller
    let resolved: ResolvedState<T, TRequestContext>
    try {
      resolved = await resolveState(routes, location, controller.signal, options.requestContext)
    } catch (error) {
      if (isAbortError(error)) return
      throw error
    }
    if (disposed || version !== resolutionVersion || controller !== inFlightController) {
      previousNavigation?.resolve(false)
      return
    }

    if (resolved.redirect) {
      if (resolved.redirect.replace) {
        history.replace(resolved.redirect.to)
      } else {
        history.push(resolved.redirect.to)
      }
      previousNavigation?.resolve(true)
      pendingNavigation = null
      return
    }

    pendingTo = null
    state = {
      location: resolved.location,
      matches: resolved.matches,
      loaderData: resolved.loaderData,
      actionData: state.actionData,
      navigation: state.navigation,
      pending: state.pending,
      submitting: state.submitting,
      loading: state.loading,
    }
    state = withNavigationState(state, 'idle')

    if (previousNavigation) {
      const context: NavigationRestorationContext<T, TRequestContext> = {
        from: previousNavigation.from,
        to: state.location,
        matches: state.matches,
        replace: previousNavigation.replace,
      }
      if (previousNavigation.restoreScroll) {
        options.restoration?.restoreScroll?.(context)
      }
      if (previousNavigation.restoreFocus) {
        options.restoration?.restoreFocus?.(context)
      }
      previousNavigation.resolve(true)
      pendingNavigation = null
    }
    inFlightController = null
    emit()
  }

  const onHistoryUpdate = (): void => {
    const previous = pendingNavigation
    state = withNavigationState(state, 'loading')
    emit()
    void applyResolvedLocation(history.location, previous)
  }

  const navigateInternal = async (to: string, navigationOptions?: NavigationOptions): Promise<boolean> => {
    if (disposed) return false
    const replace = navigationOptions?.replace ?? false
    const restoreScroll = navigationOptions?.restoreScroll ?? true
    const restoreFocus = navigationOptions?.restoreFocus ?? true
    for (const blocker of blockers) {
      const allowed = await blocker({ from: state.location, to, replace })
      if (!allowed) return false
    }
    pendingNavigation?.resolve(false)
    pendingTo = to
    const completion = new Promise<boolean>((resolve) => {
      pendingNavigation = {
        from: state.location,
        to,
        replace,
        restoreScroll,
        restoreFocus,
        resolve,
      }
    })
    state = withNavigationState(state, 'navigating')
    emit()
    if (replace) {
      history.replace(to)
    } else {
      history.push(to)
    }
    return completion
  }

  return {
    start() {
      if (disposed || started) return
      unlisten = history.listen(onHistoryUpdate)
      started = true
      void applyResolvedLocation(history.location, null)
      emit()
    },
    async navigate(to: string, navigationOptions?: NavigationOptions) {
      return navigateInternal(to, navigationOptions)
    },
    async submitAction(
      routeId: string,
      submission: RouteActionSubmission = {},
      actionOptions?: SubmitActionOptions<T, TRequestContext>,
    ) {
      if (disposed) return false
      const branch = state.matches
      if (!branch) return false

      const route = branch.matches.find((item) => item.id === routeId)
      if (!route?.action) return false

      const optimisticBaseState = state
      if (actionOptions?.optimistic) {
        state = actionOptions.optimistic.apply(state)
        emit()
      }
      state = withNavigationState(state, 'submitting')
      emit()
      try {
        const requestContext = await getRequestContext()
        const query = parseQuery(state.location.search)
        const controller = new AbortController()
        const result = await route.action({
          params: branch.params,
          query,
          location: state.location,
          requestContext,
          signal: controller.signal,
          route,
          submission,
        })

        if (isRedirectResult(result)) {
          return navigateInternal(result.to, { replace: result.replace })
        }

        state = {
          ...state,
          actionData: {
            ...state.actionData,
            [routeId]: result,
          },
        }
        emit()
        state = withNavigationState(state, 'loading')
        emit()
        await applyResolvedLocation(state.location, null)
        return true
      } catch (error) {
        if (actionOptions?.optimistic?.rollback) {
          state = actionOptions.optimistic.rollback(state, error, optimisticBaseState)
        } else if (actionOptions?.optimistic) {
          state = optimisticBaseState
        }
        state = withNavigationState(state, 'idle')
        emit()
        return false
      }
    },
    async revalidate() {
      if (disposed) return false
      state = withNavigationState(state, 'loading')
      emit()
      await applyResolvedLocation(state.location, null)
      return true
    },
    subscribe(listener: RouterSubscriber<T, TRequestContext>) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    dispose() {
      if (disposed) return
      disposed = true
      started = false
      inFlightController?.abort()
      inFlightController = null
      if (unlisten) {
        unlisten()
        unlisten = null
      }
      listeners.clear()
    },
    getState() {
      return state
    },
    isActive(to: string) {
      return state.location.pathname === to
    },
    isPending(to: string) {
      return state.pending && (pendingTo === to || (pendingTo === null && state.location.pathname === to))
    },
    addBlocker(blocker: NavigationBlocker) {
      blockers.add(blocker)
      return () => blockers.delete(blocker)
    },
  }
}
