# Geometra MCP Agent Model

Geometra MCP is designed to expose UI in a way that is cheap for an LLM to reason about.

Instead of giving the model a screenshot, raw HTML, or a large browser accessibility dump, it exposes:

- a **summary-first page model**
- **stable ids** for sections and nodes
- **on-demand section expansion**
- **compact visible-node snapshots**
- **semantic deltas after actions**

This is what keeps token usage low while still preserving enough structure to act on the page.

## At A Glance

```text
                 Native Geometra app
                        |
                        v
                    GEOM v1 WS
                        ^
                        |
Normal webpage -> @geometra/proxy (CLI or MCP-spawned) -> Chromium (headed by default)
                        |
                        v
                 +----------------+
                 | @geometra/mcp  |
                 +----------------+
                        |
        +---------------+------------------+
        |               |                  |
        v               v                  v
  page_model      expand_section      snapshot/query
  (cheap map)     (one section)       (precise target)
        \               |                  /
         \              |                 /
          +-------------+----------------+
                        |
                        v
       click / type / set_checked / wheel / upload / select
                        |
                        v
                 semantic delta
                 (what changed)
```

## Auto-start proxy (`pageUrl`)

For real web pages, prefer **`geometra_connect({ pageUrl: "https://…" })`**. The MCP server spawns **`@geometra/proxy`** (bundled), waits until the WebSocket is listening, then connects. You do **not** need a separate terminal command or a `ws://` URL.

Use **`geometra_connect({ url: "ws://…" })`** only when you already have a Geometra server or a manually started proxy.

**IDE prompts:** Some clients ask the user to approve each MCP tool invocation or “sensitive” parameters. That policy lives in **Cursor / Claude Desktop / etc.** — the Geometra server cannot disable it. Using `pageUrl` avoids an *extra* approval for running a shell command to start the proxy and avoids typing a local `ws://` URL.

## Mental Model

Geometra MCP does **not** treat the page as "browser internals the model must interpret".

It treats the page as:

- **semantics**: what kind of things exist
- **geometry**: where those things are
- **sections**: which parts of the page matter
- **changes**: what happened after an action

The goal is to let the model answer:

1. What kind of page is this?
2. What are the important sections?
3. Which section should I inspect?
4. What changed after my last action?

## Native vs Proxy

There are 2 ways to use Geometra MCP:

- **Native Geometra**: a Geometra app streams its own tree + layout over GEOM v1.
- **Geometra proxy**: Chromium + Playwright load a normal webpage, extract DOM geometry and semantics, and translate that into the same GEOM v1 protocol.

In both cases, the MCP tool contract is the same.

The low-token behavior comes from the **MCP layer and protocol shape**, not from a different browser engine.

## Why Token Usage Can Be Lower

### 1. Summary first

`geometra_page_model` returns a small page summary instead of a full nested tree.

It includes things like:

- page archetypes
- counts of landmarks/forms/dialogs/lists
- stable section ids
- top-level sections
- a few primary actions

This is meant for **orientation**, not detailed inspection.

### 2. Expand only the section you need

`geometra_expand_section` turns one section id into a richer payload.

Typical pattern:

1. `geometra_page_model`
2. pick the form/dialog/list you care about
3. `geometra_expand_section({ id: ... })`

This avoids paying for every section on the page up front.

### 3. Stable ids instead of repeated structure

Sections use stable ids like:

- `fm:...` for forms
- `dg:...` for dialogs
- `ls:...` for lists
- `lm:...` for landmarks

Nodes use ids like:

- `n:...`

This means later tool calls can refer to ids instead of repeatedly sending large paths or rediscovering the same subtree.

### 4. Compact visible-node snapshot as a fallback

`geometra_snapshot` defaults to a compact, minified JSON view of viewport-visible actionable nodes.

This is useful when the whole visible UI matters more than page sections.

### 5. Semantic deltas after actions

After clicks, typing, wheel events, uploads, etc., the MCP tries to return **what changed**:

- dialog opened/closed
- form appeared/removed
- list item counts changed
- named/focusable nodes changed

