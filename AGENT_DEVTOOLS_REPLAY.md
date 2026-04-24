# Agent Devtools And Replay

Agent-native apps need devtools that show what the agent actually saw and what it was allowed to do.

## Inspector Views

- Frame inspector: tree, layout bounds, semantic labels, and action contracts.
- Action overlay: visual boxes for every `AgentActionTarget`.
- Policy inspector: why an action is allowed, denied, or awaiting confirmation.
- Trace timeline: requested, approved, denied, completed, and failed events.
- Postcondition panel: expected state checks and observed results.
- Redaction preview: fields removed before frame snapshots or trace export.

## Replay Format

Replay stores:

- Protocol version.
- Route/workflow id.
- Frame snapshots.
- Action trace.
- Policy decisions.
- Optional sanitized app state assertions.
- Pending approval ids and approval decisions.
- Redacted action input/output.

Replay should support deterministic inspection before it supports full time travel. A reviewer must be able to answer: which action did the agent request, what did the user approve, what geometry was visible, and what changed after execution?

The current core gateway exposes `getReplay()`, and `@geometra/gateway` serves it at `GET /replay`. Browser demos can also render replay summaries in Geometra itself; the claims demo now shows frame counts, trace counts, pending approvals, and the last action's before/after frame ids.

## Developer Value

Devtools turn agent failures into debuggable product defects instead of vague prompt problems. That is useful for engineering teams and valuable for buyers who need auditability before approving agent automation in production.
