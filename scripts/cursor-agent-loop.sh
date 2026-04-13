#!/usr/bin/env bash
# Re-exec under bash when invoked as `sh` (often dash on Linux). This script uses
# bash-only syntax ([[, arrays, PIPESTATUS, BASH_SOURCE).
if [ -z "${BASH_VERSION+x}" ]; then
  exec /usr/bin/env bash "$0" "$@"
fi

# Drive Cursor Agent CLI in a loop (non-interactive). Each iteration is one agent
# session that explores the codebase, picks the next best improvement, implements
# it, runs the release gate, commits when there are real changes, and pushes only
# if that iteration created a new commit (HEAD advanced). Default: composer-2 (falls back to auto if unavailable), 100 iterations.
#
# Task selection (humans/agents): find unchecked Markdown boxes in ROADMAP.md (Phase A–C, post-1.0 plans,
# release polish, next frontier) and in ROUTING_COMPETITIVENESS_CHECKLIST.md (repo root, next to ROADMAP —
# not under packages/router). Prefer a **line-anchored** task
# pattern so you target GitHub-style unchecked items, not accidental substring matches:
#   rg '^- \[ \]' ROADMAP.md ROUTING_COMPETITIVENESS_CHECKLIST.md
#   grep -E '^- \[ \]' ROADMAP.md   # portable; add the second file as needed
# Ripgrep may be absent from PATH (shell exit 127 — "command not found"). That is not the same as zero
# matching lines; use `grep -E` or `grep -F '- [ ]'` with the same anchored patterns instead.
# Nested list items indent the bullet (`  - [ ]` under a parent). Those do not match `^- \[ \]`; use optional
# leading whitespace, e.g. `rg '^[[:space:]]*- \[ \]' ROADMAP.md ROUTING_COMPETITIVENESS_CHECKLIST.md` (or
# `grep -E '^[[:space:]]*- \[ \]'`), when you expect sub-list checkboxes or want a single pass over every task checkbox.
# Default `grep` without `-E` uses BRE where `[` starts a bracket expression — do not copy `grep '^- \[ \]'`
# without `-E` / `rg` / `grep -F` or you can get false negatives or surprising matches on macOS/BSD.
# A bare `[ ]` (unanchored) in regex is a one-space character class and matches ordinary prose; that is not
# the checkbox search. Likewise `rg '\[ \]'` without `^-\s*` is still easy to misread — anchor on `- [ ]`.
# Zero matching lines from those greps is normal when everything is checked — not a broken search; continue to
# deferred themes / north-star buckets (step 2b) instead of retrying or assuming the repo has "no roadmap".
# External agent prompts sometimes say to grep raw `[ ]` anywhere in ROADMAP — that is still the same footgun:
# without a leading `-` anchor, `[ ]` is often parsed as a one-space character class, not a Markdown checkbox.
# Always interpret "unchecked roadmap items" as line-anchored list checkboxes (`- [ ]` / `^- \[ \]`), never prose.
# Both trackers may already be all `[x]` — that only means unchecked checkbox backlog is exhausted there,
# not that the repo is "done". ROADMAP "Deferred / research" uses plain bullets (no `- [ ]`), so an empty
# roadmap grep does not mean no roadmap-backed themes — read that subsection when casting next work (RTL through
# Textura, animation beyond helpers, extra render targets). In-repo anchors: Textura `direction` / per-node `dir`
# and tests in packages/textura/src/__tests__/compute-layout.test.ts; `RTL_PARITY_MATRIX.md` (repo root) for RTL
# parity across paths; core animation helpers under packages/core;
# WebGPU geometry consumer under packages/renderer-webgpu. Otherwise prefer one scoped change under
# packages/ (tests, perf in hit-test/text/layout paths, types, public JSDoc, or
# `rg 'TODO|FIXME|HACK' packages`; a clean TODO grep is normal — pick a north-star bucket anyway).
# `vitest.fast.config.ts` (used by `npm run test` / quality.yml "Fast tests") includes only
# `packages/*/src/__tests__/**/*.test.ts`. Tests colocated as `packages/<pkg>/src/*.test.ts` are skipped by
# that glob until moved under `src/__tests__/` (or the include pattern is intentionally widened).
# The same config **excludes** several slow suites via `test.exclude` (e.g. core `fonts.test.ts`,
# `virtual-scroll.test.ts`, `perf-smoke.test.ts`, server `protocol-perf-smoke.test.ts`) — `npm run test`
# omits those even when `release:gate` runs them explicitly. Do not treat a green fast test run as a
# substitute for `release:gate` when editing fonts, virtual scroll, or perf-smoke surfaces.
# `vitest -t` on a lone test in files that combine `createApp` (awaits `textura.init()` / WASM) with
# `vi.useFakeTimers()` can hang: fake clocks block timer-driven init. Run the whole file or `release:gate`
# instead of assuming an isolated filtered test proves the case.
# Root `npm run release:gate` allowlists specific vitest entry files (see package.json), not every
# `packages/*/src/__tests__/**/*.test.ts` that `npm run test` / vitest.fast.config.ts includes — a file
# passing `vitest.fast` does not imply it runs in CI gate; check package.json before assuming coverage ships.
# `verify-release-gate.mjs` requires exactly one `vitest run` substring in `scripts.release:gate` (one batch);
# do not split the allowlist across `vitest run ... && vitest run ...` — duplicate-path checks only apply per argv list.
# Before appending a path to the gate script, confirm it is not already listed (duplicate paths make
# vitest run the same file twice). Scan the whole `scripts.release:gate` string — paths are not strictly
# ordered, so a file can appear early in the vitest argv list while you only eyeball a later segment.
# Example: `packages/core/src/__tests__/layout-bounds.test.ts` is often the *first* vitest path (before
# keyboard.test.ts); inserting it again after keyboard duplicates the entry and fails verify-release-gate.mjs.
# `verify-release-gate.mjs` also resolves paths canonically, so `packages/a/../b/x.test.ts` counts as the same
# file as `packages/b/x.test.ts` for duplicate detection. Gate paths must use forward slashes only (backslashes rejected).
# The same script enforces a **required** subset of the allowlist (do not drop these when editing `release:gate`):
# `packages/core/src/__tests__/geometry-snapshot-ci.test.ts`, `layout-bounds.test.ts`, and `hit-test.test.ts`
# (geometry CI, shared layout invariants, hit routing — see `requiredVitestAllowlistPaths` in verify-release-gate.mjs).
# The verifier also requires exactly one `bun run test:terminal-input` in the gate string and that the first
# `&&` segment runs `verify-release-gate.mjs` (fail-fast before vitest; no duplicate terminal suites).
# `npm run release:gate` runs `scripts/release/verify-release-gate.mjs`
# first to fail fast on duplicates/missing paths and to ensure `test:terminal-input` is the final `&&` segment
# in package.json (nothing may run after the demo-terminal input suite), then the vitest allowlist, then
# `bun run test:terminal-input`
# (@geometra/demo-terminal). The gate fails if `bun` is missing from PATH even when Node/npm work — install Bun or run
# only the vitest segment locally when debugging. The allowlist evolves; read package.json instead of copying examples
# from older prompts or transcripts.
# Commit hygiene for autonomous runs: `git add -A` from a dirty workspace can sweep unrelated files into the
# iteration commit — prefer `git status` first, then `git add <paths>` listing only this task’s files (same idea as
# the built-in loop prompt’s step 5).
# After hand-editing `scripts.release:gate` in package.json, run `node scripts/release/verify-release-gate.mjs` from the
# repo root to validate the vitest argv (duplicate paths, `..` escapes, forward slashes) without waiting for the full
# vitest batch — same verifier as the first `&&` segment of `npm run release:gate`.
# CI runs the same gate: `.github/workflows/quality.yml` invokes `bun run release:gate` after lint, fast tests
# (`bun run test` / vitest.fast.config.ts), `bun run build`, `bun run benchmark:mcp-flow:all -- --assert`,
# `bun run examples:smoke`, and `bun run e2e:demo`. When editing MCP benchmark scripts or harness expectations,
# run that benchmark locally (or the relevant `benchmark:mcp-*` variant), not only `release:gate`.
# Root `bun run build` also runs `cd mcp && npm run build` (see root package.json). Changes under `mcp/` need that
# build step — `release:gate` alone does not compile the MCP package.
# A green `release:gate` alone does not imply those steps passed — re-run the relevant ones when touching demos,
# create:app templates, examples tooling, or Playwright-covered demo flows.
# Extend an allowlisted file when adding release-critical tests unless you intentionally widen the gate.
# Layout/Yoga geometry regression: use `packages/core/src/__tests__/geometry-snapshot-ci.test.ts` (gate-listed)
# and `GEOMETRY_SNAPSHOT_TESTING.md`; avoid unrelated snapshot churn unless widening the gate on purpose.
# Demos and starter output: read `AGENTS.md` — Geometra should own the full viewport; no marketing DOM shells
# or extra chrome around the canvas; diagnostics belong in-tree, not adjacent HTML panels.
# Edits to scripts/create-geometra-app.mjs or templates it emits: run `npm run create:app:smoke` from repo root
# before commit (scaffold file checks; not part of release:gate).
# Interaction / protocol / renderer changes: skim `FRAMEWORK_NORTH_STAR.md` merge checklist (DOM-free invariants,
# input tests, perf hot paths, docs accuracy) before shipping.
# Ignore `[ ]` in RELEASE_CHECKLIST.md / v1-release-checklist.md
# (maintainer release steps, not framework backlog).
# A few `packages/*/src/__tests__/**/*.test.ts` files stay outside `release:gate` on purpose (browser/visual
# canvas suites, long server stress/integration): e.g. renderer-canvas `browser-client`, `input-forwarding`,
# `visual-regression`; server `server-rapid-update-integration`, `server-transport-stress`. Compare `find
# packages -path '*/src/__tests__/*.test.ts'` to package.json `release:gate` argv when unsure; run vitest on
# those paths locally when editing those surfaces.
#
# Prerequisites:
#   - Cursor Agent CLI: https://cursor.com/install (`agent` on PATH)
#   - Auth: `agent login` or CURSOR_API_KEY
#   - For push: a configured remote; new branches may need `git push -u origin HEAD` once so `git push` succeeds
#
# Environment (optional):
#   CURSOR_AGENT_ITERATIONS   Max agent runs (default: 100). Lower for a short run, e.g. CURSOR_AGENT_ITERATIONS=3.
#   CURSOR_AGENT_PUSH         If 1, run git push after an iteration only when that iteration created a new commit (default: 1). Set to 0 to never push from this script.
#   CURSOR_AGENT_FORCE_SHELL  If 1, pass --force so the agent can run shell without per-command approval (default: 1). Set to 0 for safer approval prompts. --force allows arbitrary commands: use a dedicated branch and review diffs.
#   CURSOR_AGENT_WORKSPACE    Repo root (default: git top-level from current directory).
#   CURSOR_AGENT_MODEL        Passed as --model to agent (default: composer-2, falls back to auto if composer-2 is unavailable). Override e.g. composer-2-fast.
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
_default_model="composer-2"
if [[ -z "${CURSOR_AGENT_MODEL:-}" ]]; then
  # Check whether composer-2 appears in the model list; fall back to auto if not.
  if agent --list-models 2>/dev/null | grep -q '^composer-2 '; then
    _default_model="composer-2"
  else
    echo "info: composer-2 not available; falling back to auto" >&2
    _default_model="auto"
  fi