That keeps multi-step flows smaller than repeatedly asking for a full fresh snapshot.

### 6. Use field-native fills when the task is obviously a form

`geometra_fill_fields` is the preferred primitive when the next step is “fill this form”, not “drive these exact controls”.

Use it for labeled:

- text fields
- selects / comboboxes / radio-style questions (`fieldLabel + answer`)
- individually labeled checkboxes / radios
- labeled file uploads

This keeps the agent at the field-intent level and avoids repeated control-specific micro-decisions.

When the page is long and the text payload is large, keep `detail: "minimal"` so Geometra returns compact structured step results instead of verbose action narration.

### 7. Batch obvious multi-step flows

`geometra_run_actions` exists for longer predictable workflows where you need to mix navigation, waits, and field entry in one MCP round trip.

It complements `page_model` / `expand_section`; it does not replace them.

For token-sensitive automation loops, add `includeSteps: false` so the response is mostly aggregate status plus the final validation/state payload.

### 8. Query only when you know the target

`geometra_query` is the precise lookup step:

- by `id`
- by `role`
- by `name`
- by `text`

Use it when you already know what you are looking for and want exact bounds.

## Recommended Agent Loop

For most DOM-heavy pages, the best order is:

1. `geometra_connect`
2. `geometra_page_model`
3. `geometra_expand_section` for one important section if needed
4. `geometra_query` or `geometra_wait_for`
5. `geometra_fill_fields` when the task is straightforward field entry
6. `geometra_run_actions` for predictable mixed flows, otherwise a single action tool (`geometra_click`, `geometra_type`, etc.)
7. consume the returned semantic delta / terse state summary

Use `geometra_snapshot` compact when:

- the page is simple
- the whole visible viewport matters
- you want a cheap global fallback

Use `geometra_snapshot({ view: "full" })` only for deeper debugging.

Action tools default to terse summaries. Use `detail: "verbose"` when you need a fuller fallback view for debugging.

For the lowest-token batch pattern:

1. `geometra_fill_fields` or `geometra_run_actions`
2. `detail: "minimal"`
3. `includeSteps: false`
4. inspect the returned `final.invalidCount`, `final.alertCount`, and any sampled `invalidFields`

## Headed vs Headless

The **MCP server itself does not launch the browser**, so it does not have its own "headless/headed" mode.

That choice belongs to **`@geometra/proxy`**.

Default:

- `geometra-proxy` runs **headed** (real visible Chromium) so you can watch automation.

For CI or hosts without a display, use **`--headless`** or set **`GEOMETRA_HEADLESS=1`**.

Optional pacing for demos: **`--slow-mo <ms>`** (or **`GEOMETRA_SLOW_MO`**) adds Playwright `slowMo` so clicks/typing are easier to follow.

```bash
npx geometra-proxy https://example.com --port 3200
npx geometra-proxy https://example.com --port 3200 --headless
```

or from this repo:

```bash
node packages/proxy/dist/index.js https://example.com --port 3200
node packages/proxy/dist/index.js https://example.com --port 3200 --headless
```

### Does headed mode affect token usage?

Usually, **not materially**.

Token usage is driven mostly by:

- which MCP tools are called
- how much JSON/text they return
- whether you use summary-first flow vs large snapshots

The browser being visible or hidden does **not** meaningfully change the size of the returned MCP payloads.

What headed mode can affect:

- page timing
- focus/animation behavior on some sites
- debugging convenience for humans

So headed mode is mainly a **debugging / observability** choice, not a token-optimization setting.

## Limits

This model works best on DOM-heavy apps:

- forms
- dashboards
- settings pages
- CRUD/admin UIs
- search/results pages
- many job applications

It is less effective on:

- canvas / WebGL apps
- rich editors
- maps / games
- heavy anti-bot / captcha flows

## Takeaway

Geometra MCP keeps token usage low by sending:

- **small summaries first**
- **detail only on demand**
- **stable ids for reuse**
- **deltas instead of repeated full state**

The proxy still uses Playwright under the hood for normal webpages, but the model sees a more agent-friendly, token-aware protocol.
