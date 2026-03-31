import { createMemoryHistory, type HistoryAdapter, type RouterLocation, type Unsubscribe } from './history.js'
import { matchRouteTree, type RouteBranchMatch, type RouteNode } from './tree.js'

export type RouterNavigationState = 'idle' | 'navigating'
export type NavigationOptions = {
  replace?: boolean
  restoreScroll?: boolean
  restoreFocus?: boolean
}

export type RouterState<T = unknown> = {
  location: RouterLocation
  matches: RouteBranchMatch<T> | null
  navigation: RouterNavigationState
}

export type RouterSubscriber<T = unknown> = (state: RouterState<T>) => void
export type NavigationBlocker = (context: {
  from: RouterLocation
  to: string
  replace: boolean
}) => boolean | Promise<boolean>

export type NavigationRestorationContext<T = unknown> = {
  from: RouterLocation
  to: RouterLocation
  matches: RouteBranchMatch<T> | null
  replace: boolean
}

export type RouterRestorationPolicy<T = unknown> = {
  restoreScroll?: (context: NavigationRestorationContext<T>) => void
  restoreFocus?: (context: NavigationRestorationContext<T>) => void
}

export interface Router<T = unknown> {
  start(): void
  navigate(to: string, options?: NavigationOptions): Promise<boolean>
  subscribe(listener: RouterSubscriber<T>): Unsubscribe
  dispose(): void
  getState(): RouterState<T>
  isActive(to: string): boolean
  isPending(to: string): boolean
  addBlocker(blocker: NavigationBlocker): Unsubscribe
}

export type CreateRouterOptions<T = unknown> = {
  routes: RouteNode<T>[]
  history?: HistoryAdapter
  restoration?: RouterRestorationPolicy<T>
}

function resolveState<T>(routes: RouteNode<T>[], location: RouterLocation): RouterState<T> {
  return {
    location,
    matches: matchRouteTree(routes, location.pathname),
    navigation: 'idle',
  }
}

export function createRouter<T>(options: CreateRouterOptions<T>): Router<T> {
  const history = options.history ?? createMemoryHistory()
  const routes = options.routes

  let started = false
  let disposed = false
  let unlisten: Unsubscribe | null = null
  let state = resolveState(routes, history.location)
  let pendingTo: string | null = null
  let pendingNavigation:
    | (Required<Pick<NavigationOptions, 'replace' | 'restoreScroll' | 'restoreFocus'>> & {
      from: RouterLocation
      to: string
    })
    | null = null
  const listeners = new Set<RouterSubscriber<T>>()
  const blockers = new Set<NavigationBlocker>()

  const emit = (): void => {
    for (const listener of listeners) listener(state)
  }

  const onHistoryUpdate = (): void => {
    const previous = pendingNavigation
    pendingTo = null
    state = resolveState(routes, history.location)
    if (previous) {
      const context: NavigationRestorationContext<T> = {
        from: previous.from,
        to: state.location,
        matches: state.matches,
        replace: previous.replace,
      }
      if (previous.restoreScroll) {
        options.restoration?.restoreScroll?.(context)
      }
      if (previous.restoreFocus) {
        options.restoration?.restoreFocus?.(context)
      }
      pendingNavigation = null
    }
    emit()
  }

  return {
    start() {
      if (disposed || started) return
      unlisten = history.listen(onHistoryUpdate)
      started = true
      state = resolveState(routes, history.location)
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
      pendingTo = to
      pendingNavigation = {
        from: state.location,
        to,
        replace,
        restoreScroll,
        restoreFocus,
      }
      state = { ...state, navigation: 'navigating' }
      emit()
      if (replace) {
        history.replace(to)
      } else {
        history.push(to)
      }
      return true
    },
    subscribe(listener: RouterSubscriber<T>) {
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
