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
- [ ] Add pending/submitting/loading states for transition-aware UI.
- [ ] Add optimistic mutation hooks with rollback behavior.

## 4) Error and boundary model

- [ ] Add route-level error boundaries for loader/action/render failures.
- [ ] Add not-found handling at branch and root levels.
- [ ] Add typed error payloads for server/client protocol transport.
- [ ] Add fallback rendering for failed lazy routes and chunk fetch errors.

## 5) Rendering/runtime integration (Geometra-specific)

- [ ] Ensure route state is represented in the same declarative tree model used by all renderers.
- [ ] Define hit-test and keyboard semantics for link/navigation in non-DOM renderers.
- [ ] Ensure route transitions do not break focus, selection, IME composition, or text input history.
- [ ] Support navigation events over WebSocket protocol (`navigate`, `prefetch`, `back`, `forward`).
- [ ] Support server-side route matching + data load for initial frame (fast first paint).
- [ ] Ensure geometry diffing remains incremental across route transitions.

## 6) Code splitting and prefetching

- [ ] Add lazy route modules (`lazy: () => import(...)`) with loading fallback.
- [ ] Add prefetch policies (intent/hover/viewport/manual) that work without DOM assumptions.
- [ ] Add cache policy knobs for loader data and route modules.
- [ ] Add bundle split guidance/examples for Bun + Vite.

## 7) Developer experience

- [ ] Ship `@geometra/router` package with stable, documented APIs.
- [ ] Add route definition helpers with strong TypeScript inference for params/search/loader data.
- [ ] Add dev warnings for ambiguous paths, missing params, and invalid redirects.
- [ ] Add router dev overlay hooks (current route, match tree, pending loaders, timings).
- [ ] Add migration guide from basic signal-based view switching to router APIs.

## 8) Testing and reliability

- [ ] Add unit tests for matcher, ranking, params, query handling, and path generation.
- [ ] Add integration tests for nested routes, redirects, blockers, and revalidation.
- [ ] Add server/client protocol tests for navigation and loader/action error transport.
- [ ] Add regression tests for focus and text-input behavior across navigations.
- [ ] Add performance benchmarks for route transitions and loader cancellation churn.

## 9) Documentation and examples

- [ ] Add "Routing Quick Start" in root README with local and server/client examples.
- [ ] Add dedicated docs for:
  - [ ] Nested routes and outlets.
  - [ ] Loaders/actions and mutations.
  - [ ] Error boundaries and not-found routes.
  - [ ] Prefetch strategies and lazy route modules.
- [ ] Add demos:
  - [ ] CRUD dashboard with optimistic updates.
  - [ ] Auth-gated routes with redirects.
  - [ ] Large list + search params + pagination.
  - [ ] Terminal renderer navigation example.

## 10) Competitive bar (release gates)

- [ ] Apps can express route tree + nested layouts without custom glue code.
- [ ] Data loading/mutations are first-class and cancel-safe.
- [ ] Errors are isolated at route boundaries with predictable recovery UX.
- [ ] Navigation UX includes pending states, focus restoration, and back/forward correctness.
- [ ] Server/client protocol handles navigation and data errors explicitly and version-safely.
- [ ] Docs + demos make common app flows as straightforward as mainstream router ecosystems.

## Suggested delivery phases

- [ ] **Phase 1 (MVP):** sections 1, 2, and minimal 4 + tests.
- [ ] **Phase 2 (Data Router):** section 3 + full 4 + protocol integration from 5.
- [ ] **Phase 3 (Scale/DX):** sections 6, 7, 8 perf, and 9 docs/demos.
