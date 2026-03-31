# Transport efficiency (1.4.x)

Notes for high-frequency server/client updates: backpressure, optional binary framing, and instrumentation.

## Backpressure and resync

The server uses `ws` `bufferedAmount` with a configurable threshold (`backpressureBytes`, default 512 KiB). When a client’s buffer is above the threshold, that client is skipped for the current broadcast and marked for a **full frame** on the next successful send (`needsResync`). This keeps memory bounded under slow consumers.

`shouldDeferClientSend(bufferedAmount, backpressureBytes)` is exported for tests and custom integrations.

## Patch coalescing

`diffLayout` emits at most one patch object per node path. `coalescePatches` merges **duplicate paths** in a single patch array (last write wins per field). Real bursts that repeat the same path typically come from concatenated updates, not from a single `diffLayout` call.

## Server telemetry (`onTransportMetrics`)

After each successful `computeAndBroadcast`, the server may call `onTransportMetrics` with:

- `deferredSends` — clients skipped this round due to backpressure
- `coalescedPatchDelta` — `rawPatches.length - coalescePatches(rawPatches).length`
- `binaryOutboundFrames` — clients that received a binary outbound frame this round

## Client telemetry (`onFrameMetrics`)

Per processed server message: `decodeMs`, `applyMs`, `renderMs`, optional `encoding` (`json` | `binary`), `bytesReceived`, and `patchCount` where applicable. See `ServerMessageDecodeMeta` / `ClientFrameMetrics` in `@geometra/client`.

## Binary framing

See `PROTOCOL_COMPATIBILITY.md` (optional GEOM v1 envelope). Client option: `binaryFraming: true` on `createClient`.
