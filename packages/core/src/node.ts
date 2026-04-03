/**
 * Node.js and Bun entry for the `@geometra/core/node` package subpath.
 *
 * Loads {@link ./canvas-polyfill.js} first so `globalThis.OffscreenCanvas` exists before any Textura /
 * Pretext text measurement runs, then re-exports the same public API as `@geometra/core`.
 *
 * Prefer this entry for layout, SSR, or Node-based tests; use the root `@geometra/core` import when
 * the host already provides canvas APIs (browser bundles).
 */
import './canvas-polyfill.js'
export * from './index.js'
