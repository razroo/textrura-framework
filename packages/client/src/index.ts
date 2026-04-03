/**
 * @packageDocumentation
 * Public entry for `@geometra/client`: WebSocket client, server message application, and optional
 * v1 GEOM binary JSON envelope helpers (same payload as text frames; see server `binary-frame`).
 */

export { createClient, applyServerMessage } from './client.js'
export type {
  TexturaClient,
  TexturaClientOptions,
  ClientFrameMetrics,
  ServerMessageDecodeMeta,
} from './client.js'
export { decodeBinaryFrameJson, isBinaryFrameArrayBuffer } from './binary-frame.js'
export type { BinaryFrameBytes } from './binary-frame.js'
