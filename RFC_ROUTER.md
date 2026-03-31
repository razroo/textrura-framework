# RFC: `@geometra/router` Foundation

Status: Accepted (initial scope)

Owner: Geometra core maintainers

## Why

Geometra currently has strong rendering, input, and server/client protocol primitives, but no first-class routing package. Applications can switch views manually, yet they do not get:

- deterministic route matching
- nested layout routes with outlet composition
- navigation lifecycle primitives across canvas, terminal, and server/client runtimes
- a standard data-loading and mutation model tied to route transitions

To compete with modern router ecosystems, Geometra needs an official routing layer that preserves its north-star architecture:

`Tree -> Yoga WASM -> Geometry -> Pixels`

## Proposal

Ship a new package: `@geometra/router`.

This package will provide:

- route definition and matching primitives
- history adapters (browser + memory)
- navigation APIs (imperative and declarative)
- route transition state signals
- integration points for loaders/actions and error boundaries in later phases

The router must remain declarative and renderer-agnostic so the same route model works for canvas, terminal, and server/client protocol flows.

## Success criteria (v1 foundation)

1. Applications can define nested routes with static, dynamic, and splat segments.
2. Route matching and ranking are deterministic and fully covered by unit tests.
3. Apps can navigate with `navigate(to, { replace? })`, back, and forward.
4. Browser runtime supports history sync; non-browser runtimes use memory history.
5. Route state (location, params, matched branch, pending state) is exposed as reactive primitives compatible with `@geometra/core`.
6. Initial docs and at least one working demo show router usage in Geometra.

## Non-goals (for this RFC phase)

- Full data-router parity in first release (loaders/actions are phased next).
- File-based routing conventions.
- DOM-only features that cannot be mapped to non-DOM renderers.
- Framework-specific compile-time transforms.
- Replacing existing `@geometra/core` primitives.

## Constraints and invariants

- Keep protocol behavior explicit and version-safe for server/client mode.
- Do not introduce DOM coupling in core matching/navigation logic.
- Preserve focus/selection/text input correctness through route transitions.
- Maintain Bun-first compatibility and reliable CI behavior.

## Runtime support confirmation

`@geometra/router` is required to be first-class across all primary Geometra runtimes.

| Runtime | Status | Required behavior |
|---|---|---|
| Local canvas (`createApp` + `CanvasRenderer`) | Required | Route transitions render as normal tree updates with no DOM dependency in matching/navigation core. |
| Terminal (`createApp` + `TerminalRenderer`) | Required | Same route definitions and matching behavior via memory history; keyboard navigation supported. |
| Server/client protocol (`@geometra/server` + `@geometra/client`) | Required | Initial route match works server-side and navigation behavior is explicit over protocol messages. |

Acceptance gate: no router release is considered complete unless all three runtimes are covered by integration tests and examples.

## History compatibility contract

The router exposes a single history interface so runtime differences stay behind adapters.

### Browser history contract

- Uses `window.history.pushState` / `replaceState` for navigations.
- Subscribes to `popstate` for back/forward transitions.
- Normalizes location as `{ pathname, search, hash }`.
- Treats trailing slash and base path handling consistently with memory history.
- Never requires DOM nodes for core navigation behavior (only `window` history APIs).

### Memory history contract

- Maintains an internal stack (`entries[]`, `index`) for non-browser runtimes and tests.
- Supports `push`, `replace`, `back`, and `forward` with browser-equivalent semantics.
- Emits updates through the same subscription API used by browser history.
- Serves as the default adapter for terminal/runtime contexts without `window`.

### Cross-adapter invariants

- `navigate(to)` and `navigate(to, { replace: true })` must yield equivalent final locations across adapters.
- `back()` and `forward()` behavior must match for the same sequence of operations.
- Querystring and hash parsing must be adapter-neutral.
- Router state updates must be deterministic and emitted in the same order across adapters.

## Initial API sketch (non-binding)

```ts
type RouteDefinition = {
  path?: string
  id?: string
  children?: RouteDefinition[]
  component?: () => UIElement
}

type Router = {
  start(): void
  dispose(): void
  navigate(to: string, opts?: { replace?: boolean }): void
  back(): void
  forward(): void
  state: Signal<{
    location: { pathname: string; search: string; hash: string }
    params: Record<string, string>
    matches: Array<{ id?: string; path?: string }>
    navigation: 'idle' | 'navigating'
  }>
}

declare function createRouter(config: {
  routes: RouteDefinition[]
  history?: BrowserHistory | MemoryHistory
}): Router
```

## Milestones

1. Foundation router (matching + history + navigate + nested outlet composition).
2. Data router (loaders/actions/redirect/cancel/revalidate).
3. DX and optimization (prefetch/lazy routes/dev overlay/advanced diagnostics).

## Risks

- Route transitions can regress focus and IME flows if lifecycle hooks are unclear.
- Server/client navigation protocol may drift without explicit message contracts.
- Ranking edge cases can cause surprising matches without strict tests.

## Decision

Adopt this RFC as the baseline for checklist execution, starting with the foundation milestone.
