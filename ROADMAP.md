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

## Post-1.0 execution plan (1.x)

This plan prioritizes adoption-critical capabilities while preserving the core invariant:
`Tree -> Yoga WASM -> Geometry -> Pixels`.

Tracking fields:

- Status: `todo` | `in_progress` | `blocked` | `done`
- Owner: `@unassigned` by default

### 1.1.0 — RTL and bidi baseline

Goal: make mixed-direction text and interaction credible for production apps.

Acceptance criteria:

- [x] Status: `done` | Owner: `@codex` | Direction model is explicit: root and per-node `dir` (`ltr`/`rtl`/`auto`) semantics are documented and enforced consistently.
- [x] Status: `done` | Owner: `@codex` | Caret movement semantics are correct for bidi text (left/right visual movement, home/end behavior, word jumps) with integration tests.
- [x] Status: `done` | Owner: `@codex` | Selection range mapping and paint are stable for mixed LTR/RTL runs in canvas and terminal renderers. (terminal selection UI is intentionally out of scope for baseline; documented limits apply)
- [x] Status: `done` | Owner: `@codex` | Text measurement and geometry mapping stay parity-safe across local canvas and server/client paths. (covered and tracked in `RTL_PARITY_MATRIX.md`)
- [x] Status: `done` | Owner: `@codex` | Known limitations (complex scripts edge cases, terminal constraints) are explicitly documented.

Definition of done:

- [x] Core/canvas/terminal test suites pass with new bidi/RTL coverage.
- [x] Release notes include interaction semantics changes and migration notes.
- [x] No measurable regressions in existing text input and hit-test perf baselines.

### 1.2.0 — Animation model v2 (geometry-native)

Goal: ship deterministic, declarative animations that stay renderer-agnostic.

Acceptance criteria:

- [x] Status: `done` | Owner: `@codex` | Add a declarative animation API for geometry-driven transitions (position/size) and paint properties (opacity/color).
- [x] Status: `done` | Owner: `@codex` | Add interrupt/cancel/resume semantics that are deterministic across rapid state updates.
- [x] Status: `done` | Owner: `@codex` | Add reduced-motion policy and explicit defaults for accessibility-sensitive behavior.
- [x] Status: `done` | Owner: `@codex` | Add deterministic frame-step test harness for unit/integration assertions (no timing flake).
- [x] Status: `done` | Owner: `@codex` | Provide representative demo scenarios (list reorder, dialog enter/exit, focus transition polish).

Definition of done:

- [x] Animation behavior is consistent across canvas and terminal where applicable.
- [x] New tests are stable in CI and validated under bursty update conditions.
- [x] Docs define supported properties, timing functions, and interruption rules.

### 1.3.0 — Additional render target proof

Goal: prove one extra backend can consume shared geometry without divergence.

Acceptance criteria:

- [x] Status: `done` | Owner: `@codex` | Select and document target (`WebGPU` or `PDF`) with rationale and non-goals.
- [x] Status: `done` | Owner: `@codex` | Implement MVP renderer path that consumes existing geometry output (no protocol fork).
- [x] Status: `done` | Owner: `@codex` | Add renderer-agnostic fixture reuse to assert semantic/layout parity with existing backends.
- [x] Status: `done` | Owner: `@codex` | Document feature support matrix and fallback behavior.

Definition of done:

- [x] New backend passes fixture suite for agreed MVP surface.
- [x] CI includes backend smoke check.
- [x] API/export docs reflect support status and constraints.

### 1.4.0 — Transport efficiency and scale hardening

Goal: improve high-frequency server/client behavior under realistic load.

Acceptance criteria:

- [x] Status: `done` | Owner: `@codex` | Add optional binary frame encoding path behind explicit protocol version/capability negotiation. (GEOM v1 JSON envelope; `resize.capabilities.binaryFraming`)
- [x] Status: `done` | Owner: `@codex` | Add backpressure-aware batching/coalescing policy with bounded memory behavior. (`bufferedAmount` deferral, full-frame resync, `coalescePatches` for duplicate paths)
- [x] Status: `done` | Owner: `@codex` | Expose frame budget instrumentation (encode/decode/apply timings, coalesced patch delta, binary/deferred counts). (`onFrameMetrics` client; `onTransportMetrics` server; optional dropped counters deferred)
- [ ] Status: `todo` | Owner: `@unassigned` | Add large-app stress scenarios (rapid input + layout churn + reconnect) with deterministic pass criteria.

Definition of done:

- [x] Conformance fixtures cover text and binary paths. (`protocol-binary-conformance`, `binary-frame` tests)
- [ ] Latency/throughput results are documented against baseline scenarios. (`TRANSPORT_1_4.md` describes behavior; numeric baselines TBD)
- [ ] Reconnect/resync correctness remains stable under chaos tests.

### 1.5.0 — UI primitives and developer tooling

Goal: reduce adoption friction with high-quality primitives and better introspection.

Acceptance criteria:

- [ ] Status: `todo` | Owner: `@unassigned` | Expand `@geometra/ui` with advanced primitives (combobox/menu/tree/data-table/command-palette/toast).
- [ ] Status: `todo` | Owner: `@unassigned` | Add behavior contracts + interaction/a11y fixtures for each new primitive.
- [ ] Status: `todo` | Owner: `@unassigned` | Extend dev overlay into inspector view (node tree, computed layout, hit-test path, focus chain, repaint reasons).
- [ ] Status: `todo` | Owner: `@unassigned` | Publish integration cookbooks for common app stacks and DOM-assumption migration patterns.

Definition of done:

- [ ] `@geometra/ui` primitives are tested, documented, and versioned with clear stability labels.
- [ ] Inspector tooling is usable in demos with negligible hot-path overhead when disabled.
- [ ] Starter templates demonstrate at least two advanced primitives and inspector workflow.

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
- [x] Status: `done` | Owner: `@codex` | Add protocol conformance fixtures runnable by both client and server packages.

### 0.4.4 — Visual quality and renderer confidence

- [x] Status: `done` | Owner: `@codex` | Add canvas visual regression snapshots for text selection, focus ring, gradients, and clipping.
- [x] Status: `done` | Owner: `@codex` | Add terminal renderer golden-output fixtures for z-index, clipping, and overflow behavior.
- [x] Status: `done` | Owner: `@codex` | Add renderer-agnostic fixture suite to assert geometry-in -> expected semantic/layout-out.

### 0.4.5 — Ecosystem readiness and adoption

- [x] Status: `done` | Owner: `@codex` | Publish `@geometra/ui` starter primitives (button/input/list/dialog) built only on core exports.
- [x] Status: `done` | Owner: `@codex` | Add end-to-end starter templates (canvas local app, terminal app, server/client app).
- [x] Status: `done` | Owner: `@codex` | Produce migration guide for teams moving from DOM-centric event/layout assumptions.
- [x] Status: `done` | Owner: `@codex` | Define 1.0 release criteria and freeze policy for protocol + interaction contract.
