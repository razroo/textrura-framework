const FRAME_VERSION = 1
const HEADER_BYTES = 9

/** Maximum UTF-8 payload bytes in the v1 length field (inclusive). Keep in sync with `@geometra/server` `binary-frame`. */
export const MAX_V1_PAYLOAD_BYTES = 0xffff_ffff

/**
 * Input slice for v1 GEOM binary frames: a whole backing buffer (`ArrayBuffer` or `SharedArrayBuffer`)
 * or any `ArrayBufferView` into a larger store.
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
 * True when `data` has at least the v1 GEOM header (`GEOM` magic + version byte).
 * Does not verify that the declared UTF-8 payload length fits the buffer — use
 * {@link decodeBinaryFrameJson} for full validation.
 * Accepts a root `ArrayBuffer` / `SharedArrayBuffer` or any `ArrayBufferView` (e.g. `Uint8Array` subarray)
 * so callers can probe
 * frames embedded in a larger buffer without copying.
 * `null` / `undefined` yield `false` (mistyped JS callers) instead of throwing from buffer resolution.
 */
export function isBinaryFrameArrayBuffer(data: BinaryFrameBytes): boolean {
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
 * Decode JSON string from a v1 binary envelope (browser).
 * Bytes after `header + payloadLength` are ignored so callers may pass a longer backing buffer.
 * Accepts a root `ArrayBuffer` / `SharedArrayBuffer` or any `ArrayBufferView` with the same semantics as
 * the server decoder.
 *
 * @throws {Error} When the buffer is not a v1 GEOM frame (`Not a GEOM binary frame`).
 * @throws {Error} When the declared payload length exceeds available bytes (`Truncated binary frame payload`).
 *
 * Length is uint32 little-endian. The view must contain `9 + length` bytes; otherwise decode throws.
 * Conforming encoders keep UTF-8 payload size ≤ {@link MAX_V1_PAYLOAD_BYTES} (same cap as `@geometra/server`).
 */
export function decodeBinaryFrameJson(data: BinaryFrameBytes): string {
  if (!isBinaryFrameArrayBuffer(data)) {
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
  return new TextDecoder().decode(jsonBytes)
}
