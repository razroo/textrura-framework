import type { FlexProps, ComputedLayout } from 'textura'

/**
 * Text direction model used by UI elements.
 * `auto` inherits the resolved direction of the parent (see {@link resolveDirectionValue} in `direction.js`);
 * unknown serialized values behave like `auto` at runtime.
 */
export type Direction = 'ltr' | 'rtl' | 'auto'

/**
 * CSS `cursor` keyword for box props (canvas hosts assign it to `canvas.style.cursor` when supported).
 * Use `''` so {@link import('./hit-test.js').getCursorAtPoint} can fall through to an ancestor cursor.
 * The union is a curated subset of valid CSS keywords, not an exhaustive list.
 */
export type CursorProp =
  | ''
  | 'default'
  | 'pointer'
  | 'grab'
  | 'grabbing'
  | 'text'
  | 'not-allowed'
  | 'crosshair'
  | 'move'
  | 'help'
  | 'cell'
  | 'zoom-in'
  | 'zoom-out'

/** Optional direction metadata carried on UI props (see {@link Direction}). */
export interface DirectionProps {
  /** When omitted or `auto`, inherits the parent’s resolved `ltr` / `rtl`. */
  dir?: Direction
}

/**
 * Per-corner border radius. Any omitted corner defaults to `0`. Used when you need asymmetric rounded
 * corners; for uniform rounding, pass a plain `number` to {@link StyleProps.borderRadius} instead.
 */
export interface BorderRadiusCorners {
  topLeft?: number
  topRight?: number
  bottomLeft?: number
  bottomRight?: number
}

/** Style properties for visual rendering (not layout). */
export interface StyleProps {
  backgroundColor?: string
  color?: string
  borderColor?: string
  /**
   * Border radius in pixels. Accepts a single `number` for uniform rounding or a {@link BorderRadiusCorners}
   * object for per-corner control. Canvas and WebGPU renderers support both shapes; terminal renderer ignores
   * border radius.
   */
  borderRadius?: number | BorderRadiusCorners
  borderWidth?: number
  opacity?: number
  /** Cursor to show when hovering this element. */
  cursor?: CursorProp
  /**
   * Z-index for paint ordering among siblings. Higher values paint on top.
   * Non-finite numbers and non-number runtime values are normalized to `0` for hit-testing and renderer
   * paint order (same rule as {@link import('./layout-bounds.js').finiteNumberOrZero}).
   */
  zIndex?: number
  /**
   * Pointer hit targeting. Only `'none'` is pass-through: this box is omitted from the pointer stack and
   * cursor walk so hits reach geometry behind. `'auto'` and omitting the prop behave the same (the box stays
   * in the stack). Descendants still receive hits under a `'none'` parent unless they also set `'none'`.
   */
  pointerEvents?: 'auto' | 'none'
  /**
   * Renderer clip mode: `hidden` and `scroll` clip descendant paint to this box in canvas/terminal backends;
   * `visible` (or omitted) does not clip paint.
   *
   * Hit-testing gates on the parent layout rect for every mode and does not branch on `overflow`; `scrollX` /
   * `scrollY` shift child geometry under this box.
   */
  overflow?: 'visible' | 'hidden' | 'scroll'
  /** Horizontal content scroll offset (hit-testing, selection walks, and paint). */
  scrollX?: number
  /** Vertical content scroll offset (hit-testing, selection walks, and paint). */
  scrollY?: number
  /** Box shadow. */
  boxShadow?: { offsetX: number; offsetY: number; blur: number; color: string }
  /**
   * Gradient background (overrides backgroundColor when set). Linear gradients use an angle in
   * degrees (0° = top→bottom, 90° = right→left, 180° = top→bottom, CSS semantics). Radial gradients
   * draw from a center point outward to a radius; `center` is normalized to the box (0..1 on each
   * axis; defaults to (0.5, 0.5)) and `radius` is normalized to the box's half-diagonal
   * (defaults to 1 — reaches the farthest corner). Renderers that don't support the selected
   * gradient type fall back to the first stop's color.
   */
  gradient?:
    | {
        type: 'linear'
        /** Angle in degrees. Default: 180 (top to bottom). */
        angle?: number
        stops: Array<{ offset: number; color: string }>
      }
    | {
        type: 'radial'
        /** Center point in normalized box coordinates (0..1). Default: (0.5, 0.5) */
        center?: { x: number; y: number }
        /** Radius normalized to the box's half-diagonal. Default: 1 */
        radius?: number
        stops: Array<{ offset: number; color: string }>
      }
}

