import { GEOMETRA_SPLIT_HOST_LAYOUT_DEFAULTS } from './split-host.js'
import { GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS } from './stacked-host.js'
import {
  coerceGeometraHudPlacement,
  coerceGeometraHudPointerEvents,
  coerceHostNonNegativeCssPx,
  coerceHostStackingZIndexCss,
  type GeometraHudPlacement,
} from './host-css-coerce.js'
import {
  isPlainGeometraThreeHostSnapshot,
  toPlainGeometraThreeHostSnapshot,
  toPlainGeometraThreeHostSnapshotHeadless,
  type GeometraThreeSceneBasicsOptions,
  type PlainGeometraThreeHostSnapshot,
} from './three-scene-basics.js'
import { normalizeGeometraLayoutPixels } from './utils.js'

/** Resolved Geometra column layout for {@link createThreeGeometraSplitHost} after coercion (JSON-friendly). */
export interface PlainGeometraSplitHostLayoutOptions {
  geometraWidth: number
  geometraOnLeft: boolean
}

export interface ToPlainGeometraSplitHostLayoutOptionsInput {
  geometraWidth?: number
  geometraOnLeft?: boolean
}

/**
 * Resolved split-host layout fields for logs, tests, or agent-side JSON without constructing the DOM host.
 * Uses the same coercion as {@link createThreeGeometraSplitHost}.
 */
export function toPlainGeometraSplitHostLayoutOptions(
  options: ToPlainGeometraSplitHostLayoutOptionsInput = {},
): PlainGeometraSplitHostLayoutOptions {
  const d = GEOMETRA_SPLIT_HOST_LAYOUT_DEFAULTS
  const geometraWidth = coerceHostNonNegativeCssPx(
    options.geometraWidth ?? d.geometraWidth,
    d.geometraWidth,
  )
  return {
    geometraWidth,
    geometraOnLeft: options.geometraOnLeft ?? false,
  }
}

/** Resolved stacked HUD layout for {@link createThreeGeometraStackedHost} after coercion (JSON-friendly). */
export interface PlainGeometraStackedHostLayoutOptions {
  geometraHudWidth: number
  geometraHudHeight: number
  geometraHudPlacement: GeometraHudPlacement
  geometraHudMargin: number
  geometraHudPointerEvents: string
  /** Coerced CSS `z-index` string (same value applied to the HUD wrapper in the stacked host). */
  geometraHudZIndex: string
}

export interface ToPlainGeometraStackedHostLayoutOptionsInput {
  geometraHudWidth?: number
  geometraHudHeight?: number
  /** Runtime strings (e.g. from JSON) are normalized like {@link createThreeGeometraStackedHost}. */
  geometraHudPlacement?: GeometraHudPlacement | string
  geometraHudMargin?: number
  geometraHudPointerEvents?: string
  geometraHudZIndex?: string | number
}

/**
 * Resolved stacked HUD layout fields for logs, tests, or agent-side JSON without constructing the DOM host.
 * Uses the same coercion as {@link createThreeGeometraStackedHost}.
 */
export function toPlainGeometraStackedHostLayoutOptions(
  options: ToPlainGeometraStackedHostLayoutOptionsInput = {},
): PlainGeometraStackedHostLayoutOptions {
  const d = GEOMETRA_STACKED_HOST_LAYOUT_DEFAULTS
  const geometraHudWidth = coerceHostNonNegativeCssPx(
    options.geometraHudWidth ?? d.geometraHudWidth,
    d.geometraHudWidth,
  )
  const geometraHudHeight = coerceHostNonNegativeCssPx(
    options.geometraHudHeight ?? d.geometraHudHeight,
    d.geometraHudHeight,
  )
  const geometraHudMargin = coerceHostNonNegativeCssPx(
    options.geometraHudMargin ?? d.geometraHudMargin,
    d.geometraHudMargin,
  )
  const geometraHudPlacementOpt = options.geometraHudPlacement ?? d.geometraHudPlacement
  const geometraHudPlacement = coerceGeometraHudPlacement(
    geometraHudPlacementOpt as string | undefined,
    d.geometraHudPlacement,
  )
  const geometraHudPointerEvents = coerceGeometraHudPointerEvents(options.geometraHudPointerEvents, 'auto')
  const geometraHudZIndex = coerceHostStackingZIndexCss(options.geometraHudZIndex ?? 1, 1)
  return {
    geometraHudWidth,
    geometraHudHeight,
    geometraHudPlacement,
    geometraHudMargin,
    geometraHudPointerEvents,
    geometraHudZIndex,
  }
}

