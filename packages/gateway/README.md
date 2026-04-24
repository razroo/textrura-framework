# @geometra/gateway

HTTP and tool adapters for Geometra's agent-safe workflow gateway.

The package wraps a core `AgentGateway` with:

- `GET /actions`, `POST /actions/request`, `POST /actions/approve`
- `GET /trace`, `GET /replay`, `GET /frame`
- tenant-scoped API keys with read/request/approve/admin scopes
- file or memory replay stores
- MCP-style tool adapter functions

Core policy, stale-frame checks, approvals, redaction, trace, and replay remain in `@geometra/core`.
