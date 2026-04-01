# @geometra/router

Routing primitives for Geometra.

The package now covers matching, history adapters, router lifecycle, loaders/actions, redirects, blockers, restoration policy, and a declarative `link` primitive.

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
- `submitAction(..., { optimistic })` -- optimistic mutation hooks with rollback on failure
- automatic loader revalidation after actions + explicit `router.revalidate()` support
- `redirect()` / `response()` / `json()` -- loader/action helpers for redirects and structured results
- loader/action contexts include `signal` for AbortController-driven cancellation
- router state exposes `pending` / `submitting` / `loading` flags for transition-aware UI
- router state exposes structured `error` payloads for loader/action/navigation failures
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
import { createMemoryHistory, createRouter, redirect } from '@geometra/router'

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ['/'] }),
  routes: [
    {
      id: 'home',
      path: '/',
      loader: async () => ({ ok: true }),
    },
    {
      id: 'users.show',
      path: '/users/:id',
      loader: async ({ params }) => ({ userId: params.id }),
      action: async ({ submission }) => {
        return { saved: true, payload: submission.data }
      },
    },
    {
      id: 'legacy',
      path: '/old-home',
      loader: async () => redirect('/'),
    },
  ],
})

router.start()
await router.navigate('/users/42')

router.getState().location.pathname
router.getState().loaderData['users.show']
await router.submitAction('users.show', { method: 'POST', data: { theme: 'dark' } })
```

## Notes

- The router is renderer-agnostic. It manages navigation state and data flow; rendering matched content is still your app’s job.
- `loader` and `action` contexts include route params, parsed query, optional request context, and an abort `signal`.
- `router.addBlocker()` is the escape hatch for unsaved-changes flows and transition confirmation.
- `router.isActive()` and `router.isPending()` are intended for link styling and transition-aware UI.

## Links

- [Delivery report](https://github.com/razroo/geometra/blob/main/ROUTER_DELIVERY_REPORT.md)
- [RFC](https://github.com/razroo/geometra/blob/main/RFC_ROUTER.md)
