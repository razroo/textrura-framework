#!/usr/bin/env bash
# Re-exec under bash when invoked as `sh` (often dash on Linux). This script uses
# bash-only syntax ([[, arrays, PIPESTATUS, BASH_SOURCE).
if [ -z "${BASH_VERSION+x}" ]; then
  exec /usr/bin/env bash "$0" "$@"
fi

# Drive Cursor Agent CLI in a loop (non-interactive). Each iteration is one agent
# session that explores the codebase, picks the next best improvement, implements
# it, runs the release gate, commits, and pushes.
#
# Task selection (humans/agents): grep the entire ROADMAP.md for `- [ ]` (Phase A–C, post-1.0 plans,
# release polish, and next frontier all use the same checkbox pattern) and grep ROUTING_COMPETITIVENESS_CHECKLIST.md.
# Both trackers may already be all `[x]` — that only means unchecked checkbox backlog is exhausted there,
# not that the repo is "done". ROADMAP "Deferred / research" uses plain bullets (no `- [ ]`), so an empty
# roadmap grep does not mean no roadmap-backed themes — read that subsection when casting next work (RTL through
# Textura, animation beyond helpers, extra render targets). Otherwise prefer one scoped change under
# packages/ (tests, perf in hit-test/text/layout paths, types, public JSDoc, or
# `rg 'TODO|FIXME|HACK' packages`; a clean TODO grep is normal — pick a north-star bucket anyway).
# `vitest.fast.config.ts` (used by `npm run test` / quality.yml "Fast tests") includes only
# `packages/*/src/__tests__/**/*.test.ts`. Tests colocated as `packages/<pkg>/src/*.test.ts` are skipped by
# that glob until moved under `src/__tests__/` (or the include pattern is intentionally widened).
# Root `npm run release:gate` allowlists specific vitest entry files (see package.json), not every
# `packages/*/src/__tests__/**/*.test.ts` that `npm run test` / vitest.fast.config.ts includes — a file
# passing `vitest.fast` does not imply it runs in CI gate; check package.json before assuming coverage ships.
# Before appending a path to the gate script, confirm it is not already listed (duplicate paths make
# vitest run the same file twice). Scan the whole `scripts.release:gate` string — paths are not strictly
# ordered, so a file can appear early in the vitest argv list while you only eyeball a later segment.
# Example: `packages/core/src/__tests__/layout-bounds.test.ts` is often the *first* vitest path (before
# keyboard.test.ts); inserting it again after keyboard duplicates the entry and fails verify-release-gate.mjs.
# `verify-release-gate.mjs` also resolves paths canonically, so `packages/a/../b/x.test.ts` counts as the same
# file as `packages/b/x.test.ts` for duplicate detection.
# `npm run release:gate` runs `scripts/release/verify-release-gate.mjs`
# first to fail fast on duplicates or missing paths, then the vitest allowlist, then `bun run test:terminal-input`
# (@geometra/demo-terminal). The gate fails if `bun` is missing from PATH even when Node/npm work — install Bun or run
# only the vitest segment locally when debugging. The allowlist evolves; read package.json instead of copying examples
# from older prompts or transcripts.
# Extend an allowlisted file when adding release-critical tests unless you intentionally widen the gate.
# Layout/Yoga geometry regression: use `packages/core/src/__tests__/geometry-snapshot-ci.test.ts` (gate-listed)
# and `GEOMETRY_SNAPSHOT_TESTING.md`; avoid unrelated snapshot churn unless widening the gate on purpose.
# Demos and starter output: read `AGENTS.md` — Geometra should own the full viewport; no marketing DOM shells
# or extra chrome around the canvas; diagnostics belong in-tree, not adjacent HTML panels.
# Interaction / protocol / renderer changes: skim `FRAMEWORK_NORTH_STAR.md` merge checklist (DOM-free invariants,
# input tests, perf hot paths, docs accuracy) before shipping.
# Ignore `[ ]` in RELEASE_CHECKLIST.md / v1-release-checklist.md
# (maintainer release steps, not framework backlog).
#
# Prerequisites:
#   - Cursor Agent CLI: https://cursor.com/install (`agent` on PATH)
#   - Auth: `agent login` or CURSOR_API_KEY
#   - For push: a configured remote; new branches may need `git push -u origin HEAD` once so `git push` succeeds
#
# Environment (optional):
#   CURSOR_AGENT_ITERATIONS   Max agent runs (default: 100). Lower for a short run, e.g. CURSOR_AGENT_ITERATIONS=1.
#   CURSOR_AGENT_PUSH         If 1, agent commits and this script runs git push after each iteration (default: 1). Set to 0 to skip pushing.
#   CURSOR_AGENT_FORCE_SHELL  If 1, pass --force so the agent can run shell without per-command approval (default: 1). Set to 0 for safer approval prompts. --force allows arbitrary commands: use a dedicated branch and review diffs.
#   CURSOR_AGENT_WORKSPACE    Repo root (default: git top-level from current directory).
#   CURSOR_AGENT_MODEL        Passed as --model to agent (default: composer-2). Override e.g. composer-2-fast or auto.
#   CURSOR_AGENT_EXTRA        Extra instructions appended to the built-in prompt.
#   CURSOR_AGENT_VERBOSE      If 1, stream agent progress (tools, partial text) to the terminal via stream-json (default: 1). Set to 0 for final text only.
#
# Usage:
#   ./scripts/cursor-agent-loop.sh
#   CURSOR_AGENT_ITERATIONS=3 ./scripts/cursor-agent-loop.sh
#   CURSOR_AGENT_PUSH=0 ./scripts/cursor-agent-loop.sh   # commit only, no push
#   CURSOR_AGENT_FORCE_SHELL=0 ./scripts/cursor-agent-loop.sh   # prompt before each agent shell command
#   CURSOR_AGENT_VERBOSE=0 ./scripts/cursor-agent-loop.sh        # quiet: only final assistant text
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STREAM_FORMATTER="${SCRIPT_DIR}/cursor-agent-stream-format.py"

