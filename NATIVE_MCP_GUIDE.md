# Native MCP Guide

How to build Geometra apps that AI agents can drive through MCP — no browser, no DOM, no proxy.

## Architecture

A native Geometra server computes layout via Yoga WASM and streams geometry as JSON over WebSocket. The same GEOM v1 protocol goes to every connected client — human renderers and MCP agents alike.

```
                    ┌──────────────────────┐
                    │  Your Geometra App   │
                    │  signals + view()    │
                    │  Yoga WASM layout    │
                    └──────────┬───────────┘
                               │
                        GEOM v1 WebSocket
                        { type: 'frame', layout, tree }
                        { type: 'patch', patches }
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐  ┌─────▼──────┐  ┌──────▼──────┐
       │  Canvas     │  │  Terminal  │  │  MCP Agent  │
       │  Renderer   │  │  Renderer  │  │  (Claude)   │
       └─────────────┘  └────────────┘  └─────────────┘
```

There is no browser in this picture. The server owns the layout. Clients — including MCP — receive pre-computed `{ x, y, w, h }` and interact via events sent back over the same socket.

## Tool compatibility matrix

MCP tools fall into two groups: those that work with any GEOM v1 server, and those that require the proxy (Chromium + Playwright).

### Works on native servers

| Tool | Purpose |
|------|---------|
| `geometra_connect` | Connect via `url: "ws://..."` |
| `geometra_disconnect` | Close connection |
| `geometra_list_sessions` | List active sessions |
| `geometra_page_model` | Structured page summary |
| `geometra_snapshot` | Compact UI tree (viewport or full) |
| `geometra_layout` | Raw geometry for all nodes |
| `geometra_query` | Find elements by role/name/text/state |
| `geometra_expand_section` | On-demand section details |
| `geometra_find_action` | Resolve repeated buttons by context |
| `geometra_click` | Click by coordinates or semantic target |
| `geometra_type` | Type text into focused element |
| `geometra_key` | Send special keys (Enter, Tab, Escape, arrows) |
| `geometra_scroll_to` | Scroll until target is visible |
| `geometra_wait_for` | Wait for semantic conditions |
| `geometra_wait_for_navigation` | Wait for state changes |
| `geometra_list_items` | Collect items from scrollable lists |
| `geometra_run_actions` | Batch click/type/key in one round trip |
| `geometra_workflow_state` | Track pages visited and values filled |

### Proxy-only (requires Chromium)

| Tool | Why proxy-only |
|------|---------------|
| `geometra_fill_form` | Needs DOM input element access |
| `geometra_fill_fields` | Needs DOM input element access |
| `geometra_fill_otp` | Needs per-cell DOM input targeting |
| `geometra_pick_listbox_option` | Needs Playwright for custom dropdowns |
| `geometra_select_option` | Needs native `<select>` DOM element |
| `geometra_set_checked` | Needs DOM checkbox/radio control |
| `geometra_upload_files` | Needs file input or drag-drop target |
| `geometra_wheel` | Needs Playwright mouse wheel |
| `geometra_generate_pdf` | Needs Chromium print-to-PDF |
| `geometra_prepare_browser` | Pre-launches Chromium (no native equivalent) |

The proxy-only tools send message types (`fillFields`, `setFieldText`, `selectOption`, `setChecked`, `listboxPick`, `file`, `wheel`) that the native server explicitly rejects with a descriptive error.

## When to use native vs proxy

**Use native when:**
- You're building a new app with Geometra from the ground up
- You want zero browser dependency and minimal overhead
- You're building agent-first experiences (chatbots, dashboards, tools)
- You want multiple agents and humans sharing the same live state

**Use proxy when:**
- You're automating an existing website you don't control
- You need high-level form-fill semantics (`fill_form`, `fill_fields`)
- You need file uploads, native `<select>`, or custom dropdown pickers
- You need PDF generation from rendered pages

**The trade-off:** Native is faster and simpler, but the agent must use `click` + `type` + `key` for all interaction. Proxy gives high-level form-fill tools that handle complex controls automatically.

## Making your app agent-friendly

### 1. Use `@geometra/ui` components

The `button()`, `input()`, `checkbox()`, `dialog()`, and `list()` components from `@geometra/ui` set proper semantic annotations that MCP discovers automatically:

- `button(label, onClick)` — MCP infers `role: 'button'` from the `onClick` handler and reads the label from child text
- `input(value, placeholder, opts)` — Sets `semantic: { tag: 'input' }`, mapped to `role: 'textbox'` by MCP
- `checkbox(label, opts)` — Sets `semantic: { role: 'checkbox', ariaLabel: label }`
- `dialog(title, body, actions)` — Sets `semantic: { role: 'dialog', ariaLabel: title }`

### 2. Add explicit semantics to custom elements

For elements that aren't standard `@geometra/ui` components, add `semantic` props:

```typescript
box({
  onClick: () => handleEdit(task),
  semantic: { role: 'button', ariaLabel: `Edit ${task.title}` },
}, [text({ text: 'Edit', ... })])
```

Without `ariaLabel`, MCP falls back to child text content — which works, but explicit labels are more reliable for disambiguation.

### 3. Add status indicators

Include a status text element that updates after each action. Agents verify their actions succeeded by querying for it:

```typescript
const statusMessage = signal('')

// In view:
box(
  { semantic: { role: 'status', ariaLabel: statusMessage.value } },
  [text({ text: statusMessage.value, ... })],
)

// After mutations:
statusMessage.set('Task created: Review PR')
server.update()
```

The agent verifies with `geometra_query({ role: "status" })`.

### 4. Call `server.update()` after every state change

MCP only sees state changes when the server broadcasts a new frame. Every signal mutation that should be visible to agents needs a `server.update()` call:

```typescript
function handleDelete(task: Task): void {
  tasks.set(tasks.peek().filter(t => t.id !== task.id))
  statusMessage.set(`Task deleted: ${task.title}`)
  server.update()  // MCP sees the change
}
```

### 5. Wire keyboard handlers for text input

The `@geometra/ui` `input()` component renders the input visually but doesn't own the text state — your server does. Wire up a keyboard handler:

```typescript
const inputValue = signal('')
const inputCaret = signal(0)

function handleKeyDown(e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): void {
  if (e.key === 'Enter') { handleSubmit(); return }
  if (e.key === 'Backspace') {
    const val = inputValue.peek(); const c = inputCaret.peek()
    if (c > 0) { inputValue.set(val.slice(0, c - 1) + val.slice(c)); inputCaret.set(c - 1); server.update() }
    return
  }
  if (e.key === 'ArrowLeft') {
    const c = inputCaret.peek(); if (c > 0) { inputCaret.set(c - 1); server.update() }
    return
  }
  if (e.key === 'ArrowRight') {
    const c = inputCaret.peek(); if (c < inputValue.peek().length) { inputCaret.set(c + 1); server.update() }
    return
  }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
    const val = inputValue.peek(); const c = inputCaret.peek()
    inputValue.set(val.slice(0, c) + e.key + val.slice(c))
    inputCaret.set(c + 1)
    server.update()
  }
}

// In view:
input(inputValue.value, 'Placeholder...', {
  focused: true,
  caretOffset: inputCaret.value,
  onKeyDown: handleKeyDown,
})
```

When MCP sends `geometra_type({ text: "hello" })`, the server receives individual key events that flow through this handler.

## Agent interaction patterns

### Discover, then act

```
geometra_connect({ url: "ws://localhost:3100" })
geometra_page_model({})          // learn the structure
geometra_click({ role: "button", name: "Add Task" })
geometra_snapshot({})             // verify the form appeared
geometra_click({ role: "textbox" })
geometra_type({ text: "Review PR" })
geometra_click({ role: "button", name: "Save" })
geometra_query({ role: "status" })  // verify success
```

### Batch actions

Use `geometra_run_actions` to combine multiple steps in one round trip:

```
geometra_run_actions({ actions: [
  { type: "click", role: "button", name: "Add Task" },
  { type: "click", role: "textbox" },
  { type: "type", text: "Review PR" },
  { type: "click", role: "button", name: "Save" }
] })
```

### Verify state between steps

Always check that an action had the expected effect before proceeding:

```
geometra_click({ role: "button", name: "Delete Review PR" })
geometra_query({ role: "status" })
// Expect: "Task deleted: Review PR"
```

## Multi-agent shared geometry

Multiple MCP clients can connect to the same native server simultaneously. Each calls `geometra_connect({ url: "ws://localhost:3100" })` independently.

When one agent modifies state (e.g., adds a task), the server broadcasts the updated frame to all clients. The other agent sees the change in their next `geometra_snapshot` or `geometra_page_model`.

No special configuration needed — `server.update()` broadcasts to all connected WebSocket clients by design.

**Example scenario:**
- Agent A creates tasks based on a project plan
- Agent B monitors for new tasks and assigns priorities
- A human watches both agents work in real time via the canvas client

## Debugging

### See what the agent sees

```
geometra_snapshot({ view: "full" })
```

Returns the complete nested UI tree, not just viewport-visible nodes. Useful for understanding why an element can't be found.

### Check element discoverability

```
geometra_query({ role: "button" })
```

Lists all buttons the agent can see. If your button is missing, it likely needs a `semantic` annotation or an `onClick` handler.

### Inspect raw geometry

```
geometra_layout({})
```

Returns `{ x, y, width, height }` for every node — useful for verifying layout issues.

## Reference demo

See `demos/mcp-native-crud/` for a complete working example. The server implements a task manager with add/edit/delete/filter that an agent can fully drive.
