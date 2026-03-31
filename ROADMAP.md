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
- [x] Status: `done` | Owner: `@codex` | Add release playbook checklist (version bump, tests, notes, verification).
- [x] Status: `done` | Owner: `@codex` | Add known caveats section for environment-specific behavior.

### Release readiness gate (every release)

- [x] Status: `done` | Owner: `@codex` | Core unit tests pass.
- [x] Status: `done` | Owner: `@codex` | Terminal integration suite passes.
- [x] Status: `done` | Owner: `@codex` | Renderer-specific smoke checks pass.
- [x] Status: `done` | Owner: `@codex` | Lint/build pass in CI.
- [x] Status: `done` | Owner: `@codex` | Changelog/release notes include behavior changes plus migration notes.
- [x] Status: `done` | Owner: `@codex` | npm published versions verified after release workflow completes.

## Next frontier checklist (toward 1.0 quality)

Tracking fields:

- Status: `todo` | `in_progress` | `blocked` | `done`
- Owner: `@unassigned` by default

### 0.4.0 — Input parity and editing completeness

- [x] Status: `done` | Owner: `@codex` | Add vertical caret movement (`ArrowUp`/`ArrowDown`) for multi-line text input with stable column intent.
- [x] Status: `done` | Owner: `@codex` | Add word-jump and line-boundary movement semantics (`Alt+Arrow`, `Home`, `End`) with tests.
- [x] Status: `done` | Owner: `@codex` | Implement pointer-driven text selection drag in canvas and align with text-input helpers.
- [x] Status: `done` | Owner: `@codex` | Add copy/cut/paste integration tests for selection + edit history behavior.
- [x] Status: `done` | Owner: `@codex` | Add IME stress scenarios (focus changes, rapid composition updates, cancellation) across canvas + terminal where applicable.

### 0.4.1 — Scrolling, virtualization, and large-app ergonomics

- [x] Status: `done` | Owner: `@codex` | Add scroll-container keyboard behavior contract (focus retention, key routing, wheel/scroll sync).
- [x] Status: `done` | Owner: `@codex` | Implement virtualized list primitive example with stable focus and selection behavior.
- [x] Status: `done` | Owner: `@codex` | Add integration tests for large scroll regions with rapid update bursts.
- [x] Status: `done` | Owner: `@codex` | Add dev overlay panel with node count, layout time, and repaint hot spots.

### 0.4.2 — Accessibility and semantics depth

- [x] Status: `done` | Owner: `@codex` | Expand a11y tree attributes (state/disabled/expanded/selected) and test mappings.
- [x] Status: `done` | Owner: `@codex` | Add focus trap primitives and tests for modal/overlay flows.
- [x] Status: `done` | Owner: `@codex` | Add form-like semantics examples (labels, input groups, error text relationships).
- [x] Status: `done` | Owner: `@codex` | Add regression snapshots for accessibility tree shape across representative app templates.

### 0.4.3 — Protocol v2 planning and transport resilience

- [x] Status: `done` | Owner: `@codex` | Draft protocol-v2 RFC with backward-compat strategy and migration policy.
- [x] Status: `done` | Owner: `@codex` | Add message batching/coalescing tests for high-frequency input and layout churn.
- [x] Status: `done` | Owner: `@codex` | Add chaos-style reconnect tests (out-of-order frames, delayed patches, duplicate messages).
- [ ] Status: `todo` | Owner: `@unassigned` | Add protocol conformance fixtures runnable by both client and server packages.

### 0.4.4 — Visual quality and renderer confidence

- [ ] Status: `todo` | Owner: `@unassigned` | Add canvas visual regression snapshots for text selection, focus ring, gradients, and clipping.
- [ ] Status: `todo` | Owner: `@unassigned` | Add terminal renderer golden-output fixtures for z-index, clipping, and overflow behavior.
- [ ] Status: `todo` | Owner: `@unassigned` | Add renderer-agnostic fixture suite to assert geometry-in -> expected semantic/layout-out.

### 0.4.5 — Ecosystem readiness and adoption

- [ ] Status: `todo` | Owner: `@unassigned` | Publish `@geometra/ui` starter primitives (button/input/list/dialog) built only on core exports.
- [ ] Status: `todo` | Owner: `@unassigned` | Add end-to-end starter templates (canvas local app, terminal app, server/client app).
- [ ] Status: `todo` | Owner: `@unassigned` | Produce migration guide for teams moving from DOM-centric event/layout assumptions.
- [ ] Status: `todo` | Owner: `@unassigned` | Define 1.0 release criteria and freeze policy for protocol + interaction contract.