ITERATIONS="${CURSOR_AGENT_ITERATIONS:-100}"
PUSH="${CURSOR_AGENT_PUSH:-1}"
FORCE_SHELL="${CURSOR_AGENT_FORCE_SHELL:-1}"
VERBOSE="${CURSOR_AGENT_VERBOSE:-1}"
WORKSPACE="${CURSOR_AGENT_WORKSPACE:-}"
MODEL="${CURSOR_AGENT_MODEL:-composer-2}"
EXTRA="${CURSOR_AGENT_EXTRA:-}"

if ! command -v agent >/dev/null 2>&1; then
  echo "error: 'agent' not found. Install Cursor Agent CLI: https://cursor.com/install" >&2
  exit 1
fi

if [[ "$VERBOSE" == "1" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "warning: python3 not found; install Python 3 or set CURSOR_AGENT_VERBOSE=0" >&2
    VERBOSE=0
  elif [[ ! -f "$STREAM_FORMATTER" ]]; then
    echo "warning: missing ${STREAM_FORMATTER}; set CURSOR_AGENT_VERBOSE=0" >&2
    VERBOSE=0
  fi
fi

if [[ -z "$WORKSPACE" ]]; then
  WORKSPACE="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "error: not inside a git repository (set CURSOR_AGENT_WORKSPACE)" >&2
    exit 1
  }
fi

cd "$WORKSPACE"

current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [[ "$PUSH" == "1" && "$current_branch" == "main" ]]; then
  echo "warning: will push to main after each iteration; use a feature branch or CURSOR_AGENT_PUSH=0 if that is not intended." >&2
fi

case "$ITERATIONS" in
'' | *[!0-9]*)
  echo "error: CURSOR_AGENT_ITERATIONS must be a positive integer (got: ${ITERATIONS})" >&2
  exit 1
  ;;
esac
if [[ "$ITERATIONS" -lt 1 ]]; then
  echo "error: CURSOR_AGENT_ITERATIONS must be >= 1" >&2
  exit 1
fi

if [[ "$PUSH" == "1" ]]; then
  PUSH_TEXT="After a successful commit, do not run git push; the host script runs git push immediately after this agent exits."
else
  PUSH_TEXT="Do not run git push."
fi

