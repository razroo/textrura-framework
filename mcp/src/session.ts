import WebSocket from 'ws'

/**
 * Parsed accessibility node from the UI tree + computed layout.
 * Mirrors the shape of @geometra/core's AccessibilityNode without importing it
 * (this package is standalone — no dependency on geometra packages).
 */
export interface A11yNode {
  role: string
  name?: string
  state?: { disabled?: boolean; expanded?: boolean; selected?: boolean }
  bounds: { x: number; y: number; width: number; height: number }
  path: number[]
  children: A11yNode[]
  focusable: boolean
}

export interface Session {
  ws: WebSocket
  layout: Record<string, unknown> | null
  tree: Record<string, unknown> | null
  url: string
}

let activeSession: Session | null = null

/**
 * Connect to a running Geometra server. Waits for the first frame so that
 * layout/tree state is available immediately after connection.
 */
export function connect(url: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    if (activeSession) {
      activeSession.ws.close()
      activeSession = null
    }

    const ws = new WebSocket(url)
    const session: Session = { ws, layout: null, tree: null, url }
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        ws.close()
        reject(new Error(`Connection to ${url} timed out after 10s`))
      }
    }, 10_000)

    ws.on('open', () => {
      // Send initial resize so server computes layout
      ws.send(JSON.stringify({ type: 'resize', width: 1024, height: 768 }))
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        if (msg.type === 'frame') {
          session.layout = msg.layout
          session.tree = msg.tree
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            activeSession = session
            resolve(session)
          }
        } else if (msg.type === 'patch' && session.layout) {
          applyPatches(session.layout, msg.patches)
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(new Error(`WebSocket error connecting to ${url}: ${err.message}`))
      }
    })

    ws.on('close', () => {
      if (activeSession === session) activeSession = null
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(new Error(`Connection to ${url} closed before first frame`))
      }
    })
  })
}

export function getSession(): Session | null {
  return activeSession
}

export function disconnect(): void {
  if (activeSession) {
    activeSession.ws.close()
    activeSession = null
  }
}

/**
 * Send a click event at (x, y) and wait for the next frame/patch response.
 */
export function sendClick(session: Session, x: number, y: number): Promise<void> {
  return sendAndWaitForUpdate(session, {
    type: 'event',
    eventType: 'onClick',
    x,
    y,
  })
}

/**
 * Send a sequence of key events to type text into the focused element.
 */
export function sendType(session: Session, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (session.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'))
      return
    }

    // Send each character as keydown + keyup
    for (const char of text) {
      const keyEvent = {
        type: 'key',
        eventType: 'onKeyDown',
        key: char,
        code: `Key${char.toUpperCase()}`,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }
      session.ws.send(JSON.stringify(keyEvent))
      session.ws.send(JSON.stringify({ ...keyEvent, eventType: 'onKeyUp' }))
    }

    // Wait briefly for server to process and send update
    waitForNextUpdate(session).then(resolve).catch(reject)
  })
}

/**
 * Send a special key (Enter, Tab, Escape, etc.)
 */
export function sendKey(session: Session, key: string, modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }): Promise<void> {
  return sendAndWaitForUpdate(session, {
    type: 'key',
    eventType: 'onKeyDown',
    key,
    code: key,
    shiftKey: modifiers?.shift ?? false,
    ctrlKey: modifiers?.ctrl ?? false,
    metaKey: modifiers?.meta ?? false,
    altKey: modifiers?.alt ?? false,
  })
}

/**
 * Attach local file(s). Paths must exist on the machine running `@geometra/proxy` (not the MCP host).
 * Optional `x`,`y` click opens a file chooser; omit to use the first `input[type=file]` in any frame.
 */
export function sendFileUpload(
  session: Session,
  paths: string[],
  click?: { x: number; y: number },
): Promise<void> {
  const payload: Record<string, unknown> = { type: 'file', paths }
  if (click) {
    payload.x = click.x
    payload.y = click.y
  }
  return sendAndWaitForUpdate(session, payload)
}

/** Native `<select>` only: click the control center, then pick by value, label text, or zero-based index. */
export function sendSelectOption(
  session: Session,
  x: number,
  y: number,
  option: { value?: string; label?: string; index?: number },
): Promise<void> {
  return sendAndWaitForUpdate(session, {
    type: 'selectOption',
    x,
    y,
    ...option,
  })
}

/** Mouse wheel / scroll. Optional `x`,`y` move pointer before scrolling. */
export function sendWheel(
  session: Session,
  deltaY: number,
  opts?: { deltaX?: number; x?: number; y?: number },
): Promise<void> {
  return sendAndWaitForUpdate(session, {
    type: 'wheel',
    deltaY,
    deltaX: opts?.deltaX ?? 0,
    ...(opts?.x !== undefined ? { x: opts.x } : {}),
    ...(opts?.y !== undefined ? { y: opts.y } : {}),
  })
}

/**
 * Build a flat accessibility tree from the raw UI tree + layout.
 * This is a standalone reimplementation that works with raw JSON —
 * no dependency on @geometra/core.
 */
