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

## CI baseline scenarios (deterministic)

These are **correctness** gates, not competitive latency benchmarks. They run under Vitest in CI and must stay stable.

| Scenario | Where | Pass criteria |
|----------|--------|----------------|
| Rapid layout churn | `packages/server/src/__tests__/server-rapid-update-integration.test.ts` | After 55 synchronous `server.update()` calls, replaying all received JSON messages with `applyServerMessage` yields the same root `width`/`height` as the final server view. |
| Reconnect / resync | Same file + `packages/client/src/__tests__/client-reconnect.test.ts` | A new WebSocket client receives a full `frame` matching server state after a prior client disconnected; mock client reconnects and applies a fresh frame. |
| Patch coalescing stress | `packages/server/src/__tests__/server-transport-stress.test.ts` | Duplicated-path bursts coalesce deterministically (`merged.length === raw.length`). |
| Protocol diff throughput (smoke) | `packages/server/src/__tests__/protocol-perf-smoke.test.ts` | Bounded wall time for medium and worst-case `diffLayout` bursts (guards accidental quadratic regressions). |

Absolute end-to-end latency and throughput numbers depend on hardware and Node/WebSocket stack; use the perf smoke tests as **regression rails**, not published SLA figures.
