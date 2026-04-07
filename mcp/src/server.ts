import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  connect,
  disconnect,
  getSession,
  sendClick,
  sendType,
  sendKey,
  sendFileUpload,
  sendSelectOption,
  sendWheel,
  buildA11yTree,
} from './session.js'
import type { A11yNode } from './session.js'

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'geometra', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  // ── connect ──────────────────────────────────────────────────
  server.tool(
    'geometra_connect',
    `Connect to a running Geometra server over WebSocket. This replaces Playwright/browser automation — you get direct access to the UI's pixel-exact geometry as JSON.

Call this first before using any other geometra tools. The peer must be listening (native Geometra server, or \`geometra-proxy\` for real web pages). File upload / wheel / native \`<select>\` require \`@geometra/proxy\`; native Textura servers return an error for those messages.`,
    {
      url: z.string().describe('WebSocket URL of the Geometra server (e.g. ws://localhost:3100)'),
    },
    async ({ url }) => {
      try {
        const session = await connect(url)
        const a11y = session.tree && session.layout
          ? buildA11yTree(session.tree, session.layout)
          : null
        const summary = a11y ? summarizeTree(a11y) : 'No UI tree received'
        return ok(`Connected to ${url}. UI state:\n${summary}`)
      } catch (e) {
        return err(`Failed to connect: ${(e as Error).message}`)
      }
    }
  )

  // ── query ────────────────────────────────────────────────────
  server.tool(
    'geometra_query',
    `Find elements in the current Geometra UI by role, name, or text content. Returns matching elements with their exact pixel bounds {x, y, width, height}, role, name, and tree path.

This is the Geometra equivalent of Playwright's locator — but instant, structured, and with no browser. Use the returned bounds to click elements or assert on layout.`,
    {
      role: z.string().optional().describe('ARIA role to match (e.g. "button", "textbox", "text", "heading", "listitem")'),
      name: z.string().optional().describe('Accessible name to match (exact or substring)'),
      text: z.string().optional().describe('Text content to search for (substring match)'),
    },
    async ({ role, name, text }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = buildA11yTree(session.tree, session.layout)
      const matches = findNodes(a11y, { role, name, text })

      if (matches.length === 0) {
        return ok(`No elements found matching ${JSON.stringify({ role, name, text })}`)
      }

      const result = matches.map(formatNode)
      return ok(JSON.stringify(result, null, 2))
    }
  )

  // ── click ────────────────────────────────────────────────────
  server.tool(
    'geometra_click',
    `Click an element in the Geometra UI. Provide either the element's bounds (from geometra_query) or raw x,y coordinates. The click is dispatched server-side via the geometry protocol — no browser, no simulated DOM events.

After clicking, returns the updated UI state so you can verify the click had the intended effect.`,
    {
      x: z.number().describe('X coordinate to click (use center of element bounds from geometra_query)'),
      y: z.number().describe('Y coordinate to click'),
    },
    async ({ x, y }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')

      await sendClick(session, x, y)

      const a11y = session.tree && session.layout
        ? buildA11yTree(session.tree, session.layout)
        : null
      const summary = a11y ? summarizeTree(a11y) : 'No UI update received'
      return ok(`Clicked at (${x}, ${y}). Updated UI:\n${summary}`)
    }
  )

  // ── type ─────────────────────────────────────────────────────
  server.tool(
    'geometra_type',
    `Type text into the currently focused element. First click a textbox/input with geometra_click to focus it, then use this to type.

Each character is sent as a key event through the geometry protocol. Returns updated UI state after typing.`,
    {
      text: z.string().describe('Text to type into the focused element'),
    },
    async ({ text }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')

      await sendType(session, text)

      const a11y = session.tree && session.layout
        ? buildA11yTree(session.tree, session.layout)
        : null
      const summary = a11y ? summarizeTree(a11y) : 'No UI update received'
      return ok(`Typed "${text}". Updated UI:\n${summary}`)
    }
  )

  // ── key ──────────────────────────────────────────────────────
  server.tool(
    'geometra_key',
    `Send a special key press (Enter, Tab, Escape, ArrowDown, etc.) to the Geometra UI. Useful for form submission, focus navigation, and keyboard shortcuts.`,
    {
      key: z.string().describe('Key to press (e.g. "Enter", "Tab", "Escape", "ArrowDown", "Backspace")'),
      shift: z.boolean().optional().describe('Hold Shift'),
      ctrl: z.boolean().optional().describe('Hold Ctrl'),
      meta: z.boolean().optional().describe('Hold Meta/Cmd'),
      alt: z.boolean().optional().describe('Hold Alt'),
    },
    async ({ key, shift, ctrl, meta, alt }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')

      await sendKey(session, key, { shift, ctrl, meta, alt })

      const a11y = session.tree && session.layout
        ? buildA11yTree(session.tree, session.layout)
        : null
      const summary = a11y ? summarizeTree(a11y) : 'No UI update received'
      return ok(`Pressed ${formatKeyCombo(key, { shift, ctrl, meta, alt })}. Updated UI:\n${summary}`)
    }
  )

  // ── upload files (proxy) ───────────────────────────────────────
  server.tool(
    'geometra_upload_files',
    `Attach one or more local files to a file input. Requires \`@geometra/proxy\` (paths are resolved on the proxy host).

Without x,y: uses the first \`input[type=file]\` in any frame. With x,y: clicks to open a file chooser (e.g. custom "Upload" button).`,
    {
      paths: z.array(z.string()).min(1).describe('Absolute paths on the proxy machine, e.g. /Users/you/resume.pdf'),
      x: z.number().optional().describe('Click X to trigger file chooser'),
      y: z.number().optional().describe('Click Y to trigger file chooser'),
    },
    async ({ paths, x, y }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      try {
        await sendFileUpload(session, paths, x !== undefined && y !== undefined ? { x, y } : undefined)
        const a11y = session.tree && session.layout ? buildA11yTree(session.tree, session.layout) : null
        const summary = a11y ? summarizeTree(a11y) : 'No UI update received'
        return ok(`Uploaded ${paths.length} file(s). Updated UI:\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // ── select option (proxy, native <select>) ─────────────────────
  server.tool(
    'geometra_select_option',
    `Set a native HTML \`<select>\` after clicking its center (x,y from geometra_query). Requires \`@geometra/proxy\`.

Custom React/Vue dropdowns are not supported — open them with geometra_click and pick options by snapshot instead.`,
    {
      x: z.number().describe('X coordinate (e.g. center of the select from geometra_query)'),
      y: z.number().describe('Y coordinate'),
      value: z.string().optional().describe('Option value= attribute'),
      label: z.string().optional().describe('Visible option label (substring match)'),
      index: z.number().int().min(0).optional().describe('Zero-based option index'),
    },
    async ({ x, y, value, label, index }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      if (value === undefined && label === undefined && index === undefined) {
        return err('Provide at least one of value, label, or index')
      }
      try {
        await sendSelectOption(session, x, y, { value, label, index })
        const a11y = session.tree && session.layout ? buildA11yTree(session.tree, session.layout) : null
        const summary = a11y ? summarizeTree(a11y) : 'No UI update received'
        return ok(`Selected option. Updated UI:\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // ── wheel / scroll (proxy) ─────────────────────────────────────
  server.tool(
    'geometra_wheel',
    `Scroll the page or an element under the pointer using the mouse wheel. Requires \`@geometra/proxy\` (e.g. virtualized lists, long application forms).`,
    {
      deltaY: z.number().describe('Vertical scroll delta (positive scrolls down, typical step ~100)'),
      deltaX: z.number().optional().describe('Horizontal scroll delta'),
      x: z.number().optional().describe('Move pointer to X before scrolling'),
      y: z.number().optional().describe('Move pointer to Y before scrolling'),
    },
    async ({ deltaY, deltaX, x, y }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      try {
        await sendWheel(session, deltaY, { deltaX, x, y })
        const a11y = session.tree && session.layout ? buildA11yTree(session.tree, session.layout) : null
        const summary = a11y ? summarizeTree(a11y) : 'No UI update received'
        return ok(`Wheel delta (${deltaX ?? 0}, ${deltaY}). Updated UI:\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // ── snapshot ─────────────────────────────────────────────────
  server.tool(
    'geometra_snapshot',
    `Get the full current UI state: accessibility tree with all element bounds, roles, names, and states. This is the Geometra equivalent of a Playwright screenshot — but structured JSON instead of pixels.

Use this for assertions, debugging, or understanding the current UI state. The output includes exact {x, y, width, height} for every element.`,
    {},
    async () => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = buildA11yTree(session.tree, session.layout)
      return ok(JSON.stringify(a11y, null, 2))
    }
  )

  // ── layout ───────────────────────────────────────────────────
  server.tool(
    'geometra_layout',
    `Get the raw computed layout geometry — the exact {x, y, width, height} for every node in the UI tree. This is the lowest-level view, useful for pixel-precise assertions in tests.

For a more semantic view (roles, names, focusable state), use geometra_snapshot instead.`,
    {},
    async () => {
      const session = getSession()
      if (!session?.layout) return err('Not connected. Call geometra_connect first.')

      return ok(JSON.stringify(session.layout, null, 2))
    }
  )

  // ── disconnect ───────────────────────────────────────────────
  server.tool(
    'geometra_disconnect',
    `Disconnect from the Geometra server and clean up the WebSocket connection.`,
    {},
    async () => {
      disconnect()
      return ok('Disconnected.')
    }
  )

  return server
}

// ── Helpers ──────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true }
}

function findNodes(node: A11yNode, filter: { role?: string; name?: string; text?: string }): A11yNode[] {
  const matches: A11yNode[] = []

  function walk(n: A11yNode) {
    let match = true
    if (filter.role && n.role !== filter.role) match = false
    if (filter.name && (!n.name || !n.name.includes(filter.name))) match = false
    if (filter.text && (!n.name || !n.name.includes(filter.text))) match = false
    if (match && (filter.role || filter.name || filter.text)) matches.push(n)
    for (const child of n.children) walk(child)
  }

  walk(node)
  return matches
}

function formatNode(node: A11yNode): Record<string, unknown> {
  return {
    role: node.role,
    name: node.name,
    bounds: node.bounds,
    center: {
      x: Math.round(node.bounds.x + node.bounds.width / 2),
      y: Math.round(node.bounds.y + node.bounds.height / 2),
    },
    focusable: node.focusable,
    ...(node.state && Object.keys(node.state).length > 0 ? { state: node.state } : {}),
    path: node.path,
  }
}

function summarizeTree(node: A11yNode, depth = 0, lines: string[] = []): string {
  const indent = '  '.repeat(depth)
  const name = node.name ? ` "${truncate(node.name, 40)}"` : ''
  const pos = `(${node.bounds.x},${node.bounds.y} ${node.bounds.width}x${node.bounds.height})`
  const focus = node.focusable ? ' [focusable]' : ''
  const state = node.state ? ` ${JSON.stringify(node.state)}` : ''
  lines.push(`${indent}${node.role}${name} ${pos}${focus}${state}`)

  for (const child of node.children) {
    summarizeTree(child, depth + 1, lines)
  }

  return lines.join('\n')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
}

function formatKeyCombo(key: string, mods?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }): string {
  const parts: string[] = []
  if (mods?.ctrl) parts.push('Ctrl')
  if (mods?.meta) parts.push('Cmd')
  if (mods?.alt) parts.push('Alt')
  if (mods?.shift) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}
