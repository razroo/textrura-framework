# MCP Native CRUD Demo

A task management app built as a native Geometra server. Both human users (via canvas client) and AI agents (via MCP tools) drive the same app over the same WebSocket protocol. No browser, no DOM, no proxy.

## Quick start

```bash
# Terminal 1 — start the server
npm run server

# Terminal 2 — start the canvas client (optional, for visual feedback)
npm run client
# Open http://localhost:5173/
```

The server listens on `ws://localhost:3100`.

## Driving the app with MCP

An AI agent connects to the running server and interacts through standard MCP tools. Here is an annotated walkthrough:

### 1. Connect

```
geometra_connect({ url: "ws://localhost:3100" })
```

No proxy, no browser — MCP connects directly to the native Geometra server.

### 2. Discover the UI

```
geometra_page_model({})
```

Returns the page structure: buttons, list items, status text, filter controls. The agent now knows what it can interact with.

### 3. Add a task

```
geometra_click({ role: "button", name: "Add Task" })
```

Opens the edit form. The agent can verify with `geometra_snapshot({})`.

### 4. Type a title

```
geometra_click({ role: "textbox" })
geometra_type({ text: "Review pull request" })
```

The server handles each keystroke, updates the input signal, and broadcasts the new frame.

### 5. Save

```
geometra_click({ role: "button", name: "Save" })
```

### 6. Verify

```
geometra_query({ role: "status" })
```

Returns the status message: "Task created: Review pull request".

### 7. Filter tasks

```
geometra_click({ role: "button", name: "Filter Done" })
```

Shows only completed tasks. Switch back with "Filter All".

### 8. Edit a task

```
geometra_click({ role: "button", name: "Edit Review pull request" })
```

Opens the edit form pre-filled with the task title.

### 9. Delete a task

```
geometra_click({ role: "button", name: "Delete Review pull request" })
```

Removes the task. Status message confirms: "Task deleted: Review pull request".

## Multi-agent

Multiple MCP clients can connect simultaneously. Each calls `geometra_connect({ url: "ws://localhost:3100" })` and gets the same live geometry. When one agent adds a task, the other sees it in their next `geometra_snapshot`.

This works because `server.update()` broadcasts to all connected WebSocket clients — human renderers and MCP sessions alike.

## Architecture

```
                    ┌─────────────────────┐
                    │  server.ts          │
                    │  (Geometra + Yoga)  │
                    │  signals + layout   │
                    └──────┬──────────────┘
                           │
                    GEOM v1 WebSocket
                    (same protocol)
                    ┌──────┴──────┐
                    │             │
             ┌──────▼──────┐  ┌──▼────────────┐
             │  Canvas     │  │  MCP Agent     │
             │  Client     │  │  (Claude Code) │
             │  (browser)  │  │  (CLI)         │
             └─────────────┘  └────────────────┘
```

## Native vs proxy

This demo uses the **native** path — no browser involved. The agent uses `geometra_click`, `geometra_type`, and `geometra_key` to interact. High-level form-fill tools (`geometra_fill_form`, `geometra_fill_fields`) are proxy-only and not available here.

See `NATIVE_MCP_GUIDE.md` in the repo root for the full tool compatibility matrix.
