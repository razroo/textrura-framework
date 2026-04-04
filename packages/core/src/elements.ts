import type { FlexProps } from 'textura'
import type {
  StyleProps,
  BoxElement,
  TextElement,
  ImageElement,
  Scene3dElement,
  Scene3dObject,
  Scene3dSphere,
  Scene3dPoints,
  Scene3dLine,
  Scene3dRing,
  Scene3dAmbientLight,
  Scene3dDirectionalLight,
  Scene3dGroup,
  OrbitControlsConfig,
  UIElement,
  EventHandlers,
  SemanticProps,
  DirectionProps,
} from './types.js'

type BoxProps = FlexProps & StyleProps & DirectionProps & EventHandlers & { key?: string; semantic?: SemanticProps }
type TextProps = FlexProps & StyleProps & DirectionProps & {
  text: string
  font: string
  lineHeight: number
  whiteSpace?: 'normal' | 'pre-wrap'
  selectable?: boolean
  key?: string
  semantic?: SemanticProps
}
type ImageProps = FlexProps & StyleProps & DirectionProps & {
  src: string
  alt?: string
  objectFit?: 'fill' | 'contain' | 'cover'
  key?: string
  semantic?: SemanticProps
}

type Scene3dProps = FlexProps & StyleProps & DirectionProps & {
  background?: number
  objects: Scene3dObject[]
  fov?: number
  near?: number
  far?: number
  cameraPosition?: [number, number, number]
  cameraTarget?: [number, number, number]
  orbitControls?: boolean | OrbitControlsConfig
  maxPixelRatio?: number
  key?: string
  semantic?: SemanticProps
}

/**
 * Create a box (container) element.
 * Handlers, `semantic`, and `key` are runtime metadata; flex and layout fields are consumed by `toLayoutTree()`.
 * Optional `dir` (`ltr` | `rtl` | `auto`) sets resolved direction for this subtree for focus, hit-testing, text
 * interaction, and Yoga layout on descendants; `auto` inherits from the parent context. The layout-tree root
 * omits `dir` so {@link import('./app.js').createApp}'s `layoutDirection` (when provided) stays authoritative.
 * For pointer routing, only `pointerEvents: 'none'` opts out; `'auto'` matches the default (see {@link import('./types.js').StyleProps.pointerEvents}).
 */
export function box(props: BoxProps, children: UIElement[] = []): BoxElement {
  const {
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onWheel,
    onKeyDown,
    onKeyUp,
    onCompositionStart,
    onCompositionUpdate,
    onCompositionEnd,
    key,
    semantic,
    ...rest
  } = props
  const handlers: EventHandlers = {}
  if (onClick) handlers.onClick = onClick
  if (onPointerDown) handlers.onPointerDown = onPointerDown
  if (onPointerUp) handlers.onPointerUp = onPointerUp
  if (onPointerMove) handlers.onPointerMove = onPointerMove
  if (onWheel) handlers.onWheel = onWheel
  if (onKeyDown) handlers.onKeyDown = onKeyDown
  if (onKeyUp) handlers.onKeyUp = onKeyUp
  if (onCompositionStart) handlers.onCompositionStart = onCompositionStart
  if (onCompositionUpdate) handlers.onCompositionUpdate = onCompositionUpdate
  if (onCompositionEnd) handlers.onCompositionEnd = onCompositionEnd

  return {
    kind: 'box',
    props: rest,
    children,
    key,
    handlers: Object.keys(handlers).length > 0 ? handlers : undefined,
    semantic,
  }
}

/**
 * Create a text leaf element.
 * `selectable` and `semantic` are runtime/rendering concerns; remaining props feed `toLayoutTree()` and Textura.
 * Optional `dir` participates in the same resolved-direction model as boxes (caret, selection, bidi) and is
 * forwarded to Textura when this node is not the layout root.
 */
export function text(props: TextProps): TextElement {
  const { key, semantic, ...rest } = props
  return { kind: 'text', props: rest, key, semantic }
}

/**
 * Create an image element.
 * `semantic` and `key` are runtime metadata. Flex and sizing props feed {@link import('./tree.js').toLayoutTree}
 * for Yoga/Textura; `src`, `alt`, and `objectFit` remain on the live element for renderers and a11y but are
 * stripped from the layout snapshot (Textura measures boxes from width/height, not bitmaps).
 * Optional `dir` is used for resolved direction alongside siblings and ancestors and is forwarded to Textura when
 * this node is not the layout root.
 */
export function image(props: ImageProps): ImageElement {
  const { key, semantic, ...rest } = props
  return { kind: 'image', props: rest, key, semantic }
}

/**
 * Create a declarative 3D scene element.
 * The `objects` array describes the scene graph using plain serializable data;
 * a Three.js-capable renderer (e.g. `@geometra/renderer-three`) builds the live scene from these descriptors.
 * Flex and sizing props feed {@link import('./tree.js').toLayoutTree} — the element reserves layout space like a box.
 * 3D and host props (`background`, `objects`, camera settings, `orbitControls`, `maxPixelRatio`) plus the same
 * paint-only style metadata as other elements are stripped from the layout snapshot; renderers read them from the live tree.
 */
export function scene3d(props: Scene3dProps): Scene3dElement {
  const { key, semantic, ...rest } = props
  return { kind: 'scene3d', props: rest, key, semantic }
}

// ---------------------------------------------------------------------------
// Scene3d object helpers — plain data factories for the `objects` array.
// ---------------------------------------------------------------------------

export function sphere(opts: Omit<Scene3dSphere, 'type'>): Scene3dSphere {
  return { type: 'sphere', ...opts }
}

export function points(opts: Omit<Scene3dPoints, 'type'>): Scene3dPoints {
  return { type: 'points', ...opts }
}

export function line(opts: Omit<Scene3dLine, 'type'>): Scene3dLine {
  return { type: 'line', ...opts }
}

export function ring(opts: Omit<Scene3dRing, 'type'>): Scene3dRing {
  return { type: 'ring', ...opts }
}

export function ambientLight(opts: Omit<Scene3dAmbientLight, 'type'> = {}): Scene3dAmbientLight {
  return { type: 'ambientLight', ...opts }
}

export function directionalLight(opts: Omit<Scene3dDirectionalLight, 'type'>): Scene3dDirectionalLight {
  return { type: 'directionalLight', ...opts }
}

export function group(opts: Omit<Scene3dGroup, 'type'>): Scene3dGroup {
  return { type: 'group', ...opts }
}
