# RFC: Geometra protocol v2

Status: draft

## Goals

- Preserve backward compatibility for v1 clients/servers during migration.
- Improve robustness for high-frequency input/layout updates.
- Make ordering/idempotency behavior explicit.

## Proposed changes

1. Add `frameId` and `baseFrameId` metadata:
   - `frame` includes `frameId`
   - `patch` includes both `frameId` and `baseFrameId`
2. Add optional `batch` envelope:
   - `type: "batch"`
   - `messages: ServerMessage[]`
3. Add explicit `ack` and `resync-request` client messages for recovery hooks.
4. Keep v1 message shapes accepted while v2 is rolled out.

## Compatibility strategy

- During migration, server can emit v1-compatible messages by default and v2 when explicitly negotiated.
- Version negotiation rule:
  - client advertises supported protocol range on connect
  - server selects highest mutually supported version
- If peer version is newer than supported and no overlap exists: explicit error + no partial parse.

## Migration plan

1. Land fixtures/tests for v1 + v2 conformance.
2. Add dual-stack server emit path (v1 default, opt-in v2).
3. Add client parse path for v2 metadata while retaining v1 behavior.
4. Flip default to v2 in a minor release after compatibility soak.

## Acceptance criteria

- Protocol fixture suite passes for both client and server packages.
- Reconnect/resync tests cover out-of-order and duplicate delivery scenarios.
- Release notes include migration guidance and compatibility notes.
