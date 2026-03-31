# Protocol compatibility policy

This project uses explicit protocol versioning for server/client wire messages.

## Current version

- `PROTOCOL_VERSION = 1` in `packages/server/src/protocol.ts`.
- Client and server treat missing `protocolVersion` as legacy v1-compatible traffic.

## Compatibility contract

- If peer `protocolVersion` is **newer** than local supported version:
  - reject explicitly with an error message
  - do not attempt partial interpretation
- If peer `protocolVersion` is equal, older, or omitted:
  - accept as backward-compatible

## Change process for protocol shape updates

1. Increment `PROTOCOL_VERSION` for non-backward-compatible wire changes.
2. Add/adjust compatibility tests:
   - `packages/server/src/__tests__/protocol-compat.test.ts`
   - `packages/server/src/__tests__/protocol-diff.test.ts`
   - client protocol tests when message handling changes
3. Update README protocol notes and release notes with migration details.
4. Keep error text explicit (`newer than ... protocol ...`) for debuggability.
