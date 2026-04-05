/**
 * @packageDocumentation
 *
 * **Textura** is Geometra’s layout engine: Yoga WASM flexbox plus Pretext text measurement.
 *
 * - Call {@link init} once before layout; use {@link destroy} in tests or teardown.
 * - {@link computeLayout} walks a declarative {@link LayoutNode} and returns {@link ComputedLayout} geometry.
 * - Root constraints and document direction: {@link ComputeOptions} (`width`, `height`, `direction`).
 * - Per-node writing mode: optional {@link FlexProps.dir} on {@link BoxNode} and leaf {@link TextNode} snapshots
 *   (`ltr` / `rtl` / `auto`, or JSON `null` / other strings mapped to Yoga Inherit); hosts often omit `dir` on the
 *   **layout root** and rely on `ComputeOptions.direction` alone.
 * - {@link clearCache} clears Pretext measurement caches when fonts or measurement inputs change.
 *
 * Host frameworks (including Geometra’s `@geometra/core`) convert UI props into {@link LayoutNode} trees before
 * calling {@link computeLayout}; standalone use is the same contract.
 */
export { init, destroy, clearCache, computeLayout } from './engine.js'
export type { ComputeOptions } from './engine.js'
export type {
  LayoutNode,
  TextNode,
  BoxNode,
  FlexProps,
  ComputedLayout,
} from './types.js'
export { isTextNode } from './types.js'
