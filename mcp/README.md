# @geometra/mcp

MCP server for [Geometra](https://github.com/razroo/geometra) — interact with running Geometra apps via the geometry protocol. No browser, no Playwright, no screenshots.

## What this does

Connects Claude Code, Codex, or any MCP-compatible AI agent to a running Geometra server over WebSocket. The agent gets structured `{ x, y, width, height }` geometry and semantic metadata for every UI element — not pixels, not DOM, not component descriptions.

```
Playwright:  Launch Chromium → render → screenshot → vision model → "I see a button"
Geometra:    WebSocket → JSON → { role: "button", name: "Submit", bounds: {x:200, y:300, w:80, h:40} }
```

## Tools

| Tool | Description |
|---|---|
| `geometra_connect` | Connect to a running Geometra server |
| `geometra_query` | Find elements by role, name, or text content |
| `geometra_click` | Click an element by coordinates |
| `geometra_type` | Type text into the focused element |
| `geometra_key` | Send special keys (Enter, Tab, Escape, arrows) |
| `geometra_snapshot` | Full accessibility tree with bounds (structured "screenshot") |
| `geometra_layout` | Raw computed geometry for every node |
| `geometra_disconnect` | Close the connection |

## Setup

### Claude Code

```bash
claude mcp add geometra -- npx @geometra/mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "geometra": {
      "command": "npx",
      "args": ["@geometra/mcp"]
    }
  }
}
```

### From source (this repo)

```bash
cd mcp
npm install
npm run build
claude mcp add geometra -- node ./dist/index.js
```

## Usage

Start a Geometra app:

```bash
cd demos/server-client
npm run server  # starts on ws://localhost:3100
```

Then in Claude Code:

```
> Connect to my Geometra app at ws://localhost:3100 and tell me what's on screen

> Click the "Submit" button

> Type "hello@example.com" into the email input

> Take a snapshot and check if the dialog is visible
```

## Example: agent testing a signup form

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

No browser. No screenshots. No vision model. JSON in, JSON out.

## How it works

1. The MCP server connects to a Geometra WebSocket server
2. It receives the computed layout (`{ x, y, width, height }` for every element) and the UI tree (element types, props, handlers, semantic metadata)
3. It builds an accessibility tree from the raw data — roles, names, focusable state, bounds
4. Tools expose query, click, type, and snapshot operations over this structured data
5. After each interaction, the server sends updated geometry — the MCP server returns the new state

The Geometra server does all layout computation. The MCP server is a thin bridge that translates between MCP tool calls and the WebSocket geometry protocol.
