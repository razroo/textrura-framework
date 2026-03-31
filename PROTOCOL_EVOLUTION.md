# Protocol evolution (post–GEOM v1)

How Geometra evolves the server/client wire contract without breaking the core pipeline: `Tree → Yoga WASM → Geometry → Pixels`.

## Version number

- **`PROTOCOL_VERSION`** in `packages/server/src/protocol.ts` must increment when message **JSON shape** changes in a way that older peers cannot safely ignore or parse.
- Peers with a **newer** `protocolVersion` than the local maximum are rejected with an explicit error (see `isProtocolCompatible` and client handling).

## Transport layers

1. **Text frames** — UTF-8 JSON. Default and always supported.
2. **GEOM v1 binary envelope** — Same JSON bytes wrapped with a fixed header; negotiated via `resize.capabilities.binaryFraming`. Does not change semantics or `protocolVersion`.

Future **true binary layout** (non-JSON payload) would be a **new capability** and likely a new `PROTOCOL_VERSION` or a versioned sub-envelope, with fixtures in both `packages/server` and `packages/client`.

## Backward-compatible changes

- Prefer **optional** fields with safe defaults.
- Reuse **capability objects** on handshake-style messages (as with `binaryFraming`) instead of silent behavior changes.

## Change checklist

1. Update `PROTOCOL_COMPATIBILITY.md` and, when applicable, `TRANSPORT_1_4.md`.
2. Add or extend conformance tests (`protocol-*`, `binary-frame`, client protocol tests).
3. Document migration in release notes for any observable behavior change.

## Related

- `PROTOCOL_COMPATIBILITY.md` — current rules and GEOM v1 negotiation.
- `fixtures/protocol/v1/` — shared JSON fixtures.
