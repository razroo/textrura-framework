import { Buffer } from 'node:buffer'

/** Magic prefix for optional v1 binary JSON envelopes (same JSON payload as text frames). */
export const BINARY_FRAME_MAGIC = Buffer.from([0x47, 0x45, 0x4f, 0x4d]) // GEOM

const FRAME_VERSION = 1
const HEADER_BYTES = 9
/** Maximum UTF-8 payload bytes representable in the v1 length field (inclusive). Keep in sync with `@geometra/client` `MAX_V1_PAYLOAD_BYTES`. */
export const MAX_V1_PAYLOAD_BYTES = 0xffff_ffff

/**
 * Input slice for v1 GEOM binary frames: a whole backing buffer (`ArrayBuffer` or `SharedArrayBuffer`)
 * or any `ArrayBufferView` into a larger store — same contract as `BinaryFrameBytes` in `@geometra/client`.
 */
export type BinaryFrameBytes = ArrayBuffer | SharedArrayBuffer | ArrayBufferView

function isRootArrayBufferLike(data: BinaryFrameBytes): data is ArrayBuffer | SharedArrayBuffer {
  return (
    (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) ||
    (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer)
  )
}

function resolveFrameBytes(data: BinaryFrameBytes): {
  buffer: ArrayBufferLike
  byteOffset: number
  byteLength: number
} {
  if (isRootArrayBufferLike(data)) {
    return { buffer: data, byteOffset: 0, byteLength: data.byteLength }
  }
  return { buffer: data.buffer, byteOffset: data.byteOffset, byteLength: data.byteLength }
}

/**
 * True if data looks like a v1 binary envelope (GEOM + version 1). Does not verify that the declared
 * UTF-8 payload length fits the view — use {@link decodeBinaryFrameJson} for full validation.
 * Accepts a root `ArrayBuffer` / `SharedArrayBuffer` or any `ArrayBufferView` (e.g. `Uint8Array` subarray,
 * `DataView`, other typed arrays) so callers can probe frames embedded in a larger store without copying.
 * `null` / `undefined` yield `false`.
 */
export function isBinaryFrameBuffer(data: BinaryFrameBytes): boolean {
  if (data == null) return false
  const { buffer, byteOffset, byteLength } = resolveFrameBytes(data)
  if (byteLength < HEADER_BYTES) return false
  const u8 = new Uint8Array(buffer, byteOffset, byteLength)
  return (
    u8[0] === 0x47 &&
    u8[1] === 0x45 &&
    u8[2] === 0x4f &&
    u8[3] === 0x4d &&
    u8[4] === FRAME_VERSION
  )
}

/**
 * Wrap UTF-8 JSON bytes in a binary envelope for WebSocket binary frames.
 *
 * @throws {RangeError} When the UTF-8 payload is larger than 4294967295 bytes (v1 uint32 length field).
 */
export function encodeBinaryFrameJson(jsonUtf8: string): Buffer {
  const payload = Buffer.from(jsonUtf8, 'utf8')
  if (payload.length > MAX_V1_PAYLOAD_BYTES) {
    throw new RangeError(
      `GEOM v1 binary frame payload length ${payload.length} exceeds uint32 max (${MAX_V1_PAYLOAD_BYTES})`,
    )
  }
  const header = Buffer.alloc(HEADER_BYTES)
  BINARY_FRAME_MAGIC.copy(header, 0)
  header.writeUInt8(FRAME_VERSION, 4)
  header.writeUInt32LE(payload.length, 5)
  return Buffer.concat([header, payload])
}

/**
 * Decode JSON string from a v1 binary envelope.
 * Bytes after `header + payloadLength` are ignored so callers may pass a longer backing buffer.
 * Accepts a root `ArrayBuffer` / `SharedArrayBuffer` or any `ArrayBufferView` with the same semantics as
 * `decodeBinaryFrameJson` in `@geometra/client`.
 *
 * @throws {Error} When the buffer is not a v1 GEOM frame (`Not a GEOM binary frame`).
 * @throws {Error} When the declared payload length exceeds available bytes (`Truncated binary frame payload`).
 */
export function decodeBinaryFrameJson(data: BinaryFrameBytes): string {
  if (!isBinaryFrameBuffer(data)) {
    throw new Error('Not a GEOM binary frame')
  }
  const { buffer, byteOffset, byteLength } = resolveFrameBytes(data)
  const dv = new DataView(buffer, byteOffset, byteLength)
  const len = dv.getUint32(5, true)
  const maxPayload = byteLength - HEADER_BYTES
  if (len > maxPayload) {
    throw new Error('Truncated binary frame payload')
  }
  const jsonBytes = new Uint8Array(buffer, byteOffset + HEADER_BYTES, len)
  return new TextDecoder('utf-8').decode(jsonBytes)
}
