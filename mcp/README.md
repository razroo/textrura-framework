# @geometra/mcp

MCP server for [Geometra](https://github.com/razroo/geometra) — interact with running Geometra apps via the geometry protocol over WebSocket. For **native** Geometra apps there is no browser in the loop. For **any existing website**, use **`geometra_connect` with `pageUrl`** — the MCP server starts [`@geometra/proxy`](../packages/proxy/README.md) for you (bundled dependency) so you do not need a separate terminal or a `ws://` URL. You can still pass `url: "ws://…"` if a proxy is already running, and if you accidentally pass `https://…` in `url`, MCP will treat it as `pageUrl` and auto-start the proxy.

See [`AGENT_MODEL.md`](./AGENT_MODEL.md) for the MCP mental model, why token usage can be lower than large browser snapshots, and how headed vs headless proxy mode works.

## What this does

Connects Claude Code, Codex, or any MCP-compatible AI agent to a WebSocket endpoint that streams `frame` / `patch` messages. The agent gets structured `{ x, y, width, height }` geometry and semantic metadata for every UI node — not screenshots, not a vision model.

```
Playwright + vision:  screenshot → model → guess coordinates → click → repeat
Native Geometra:      WebSocket → JSON geometry (no browser on the agent path)
Geometra proxy:       Chromium → DOM geometry → same WebSocket as native → MCP tools unchanged (often started via `pageUrl`, no manual CLI)
```

## Tools

| Tool | Description |
|---|---|
| `geometra_connect` | Connect with `url` (ws://…) **or** `pageUrl` (https://…) to auto-start geometra-proxy; `url: "https://…"` is auto-coerced onto the proxy path |
| `geometra_query` | Find elements by stable id, role, name, text content, ancestor/prompt context, current value, or semantic state such as `invalid`, `required`, or `busy` |
| `geometra_wait_for` | Wait for a semantic condition instead of guessing sleeps (`busy`, `disabled`, alerts, values, etc.) |
| `geometra_form_schema` | Compact, fill-oriented form schema with stable field ids and collapsed radio/button groups |
| `geometra_fill_form` | Fill a form from `valuesById` / `valuesByLabel` in one MCP call; preferred low-token happy path for standard forms |
| `geometra_fill_fields` | Fill labeled text/choice/toggle/file fields in one MCP call; can return final-only status for the smallest responses |
| `geometra_run_actions` | Execute a batch of high-level actions in one MCP round trip and get one consolidated result, with optional final-only output |
| `geometra_page_model` | Summary-first webpage model: archetypes, stable section ids, counts, top-level sections, primary actions |
| `geometra_expand_section` | Expand one form/dialog/list/landmark from `geometra_page_model` on demand, with paging/filtering for long sections |
| `geometra_reveal` | Scroll until a matching node is visible instead of guessing wheel deltas |
| `geometra_click` | Click an element by coordinates |
| `geometra_type` | Type text into the focused element |
| `geometra_key` | Send special keys (Enter, Tab, Escape, arrows) |
| `geometra_upload_files` | Attach files: labeled field / auto / hidden input / native chooser / synthetic drop (`@geometra/proxy` only) |
| `geometra_pick_listbox_option` | Pick an option from a custom dropdown/searchable combobox; can open by field label (`@geometra/proxy` only) |
| `geometra_select_option` | Choose an option on a native `<select>` (`@geometra/proxy` only) |
| `geometra_set_checked` | Set a checkbox or radio by label instead of coordinate clicks (`@geometra/proxy` only) |
| `geometra_wheel` | Mouse wheel / scroll (`@geometra/proxy` only) |
| `geometra_snapshot` | Default **compact**: flat viewport-visible actionable nodes (minified JSON). `view=full` for nested tree |
| `geometra_layout` | Raw computed geometry for every node |
| `geometra_disconnect` | Close the connection |

## Setup

<details>
<summary>Claude Code</summary>

**One-line install:**
```bash
claude mcp add geometra -- npx -y @geometra/mcp
```

**Uninstall:**
```bash
claude mcp remove geometra
```

Or manually add to `.mcp.json` (project-level) or `~/.claude/settings.json` (global):
```json
{
  "mcpServers": {
    "geometra": {
      "command": "npx",
      "args": ["-y", "@geometra/mcp"]
    }
  }
}
```

To uninstall manually, remove the `geometra` entry from the config file.

</details>

<details>
<summary>Claude Desktop</summary>

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "geometra": {
      "command": "npx",
      "args": ["-y", "@geometra/mcp"]
    }
  }
}
```

To uninstall, remove the `geometra` entry from the config file.

</details>

<details>
<summary>OpenAI Codex</summary>

Add to your Codex MCP configuration:

```json
{
  "mcpServers": {
    "geometra": {
      "command": "npx",
      "args": ["-y", "@geometra/mcp"]
    }
  }
}
```

To uninstall, remove the `geometra` entry from the config file.

</details>

<details>
<summary>Cursor</summary>

Open Settings → MCP → Add new MCP server, or add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "geometra": {
      "command": "npx",
      "args": ["-y", "@geometra/mcp"]
    }
  }
}
```

