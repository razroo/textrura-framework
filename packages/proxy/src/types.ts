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

export type ClientFileMessage = {
  type: 'file'
  paths: string[]
  x?: number
  y?: number
  strategy?: 'auto' | 'chooser' | 'hidden' | 'drop'
  dropX?: number
  dropY?: number
  protocolVersion?: number
}

export type ClientListboxPickMessage = {
  type: 'listboxPick'
  label: string
  exact?: boolean
  openX?: number
  openY?: number
  protocolVersion?: number
}

export type ClientSelectOptionMessage = {
  type: 'selectOption'
  x: number
  y: number
  value?: string
  label?: string
  index?: number
  protocolVersion?: number
}

export type ClientSetCheckedMessage = {
  type: 'setChecked'
  label: string
  checked?: boolean
  exact?: boolean
  controlType?: 'checkbox' | 'radio'
  protocolVersion?: number
}

export type ClientWheelMessage = {
  type: 'wheel'
  deltaX?: number
  deltaY?: number
  x?: number
  y?: number
  protocolVersion?: number
}

export type ParsedClientMessage =
  | ClientEventMessage
  | ClientKeyMessage
  | ClientResizeMessage
  | ClientCompositionMessage
  | ClientFileMessage
  | ClientListboxPickMessage
  | ClientSelectOptionMessage
  | ClientSetCheckedMessage
  | ClientWheelMessage
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

export function isFileMessage(msg: ParsedClientMessage): msg is ClientFileMessage {
  return msg.type === 'file' && 'paths' in msg && Array.isArray((msg as ClientFileMessage).paths)
}

export function isSelectOptionMessage(msg: ParsedClientMessage): msg is ClientSelectOptionMessage {
  return (
    msg.type === 'selectOption' &&
    'x' in msg &&
    'y' in msg &&
    typeof (msg as ClientSelectOptionMessage).x === 'number' &&
    typeof (msg as ClientSelectOptionMessage).y === 'number'
  )
}

export function isWheelMessage(msg: ParsedClientMessage): msg is ClientWheelMessage {
  return msg.type === 'wheel'
}

export function isListboxPickMessage(msg: ParsedClientMessage): msg is ClientListboxPickMessage {
  return msg.type === 'listboxPick' && 'label' in msg && typeof (msg as ClientListboxPickMessage).label === 'string'
}

export function isSetCheckedMessage(msg: ParsedClientMessage): msg is ClientSetCheckedMessage {
  return msg.type === 'setChecked' && 'label' in msg && typeof (msg as ClientSetCheckedMessage).label === 'string'
}