/**
 * Axis-aligned HUD rectangle in the stacked host root’s coordinate system (origin top-left), matching
 * the inset rules used by {@link createThreeGeometraStackedHost} (`right`/`bottom`/`left`/`top` on the
 * absolutely positioned HUD wrapper).
 *
 * Root width and height are normalized with {@link normalizeGeometraLayoutPixels} per axis so they stay
 * aligned with {@link PlainGeometraThreeViewSizingState.layoutWidth} / `layoutHeight` for the same CSS
 * inputs. `width` and `height` are taken from {@link PlainGeometraStackedHostLayoutOptions} as-is.
 *
 * Use for custom overlay geometry, agent hit targets, or stacked layouts built outside this package
 * without calling `getBoundingClientRect`.
 */
export interface PlainGeometraStackedHudRect {
  left: number
  top: number
  width: number
  height: number
}

/** Fields read by {@link toPlainGeometraStackedHudRect} (satisfied by {@link PlainGeometraStackedHostLayoutOptions} and stacked composite snapshots). */
export type GeometraStackedHudRectLayoutInput = Pick<
  PlainGeometraStackedHostLayoutOptions,
  'geometraHudWidth' | 'geometraHudHeight' | 'geometraHudPlacement' | 'geometraHudMargin'
>

/**
 * Compute {@link PlainGeometraStackedHudRect} from resolved stacked layout and root CSS size.
 *
 * @param layout - From {@link toPlainGeometraStackedHostLayoutOptions}, or any object that includes the
 *   HUD width/height/placement/margin fields (for example {@link toPlainGeometraThreeStackedHostSnapshot}).
 */
export function toPlainGeometraStackedHudRect(
  layout: GeometraStackedHudRectLayoutInput,
  rootCssWidth: number,
  rootCssHeight: number,
): PlainGeometraStackedHudRect {
  const rw = normalizeGeometraLayoutPixels(rootCssWidth)
  const rh = normalizeGeometraLayoutPixels(rootCssHeight)
  const { geometraHudWidth: w, geometraHudHeight: h, geometraHudPlacement: p, geometraHudMargin: m } =
    layout
  switch (p) {
    case 'bottom-right':
      return { left: rw - w - m, top: rh - h - m, width: w, height: h }
    case 'bottom-left':
      return { left: m, top: rh - h - m, width: w, height: h }
    case 'top-right':
      return { left: rw - w - m, top: m, width: w, height: h }
    case 'top-left':
      return { left: m, top: m, width: w, height: h }
  }
}

/** Literal tag on composite plain snapshots so JSON consumers can tell hybrid layout without inferring fields. */
export type GeometraHybridHostKind = 'split' | 'stacked'

/** Every {@link GeometraHybridHostKind} value (stable iteration, prompts, or defensive checks). */
export const GEOMETRA_HYBRID_HOST_KINDS: readonly GeometraHybridHostKind[] = ['split', 'stacked']

/**
 * Parse a {@link GeometraHybridHostKind} from loose input (trim + case-insensitive literals) without a fallback.
 * Used by {@link coerceGeometraHybridHostKind} and composite {@link isPlainGeometraThreeSplitHostSnapshot} /
 * {@link isPlainGeometraThreeStackedHostSnapshot} guards so agent JSON matches coercion rules.
 */
function parseGeometraHybridHostKindLiteral(value: unknown): GeometraHybridHostKind | undefined {
  if (value === 'split' || value === 'stacked') return value
  if (typeof value !== 'string') return undefined
  const key = value.trim().toLowerCase()
  if (key === 'split' || key === 'stacked') return key
  return undefined
}

/**
 * Narrow `unknown` to {@link GeometraHybridHostKind} when parsing composite snapshot JSON from logs or agents.
 */
