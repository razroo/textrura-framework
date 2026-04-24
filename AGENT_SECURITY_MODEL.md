# Agent Security Model

Geometra's security pitch is not that canvas is magic. The pitch is that the automation surface can be smaller, explicit, and auditable than a general DOM page.

## Threats

- Prompt injection hidden in DOM comments, CSS-hidden text, offscreen content, or user-generated markup.
- Fake UI overlays that trick vision agents into clicking unrelated controls.
- Tool confusion where an agent clicks a label that looks right but maps to the wrong operation.
- Data exfiltration through automatic resource loading, hidden links, prefetches, or third-party scripts.
- Stale actions where an agent acts on a frame after the UI state changed.
- Destructive operation execution without human approval.
- Trace leakage where logs store secrets or regulated content unnecessarily.

## Mitigations

- Render from explicit UI nodes rather than parsed HTML.
- Expose only finite geometry and semantic metadata from the current frame.
- Require stable `agentAction.id` values for business operations.
- Default external and destructive action contracts to confirmation.
- Bind action requests to the current frame and reject stale ids.
- Record requested, approved, denied, completed, and failed events in `AgentTrace`.
- Redact secrets before publishing frame snapshots or traces.
- Let tenant policy allow or deny actions by route, id, risk, and actor.
- Deny external and destructive risk classes by default in the policy helper unless the app explicitly opts into a different posture.
- Gate HTTP access with tenant-scoped API keys and separate read/request/approve scopes.
- Persist replay through a store so audit records survive process restarts.

## Security Boundary

The gateway is the enforcement boundary. The renderer paints pixels, the core exposes geometry and contracts, and the gateway decides whether a requested action may run.

This makes security review tractable: instead of asking whether an agent can safely understand an arbitrary web page, reviewers inspect a finite set of action contracts and policy rules.
