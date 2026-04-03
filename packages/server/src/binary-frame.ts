import { Buffer } from 'node:buffer'

/** Magic prefix for optional v1 binary JSON envelopes (same JSON payload as text frames). */
export const BINARY_FRAME_MAGIC = Buffer.from([0x47, 0x45, 0x4f, 0x4d]) // GEOM

const FRAME_VERSION = 1
const HEADER_BYTES = 9

/** True if buffer looks like a v1 binary envelope (GEOM + version 1). */
export function isBinaryFrameBuffer(data: Buffer | Uint8Array): boolean {
  if (data.length < HEADER_BYTES) return false
  return (
    data[0] === 0x47 &&
    data[1] === 0x45 &&
    data[2] === 0x4f &&
    data[3] === 0x4d &&
    data[4] === FRAME_VERSION
  )
}

/** Wrap UTF-8 JSON bytes in a binary envelope for WebSocket binary frames. */
export function encodeBinaryFrameJson(jsonUtf8: string): Buffer {
  const payload = Buffer.from(jsonUtf8, 'utf8')
  const header = Buffer.alloc(HEADER_BYTES)
  BINARY_FRAME_MAGIC.copy(header, 0)
  header.writeUInt8(FRAME_VERSION, 4)
  header.writeUInt32LE(payload.length, 5)
  return Buffer.concat([header, payload])
}

/**
 * Decode JSON string from a v1 binary envelope.
 * Bytes after `header + payloadLength` are ignored so callers may pass a longer buffer.
 * Accepts any `Uint8Array` view (including non-zero `byteOffset` into a shared `ArrayBuffer`).
 *
 * @throws {Error} When the buffer is not a v1 GEOM frame (`Not a GEOM binary frame`).
 * @throws {Error} When the declared payload length exceeds available bytes (`Truncated binary frame payload`).
 */
export function decodeBinaryFrameJson(data: Buffer | Uint8Array): string {
  if (!isBinaryFrameBuffer(data)) {
    throw new Error('Not a GEOM binary frame')
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const len = dv.getUint32(5, true)
  if (HEADER_BYTES + len > data.length) {
    throw new Error('Truncated binary frame payload')
  }
  return new TextDecoder('utf-8').decode(data.subarray(HEADER_BYTES, HEADER_BYTES + len))
}
