import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { formatConnectFailureMessage, isHttpUrl, normalizeConnectTarget } from './connect-utils.js'
import {
  connect,
  connectThroughProxy,
  disconnect,
  getSession,
  sendClick,
  sendType,
  sendKey,
  sendFileUpload,
  sendListboxPick,
  sendSelectOption,
  sendSetChecked,
  sendWheel,
  buildA11yTree,
  buildCompactUiIndex,
  buildPageModel,
  expandPageSection,
  buildUiDelta,
  hasUiDelta,
  nodeIdForPath,
  summarizeCompactIndex,
  summarizePageModel,
  summarizeUiDelta,
} from './session.js'
import type { A11yNode, Session, UpdateWaitResult } from './session.js'

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'geometra', version: '1.19.5' },
    { capabilities: { tools: {} } },
  )

  // ── connect ──────────────────────────────────────────────────
  server.tool(
    'geometra_connect',
    `Connect to a Geometra WebSocket peer, or start \`geometra-proxy\` automatically for a normal web page.

**Prefer \`pageUrl\` for job sites and SPAs:** pass \`https://…\` and this server spawns geometra-proxy on an ephemeral local port and connects — you do **not** need a separate terminal or a \`ws://\` URL (fewer IDE approval steps for the human).

Use \`url\` (ws://…) only when a Geometra/native server or an already-running proxy is listening. If you accidentally pass \`https://…\` in \`url\`, MCP treats it like \`pageUrl\` and starts the proxy for you.

Chromium opens **visible** by default unless \`headless: true\`. File upload / wheel / native \`<select>\` need the proxy path (\`pageUrl\` or ws to proxy).`,
    {
      url: z
        .string()
        .optional()
        .describe(
          'WebSocket URL when a server is already running (e.g. ws://127.0.0.1:3200 or ws://localhost:3100). If you pass http(s) here by mistake, MCP will treat it as a page URL and start geometra-proxy.',
        ),
      pageUrl: z
        .string()
        .url()
        .refine(isHttpUrl, 'pageUrl must use http:// or https://')
        .optional()
        .describe(
          'HTTP(S) page to open. MCP starts geometra-proxy and connects automatically. Use this instead of url for most web apply flows.',
        ),
      port: z
        .number()
        .int()
        .positive()
        .max(65535)
        .optional()
        .describe('Preferred local port for spawned proxy (default: ephemeral OS-assigned port).'),
      headless: z
        .boolean()
        .optional()
        .describe('Run Chromium headless (default false = visible window).'),
      width: z.number().int().positive().optional().describe('Viewport width for spawned proxy.'),
      height: z.number().int().positive().optional().describe('Viewport height for spawned proxy.'),
      slowMo: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Playwright slowMo (ms) on spawned proxy for easier visual following.'),
    },
    async input => {
      const normalized = normalizeConnectTarget({ url: input.url, pageUrl: input.pageUrl })
      if (!normalized.ok) return err(normalized.error)
      const target = normalized.value

      try {
        if (target.kind === 'proxy') {
          const session = await connectThroughProxy({
            pageUrl: target.pageUrl!,
            port: input.port,
            headless: input.headless,
            width: input.width,
            height: input.height,
            slowMo: input.slowMo,
          })
          const summary = compactSessionSummary(session)
          const inferred = target.autoCoercedFromUrl ? ' inferred from url input' : ''
          return ok(
            `Started geometra-proxy and connected at ${session.url} (page: ${target.pageUrl}${inferred}). UI state:\n${summary}`,
          )
        }
        const session = await connect(target.wsUrl!)
        const summary = compactSessionSummary(session)
        return ok(`Connected to ${target.wsUrl}. UI state:\n${summary}`)
      } catch (e) {
        return err(`Failed to connect: ${formatConnectFailureMessage(e, target)}`)
      }
    }
  )

  // ── query ────────────────────────────────────────────────────
  server.tool(
    'geometra_query',
    `Find elements in the current Geometra UI by stable id, role, name, or text content. Returns matching elements with their exact pixel bounds {x, y, width, height}, role, name, and tree path.

This is the Geometra equivalent of Playwright's locator — but instant, structured, and with no browser. Use the returned bounds to click elements or assert on layout.`,
    {
      id: z.string().optional().describe('Stable node id from geometra_snapshot or geometra_expand_section'),
      role: z.string().optional().describe('ARIA role to match (e.g. "button", "textbox", "text", "heading", "listitem")'),
      name: z.string().optional().describe('Accessible name to match (exact or substring)'),
      text: z.string().optional().describe('Text content to search for (substring match)'),
    },
    async ({ id, role, name, text }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = buildA11yTree(session.tree, session.layout)
      const matches = findNodes(a11y, { id, role, name, text })

      if (matches.length === 0) {
        return ok(`No elements found matching ${JSON.stringify({ id, role, name, text })}`)
      }

      const result = matches.map(formatNode)
      return ok(JSON.stringify(result, null, 2))
    }
  )

  // ── page model ────────────────────────────────────────────────
  server.tool(
    'geometra_page_model',
    `Get a higher-level webpage summary instead of a raw node dump. Returns stable section ids, page archetypes, summary counts, top-level landmarks/forms/dialogs/lists, and a few primary actions.

Use this first on normal HTML pages when you want to understand the page shape with fewer tokens than a full snapshot. Then call geometra_expand_section on a returned section id when you need details.`,
    {
      maxPrimaryActions: z
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .default(6)
        .describe('Cap top-level primary actions (default 6).'),
      maxSectionsPerKind: z
        .number()
        .int()
        .min(1)
        .max(16)
        .optional()
        .default(8)
        .describe('Cap returned landmarks/forms/dialogs/lists per kind (default 8).'),
    },
    async ({ maxPrimaryActions, maxSectionsPerKind }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = buildA11yTree(session.tree, session.layout)
      const model = buildPageModel(a11y, { maxPrimaryActions, maxSectionsPerKind })
      return ok(JSON.stringify(model))
    }
  )

  server.tool(
    'geometra_expand_section',
    `Expand one section from geometra_page_model by stable id. Returns richer on-demand details such as headings, fields, actions, nested lists, list items, and text preview.

Use this after geometra_page_model when you know which form/dialog/list/landmark you want to inspect more closely. Per-item bounds are omitted by default to save tokens; set includeBounds=true if you need them immediately.`,
    {
      id: z.string().describe('Section id from geometra_page_model, e.g. fm:1.0 or ls:2.1'),
      maxHeadings: z.number().int().min(1).max(20).optional().default(6).describe('Cap heading rows'),
      maxFields: z.number().int().min(1).max(40).optional().default(18).describe('Cap field rows'),
      maxActions: z.number().int().min(1).max(30).optional().default(12).describe('Cap action rows'),
      maxLists: z.number().int().min(0).max(20).optional().default(8).describe('Cap nested lists'),
      maxItems: z.number().int().min(0).max(50).optional().default(20).describe('Cap list items'),
      maxTextPreview: z.number().int().min(0).max(20).optional().default(6).describe('Cap text preview lines'),
      includeBounds: z.boolean().optional().default(false).describe('Include bounds for fields/actions/headings/items'),
    },
    async ({ id, maxHeadings, maxFields, maxActions, maxLists, maxItems, maxTextPreview, includeBounds }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = buildA11yTree(session.tree, session.layout)
      const detail = expandPageSection(a11y, id, {
        maxHeadings,
        maxFields,
        maxActions,
        maxLists,
        maxItems,
        maxTextPreview,
        includeBounds,
      })
      if (!detail) return err(`No expandable section found for id ${id}`)
      return ok(JSON.stringify(detail))
    }
  )

  // ── click ────────────────────────────────────────────────────
  server.tool(
    'geometra_click',
    `Click an element in the Geometra UI. Provide either the element's bounds (from geometra_query) or raw x,y coordinates. The click is dispatched server-side via the geometry protocol — no browser, no simulated DOM events.

After clicking, returns a compact semantic delta when possible (dialogs/forms/lists/nodes changed). If nothing meaningful changed, returns a short current-UI overview.`,
    {
      x: z.number().describe('X coordinate to click (use center of element bounds from geometra_query)'),
      y: z.number().describe('Y coordinate to click'),
    },
    async ({ x, y }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)

      const wait = await sendClick(session, x, y)

      const summary = postActionSummary(session, before, wait)
      return ok(`Clicked at (${x}, ${y}).\n${summary}`)
    }
  )

  // ── type ─────────────────────────────────────────────────────
  server.tool(
    'geometra_type',
    `Type text into the currently focused element. First click a textbox/input with geometra_click to focus it, then use this to type.

Each character is sent as a key event through the geometry protocol. Returns a compact semantic delta when possible, otherwise a short current-UI overview.`,
    {
      text: z.string().describe('Text to type into the focused element'),
    },
    async ({ text }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)

      const wait = await sendType(session, text)

      const summary = postActionSummary(session, before, wait)
      return ok(`Typed "${text}".\n${summary}`)
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
      const before = sessionA11y(session)

      const wait = await sendKey(session, key, { shift, ctrl, meta, alt })

      const summary = postActionSummary(session, before, wait)
      return ok(`Pressed ${formatKeyCombo(key, { shift, ctrl, meta, alt })}.\n${summary}`)
    }
  )

  // ── upload files (proxy) ───────────────────────────────────────
  server.tool(
    'geometra_upload_files',
    `Attach local files to a file input. Requires \`@geometra/proxy\` (paths exist on the proxy host).

Strategies: **auto** (default) tries chooser click if x,y given, else hidden \`input[type=file]\`, else first visible file input. **hidden** targets hidden inputs directly. **drop** needs dropX,dropY for drag-target zones. **chooser** requires x,y.`,
    {
      paths: z.array(z.string()).min(1).describe('Absolute paths on the proxy machine, e.g. /Users/you/resume.pdf'),
      x: z.number().optional().describe('Click X to trigger native file chooser'),
      y: z.number().optional().describe('Click Y to trigger native file chooser'),
      strategy: z
        .enum(['auto', 'chooser', 'hidden', 'drop'])
        .optional()
        .describe('Upload strategy (default auto)'),
      dropX: z.number().optional().describe('Drop target X (viewport) for strategy drop'),
      dropY: z.number().optional().describe('Drop target Y (viewport) for strategy drop'),
    },
    async ({ paths, x, y, strategy, dropX, dropY }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)
      try {
        const wait = await sendFileUpload(session, paths, {
          click: x !== undefined && y !== undefined ? { x, y } : undefined,
          strategy,
          drop: dropX !== undefined && dropY !== undefined ? { x: dropX, y: dropY } : undefined,
        })
        const summary = postActionSummary(session, before, wait)
        return ok(`Uploaded ${paths.length} file(s).\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'geometra_pick_listbox_option',
    `Pick a visible \`role=option\` (Headless UI, React Select, Radix, etc.). Requires \`@geometra/proxy\`.

Optional openX,openY clicks the combobox first if the list is not open. Uses substring name match unless exact=true.`,
    {
      label: z.string().describe('Accessible name of the option (visible text or aria-label)'),
      exact: z.boolean().optional().describe('Exact name match'),
      openX: z.number().optional().describe('Click to open dropdown'),
      openY: z.number().optional().describe('Click to open dropdown'),
    },
    async ({ label, exact, openX, openY }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)
      try {
        const wait = await sendListboxPick(session, label, {
          exact,
          open: openX !== undefined && openY !== undefined ? { x: openX, y: openY } : undefined,
        })
        const summary = postActionSummary(session, before, wait)
        return ok(`Picked listbox option "${label}".\n${summary}`)
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
      const before = sessionA11y(session)
      try {
        const wait = await sendSelectOption(session, x, y, { value, label, index })
        const summary = postActionSummary(session, before, wait)
        return ok(`Selected option.\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'geometra_set_checked',
    `Set a checkbox or radio by label. Requires \`@geometra/proxy\`.

Prefer this over raw coordinate clicks for custom forms that keep the real input visually hidden (common on Ashby, Greenhouse custom widgets, and design-system checkboxes/radios). Uses substring label matching unless exact=true.`,
    {
      label: z.string().describe('Accessible label or visible option text to match'),
      checked: z.boolean().optional().default(true).describe('Desired checked state (radios only support true)'),
      exact: z.boolean().optional().describe('Exact label match'),
      controlType: z.enum(['checkbox', 'radio']).optional().describe('Limit matching to checkbox or radio'),
    },
    async ({ label, checked, exact, controlType }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)
      try {
        const wait = await sendSetChecked(session, label, { checked, exact, controlType })
        const summary = postActionSummary(session, before, wait)
        return ok(`Set ${controlType ?? 'checkbox/radio'} "${label}" to ${String(checked ?? true)}.\n${summary}`)
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
      const before = sessionA11y(session)
      try {
        const wait = await sendWheel(session, deltaY, { deltaX, x, y })
        const summary = postActionSummary(session, before, wait)
        return ok(`Wheel delta (${deltaX ?? 0}, ${deltaY}).\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // ── snapshot ─────────────────────────────────────────────────
  server.tool(
    'geometra_snapshot',
    `Get the current UI as JSON. Default **compact** view: flat list of viewport-visible actionable nodes (links, buttons, inputs, headings, landmarks, text leaves, focusable elements) with bounds and tree paths — far fewer tokens than a full nested tree. Use **full** for complete nested a11y + every wrapper when debugging layout.

JSON is minified in compact view to save tokens. For a summary-first overview, use geometra_page_model, then geometra_expand_section for just the part you want.`,
    {
      view: z
        .enum(['compact', 'full'])
        .optional()
        .default('compact')
        .describe('compact (default): token-efficient flat index. full: nested tree, every node.'),
      maxNodes: z
        .number()
        .int()
        .min(20)
        .max(800)
        .optional()
        .default(400)
        .describe('Max rows in compact view (default 400).'),
    },
    async ({ view, maxNodes }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = buildA11yTree(session.tree, session.layout)
      if (view === 'full') {
        return ok(JSON.stringify(a11y, null, 2))
      }
      const { nodes, truncated } = buildCompactUiIndex(a11y, { maxNodes })
      const payload = {
        view: 'compact' as const,
        viewport: { width: a11y.bounds.width, height: a11y.bounds.height },
        nodes,
        truncated,
      }
      return ok(JSON.stringify(payload))
    }
  )

  // ── layout ───────────────────────────────────────────────────
  server.tool(
    'geometra_layout',
    `Get the raw computed layout geometry — the exact {x, y, width, height} for every node in the UI tree. This is the lowest-level view, useful for pixel-precise assertions in tests.

For a token-efficient semantic view, use geometra_snapshot (default compact). For the complete nested tree, geometra_snapshot with view=full.`,
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

function compactSessionSummary(session: Session): string {
  const a11y = sessionA11y(session)
  if (!a11y) return 'No UI update received'
  return sessionOverviewFromA11y(a11y)
}

function sessionA11y(session: Session): A11yNode | null {
  if (!session.tree || !session.layout) return null
  return buildA11yTree(session.tree, session.layout)
}

function sessionOverviewFromA11y(a11y: A11yNode): string {
  const pageSummary = summarizePageModel(buildPageModel(a11y), 8)
  const { nodes } = buildCompactUiIndex(a11y, { maxNodes: 32 })
  const keyNodes = nodes.length > 0 ? `Key nodes:\n${summarizeCompactIndex(nodes, 18)}` : ''
  return [pageSummary, keyNodes].filter(Boolean).join('\n')
}

function postActionSummary(session: Session, before: A11yNode | null, wait?: UpdateWaitResult): string {
  const after = sessionA11y(session)
  const notes: string[] = []
  if (wait?.status === 'timed_out') {
    notes.push(
      `No frame or patch arrived within ${wait.timeoutMs}ms after the action. The action may still have succeeded if it did not change geometry or semantics.`,
    )
  }
  if (!after) return [...notes, 'No UI update received'].filter(Boolean).join('\n')
  if (before) {
    const delta = buildUiDelta(before, after)
    if (hasUiDelta(delta)) {
      return [...notes, `Changes:\n${summarizeUiDelta(delta)}`].filter(Boolean).join('\n')
    }
  }
  return [...notes, `Current UI:\n${sessionOverviewFromA11y(after)}`].filter(Boolean).join('\n')
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true }
}

function findNodes(node: A11yNode, filter: { id?: string; role?: string; name?: string; text?: string }): A11yNode[] {
  const matches: A11yNode[] = []

  function walk(n: A11yNode) {
    let match = true
    if (filter.id && nodeIdForPath(n.path) !== filter.id) match = false
    if (filter.role && n.role !== filter.role) match = false
    if (filter.name && (!n.name || !n.name.includes(filter.name))) match = false
    if (filter.text && (!n.name || !n.name.includes(filter.text))) match = false
    if (match && (filter.id || filter.role || filter.name || filter.text)) matches.push(n)
    for (const child of n.children) walk(child)
  }

  walk(node)
  return matches
}

function formatNode(node: A11yNode): Record<string, unknown> {
  return {
    id: nodeIdForPath(node.path),
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

function formatKeyCombo(key: string, mods?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }): string {
  const parts: string[] = []
  if (mods?.ctrl) parts.push('Ctrl')
  if (mods?.meta) parts.push('Cmd')
  if (mods?.alt) parts.push('Alt')
  if (mods?.shift) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}
