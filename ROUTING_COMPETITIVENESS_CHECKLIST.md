# Routing Competitiveness Checklist

Goal: deliver a Geometra routing stack that is competitive with modern data routers (for example React Router 7), while preserving Geometra's core pipeline (`Tree -> Yoga WASM -> Geometry -> Pixels`) and DOM-free model.

## 0) Define target and scope

- [x] Publish an RFC for `@geometra/router` with success criteria and non-goals.
- [x] Confirm first-class support for local canvas, terminal, and server/client protocol modes.
- [x] Define compatibility contract for browser history mode and memory history mode.
- [x] Define protocol behavior for route transitions in server-computed layouts.

## 1) Core routing primitives (must have)

- [x] Add route matcher supporting static, dynamic (`:id`), optional, and splat segments.
- [x] Add nested route tree with layout routes and child outlet rendering.
- [x] Add route ranking and deterministic conflict resolution.
- [x] Add path generation utilities (reverse routing) with typed params.
- [x] Add querystring parse/stringify helpers with stable ordering.
- [x] Add `createRouter()` lifecycle (`start`, `navigate`, `subscribe`, `dispose`).
- [x] Add history adapters:
  - [x] Browser history (push/replace/popstate).
  - [x] Memory history (tests, terminal, server runtime).

## 2) Navigation APIs (must have)

- [x] Add imperative navigation API (`navigate(to, options)`).
- [x] Add declarative link primitive with keyboard activation semantics.
- [x] Add active/pending route state helpers.
- [x] Add blockers/guards for unsaved state and transition confirmation.
- [x] Add scroll and focus restoration policy per navigation.

## 3) Data loading and mutations (React Router class parity)

- [x] Add route `loader` support with params, query, and request context.
- [x] Add route `action` support for write operations and mutation workflows.
- [x] Add redirect and response helpers from loaders/actions.
- [x] Add request cancellation via `AbortController` on interrupted transitions.
- [x] Add revalidation strategy after actions and explicit manual revalidate.
- [x] Add pending/submitting/loading states for transition-aware UI.
- [x] Add optimistic mutation hooks with rollback behavior.

## 4) Error and boundary model

- [x] Add route-level error boundaries for loader/action/render failures.
- [x] Add not-found handling at branch and root levels.
- [x] Add typed error payloads for server/client protocol transport.
- [x] Add fallback rendering for failed lazy routes and chunk fetch errors.

## 5) Rendering/runtime integration (Geometra-specific)

- [x] Ensure route state is represented in the same declarative tree model used by all renderers.
- [x] Define hit-test and keyboard semantics for link/navigation in non-DOM renderers.
- [x] Ensure route transitions do not break focus, selection, IME composition, or text input history.
- [x] Support navigation events over WebSocket protocol (`navigate`, `prefetch`, `back`, `forward`).
- [x] Support server-side route matching + data load for initial frame (fast first paint).
- [x] Ensure geometry diffing remains incremental across route transitions.

## 6) Code splitting and prefetching

- [x] Add lazy route modules (`lazy: () => import(...)`) with loading fallback.
- [x] Add prefetch policies (intent/hover/viewport/manual) that work without DOM assumptions.
- [x] Add cache policy knobs for loader data and route modules.
- [x] Add bundle split guidance/examples for Bun + Vite.

## 7) Developer experience

- [x] Ship `@geometra/router` package with stable, documented APIs.
- [x] Add route definition helpers with strong TypeScript inference for params/search/loader data.
- [x] Add dev warnings for ambiguous paths, missing params, and invalid redirects.
- [x] Add router dev overlay hooks (current route, match tree, pending loaders, timings).
- [x] Add migration guide from basic signal-based view switching to router APIs.

## 8) Testing and reliability

- [x] Add unit tests for matcher, ranking, params, query handling, and path generation.
- [x] Add integration tests for nested routes, redirects, blockers, and revalidation.
- [x] Add server/client protocol tests for navigation and loader/action error transport.
- [x] Add regression tests for focus and text-input behavior across navigations.
- [x] Add performance benchmarks for route transitions and loader cancellation churn.

## 9) Documentation and examples

- [x] Add "Routing Quick Start" in root README with local and server/client examples.
- [x] Add dedicated docs for:
  - [x] Nested routes and outlets.
  - [x] Loaders/actions and mutations.
  - [x] Error boundaries and not-found routes.
  - [x] Prefetch strategies and lazy route modules.
- [x] Add demos:
  - [x] CRUD dashboard with optimistic updates.
  - [x] Auth-gated routes with redirects.
  - [x] Large list + search params + pagination.
  - [x] Terminal renderer navigation example.

## 10) Competitive bar (release gates)

- [x] Apps can express route tree + nested layouts without custom glue code.
- [x] Data loading/mutations are first-class and cancel-safe.
- [x] Errors are isolated at route boundaries with predictable recovery UX.
- [x] Navigation UX includes pending states, focus restoration, and back/forward correctness.
- [x] Server/client protocol handles navigation and data errors explicitly and version-safely.
- [x] Docs + demos make common app flows as straightforward as mainstream router ecosystems.

## Suggested delivery phases

- [x] **Phase 1 (MVP):** sections 1, 2, and minimal 4 + tests.
- [x] **Phase 2 (Data Router):** section 3 + full 4 + protocol integration from 5.
- [x] **Phase 3 (Scale/DX):** sections 6, 7, 8 perf, and 9 docs/demos.
