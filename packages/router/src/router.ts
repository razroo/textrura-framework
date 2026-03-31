import { createMemoryHistory, type HistoryAdapter, type RouterLocation, type Unsubscribe } from './history.js'
import { matchRouteTree, type RouteBranchMatch, type RouteNode } from './tree.js'
import { parseQuery, type ParsedQuery } from './query.js'

export type RouterNavigationState = 'idle' | 'navigating'
export type NavigationOptions = {
  replace?: boolean
  restoreScroll?: boolean
  restoreFocus?: boolean
}

export type RouterState<T = unknown, TRequestContext = unknown> = {
  location: RouterLocation
  matches: RouteBranchMatch<T, TRequestContext> | null
  navigation: RouterNavigationState
  loaderData: Record<string, unknown>
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

export interface Router<T = unknown, TRequestContext = unknown> {
  start(): void
  navigate(to: string, options?: NavigationOptions): Promise<boolean>
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
}

function createRouteDataKey(route: { id?: string }, index: number): string {
  return route.id ?? `__route_${index}`
}

async function resolveState<T, TRequestContext>(
  routes: RouteNode<T, TRequestContext>[],
  location: RouterLocation,
  requestContextProvider?: TRequestContext | (() => TRequestContext | Promise<TRequestContext>),
): Promise<ResolvedState<T, TRequestContext>> {
  const matches = matchRouteTree(routes, location.pathname)
  const loaderData: Record<string, unknown> = {}

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
      loaderData[key] = await route.loader({
        params: matches.params,
        query,
        location,
        requestContext,
        route,
      })
    }
  }

  return {
    location,
    matches,
    loaderData,
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
    loaderData: {},
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

  const emit = (): void => {
    for (const listener of listeners) listener(state)
  }

  const applyResolvedLocation = async (
    location: RouterLocation,
    previousNavigation: typeof pendingNavigation,
  ): Promise<void> => {
    const version = ++resolutionVersion
    const resolved = await resolveState(routes, location, options.requestContext)
    if (disposed || version !== resolutionVersion) {
      previousNavigation?.resolve(false)
      return
    }

    pendingTo = null
    state = {
      location: resolved.location,
      matches: resolved.matches,
      loaderData: resolved.loaderData,
      navigation: 'idle',
    }

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
    emit()
  }

  const onHistoryUpdate = (): void => {
    const previous = pendingNavigation
    void applyResolvedLocation(history.location, previous)
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
      state = { ...state, navigation: 'navigating' }
      emit()
      if (replace) {
        history.replace(to)
      } else {
        history.push(to)
      }
      return completion
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
      return state.navigation === 'navigating' && pendingTo === to
    },
    addBlocker(blocker: NavigationBlocker) {
      blockers.add(blocker)
      return () => blockers.delete(blocker)
    },
  }
}