export function buildA11yTree(tree: Record<string, unknown>, layout: Record<string, unknown>): A11yNode {
  return walkNode(tree, layout, [])
}

function walkNode(element: Record<string, unknown>, layout: Record<string, unknown>, path: number[]): A11yNode {
  const kind = element.kind as string | undefined
  const semantic = element.semantic as Record<string, unknown> | undefined
  const props = element.props as Record<string, unknown> | undefined
  const handlers = element.handlers as Record<string, unknown> | undefined

  const role = inferRole(kind, semantic, handlers)
  const name = inferName(kind, semantic, props)
  const focusable = !!(handlers?.onClick || handlers?.onKeyDown || handlers?.onKeyUp ||
    handlers?.onCompositionStart || handlers?.onCompositionUpdate || handlers?.onCompositionEnd)

  const bounds = {
    x: (layout.x as number) ?? 0,
    y: (layout.y as number) ?? 0,
    width: (layout.width as number) ?? 0,
    height: (layout.height as number) ?? 0,
  }

  const state: A11yNode['state'] = {}
  if (semantic?.ariaDisabled) state.disabled = true
  if (semantic?.ariaExpanded !== undefined) state.expanded = !!semantic.ariaExpanded
  if (semantic?.ariaSelected !== undefined) state.selected = !!semantic.ariaSelected

  const children: A11yNode[] = []
  const elementChildren = element.children as Record<string, unknown>[] | undefined
  const layoutChildren = layout.children as Record<string, unknown>[] | undefined

  if (elementChildren && layoutChildren) {
    for (let i = 0; i < elementChildren.length; i++) {
      if (elementChildren[i] && layoutChildren[i]) {
        children.push(walkNode(elementChildren[i], layoutChildren[i], [...path, i]))
      }
    }
  }

  return {
    role,
    ...(name ? { name } : {}),
    ...(Object.keys(state).length > 0 ? { state } : {}),
    bounds,
    path,
    children,
    focusable,
  }
}

function inferRole(kind: string | undefined, semantic: Record<string, unknown> | undefined, handlers: Record<string, unknown> | undefined): string {
  if (semantic?.role) return semantic.role as string
  const tag = semantic?.tag as string | undefined
  if (kind === 'text') {
    if (tag && /^h[1-6]$/.test(tag)) return 'heading'
    return 'text'
  }
  if (kind === 'image') return 'img'
  if (kind === 'scene3d') return 'img'
  // box
  if (tag === 'nav') return 'navigation'
  if (tag === 'main') return 'main'
  if (tag === 'article') return 'article'
  if (tag === 'section') return 'region'
  if (tag === 'ul' || tag === 'ol') return 'list'
  if (tag === 'li') return 'listitem'
  if (tag === 'form') return 'form'
  if (tag === 'button') return 'button'
  if (tag === 'input') return 'textbox'
  if (handlers?.onClick) return 'button'
  return 'group'
}

function inferName(kind: string | undefined, semantic: Record<string, unknown> | undefined, props: Record<string, unknown> | undefined): string | undefined {
  if (semantic?.ariaLabel) return semantic.ariaLabel as string
  if (kind === 'text' && props?.text) return props.text as string
  if (kind === 'image') return (semantic?.alt ?? props?.alt) as string | undefined
  return semantic?.alt as string | undefined
}

function applyPatches(layout: Record<string, unknown>, patches: Array<{ path: number[]; x?: number; y?: number; width?: number; height?: number }>): void {
  for (const patch of patches) {
    let node = layout
    for (const idx of patch.path) {
      const children = node.children as Record<string, unknown>[] | undefined
      if (!children?.[idx]) break
      node = children[idx]
    }
    if (patch.x !== undefined) node.x = patch.x
    if (patch.y !== undefined) node.y = patch.y
    if (patch.width !== undefined) node.width = patch.width
    if (patch.height !== undefined) node.height = patch.height
  }
}

function sendAndWaitForUpdate(session: Session, message: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (session.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'))
      return
    }
    session.ws.send(JSON.stringify(message))
    waitForNextUpdate(session).then(resolve).catch(reject)
  })
}

function waitForNextUpdate(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(String(data))
        if (msg.type === 'error') {
          cleanup()
          reject(new Error(typeof msg.message === 'string' ? msg.message : 'Geometra server error'))
          return
        }
        if (msg.type === 'frame') {
          session.layout = msg.layout
          session.tree = msg.tree
          cleanup()
          resolve()
        } else if (msg.type === 'patch' && session.layout) {
          applyPatches(session.layout, msg.patches)
          cleanup()
          resolve()
        }
      } catch { /* ignore */ }
    }

    // Resolve after timeout even if no update comes (action may not change layout)
    const timeout = setTimeout(() => { cleanup(); resolve() }, 2000)

    function cleanup() {
      clearTimeout(timeout)
      session.ws.off('message', onMessage)
    }

    session.ws.on('message', onMessage)
  })
}
