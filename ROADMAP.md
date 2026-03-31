# Geometra roadmap

Phased plan to grow Geometra from a capable layout-on-geometry stack into a broadly credible UI framework (Yoga + Pretext via Textura).

Routing competitiveness work is tracked in `ROUTING_COMPETITIVENESS_CHECKLIST.md`.

## Phase A — Foundation (shipping now)

- Web font readiness before first paint (`waitForFonts` + tree collection).
- Keyboard focus that repaints when focus changes; click-to-focus for focusable boxes.
- Canvas debug overlay for layout bounds; optional focus ring styling.
- Harden tests around hit dispatch and font family parsing.

## Phase B — Apps that feel “real”

- **Text input**: caret, IME/composition, selection, undo baseline; align Pretext metrics with canvas paint.
- **Font policy**: document generic families, variable fonts, and server/client metric parity.
- **Runtime accessibility**: hidden DOM mirror or accessibility tree API + docs for canvas mode.
- **Protocol**: versioned WS frames; compatibility notes.

## Phase C — Platform & ecosystem

- Virtualized lists / large scroll regions; focus trap for overlays.
- Dev overlay (layout time, node count, hit targets).
- Visual/regression and geometry snapshot testing in CI.
- Optional component layer (`@geometra/ui`) built only on core primitives.

## Deferred / research

- Full RTL/document direction pass through Textura props.
- Animation primitives beyond current `animation.ts` helpers.
- Non-canvas render targets (WebGPU, PDF) consuming the same geometry.

## Release polish checklist

Tracking fields:

- Status: `todo` | `in_progress` | `blocked` | `done`
- Owner: `@unassigned` by default

### 0.3.2 — Text input and IME quality

- [x] Status: `done` | Owner: `@codex` | Add a dedicated text-input demo covering caret, selection, insert/delete, and undo/redo.
- [x] Status: `done` | Owner: `@codex` | Add integration tests for composition lifecycle (`start/update/end`) and mixed key/composition flows.
- [x] Status: `done` | Owner: `@codex` | Validate caret geometry across multiline and edge positions.
- [x] Status: `done` | Owner: `@codex` | Verify selection replacement plus backspace/delete boundary behavior.
- [x] Status: `done` | Owner: `@codex` | Add regression tests for focus switching during active composition.
- [x] Status: `done` | Owner: `@codex` | Document text-input semantics in README/API docs.

### 0.3.3 — Keyboard/focus contract and a11y

- [x] Status: `done` | Owner: `@codex` | Write a concise interaction spec (Tab/Shift+Tab, Enter/Escape, arrow behavior, focus order rules).
- [x] Status: `done` | Owner: `@codex` | Align core + terminal/canvas behavior with the interaction spec.
- [x] Status: `done` | Owner: `@codex` | Add end-to-end focus traversal tests for multiple focusable regions.
- [x] Status: `done` | Owner: `@codex` | Expand accessibility tree coverage for common patterns (headings, nav, lists, buttons, forms).
- [x] Status: `done` | Owner: `@codex` | Add semantic output snapshots for representative UI trees.
- [x] Status: `done` | Owner: `@codex` | Document accessibility guarantees and known limitations.

### 0.3.4 — Protocol and reliability hardening

- [x] Status: `done` | Owner: `@codex` | Add protocol version fixtures and compatibility tests (including mismatch handling).
- [x] Status: `done` | Owner: `@codex` | Add tests for geometry diff correctness under rapid update bursts.
- [x] Status: `done` | Owner: `@codex` | Validate error surfacing and recovery behavior in server/client flows.
- [x] Status: `done` | Owner: `@codex` | Add reconnect/retry integration scenario with state resync.
- [x] Status: `done` | Owner: `@codex` | Ensure protocol changes are explicit and backward-safe.

### 0.3.5 — Performance guardrails

- [x] Status: `done` | Owner: `@codex` | Add microbenchmarks for hit-testing, text measurement, and geometry diffing.
- [x] Status: `done` | Owner: `@codex` | Establish baseline metrics and acceptable regression thresholds.
- [x] Status: `done` | Owner: `@codex` | Wire benchmark/performance checks into CI reporting.
- [x] Status: `done` | Owner: `@codex` | Add smoke perf test for large tree updates (worst-case UI churn).
- [x] Status: `done` | Owner: `@codex` | Track perf notes in release checklist before each tag.

### Docs and developer experience (parallel track)

- [x] Status: `done` | Owner: `@codex` | Keep README/API exports aligned with shipped behavior every release.
- [x] Status: `done` | Owner: `@codex` | Add a testing matrix doc (unit vs integration vs renderer-specific).
- [x] Status: `done` | Owner: `@codex` | Provide copy-paste examples for terminal input/focus wiring.
- [ ] Status: `todo` | Owner: `@unassigned` | Add release playbook checklist (version bump, tests, notes, verification).
- [ ] Status: `todo` | Owner: `@unassigned` | Add known caveats section for environment-specific behavior.

### Release readiness gate (every release)

- [ ] Status: `todo` | Owner: `@unassigned` | Core unit tests pass.
- [ ] Status: `todo` | Owner: `@unassigned` | Terminal integration suite passes.
- [ ] Status: `todo` | Owner: `@unassigned` | Renderer-specific smoke checks pass.
- [ ] Status: `todo` | Owner: `@unassigned` | Lint/build pass in CI.
- [ ] Status: `todo` | Owner: `@unassigned` | Changelog/release notes include behavior changes plus migration notes.
- [ ] Status: `todo` | Owner: `@unassigned` | npm published versions verified after release workflow completes.
