/** Layout snapshot aligned with Textura {@link ComputedLayout} / GEOM v1 `frame.layout`. */
export interface LayoutSnapshot {
  x: number
  y: number
  width: number
  height: number
  children: LayoutSnapshot[]
}

/** Synthetic UI tree shape consumed by `@geometra/mcp` `buildA11yTree` (JSON-serializable). */
export interface TreeSnapshot {
  kind: 'box' | 'text' | 'image'
  props: Record<string, unknown>
  semantic?: Record<string, unknown>
  /** Truthy flags only — matches JSON round-trips from native Geometra servers. */
  handlers?: { onClick?: boolean; onKeyDown?: boolean; onKeyUp?: boolean }
  children?: TreeSnapshot[]
}

export interface GeometrySnapshot {
  layout: LayoutSnapshot
  tree: TreeSnapshot
  /** `JSON.stringify(tree)` for deciding frame vs patch. */
  treeJson: string
}

export const PROXY_PROTOCOL_VERSION = 1 as const

export type ClientEventMessage = {
  type: 'event'
  eventType: string
  x: number
  y: number
  protocolVersion?: number
}

export type ClientKeyMessage = {
  type: 'key'
  eventType: 'onKeyDown' | 'onKeyUp'
  key: string
  code: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  protocolVersion?: number
}

export type ClientResizeMessage = {
  type: 'resize'
  width: number
  height: number
  capabilities?: { binaryFraming?: boolean }
  protocolVersion?: number
}

export type ClientCompositionMessage = {
  type: 'composition'
  eventType: 'onCompositionStart' | 'onCompositionUpdate' | 'onCompositionEnd'
  data: string
  protocolVersion?: number
}

export type ParsedClientMessage =
  | ClientEventMessage
  | ClientKeyMessage
  | ClientResizeMessage
  | ClientCompositionMessage
  | { type: string; protocolVersion?: number }

export function isKeyMessage(msg: ParsedClientMessage): msg is ClientKeyMessage {
  return msg.type === 'key' && 'eventType' in msg && 'key' in msg && 'code' in msg
}

export function isResizeMessage(msg: ParsedClientMessage): msg is ClientResizeMessage {
  return msg.type === 'resize' && 'width' in msg && 'height' in msg
}

export function isClickEventMessage(msg: ParsedClientMessage): msg is ClientEventMessage {
  return msg.type === 'event' && 'eventType' in msg && msg.eventType === 'onClick' && 'x' in msg && 'y' in msg
}

export function isCompositionMessage(msg: ParsedClientMessage): msg is ClientCompositionMessage {
  return msg.type === 'composition' && 'eventType' in msg && 'data' in msg
}
