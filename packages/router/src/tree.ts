import { matchPath } from './matcher.js'

export type RouteNode<T = unknown> = {
  id?: string
  path?: string
  children?: RouteNode<T>[]
  render?: (context: {
    outlet: T | null
    params: Record<string, string>
    pathname: string
    route: RouteNode<T>
  }) => T
}

export type RouteBranchMatch<T = unknown> = {
  params: Record<string, string>
  matches: RouteNode<T>[]
}

function joinPaths(base: string, next: string): string {
  const left = base === '/' ? '' : base.replace(/\/+$/, '')
  const right = next.replace(/^\/+/, '')
  const combined = `${left}/${right}`.replace(/\/+/g, '/')
  return combined === '' ? '/' : combined
}

export function matchRouteTree<T>(routes: RouteNode<T>[], pathname: string): RouteBranchMatch<T> | null {
  let bestMatch: RouteBranchMatch<T> | null = null

  function visit(node: RouteNode<T>, inheritedPath: string, stack: RouteNode<T>[]): void {
    const nodePath = node.path ?? ''
    const absolutePath = nodePath === '' ? inheritedPath : joinPaths(inheritedPath, nodePath)
    const nextStack = [...stack, node]

    const nodeMatch = matchPath(absolutePath, pathname)
    if (nodeMatch) {
      const candidate: RouteBranchMatch<T> = { params: nodeMatch.params, matches: nextStack }
      if (!bestMatch || candidate.matches.length > bestMatch.matches.length) {
        bestMatch = candidate
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

export function renderMatchedOutlet<T>(branch: RouteBranchMatch<T>, pathname: string): T | null {
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
