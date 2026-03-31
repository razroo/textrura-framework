# @geometra/router

Routing primitives for Geometra.

Current scope (foundation): route matching and nested branch composition utilities.

## Install

```bash
npm install @geometra/router
```

## Key Exports

- `matchPath` -- matches path patterns with static, dynamic, optional, and splat segments
- `buildPath` -- reverse routing helper with typed params
- `parseQuery` / `stringifyQuery` -- query parse/stringify helpers with deterministic key ordering
- `createMemoryHistory` -- history adapter for non-browser runtimes and tests
- `createBrowserHistory` -- browser adapter using pushState/replaceState/popstate
- `createRouter` -- router lifecycle (`start`, `navigate`, `subscribe`, `dispose`)
- route `loader` support -- params/query/requestContext-aware data loading for matched routes
- `state.loaderData` -- per-route loader results keyed by route `id`
- route `action` support -- write/mutation handlers with submission payloads
- `router.submitAction(routeId, submission)` + `state.actionData` -- mutation workflow primitives
- `router.isActive(to)` / `router.isPending(to)` -- route state helpers for active and transition states
- `router.addBlocker(fn)` -- guards transitions for unsaved-state and confirmation flows
- `restoration` policy + per-navigation options -- scroll/focus restoration control on transitions
- `link` -- declarative link element with click + keyboard activation semantics
- `scorePathPattern` -- computes route specificity score for deterministic ranking
- `comparePatternSpecificity` -- compares two patterns by ranking
- `matchRouteTree` -- matches nested route trees with layout routes
- `renderMatchedOutlet` -- composes matched branch render output from leaf to root

## Usage

```ts
import { matchPath } from '@geometra/router'

const match = matchPath('/users/:id?', '/users/42')
// { params: { id: '42' } }
```
