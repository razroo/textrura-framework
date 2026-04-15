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
 * True when `[byteOffset, byteOffset + byteLength)` lies within `buffer.byteLength` so
 * `Uint8Array` / `DataView` construction cannot throw `RangeError`.
 * Rejects non-integer offsets/lengths (typed array lengths must be integers).
 */
function binaryFrameBytesFitBuffer(
  buffer: ArrayBufferLike,
  byteOffset: number,
  byteLength: number,
): boolean {
  if (!Number.isInteger(byteOffset) || byteOffset < 0) return false
  if (!Number.isInteger(byteLength) || byteLength < 0) return false
  try {
    const bufLen = buffer.byteLength
    if (typeof bufLen !== 'number' || !Number.isFinite(bufLen) || bufLen < 0) return false
    if (byteOffset > bufLen) return false
    return byteLength <= bufLen - byteOffset
  } catch {
    return false
  }
}

/**
 * True when `data` has at least the v1 GEOM header (`GEOM` magic + version byte).
 * Does not verify that the declared UTF-8 payload length fits the buffer — use
 * {@link decodeBinaryFrameJson} for full validation.
 * Accepts a root `ArrayBuffer` / `SharedArrayBuffer` or any `ArrayBufferView` (e.g. `Uint8Array` subarray)
 * so callers can probe
 * frames embedded in a larger buffer without copying.
 * `null` / `undefined` yield `false` (mistyped JS callers) instead of throwing from buffer resolution.
 * Plain objects that are not real `ArrayBufferView` instances also yield `false` (no numeric coercion).
 * Non-integer `byteOffset` / `byteLength` (e.g. mistyped fake views) yield `false` — same invariant as real
 * `ArrayBufferView` fields and {@link binaryFrameBytesFitBuffer}.
 * Inconsistent `(buffer, byteOffset, byteLength)` tuples that would make `Uint8Array` throw `RangeError`
 * yield `false` instead of throwing. Hostile `Proxy` / exotic accessors that throw when reading
 * `byteLength` or `byteOffset` on the root buffer or view also yield `false` (same non-throwing contract).
 */
export function isBinaryFrameArrayBuffer(data: BinaryFrameBytes): boolean {
  if (data == null) return false
  let buffer: ArrayBufferLike
  let byteOffset: number
  let byteLength: number
  try {
    ;({ buffer, byteOffset, byteLength } = resolveFrameBytes(data))
  } catch {
    return false
  }
  // Mistyped non-view objects can yield undefined fields; `undefined < 9` is false in JS, so guard explicitly.
  if (
    buffer == null ||
    typeof byteOffset !== 'number' ||
    !Number.isFinite(byteOffset) ||
    byteOffset < 0 ||
    !Number.isInteger(byteOffset) ||
    typeof byteLength !== 'number' ||
    !Number.isFinite(byteLength) ||
    byteLength < HEADER_BYTES ||
    !Number.isInteger(byteLength)
  ) {
    return false
  }
  if (!binaryFrameBytesFitBuffer(buffer, byteOffset, byteLength)) return false
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
 * Same predicate as {@link isBinaryFrameArrayBuffer}. Use this name when aligning helpers with
 * `@geometra/server` `isBinaryFrameBuffer` (identical guards; browser bundle keeps both exports).
 */
export const isBinaryFrameBuffer = isBinaryFrameArrayBuffer

/**
 * Wrap UTF-8 JSON in a v1 binary envelope for WebSocket binary frames.
 * Same layout as `@geometra/server` `encodeBinaryFrameJson` (GEOM magic, version 1, uint32 LE length, UTF-8 payload);
 * returns an `ArrayBuffer` instead of Node `Buffer`.
 *
 * @throws {RangeError} When the UTF-8 payload byte length exceeds {@link MAX_V1_PAYLOAD_BYTES}.
 */
export function encodeBinaryFrameJson(jsonUtf8: string): ArrayBuffer {
  const payload = new TextEncoder().encode(jsonUtf8)
  if (payload.length > MAX_V1_PAYLOAD_BYTES) {
    throw new RangeError(
      `GEOM v1 binary frame payload length ${payload.length} exceeds uint32 max (${MAX_V1_PAYLOAD_BYTES})`,
    )
  }
  const out = new Uint8Array(HEADER_BYTES + payload.length)
  out.set([0x47, 0x45, 0x4f, 0x4d, FRAME_VERSION], 0)
  new DataView(out.buffer).setUint32(5, payload.length, true)
  out.set(payload, HEADER_BYTES)
  return out.buffer
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
