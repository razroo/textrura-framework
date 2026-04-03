const FRAME_VERSION = 1
const HEADER_BYTES = 9

/**
 * True when `data` has at least the v1 GEOM header (`GEOM` magic + version byte).
 * Does not verify that the declared UTF-8 payload length fits the buffer — use
 * {@link decodeBinaryFrameJson} for full validation.
 */
export function isBinaryFrameArrayBuffer(data: ArrayBuffer): boolean {
  if (data.byteLength < HEADER_BYTES) return false
  const u8 = new Uint8Array(data)
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
 * Bytes after `header + payloadLength` are ignored so callers may pass a longer `ArrayBuffer`.
 *
 * @throws {Error} When the buffer is not a v1 GEOM frame (`Not a GEOM binary frame`).
 * @throws {Error} When the declared payload length exceeds available bytes (`Truncated binary frame payload`).
 */
export function decodeBinaryFrameJson(data: ArrayBuffer): string {
  if (!isBinaryFrameArrayBuffer(data)) {
    throw new Error('Not a GEOM binary frame')
  }
  const dv = new DataView(data)
  const len = dv.getUint32(5, true)
  if (HEADER_BYTES + len > data.byteLength) {
    throw new Error('Truncated binary frame payload')
  }
  const jsonBytes = new Uint8Array(data, HEADER_BYTES, len)
  return new TextDecoder().decode(jsonBytes)
}
