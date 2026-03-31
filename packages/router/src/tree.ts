import { matchPath } from './matcher.js'
import type { ParsedQuery } from './query.js'
import { comparePatternSpecificity } from './ranking.js'
import type { RouterLocation } from './history.js'

export type RouteLoaderContext<T = unknown, TRequestContext = unknown> = {
  params: Record<string, string>
  query: ParsedQuery
  location: RouterLocation
  requestContext: TRequestContext
  route: RouteNode<T, TRequestContext>
}

export type RouteNode<T = unknown, TRequestContext = unknown> = {
  id?: string
  path?: string
  children?: RouteNode<T, TRequestContext>[]
  render?: (context: {
    outlet: T | null
    params: Record<string, string>
    pathname: string
    route: RouteNode<T, TRequestContext>
  }) => T
  loader?: (context: RouteLoaderContext<T, TRequestContext>) => unknown | Promise<unknown>
}

export type RouteBranchMatch<T = unknown, TRequestContext = unknown> = {
  params: Record<string, string>
  matches: RouteNode<T, TRequestContext>[]
}

function joinPaths(base: string, next: string): string {
  const left = base === '/' ? '' : base.replace(/\/+$/, '')
  const right = next.replace(/^\/+/, '')
  const combined = `${left}/${right}`.replace(/\/+/g, '/')
  return combined === '' ? '/' : combined
}

function branchPattern<T, TRequestContext>(matches: RouteNode<T, TRequestContext>[]): string {
  let current = '/'
  for (const route of matches) {
    if (!route.path) continue
    current = joinPaths(current, route.path)
  }
  return current
}

export function matchRouteTree<T, TRequestContext>(
  routes: RouteNode<T, TRequestContext>[],
  pathname: string,
): RouteBranchMatch<T, TRequestContext> | null {
  let bestMatch: RouteBranchMatch<T, TRequestContext> | null = null

  function visit(
    node: RouteNode<T, TRequestContext>,
    inheritedPath: string,
    stack: RouteNode<T, TRequestContext>[],
  ): void {
    const nodePath = node.path ?? ''
    const absolutePath = nodePath === '' ? inheritedPath : joinPaths(inheritedPath, nodePath)
    const nextStack = [...stack, node]

    const nodeMatch = matchPath(absolutePath, pathname)
    if (nodeMatch) {
      const candidate: RouteBranchMatch<T, TRequestContext> = { params: nodeMatch.params, matches: nextStack }
      if (!bestMatch) {
        bestMatch = candidate
      } else {
        const candidatePattern = branchPattern(candidate.matches)
        const bestPattern = branchPattern(bestMatch.matches)
        const compare = comparePatternSpecificity(candidatePattern, bestPattern)
        if (compare < 0 || (compare === 0 && candidate.matches.length > bestMatch.matches.length)) {
          bestMatch = candidate
        }
      }
    }

    if (!node.children) return
    for (const child of node.children) {
      visit(child, absolutePath, nextStack)
    }
  }

  for (const route of routes) {
    visit(route, '/', [])
  }

  return bestMatch
}

export function renderMatchedOutlet<T, TRequestContext>(
  branch: RouteBranchMatch<T, TRequestContext>,
  pathname: string,
): T | null {
  let outlet: T | null = null
  for (let i = branch.matches.length - 1; i >= 0; i -= 1) {
    const route = branch.matches[i]
    if (!route) continue
    if (!route.render) continue
    outlet = route.render({
      outlet,
      params: branch.params,
      pathname,
      route,
    })
  }
  return outlet
}
