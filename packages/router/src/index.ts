/**
 * @packageDocumentation
 * Public entry for `@geometra/router`: pathname matching ({@link matchPath}), reverse path building ({@link buildPath}),
 * query helpers ({@link parseQuery}, {@link stringifyQuery}), browser and memory history adapters, the {@link link}
 * primitive, loader/action response helpers ({@link redirect}, {@link response}, {@link json}), route pattern ranking,
 * {@link createRouter} with navigation, data loading, and error boundaries, plus outlet rendering utilities ({@link matchRouteTree},
 * {@link renderMatchedOutlet}). All routing state stays compatible with Geometra’s declarative tree across canvas,
 * terminal, and server-driven clients.
 */

export { matchPath } from './matcher.js'
export type { RouteMatch } from './matcher.js'
export { buildPath } from './path.js'
export type { PathParams } from './path.js'
export { parseQuery, stringifyQuery } from './query.js'
export type { QueryInput, QueryValue, ParsedQuery } from './query.js'
export { createMemoryHistory } from './history.js'
export { createBrowserHistory } from './history.js'
export type { RouterLocation, HistoryUpdate, HistoryAdapter, BrowserHistoryOptions } from './history.js'
export { link } from './link.js'
export type { LinkProps } from './link.js'
export { redirect, response, json } from './responses.js'
export type { RedirectResult, ResponseResult } from './responses.js'
export { scorePathPattern, comparePatternSpecificity } from './ranking.js'
export { createRouter } from './router.js'
export type {
  Router,
  RouterState,
  RouterSubscriber,
  RouterNavigationState,
  CreateRouterOptions,
  NavigationOptions,
  NavigationBlocker,
  RouterRestorationPolicy,
  NavigationRestorationContext,
  OptimisticMutation,
  SubmitActionOptions,
  RouterErrorPayload,
  RouterErrorPhase,
} from './router.js'
export { matchRouteTree, renderMatchedOutlet } from './tree.js'
export type { RouteNode, RouteBranchMatch } from './tree.js'
export type { RouteLoaderContext, RouteActionContext, RouteActionSubmission } from './tree.js'