/** Semantic properties for SEO and accessibility. */
export interface SemanticProps {
  /** HTML tag to use in semantic HTML output (e.g. 'h1', 'p', 'nav', 'article'). */
  tag?: string
  /** ARIA role for accessibility (e.g. 'heading', 'navigation', 'button'). */
  role?: string
  /** Alt text for images; on boxes, `toSemanticHTML` maps this to `aria-label` only when `ariaLabel` is unset. */
  alt?: string
  /** Aria-label for screen readers. */
  ariaLabel?: string
  /** State: disabled. */
  ariaDisabled?: boolean
  /** State: read-only (e.g. immutable text fields). */
  ariaReadOnly?: boolean
  /** State: expanded/collapsed. */
  ariaExpanded?: boolean
  /** State: selected. */
  ariaSelected?: boolean
  /**
   * Optional agent-native action contract. This describes intent and policy above raw geometry so
   * agents can request a known business operation instead of guessing from labels and coordinates.
   */
  agentAction?: AgentActionContract
}

/** Risk class for an agent-invokable action. */
export type AgentActionRisk = 'read' | 'write' | 'external' | 'destructive'

/** Stable agent-facing action category. */
export type AgentActionKind =
  | 'navigate'
  | 'open'
  | 'select'
  | 'input'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'mutate'
  | 'export'
  | 'custom'

/**
 * Intent-level action metadata carried with a semantic UI node.
 *
 * Geometry remains the source of truth for hit targets, but this contract gives an MCP/gateway layer a
 * stable id, policy metadata, and structured pre/postconditions for deterministic agent operation.
 */
export interface AgentActionContract {
  /** Stable id, unique within the current app surface or route. */
  id: string
  /** Machine-readable category for routing and policy decisions. */
  kind: AgentActionKind
  /** Human-readable label for logs, permission prompts, and devtools. */
  title: string
  /** Optional explanation of what the action does. */
  description?: string
  /** Risk level; defaults to `write` in helpers unless explicitly supplied. */
  risk?: AgentActionRisk
  /** Whether a human approval prompt should gate execution. */
  requiresConfirmation?: boolean
  /** JSON-schema-like object describing accepted structured input. */
  inputSchema?: Record<string, unknown>
  /** JSON-schema-like object describing the structured result an agent can expect. */
  outputSchema?: Record<string, unknown>
  /** Conditions that must be true before execution. */
  preconditions?: string[]
  /** Conditions the gateway/devtools should verify after execution. */
  postconditions?: string[]
  /** Extra audit metadata, kept JSON-serializable for traces. */
  audit?: Record<string, string | number | boolean>
}

/** A text node in the component tree. */
export interface TextElement {
  kind: 'text'
  props: FlexProps & StyleProps & DirectionProps & {
    text: string
    font: string
    lineHeight: number
    whiteSpace?: 'normal' | 'pre-wrap' | 'nowrap'
    /** Text is selectable by default. Set to false to disable. */
    selectable?: boolean
  }
  key?: string
  /** Semantic hints for SEO/a11y. */
  semantic?: SemanticProps
}

/** A box (container) node in the component tree. */
export interface BoxElement {
  kind: 'box'
  props: FlexProps & StyleProps & DirectionProps
  children: UIElement[]
  key?: string
  /** Optional event handlers — resolved via hit-testing. */
  handlers?: EventHandlers
  /** Semantic hints for SEO/a11y. */
  semantic?: SemanticProps
}

/** An image element in the component tree. */
export interface ImageElement {
  kind: 'image'
  props: FlexProps & StyleProps & DirectionProps & {
    src: string
    alt?: string
    objectFit?: 'fill' | 'contain' | 'cover'
  }
  key?: string
  semantic?: SemanticProps
}

/** Orbit-controls configuration for {@link Scene3dElement}. */
export interface OrbitControlsConfig {
  /** Damping factor (0–1). Default renderer-specific. */
  damping?: number
  /** Minimum camera distance. */
  minDistance?: number
  /** Maximum camera distance. */
  maxDistance?: number
  /** Maximum polar angle in radians. */
  maxPolarAngle?: number
}

/**
 * Discriminated union of declarative 3D objects that live inside a {@link Scene3dElement}.
 * All fields are plain JSON-serializable so the server can stream them over the Geometra WebSocket protocol.
 */
export type Scene3dObject =
  | Scene3dSphere
  | Scene3dPoints
  | Scene3dLine
  | Scene3dRing
  | Scene3dAmbientLight
  | Scene3dDirectionalLight
  | Scene3dGroup

export interface Scene3dSphere {
  type: 'sphere'
  position?: [number, number, number]
  radius?: number
  color?: number
  emissive?: number
  metalness?: number
  roughness?: number
  widthSegments?: number
  heightSegments?: number
}

export interface Scene3dPoints {
  type: 'points'
  /** Flat xyz array: [x0, y0, z0, x1, y1, z1, …]. Length must be divisible by 3. */
  positions: number[]
  color?: number
  size?: number
  opacity?: number
}

