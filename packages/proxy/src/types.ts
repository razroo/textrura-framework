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
export type ClientChoiceType = 'select' | 'group' | 'listbox'

export type ClientEventMessage = {
  type: 'event'
  eventType: string
  x: number
  y: number
  requestId?: string
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
  requestId?: string
  protocolVersion?: number
}

export type ClientResizeMessage = {
  type: 'resize'
  width: number
  height: number
  capabilities?: { binaryFraming?: boolean }
  requestId?: string
  protocolVersion?: number
}

export type ClientNavigateMessage = {
  type: 'navigate'
  url: string
  requestId?: string
  protocolVersion?: number
}

export type ClientCompositionMessage = {
  type: 'composition'
  eventType: 'onCompositionStart' | 'onCompositionUpdate' | 'onCompositionEnd'
  data: string
  requestId?: string
  protocolVersion?: number
}

export type ClientFileMessage = {
  type: 'file'
  paths: string[]
  fieldId?: string
  x?: number
  y?: number
  fieldLabel?: string
  exact?: boolean
  strategy?: 'auto' | 'chooser' | 'hidden' | 'drop'
  dropX?: number
  dropY?: number
  requestId?: string
  protocolVersion?: number
}

export type ClientSetFieldTextMessage = {
  type: 'setFieldText'
  fieldId?: string
  fieldLabel: string
  value: string
  exact?: boolean
  /** Optional delay between keystrokes when falling back to keyboard typing (masked fields, rich editors). */
  typingDelayMs?: number
  /** Dispatch composition + input events before assignment (some IME-heavy controlled inputs). */
  imeFriendly?: boolean
  requestId?: string
  protocolVersion?: number
}

export type ClientSetFieldChoiceMessage = {
  type: 'setFieldChoice'
  fieldId?: string
  fieldLabel: string
  value: string
  query?: string
  choiceType?: ClientChoiceType
  exact?: boolean
  requestId?: string
  protocolVersion?: number
}

export type ClientFillField =
  | { kind: 'auto'; fieldId?: string; fieldLabel: string; value: string | boolean; exact?: boolean }
  | {
      kind: 'text'
      fieldId?: string
      fieldLabel: string
      value: string
      exact?: boolean
      typingDelayMs?: number
      imeFriendly?: boolean
    }
  | { kind: 'choice'; fieldId?: string; fieldLabel: string; value: string; query?: string; exact?: boolean; choiceType?: ClientChoiceType }
  | { kind: 'toggle'; fieldId?: string; label: string; checked?: boolean; exact?: boolean; controlType?: 'checkbox' | 'radio' }
  | { kind: 'file'; fieldId?: string; fieldLabel: string; paths: string[]; exact?: boolean }

export type ClientFillFieldsMessage = {
  type: 'fillFields'
  fields: ClientFillField[]
  requestId?: string
  protocolVersion?: number
}

export type ClientListboxPickMessage = {
  type: 'listboxPick'
  label: string
  exact?: boolean
  openX?: number
  openY?: number
  fieldId?: string
  fieldLabel?: string
  query?: string
  requestId?: string
  protocolVersion?: number
}

export type ClientSelectOptionMessage = {
  type: 'selectOption'
  x: number
  y: number
  value?: string
  label?: string
  index?: number
  requestId?: string
  protocolVersion?: number
}

export type ClientSetCheckedMessage = {
  type: 'setChecked'
  label: string
  checked?: boolean
  exact?: boolean
  controlType?: 'checkbox' | 'radio'
  requestId?: string
  protocolVersion?: number
}

export type ClientWheelMessage = {
  type: 'wheel'
  deltaX?: number
  deltaY?: number
  x?: number
  y?: number
  requestId?: string
  protocolVersion?: number
}

export type ClientScreenshotMessage = {
  type: 'screenshot'
  requestId?: string
  protocolVersion?: number
}

export type ClientFillOtpMessage = {
  type: 'fillOtp'
  value: string
  fieldLabel?: string
  perCharDelayMs?: number
  requestId?: string
  protocolVersion?: number
}

export type ClientPdfGenerateMessage = {
  type: 'pdfGenerate'
  /** Optional HTML string to render instead of the current page. */
  html?: string
  /** Paper format: 'A4' or 'Letter'. Defaults to 'A4'. */
  format?: 'A4' | 'Letter'
  /** Print in landscape orientation. */
  landscape?: boolean
  /** CSS margin (e.g. '1cm', '0.5in'). Applied to all sides if individual sides are not set. */
  margin?: string
  /** Print background graphics. Defaults to true. */
  printBackground?: boolean
  requestId?: string
  protocolVersion?: number
}

export type ParsedClientMessage =
  | ClientEventMessage
  | ClientKeyMessage
  | ClientResizeMessage
  | ClientNavigateMessage
  | ClientCompositionMessage
  | ClientFileMessage
  | ClientSetFieldTextMessage
  | ClientSetFieldChoiceMessage
  | ClientFillFieldsMessage
  | ClientFillOtpMessage
  | ClientListboxPickMessage
  | ClientSelectOptionMessage
  | ClientSetCheckedMessage
  | ClientWheelMessage
  | ClientScreenshotMessage
  | ClientPdfGenerateMessage
  | { type: string; protocolVersion?: number }

export function isKeyMessage(msg: ParsedClientMessage): msg is ClientKeyMessage {
  return msg.type === 'key' && 'eventType' in msg && 'key' in msg && 'code' in msg
}

export function isResizeMessage(msg: ParsedClientMessage): msg is ClientResizeMessage {
  return msg.type === 'resize' && 'width' in msg && 'height' in msg
}

export function isNavigateMessage(msg: ParsedClientMessage): msg is ClientNavigateMessage {
  return msg.type === 'navigate' && 'url' in msg && typeof (msg as ClientNavigateMessage).url === 'string'
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

export function isSetFieldTextMessage(msg: ParsedClientMessage): msg is ClientSetFieldTextMessage {
  return (
    msg.type === 'setFieldText' &&
    'fieldLabel' in msg &&
    typeof (msg as ClientSetFieldTextMessage).fieldLabel === 'string' &&
    'value' in msg &&
    typeof (msg as ClientSetFieldTextMessage).value === 'string'
  )
}

export function isSetFieldChoiceMessage(msg: ParsedClientMessage): msg is ClientSetFieldChoiceMessage {
  return (
    msg.type === 'setFieldChoice' &&
    'fieldLabel' in msg &&
    typeof (msg as ClientSetFieldChoiceMessage).fieldLabel === 'string' &&
    'value' in msg &&
    typeof (msg as ClientSetFieldChoiceMessage).value === 'string'
  )
}

export function isFillFieldsMessage(msg: ParsedClientMessage): msg is ClientFillFieldsMessage {
  return msg.type === 'fillFields' && 'fields' in msg && Array.isArray((msg as ClientFillFieldsMessage).fields)
}

export function isFillOtpMessage(msg: ParsedClientMessage): msg is ClientFillOtpMessage {
  return (
    msg.type === 'fillOtp' &&
    'value' in msg &&
    typeof (msg as ClientFillOtpMessage).value === 'string'
  )
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

export function isScreenshotMessage(msg: ParsedClientMessage): msg is ClientScreenshotMessage {
  return msg.type === 'screenshot'
}

export function isPdfGenerateMessage(msg: ParsedClientMessage): msg is ClientPdfGenerateMessage {
  return msg.type === 'pdfGenerate'
}
