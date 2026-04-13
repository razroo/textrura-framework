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
export { createNoopRenderer } from './noop-renderer.js'
export { createHeadlessClient } from './headless.js'
export type { HeadlessClientOptions } from './headless.js'
export { GEOM_DATA_CHANNEL_TRACKER_SNAPSHOT } from './data-channels.js'
export {
  decodeBinaryFrameJson,
  isBinaryFrameArrayBuffer,
  isBinaryFrameBuffer,
  MAX_V1_PAYLOAD_BYTES,
} from './binary-frame.js'
export type { BinaryFrameBytes } from './binary-frame.js'