export function isGeometraHybridHostKind(value: unknown): value is GeometraHybridHostKind {
  return value === 'split' || value === 'stacked'
}

/**
 * Narrow `unknown` to {@link GeometraHybridHostKind} using the same trim + case-insensitive literals as
 * {@link coerceGeometraHybridHostKind} and {@link isPlainGeometraThreeSplitHostSnapshot} /
 * {@link isPlainGeometraThreeStackedHostSnapshot}. Use when agent or log JSON may carry whitespace or mixed case;
 * prefer {@link isGeometraHybridHostKind} when the value is already normalized.
 */
export function isPlainGeometraHybridHostKind(value: unknown): value is GeometraHybridHostKind {
  return parseGeometraHybridHostKindLiteral(value) !== undefined
}

/**
 * Normalize {@link GeometraHybridHostKind} from runtime values (e.g. agent JSON or untyped config).
 * Literal `'split'` and `'stacked'` pass through. Strings are trimmed and matched **case-insensitively**;
 * unknown or empty strings use `fallback` (same normalization idea as {@link coerceGeometraHudPlacement}).
 *
 * For narrowing without coercion, use {@link isGeometraHybridHostKind} for exact literals or
 * {@link isPlainGeometraHybridHostKind} when payloads may use whitespace or mixed case.
 */
export function coerceGeometraHybridHostKind(
  value: unknown,
  fallback: GeometraHybridHostKind,
): GeometraHybridHostKind {
  return parseGeometraHybridHostKindLiteral(value) ?? fallback
}

const GEOMETRA_HUD_PLACEMENT_LITERALS = new Set<GeometraHudPlacement>([
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
])

/**
 * Narrow `unknown` (e.g. `JSON.parse`) to {@link PlainGeometraSplitHostLayoutOptions} — the layout-only
 * fields from {@link toPlainGeometraSplitHostLayoutOptions} without viewport or scene sizing. Extra keys
 * are allowed. Composite {@link PlainGeometraThreeSplitHostSnapshot} values satisfy this guard as well.
 */
