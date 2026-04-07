# Geometra Framework North Star

Geometra is the geometry protocol for UI. The server computes pixel-exact `{ x, y, w, h }` layout and streams it to thin clients — human renderers and AI agents alike — over the same JSON protocol. No DOM. No component descriptions. Just coordinates.

## Mission

- Compute layout once on the server, stream geometry everywhere: `Tree → Yoga WASM → { x, y, w, h } → Render Target`.
- Give AI agents first-class access to UI state — same socket, same data, no scraping.
- Keep clients minimal: a paint loop, not a framework runtime.

## Non-Negotiables

- DOM-free runtime model: no dependence on browser layout engine semantics.
- Bun-first development and CI for install/build/test workflows.
- Deterministic protocol behavior with explicit version checks.
- Real framework ergonomics: reactivity, hit-testing, focus/keyboard, selection, text input, IME support.
- Accessibility and SEO foundations must advance with core rendering features.

## Engineering Bar (Before Merge)

- Correctness: no regressions in core event, selection, text input, or protocol behavior.
- Cross-target consistency: behavior aligns across Canvas, Terminal, and server/client pathways when applicable.
- Performance: avoid O(n) hot-path regressions; cache or short-circuit where practical.
- Reliability: CI remains green on Bun-only paths.
- Clarity: exported APIs and README/docs stay aligned with shipped behavior.

## Coding Priority Order

1. Preserve framework invariants (pipeline, protocol, cross-target model).
2. Fix correctness issues in interaction and input before adding new surface area.
3. Improve performance in measured hot paths (hit-test, text metrics, paint/selection churn).
4. Expand platform guarantees (a11y, text input, protocol robustness, dev UX).
5. Add demos/docs that prove capabilities rather than only describing them.

## Definition of "Pristine"

- A developer can build an interactive app in Geometra without relying on DOM layout/input primitives.
- Core interaction loops (pointer, keyboard, selection, IME) are stable and test-covered.
- Accessibility mirror/tree and semantic output are practical, not placeholder.
- CI is fast, Bun-native, and dependable.
- README promise matches observed behavior in demo and package APIs.