To uninstall, remove the entry from MCP settings.

</details>

<details>
<summary>Windsurf</summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "geometra": {
      "command": "npx",
      "args": ["-y", "@geometra/mcp"]
    }
  }
}
```

To uninstall, remove the entry from the config file.

</details>

<details>
<summary>VS Code / Copilot</summary>

**One-line install:**
```bash
code --add-mcp '{"name":"geometra","command":"npx","args":["-y","@geometra/mcp"]}'
```

Or add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "geometra": {
      "command": "npx",
      "args": ["-y", "@geometra/mcp"]
    }
  }
}
```

To uninstall, remove the entry from MCP settings or delete the server from the MCP panel.

</details>

<details>
<summary>Other MCP clients</summary>

Any MCP client that supports stdio transport can use Geometra. The server config is:

```json
{
  "command": "npx",
  "args": ["-y", "@geometra/mcp"]
}
```

To uninstall, remove the server entry from your client's MCP configuration.

</details>

### From source (this repo)

```bash
cd mcp
npm install
npm run build
claude mcp add geometra -- node ./dist/index.js
```

## Usage

### Native Geometra server

```bash
cd demos/server-client
npm run server  # starts on ws://localhost:3100
```

### Any web app (Geometra proxy)

**Preferred path for agents:** call `geometra_connect({ pageUrl: "https://…" })` and let MCP spawn the proxy for you on an ephemeral local port. The manual CLI below is still useful for debugging or when you want to inspect the proxy directly.

In one terminal, serve or open a page (example uses the repo sample):

```bash
cd demos/proxy-mcp-sample
python3 -m http.server 8080
```

In another terminal (from repo root after `npm install` / `bun install` and `bun run build`):

```bash
npx geometra-proxy http://localhost:8080 --port 3200
# Requires Chromium: npx playwright install chromium
```

`geometra-proxy` opens a **visible Chromium window by default**. For servers or CI, pass **`--headless`** or set **`GEOMETRA_HEADLESS=1`**. Optional **`--slow-mo <ms>`** slows Playwright actions so they are easier to watch. Headed vs headless usually does **not** materially change token usage, since token usage is driven by MCP tool output rather than whether Chromium is visible.

Point MCP at `ws://127.0.0.1:3200` instead of a native Geometra server. The proxy translates clicks and keyboard messages into Playwright actions and streams updated geometry.

Then in Claude Code (either backend):

```
> Connect to my Geometra app at ws://localhost:3100 and tell me what's on screen

> Give me the page model first, then expand the main form

> Click the "Submit" button

> Type "hello@example.com" into the email input

> Take a snapshot and check if the dialog is visible
```

## Example: agent testing a signup form (native server)

```
Agent:  geometra_connect({ url: "ws://localhost:3100" })
        → Connected. UI: button "Sign Up", textbox "Email", textbox "Password"

Agent:  geometra_query({ role: "textbox", name: "Email" })
        → [{ role: "textbox", name: "Email", bounds: {x:100, y:200, w:300, h:40}, center: {x:250, y:220} }]

Agent:  geometra_click({ x: 250, y: 220 })
        → Clicked. Email input focused.

Agent:  geometra_type({ text: "test@example.com" })
        → Typed. Email field updated.

Agent:  geometra_query({ role: "button", name: "Sign Up" })
        → [{ role: "button", name: "Sign Up", bounds: {x:100, y:350, w:120, h:44}, center: {x:160, y:372} }]

Agent:  geometra_click({ x: 160, y: 372 })
        → Clicked. Success message visible.
```

No screenshots and no vision model in the loop. JSON in, JSON out.

## Example: static HTML via `@geometra/proxy`

With `python3 -m http.server 8080` in `demos/proxy-mcp-sample` and `npx geometra-proxy http://localhost:8080 --port 3200` running:

