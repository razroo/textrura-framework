import { createMemoryHistory, type HistoryAdapter, type RouterLocation, type Unsubscribe } from './history.js'
import { matchRouteTree, type RouteBranchMatch, type RouteNode } from './tree.js'

export type RouterNavigationState = 'idle' | 'navigating'

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

export interface Router<T = unknown> {
  start(): void
  navigate(to: string, options?: { replace?: boolean }): Promise<boolean>
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
  const listeners = new Set<RouterSubscriber<T>>()
  const blockers = new Set<NavigationBlocker>()

  const emit = (): void => {
    for (const listener of listeners) listener(state)
  }

  const onHistoryUpdate = (): void => {
    pendingTo = null
    state = resolveState(routes, history.location)
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
    async navigate(to: string, navigationOptions?: { replace?: boolean }) {
      if (disposed) return false
      const replace = navigationOptions?.replace ?? false
      for (const blocker of blockers) {
        const allowed = await blocker({ from: state.location, to, replace })
        if (!allowed) return false
      }
      pendingTo = to
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