export interface Scene3dLine {
  type: 'line'
  /** Array of [x, y, z] tuples. */
  points: Array<[number, number, number]>
  color?: number
  opacity?: number
  dashed?: boolean
  dashSize?: number
  gapSize?: number
}

export interface Scene3dRing {
  type: 'ring'
  innerRadius: number
  outerRadius: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  color?: number
  opacity?: number
  segments?: number
}

export interface Scene3dAmbientLight {
  type: 'ambientLight'
  color?: number
  intensity?: number
}

export interface Scene3dDirectionalLight {
  type: 'directionalLight'
  color?: number
  intensity?: number
  position?: [number, number, number]
}

export interface Scene3dGroup {
  type: 'group'
  objects: Scene3dObject[]
  position?: [number, number, number]
}

/** A declarative 3D scene element. Renderers that support Three.js build a scene graph from {@link Scene3dObject} descriptors. */
export interface Scene3dElement {
  kind: 'scene3d'
  props: FlexProps & StyleProps & DirectionProps & {
    /** Hex color for the scene background. */
    background?: number
    /** 3D objects in the scene. */
    objects: Scene3dObject[]
    /** Camera field of view in degrees. Default: 50. */
    fov?: number
    /** Camera near plane. Default: 0.1. */
    near?: number
    /** Camera far plane. Default: 2000. */
    far?: number
    /** Camera position [x, y, z]. */
    cameraPosition?: [number, number, number]
    /** Camera look-at target [x, y, z]. */
    cameraTarget?: [number, number, number]
    /** Enable orbit controls. */
    orbitControls?: boolean | OrbitControlsConfig
    /** Cap the device pixel ratio for the WebGL canvas. */
    maxPixelRatio?: number
  }
  key?: string
  semantic?: SemanticProps
}

/** Union of all element types. */
export type UIElement = TextElement | BoxElement | ImageElement | Scene3dElement

/**
 * Supported event handlers on box elements.
 *
 * Pointer slots (`onPointer*`, `onWheel`) and `onClick` are hit-tested; keyboard and composition slots
 * route to the focused element. Tab order, focus traps, and click-to-focus use
 * {@link import('./focus-candidates.js').hasFocusCandidateHandlers} — pointer-only boxes are omitted there
 * until they also define click, key, or composition handlers.
 */
export interface EventHandlers {
  onClick?: (e: HitEvent) => void
  onPointerDown?: (e: HitEvent) => void
  onPointerUp?: (e: HitEvent) => void
  onPointerMove?: (e: HitEvent) => void
  onWheel?: (e: HitEvent & { deltaX: number; deltaY: number }) => void
  onKeyDown?: (e: KeyboardHitEvent) => void
  onKeyUp?: (e: KeyboardHitEvent) => void
  onCompositionStart?: (e: CompositionHitEvent) => void
  onCompositionUpdate?: (e: CompositionHitEvent) => void
  onCompositionEnd?: (e: CompositionHitEvent) => void
}

/** Event delivered to handlers after hit-testing. */
export interface HitEvent {
  x: number
  y: number
  /** Pointer x relative to the hit target's local box. */
  localX?: number
  /** Pointer y relative to the hit target's local box. */
  localY?: number
  target: ComputedLayout
}

/** Keyboard event delivered to the focused element. */
export interface KeyboardHitEvent {
  key: string
  code: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  target: ComputedLayout
}

/** IME/composition event delivered to the focused element. */
export interface CompositionHitEvent {
  data: string
  target: ComputedLayout
}

/** A component function receives props and returns a UIElement tree. */
export type Component<P = Record<string, never>> = (props: P) => UIElement

/** Optional per-frame timings supplied by the host (e.g. `createApp` after Yoga). */
export interface FrameTimings {
  /**
   * Wall time for `computeLayout` (or equivalent) in milliseconds.
   *
   * {@link import('./app.js').createApp} measures with {@link import('./performance-now.js').safePerformanceNowMs}
   * and passes the delta through {@link import('./performance-now.js').clampNonNegativeLayoutWallMs}, so the value
   * is always a primitive finite non-negative number (including `0` when the clock is unusable or the raw delta is
   * corrupt). Custom hosts that call `setFrameTimings` without `createApp` should apply the same sanitization for
   * consistent inspector and telemetry behavior.
   */
  layoutMs: number
}

/** Interface that all render backends implement. */
export interface Renderer {
  /** Render a computed layout frame. */
  render(layout: ComputedLayout, tree: UIElement): void
  /** Clean up renderer resources. */
  destroy(): void
  /**
   * When present, called by {@link import('./app.js').createApp} immediately after `computeLayout` and before
   * `render` with {@link FrameTimings} (`layoutMs` only). Lets backends (e.g. canvas inspector HUD) split Yoga/layout
   * wall time from paint; see {@link FrameTimings.layoutMs} for measurement and clamping rules.
   */
  setFrameTimings?(timings: FrameTimings): void
}