```
Agent:  geometra_connect({ url: "ws://127.0.0.1:3200" })
        → Connected. UI includes textbox "Email", button "Save", …

Agent:  geometra_form_schema({})
        → {"forms":[{"formId":"fm:1.0","fields":[{"id":"ff:1.0.0","label":"Email"}, ...]}]}

Agent:  geometra_fill_form({
          formId: "fm:1.0",
          valuesByLabel: { "Email": "hello@example.com" },
          failOnInvalid: true
        })
        → {"completed":true,"successCount":1,"errorCount":0,"final":{"invalidCount":0,...}}

Agent:  geometra_query({ role: "button", name: "Save" })
        → Click center to submit the sample form; status text updates in the DOM
```

## How it works

1. The MCP server connects to a WebSocket peer that speaks GEOM v1 (`frame` with `layout` + `tree`, optional `patch` updates).
2. It receives the computed layout (`{ x, y, width, height }` for every node) and the UI tree (`kind`, `semantic`, `props`, `handlers`, `children`).
3. It builds an accessibility tree from that data — roles, names, focusable state, bounds.
4. **`geometra_snapshot`** defaults to a **compact** flat list of viewport-visible actionable nodes (minified JSON) to reduce LLM tokens; use `view: "full"` for the complete nested tree.
5. **`geometra_form_schema`** is the compact form-specific path: stable field ids, required/invalid state, current values, and collapsed choice groups without layout-heavy section detail.
6. **`geometra_fill_form`** turns a compact values object into semantic field operations server-side, so the model does not need to emit one tool call per field.
7. **`geometra_page_model`** is still the right summary-first path for non-form exploration: page archetypes, stable section ids, counts, top-level landmarks/forms/dialogs/lists, and a few primary actions.
8. **`geometra_expand_section`** fetches richer details only for the section you care about (fields, actions, headings, nested lists, list items, text preview).
9. After interactions, action tools return a **semantic delta** when possible (dialogs opened/closed, forms appeared/removed, list counts changed, named/focusable nodes added/removed/updated). If nothing meaningful changed, they fall back to a short current-UI overview.
10. After each interaction, the peer sends updated geometry (full `frame` or `patch`) — the MCP tools interpret that into compact summaries.

## Long Forms

For long application flows, prefer one of these patterns:

1. `geometra_form_schema`
2. `geometra_fill_form`
3. `geometra_reveal` for far-below-fold targets such as submit buttons
4. `geometra_run_actions` when you need mixed navigation + waits + field entry
5. `geometra_page_model` + `geometra_expand_section` when you are still exploring the page rather than filling it

Typical batch:

```json
{
  "actions": [
    { "type": "click", "x": 412, "y": 228 },
    { "type": "type", "text": "Taylor Applicant" },
    { "type": "upload_files", "paths": ["/Users/you/resume.pdf"], "fieldLabel": "Resume" },
    { "type": "wait_for", "text": "Parsing your resume", "present": false, "timeoutMs": 10000 }
  ]
}
```

Single action tools now default to terse summaries. Pass `detail: "verbose"` when you need a fuller current-UI fallback for debugging.

For the smallest long-form responses, prefer:

1. `detail: "minimal"` for structured step metadata instead of narrated deltas
2. `includeSteps: false` when you only need aggregate success/error counts plus the final validation/state payload

Typical low-token form fill:

```json
{
  "formId": "fm:1.0",
  "valuesById": {
    "ff:1.0.0": "Taylor Applicant",
    "ff:1.0.1": "taylor@example.com",
    "ff:1.0.2": "Germany",
    "ff:1.0.3": "No"
  },
  "failOnInvalid": true,
  "includeSteps": false,
  "detail": "minimal"
}
```

For long single-page forms:

1. Use `geometra_expand_section` with `fieldOffset` / `actionOffset` to page through large forms instead of taking a full snapshot.
2. Add `onlyRequiredFields: true` or `onlyInvalidFields: true` when you want the actionable subset.
3. Use `contextText` in `geometra_query` / `geometra_wait_for` to disambiguate repeated `Yes` / `No` controls by question text.
4. Use `geometra_reveal` instead of manual wheel loops when the next target is offscreen.

Typical field fill:

```json
{
  "fields": [
    { "kind": "text", "fieldLabel": "Full name", "value": "Taylor Applicant" },
    { "kind": "text", "fieldLabel": "Email", "value": "taylor@example.com" },
    { "kind": "choice", "fieldLabel": "Country", "value": "Germany" },
    { "kind": "choice", "fieldLabel": "Will you require sponsorship?", "value": "No" },
    { "kind": "file", "fieldLabel": "Resume", "paths": ["/Users/you/resume.pdf"] }
  ],
  "failOnInvalid": true,
  "detail": "minimal",
  "includeSteps": false
}
```

With a **native** Geometra server, layout comes from Textura/Yoga. With **`@geometra/proxy`**, layout comes from the browser’s computed DOM geometry; the MCP layer is the same.
