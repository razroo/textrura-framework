# Claims And Compliance Workstations

Geometra's strongest business wedge is not general-purpose frontend replacement. It is regulated operational software where humans and AI agents share a workflow and the business must prove what the agent saw, what it could do, what it clicked, and what changed afterward.

## Target Buyer

- Claims operations leaders who want AI-assisted review without losing auditability.
- Compliance teams that need structured proof for escalations, approvals, and evidence handling.
- Security and access-governance teams approving privileged actions.
- Platform teams building internal agent workstations for regulated workflows.

## Why Geometra Fits

Claims and compliance workflows are UI-bound: evidence, status, risk, approvals, and exceptions all appear together on one screen. Backend APIs can prove a mutation happened, but they cannot prove what was visible and actionable when an agent chose that mutation.

Geometra can package that proof in the UI protocol:

- Exact semantic geometry for every relevant node.
- Stable ids for agent targets like `approve-payout`.
- Risk classes and human confirmation requirements on actions.
- Trace events for request, approval, completion, denial, and failure.
- Replay frames showing before/after UI state.
- Postconditions attached to the action contract.

## Flagship Workflow

1. A claim enters the review queue.
2. The agent calls `/inspect` and receives exact semantic geometry and action contracts.
3. The agent chooses `approve-payout`, `request-evidence`, or `escalate-claim`.
4. Gateway policy checks risk and requires approval when needed.
5. A human approves or denies the pending action.
6. The gateway executes the workflow action.
7. Replay stores the frame-before, policy decision, approval, output, and frame-after.

## Sales Message

> Browser automation infers claims workflows from DOM or screenshots. Geometra-native workstations expose the claims workflow as an auditable UI protocol.

## Proof Assets In This Repo

- `demos/agent-native-ops` shows the human workstation and the agent-visible semantic geometry side by side.
- `bun run demo:agent-native:http` runs the external-agent HTTP flow and writes `examples/replays/claims-review.json`.
- `packages/gateway/openapi.json` describes the inspect/actions/trace/replay API surface.
- `bun run benchmark:agent-native:live` compares a live Geometra-native flow with browser-inference-style automation.
- `bun run create:app -- ./claims-compliance --template claims-compliance` scaffolds a vertical gateway starter.
- `benchmarks/agent-native-methodology.md` explains the modeled benchmark assumptions.

## Product Direction

Prioritize features that make this vertical easier to sell:

- Replay retention, export, and redaction policies.
- Approval webhooks and integrations with existing workflow systems.
- Tenant/session auth examples.
- Audit packet viewer.
- Starter templates for claims/compliance queues.
- Live benchmarks against equivalent HTML/Playwright workflows.