fi
MODEL="${CURSOR_AGENT_MODEL:-$_default_model}"
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
  echo "warning: will push to main when an iteration creates a new commit; use a feature branch or CURSOR_AGENT_PUSH=0 if that is not intended." >&2
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
  PUSH_TEXT="After a successful commit, do not run git push; the host script runs git push after this agent exits only if this iteration created a new commit (it compares HEAD before/after)."
else
  PUSH_TEXT="Do not run git push."
fi

build_prompt() {
  cat <<EOF
You are working on Geometra, a DOM-free UI framework. Respect CLAUDE.md, FRAMEWORK_NORTH_STAR.md, and .cursor/rules if present.

Single iteration — do exactly one cohesive, meaningful slice of work:

1. Explore the codebase. Read ROADMAP.md, CLAUDE.md, and browse the source in packages/. Understand the architecture and what already exists. If the task touches demo sites, \`create:app\` templates, or starter examples, read AGENTS.md (full-viewport canvas; no extra DOM chrome around Geometra).

2. Decide what to work on. Use this priority order:
   a) Unchecked items in ROADMAP.md (if any remain). Find Markdown **task** checkboxes with a line-anchored pattern, e.g. \`rg '^- \\[ \\]' ROADMAP.md\` or \`grep -E '^- \\[ \\]' ROADMAP.md\` — not only Phase A–C; post-1.0, release polish, and next-frontier blocks use the same \`- [ ] / - [x]\` shape. Indented nested items (e.g. under a parent bullet in ROUTING_COMPETITIVENESS_CHECKLIST.md) need optional leading whitespace: \`rg '^[[:space:]]*- \\[ \\]' FILE.md\`. (**Do not** use a bare \`[ ]\` regex: in common engines that is a one-space character class and matches almost every line, not an unchecked box.) **Do not** use plain \`grep\` without \`-E\` for this pattern: default BRE treats \`[\` as starting a bracket expression; use \`grep -E\`, \`rg\`, or \`grep -F '- [ ]'\` if you truly need fixed-string matching. If \`rg\` is not installed (shell exit 127), use \`grep -E\` / \`grep -F\` with the same patterns — a missing binary is not "no unchecked items". When ROADMAP is all \`[x]\`, run the same search on \`ROUTING_COMPETITIVENESS_CHECKLIST.md\` at the **repository root** (same directory as ROADMAP; not \`packages/router\`) — include the nested pattern if you expect sub-list checkboxes. When both return no unchecked lines, that means backlog checkboxes there are exhausted (expected), not a broken search — proceed to ROADMAP "Deferred / research" or routing sections as thematic hints (fonts/metrics, hit-test and input, protocol, renderers, demos), or to 2b. The ROADMAP "Deferred / research" subsection has no checkboxes — read it explicitly when everything else is \`[x]\` and you want roadmap-aligned themes. Skip maintainer-only release files for backlog: ignore unchecked lines in RELEASE_CHECKLIST.md and v1-release-checklist.md.
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
      When adding tests without a specific bugfix, prefer extending files already run by root \`package.json\` \`release:gate\` (keeps new coverage in the vetted CI path; only widen the gate when the suite is release-critical). The gate is an explicit file allowlist — \`npm run test\` (vitest.fast) may run additional files that the gate does not; confirm in \`package.json\` rather than assuming. If you widen the gate, grep or read the existing \`vitest run ...\` list first so you do not add a duplicate path (vitest would execute that file twice). Paths are not grouped by package: e.g. \`layout-bounds.test.ts\` may already be the first argv path — search the whole line, not only near related tests. \`scripts/release/verify-release-gate.mjs\` also enforces that \`geometry-snapshot-ci.test.ts\`, \`layout-bounds.test.ts\`, and \`hit-test.test.ts\` remain in the allowlist (do not drop them when trimming \`release:gate\`).
      When roadmap and routing checklists are fully checked, re-read ROADMAP "Deferred / research" for themes, or target north-star hot paths (hit-test, text measurement, protocol encode/decode, layout/repaint).
      Pick something concrete and high-value. Do NOT say there is nothing to do — there is always room to improve a codebase.

   c) Self-improve this loop: when scripts/cursor-agent-loop.sh — the prompt you are reading or the script's header comments — is stale, misleading, too vague, or omits heuristics that would help later runs pick better tasks and scope work smarter, prefer a minimal, accurate edit to that script if that is higher leverage right now than the next item in (a)/(b). Goal: successive iterations should get better at deciding what to work on and how.

3. Implement with minimal scope: only files and changes required for this one task. Match existing naming, imports (.js extensions), and patterns. If you changed \`scripts/create-geometra-app.mjs\` or starter templates it generates, run \`npm run create:app:smoke\` from the repo root before commit (not in release:gate).

4. Run the repo release gate from the repo root:
   npm run release:gate
   The gate ends with \`bun run test:terminal-input\` (see root package.json) — \`bun\` must be on PATH. If that fails, fix issues and re-run until it passes (or stop with a clear explanation if blocked by environment).
   If you edited \`scripts.release:gate\` in package.json, run \`node scripts/release/verify-release-gate.mjs\` first to catch duplicate/malformed vitest paths before the long vitest batch (same check as the first \`&&\` segment of the gate).
   CI (\`.github/workflows/quality.yml\`) also runs lint, fast tests, build, \`benchmark:mcp-flow:all -- --assert\`, examples:smoke, and e2e:demo before this gate; when your change touches demos, \`create:app\`, examples scripts, demo E2E surfaces, or MCP benchmark scripts / harness expectations, run the matching subset locally (not only the gate).

5. If you made real changes: git add only what belongs to this task, then git commit with a conventional message (feat:/fix:/chore:/docs:/test:/perf:/refactor: as appropriate).
   Prefer \`git status\` first, then \`git add <file...>\` with explicit paths (avoid \`git add -A\` when the workspace has unrelated edits that must not ship in this commit).
   ${PUSH_TEXT}

6. Do not force-push. Do not rewrite published history.

7. End your response with a final line: DONE

${EXTRA}
EOF
}

agent_base_cmd=(agent -p --trust --workspace "$WORKSPACE")
if [[ "$VERBOSE" == "1" ]]; then
  agent_base_cmd+=(--output-format stream-json --stream-partial-output)
else
  agent_base_cmd+=(--output-format text)
fi
if [[ "$FORCE_SHELL" == "1" ]]; then
  agent_base_cmd+=(--force)
fi

# Run the agent with a given model. Sets $agent_status and $agent_output.
# Captures both stdout and stderr so usage-limit messages (which the CLI
# prints to stderr) can be detected for auto-fallback.
# Usage: run_agent <model> <prompt>
run_agent() {
  local model="$1" prompt="$2"
  local cmd=("${agent_base_cmd[@]}" --model "$model")
  local tmpout
  tmpout="$(mktemp)"
  agent_output=""
  agent_status=0
  if [[ "$VERBOSE" == "1" ]]; then
    set +e
    "${cmd[@]}" "$prompt" 2>&1 | tee "$tmpout" | python3 "$STREAM_FORMATTER"
    pipe_statuses=("${PIPESTATUS[@]}")
    set -e
    agent_status=${pipe_statuses[0]}
    local fmt_status=${pipe_statuses[1]:-0}
    # formatter may exit non-zero on malformed JSON from a usage error — not fatal
    if [[ "$agent_status" -eq 0 && "$fmt_status" -ne 0 ]]; then
      echo "error: stream formatter exited non-zero ($fmt_status)" >&2
      exit "$fmt_status"
    fi
  else
    set +e
    "${cmd[@]}" "$prompt" > "$tmpout" 2>&1
    agent_status=$?
    set -e
    cat "$tmpout"
  fi
  agent_output="$(cat "$tmpout")"
  rm -f "$tmpout"
}

i=1
while true; do
  if [[ "$i" -gt "$ITERATIONS" ]]; then
    break
  fi

  echo "=== cursor-agent-loop: iteration $i of ${ITERATIONS} ===" >&2
  head_before="$(git rev-parse HEAD)"
  prompt="$(build_prompt)"

  run_agent "$MODEL" "$prompt"

  # If the model hit a usage limit, retry with auto (unless already auto).
  if [[ "$agent_status" -ne 0 && "$MODEL" != "auto" ]]; then
    if printf '%s' "$agent_output" | grep -qi 'out of usage\|increase your limit\|switch to auto'; then
      echo "info: $MODEL out of usage on iteration $i; retrying with auto" >&2
      run_agent "auto" "$prompt"
    fi
  fi

  if [[ "$agent_status" -ne 0 ]]; then
    echo "error: agent exited non-zero ($agent_status) on iteration $i" >&2
    exit "$agent_status"
  fi

  # The agent is instructed to commit after a successful release:gate. A clean tree
  # is the usual success signal; dirty state often means a missed add/commit or WIP.
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    echo "warning: working tree still dirty after agent exit 0 (iteration $i); review git status before continuing." >&2
  fi

  head_after="$(git rev-parse HEAD)"
  if [[ "$PUSH" == "1" && "$head_before" != "$head_after" ]]; then
    git push
  fi

  let i+=1
done

echo "=== cursor-agent-loop: finished ${ITERATIONS} iteration(s) ===" >&2
