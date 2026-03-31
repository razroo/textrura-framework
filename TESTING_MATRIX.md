# Testing matrix

This matrix clarifies what each test layer validates and where to add new coverage.

## Unit tests (fast, deterministic)

- Scope: pure logic in `packages/*/src`.
- Examples:
  - keyboard/focus dispatch (`packages/core/src/__tests__/keyboard.test.ts`)
  - text-input editing (`packages/core/src/__tests__/text-input.test.ts`)
  - semantic/a11y projection (`packages/core/src/__tests__/seo.test.ts`, `a11y.test.ts`)
  - protocol diff/compat helpers (`packages/server/src/__tests__/protocol-*.test.ts`)

## Integration tests (I/O, lifecycle, event routing)

- Scope: multi-module workflows and event pipelines.
- Examples:
  - terminal input lifecycle (`demos/terminal/input.integration.ts`)
  - client reconnect/resync (`packages/client/src/__tests__/client-reconnect.test.ts`)

## Renderer-specific checks

- Canvas:
  - keyboard/composition forwarding in demo wiring (`demos/text-input-canvas/app.ts`)
  - optional accessibility mirror behavior (`packages/renderer-canvas`)
- Terminal:
  - stdin parsing and dispatchKey routing (`demos/terminal/app.ts`)
  - focus traversal and ctrl-exit integration assertions (`input.integration.ts`)

## Performance smoke checks

- `npm run test:perf`
  - core hit-test and caret-geometry timing smoke
  - server geometry diff burst and worst-case churn smoke

## Recommended test placement

- New pure state/algorithm logic -> unit tests in owning package.
- New cross-package event flow -> integration tests near entrypoint demo/client/server.
- Protocol shape or compatibility changes -> protocol tests + compatibility docs update.
- Hot-path changes -> perf smoke test updates and baseline review.