build_prompt() {
  cat <<EOF
You are working on Geometra, a DOM-free UI framework. Respect CLAUDE.md, FRAMEWORK_NORTH_STAR.md, and .cursor/rules if present.

Single iteration — do exactly one cohesive, meaningful slice of work:

1. Explore the codebase. Read ROADMAP.md, CLAUDE.md, and browse the source in packages/. Understand the architecture and what already exists. If the task touches demo sites, \`create:app\` templates, or starter examples, read AGENTS.md (full-viewport canvas; no extra DOM chrome around Geometra).

2. Decide what to work on. Use this priority order:
   a) Unchecked items in ROADMAP.md (if any remain). Grep the whole file for \`[ ]\` — not only Phase A–C; post-1.0, release polish, and next-frontier blocks use the same pattern. When ROADMAP is all \`[x]\`, still grep ROUTING_COMPETITIVENESS_CHECKLIST.md for any remaining \`[ ]\` lines; when both greps are empty, use ROADMAP "Deferred / research" or the routing doc's sections only as thematic hints (fonts/metrics, hit-test and input, protocol, renderers, demos). The ROADMAP "Deferred / research" subsection has no checkboxes — read it explicitly when everything else is \`[x]\` and you want roadmap-aligned themes. Ignore \`[ ]\` in RELEASE_CHECKLIST.md and v1-release-checklist.md — those are maintainer release steps, not framework backlog.
   b) If nothing is unchecked there either, improve the framework on your own initiative. Examples of valuable work:
      - Add or expand test coverage (unit tests, edge cases, integration tests)
      - Improve performance in hot paths (hit-testing, text measurement, layout, repaint)
      - Harden error handling and edge cases
      - Add missing TypeScript types or tighten existing ones
      - Refactor code for clarity without changing behavior
      - Improve or add JSDoc on public API surfaces
      - Fix any TODO/FIXME/HACK comments in the source
      - Add small, useful features that fit the framework's philosophy
      - Improve the demo site or starter templates (follow AGENTS.md: Geometra owns the page; minimal host HTML)
      Prefer one primary subsystem or package per iteration (e.g. core hit-test, fonts, server protocol); avoid wide drive-by refactors unless the task truly spans boundaries. For hit-test, text input, protocol, or layout/repaint work, align with FRAMEWORK_NORTH_STAR.md (merge checklist: tests where practical, no DOM leaks, no avoidable perf regressions).
      When adding tests without a specific bugfix, prefer extending files already run by root \`package.json\` \`release:gate\` (keeps new coverage in the vetted CI path; only widen the gate when the suite is release-critical). The gate is an explicit file allowlist — \`npm run test\` (vitest.fast) may run additional files that the gate does not; confirm in \`package.json\` rather than assuming. If you widen the gate, grep or read the existing \`vitest run ...\` list first so you do not add a duplicate path (vitest would execute that file twice). Paths are not grouped by package: e.g. \`layout-bounds.test.ts\` may already be the first argv path — search the whole line, not only near related tests.
      When roadmap and routing checklists are fully checked, re-read ROADMAP "Deferred / research" for themes, or target north-star hot paths (hit-test, text measurement, protocol encode/decode, layout/repaint).
      Pick something concrete and high-value. Do NOT say there is nothing to do — there is always room to improve a codebase.

   c) Self-improve this loop: when scripts/cursor-agent-loop.sh — the prompt you are reading or the script's header comments — is stale, misleading, too vague, or omits heuristics that would help later runs pick better tasks and scope work smarter, prefer a minimal, accurate edit to that script if that is higher leverage right now than the next item in (a)/(b). Goal: successive iterations should get better at deciding what to work on and how.

3. Implement with minimal scope: only files and changes required for this one task. Match existing naming, imports (.js extensions), and patterns.

4. Run the repo release gate from the repo root:
   npm run release:gate
   The gate ends with \`bun run test:terminal-input\` (see root package.json) — \`bun\` must be on PATH. If that fails, fix issues and re-run until it passes (or stop with a clear explanation if blocked by environment).

5. If you made real changes: git add only what belongs to this task, then git commit with a conventional message (feat:/fix:/chore:/docs:/test:/perf:/refactor: as appropriate).
   ${PUSH_TEXT}

6. Do not force-push. Do not rewrite published history.

7. End your response with a final line: DONE

${EXTRA}
EOF
}

agent_cmd=(agent -p --trust --workspace "$WORKSPACE")
if [[ "$VERBOSE" == "1" ]]; then
  agent_cmd+=(--output-format stream-json --stream-partial-output)
else
  agent_cmd+=(--output-format text)
fi
if [[ "$FORCE_SHELL" == "1" ]]; then
  agent_cmd+=(--force)
fi
agent_cmd+=(--model "$MODEL")

i=1
while true; do
  if [[ "$i" -gt "$ITERATIONS" ]]; then
    break
  fi

  echo "=== cursor-agent-loop: iteration $i of ${ITERATIONS} ===" >&2
  prompt="$(build_prompt)"
  agent_status=0
  if [[ "$VERBOSE" == "1" ]]; then
    set +e
    "${agent_cmd[@]}" "$prompt" | python3 "$STREAM_FORMATTER"
    pipe_statuses=("${PIPESTATUS[@]}")
    set -e
    agent_status=${pipe_statuses[0]}
    fmt_status=${pipe_statuses[1]:-0}
    if [[ "$fmt_status" -ne 0 ]]; then
      echo "error: stream formatter exited non-zero ($fmt_status) on iteration $i" >&2
      exit "$fmt_status"
    fi
  fi
  if [[ "$VERBOSE" != "1" ]]; then
    set +e
    "${agent_cmd[@]}" "$prompt"
    agent_status=$?
    set -e
  fi
  if [[ "$agent_status" -ne 0 ]]; then
    echo "error: agent exited non-zero ($agent_status) on iteration $i" >&2
    exit "$agent_status"
  fi

  if [[ "$PUSH" == "1" ]]; then
    git push
  fi

  i=$((i + 1))
done

echo "=== cursor-agent-loop: finished ${ITERATIONS} iteration(s) ===" >&2