export function isPlainGeometraSplitHostLayoutOptions(
  value: unknown,
): value is PlainGeometraSplitHostLayoutOptions {
  if (value === null || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  if (typeof o.geometraOnLeft !== 'boolean') return false
  if (typeof o.geometraWidth !== 'number' || !Number.isFinite(o.geometraWidth) || o.geometraWidth < 0) {
    return false
  }
  return true
}

/**
 * Narrow `unknown` (e.g. `JSON.parse`) to {@link PlainGeometraStackedHostLayoutOptions} — the HUD layout
 * fields from {@link toPlainGeometraStackedHostLayoutOptions} without viewport or scene. Extra keys are
 * allowed. `geometraHudPlacement` must be exactly one of the four corner literals (same rule as
 * {@link isPlainGeometraThreeStackedHostSnapshot}; normalize loose strings with {@link coerceGeometraHudPlacement}
 * before asserting). Composite {@link PlainGeometraThreeStackedHostSnapshot} values satisfy this guard too.
 */
export function isPlainGeometraStackedHostLayoutOptions(
  value: unknown,
): value is PlainGeometraStackedHostLayoutOptions {
  if (value === null || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  if (
    typeof o.geometraHudWidth !== 'number' ||
    !Number.isFinite(o.geometraHudWidth) ||
    o.geometraHudWidth < 0 ||
    typeof o.geometraHudHeight !== 'number' ||
    !Number.isFinite(o.geometraHudHeight) ||
    o.geometraHudHeight < 0 ||
    typeof o.geometraHudMargin !== 'number' ||
    !Number.isFinite(o.geometraHudMargin) ||
    o.geometraHudMargin < 0
  ) {
    return false
  }
  if (typeof o.geometraHudPlacement !== 'string' || !GEOMETRA_HUD_PLACEMENT_LITERALS.has(o.geometraHudPlacement as GeometraHudPlacement)) {
    return false
  }
  if (typeof o.geometraHudPointerEvents !== 'string') return false
  if (typeof o.geometraHudZIndex !== 'string') return false
  return true
}

/**
 * Narrow `unknown` (e.g. `JSON.parse`) to {@link PlainGeometraThreeSplitHostSnapshot} when the object
 * matches the shape produced by {@link toPlainGeometraThreeSplitHostSnapshot} /
 * {@link toPlainGeometraThreeSplitHostSnapshotHeadless}. `geometraHybridHostKind` accepts the same trim +
 * case-insensitive literals as {@link coerceGeometraHybridHostKind} (not only exact `'split'`).
 * `geometraWidth` is finite and **≥ 0**, same as
 * {@link coerceHostNonNegativeCssPx}. Complements {@link isGeometraHybridHostKind} for composite agent or log payloads.
 */
export function isPlainGeometraThreeSplitHostSnapshot(
  value: unknown,
): value is PlainGeometraThreeSplitHostSnapshot {
  if (value === null || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  if (parseGeometraHybridHostKindLiteral(o.geometraHybridHostKind) !== 'split') return false
  if (typeof o.geometraOnLeft !== 'boolean') return false
  if (typeof o.geometraWidth !== 'number' || !Number.isFinite(o.geometraWidth) || o.geometraWidth < 0) {
    return false
  }
  return isPlainGeometraThreeHostSnapshot(value)
}

/**
 * Same idea as {@link isPlainGeometraThreeSplitHostSnapshot} for {@link PlainGeometraThreeStackedHostSnapshot}
 * / {@link toPlainGeometraThreeStackedHostSnapshot} / {@link toPlainGeometraThreeStackedHostSnapshotHeadless}.
 * `geometraHybridHostKind` accepts the same trim + case-insensitive literals as {@link coerceGeometraHybridHostKind}.
 * HUD width, height, and margin are finite and **≥ 0**, same as {@link coerceHostNonNegativeCssPx}.
 */
export function isPlainGeometraThreeStackedHostSnapshot(
  value: unknown,
): value is PlainGeometraThreeStackedHostSnapshot {
  if (value === null || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  if (parseGeometraHybridHostKindLiteral(o.geometraHybridHostKind) !== 'stacked') return false
  if (
    typeof o.geometraHudWidth !== 'number' ||
    !Number.isFinite(o.geometraHudWidth) ||
    o.geometraHudWidth < 0 ||
    typeof o.geometraHudHeight !== 'number' ||
    !Number.isFinite(o.geometraHudHeight) ||
    o.geometraHudHeight < 0 ||
    typeof o.geometraHudMargin !== 'number' ||
    !Number.isFinite(o.geometraHudMargin) ||
    o.geometraHudMargin < 0
  ) {
    return false
  }
  if (typeof o.geometraHudPlacement !== 'string' || !GEOMETRA_HUD_PLACEMENT_LITERALS.has(o.geometraHudPlacement as GeometraHudPlacement)) {
    return false
  }
  if (typeof o.geometraHudPointerEvents !== 'string') return false
  if (typeof o.geometraHudZIndex !== 'string') return false
  return isPlainGeometraThreeHostSnapshot(value)
}

/**
 * Split-host layout fields plus {@link PlainGeometraThreeHostSnapshot} in one JSON-friendly object —
 * same coercion as {@link toPlainGeometraSplitHostLayoutOptions} and {@link toPlainGeometraThreeHostSnapshot}.
 *
 * Use for logs, tests, or agent payloads that describe column chrome and Three viewport/scene together.
 * The `geometraHybridHostKind` field is always `'split'` on values from {@link toPlainGeometraThreeSplitHostSnapshot} /
 * {@link toPlainGeometraThreeSplitHostSnapshotHeadless}.
 */
export type PlainGeometraThreeSplitHostSnapshot = PlainGeometraSplitHostLayoutOptions &
  PlainGeometraThreeHostSnapshot & {
    geometraHybridHostKind: 'split'
  }

/**
 * Stacked-host HUD layout plus {@link PlainGeometraThreeHostSnapshot} (full-viewport Three sizing, not HUD box size).
 *
 * Same coercion as {@link toPlainGeometraStackedHostLayoutOptions} and {@link toPlainGeometraThreeHostSnapshot}.
 * The `geometraHybridHostKind` field is always `'stacked'` on values from {@link toPlainGeometraThreeStackedHostSnapshot} /
 * {@link toPlainGeometraThreeStackedHostSnapshotHeadless}.
 */
export type PlainGeometraThreeStackedHostSnapshot = PlainGeometraStackedHostLayoutOptions &
  PlainGeometraThreeHostSnapshot & {
    geometraHybridHostKind: 'stacked'
  }

/**
 * Merge split layout and host viewport/scene plain fields for stable JSON.
 *
 * @see PlainGeometraThreeSplitHostSnapshot
 */
export function toPlainGeometraThreeSplitHostSnapshot(
  layoutOptions: ToPlainGeometraSplitHostLayoutOptionsInput = {},
  cssWidth: number,
  cssHeight: number,
  rawDevicePixelRatio: number,
  maxDevicePixelRatio?: number,
  sceneBasicsOptions: GeometraThreeSceneBasicsOptions = {},
): PlainGeometraThreeSplitHostSnapshot {
  return {
    geometraHybridHostKind: 'split',
    ...toPlainGeometraSplitHostLayoutOptions(layoutOptions),
    ...toPlainGeometraThreeHostSnapshot(
      cssWidth,
      cssHeight,
      rawDevicePixelRatio,
      maxDevicePixelRatio,
      sceneBasicsOptions,
    ),
  }
}

/**
 * Same as {@link toPlainGeometraThreeSplitHostSnapshot} with raw device pixel ratio **1** —
 * parity with {@link toPlainGeometraThreeHostSnapshotHeadless} for headless or agent payloads without a `window`.
 */
export function toPlainGeometraThreeSplitHostSnapshotHeadless(
  layoutOptions: ToPlainGeometraSplitHostLayoutOptionsInput = {},
  cssWidth: number,
  cssHeight: number,
  maxDevicePixelRatio?: number,
  sceneBasicsOptions: GeometraThreeSceneBasicsOptions = {},
): PlainGeometraThreeSplitHostSnapshot {
  return {
    geometraHybridHostKind: 'split',
    ...toPlainGeometraSplitHostLayoutOptions(layoutOptions),
    ...toPlainGeometraThreeHostSnapshotHeadless(cssWidth, cssHeight, maxDevicePixelRatio, sceneBasicsOptions),
  }
}

/**
 * Merge stacked HUD layout and host viewport/scene plain fields for stable JSON.
 *
 * @see PlainGeometraThreeStackedHostSnapshot
 */
export function toPlainGeometraThreeStackedHostSnapshot(
  layoutOptions: ToPlainGeometraStackedHostLayoutOptionsInput = {},
  cssWidth: number,
  cssHeight: number,
  rawDevicePixelRatio: number,
  maxDevicePixelRatio?: number,
  sceneBasicsOptions: GeometraThreeSceneBasicsOptions = {},
): PlainGeometraThreeStackedHostSnapshot {
  return {
    geometraHybridHostKind: 'stacked',
    ...toPlainGeometraStackedHostLayoutOptions(layoutOptions),
    ...toPlainGeometraThreeHostSnapshot(
      cssWidth,
      cssHeight,
      rawDevicePixelRatio,
      maxDevicePixelRatio,
      sceneBasicsOptions,
    ),
  }
}

/**
 * Same as {@link toPlainGeometraThreeStackedHostSnapshot} with raw device pixel ratio **1**.
 */
export function toPlainGeometraThreeStackedHostSnapshotHeadless(
  layoutOptions: ToPlainGeometraStackedHostLayoutOptionsInput = {},
  cssWidth: number,
  cssHeight: number,
  maxDevicePixelRatio?: number,
  sceneBasicsOptions: GeometraThreeSceneBasicsOptions = {},
): PlainGeometraThreeStackedHostSnapshot {
  return {
    geometraHybridHostKind: 'stacked',
    ...toPlainGeometraStackedHostLayoutOptions(layoutOptions),
    ...toPlainGeometraThreeHostSnapshotHeadless(cssWidth, cssHeight, maxDevicePixelRatio, sceneBasicsOptions),
  }
}
