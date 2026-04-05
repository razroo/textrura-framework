import { TerminalRenderer } from '@geometra/renderer-terminal'
import type { ComputedLayout } from 'textura'
import type { UIElement } from '@geometra/core'
import WebSocket from 'ws'

interface ServerFrame {
  type: 'frame'
  layout: ComputedLayout
  tree: UIElement
}

interface ServerPatch {
  type: 'patch'
  patches: Array<{ path: number[]; x?: number; y?: number; width?: number; height?: number }>
}

type ServerMessage = ServerFrame | ServerPatch | { type: string }

function applyPatches(layout: ComputedLayout, patches: ServerPatch['patches']): void {
  for (const patch of patches) {
    let node: ComputedLayout = layout
    for (const idx of patch.path) {
      node = node.children[idx]!
    }
    if (patch.x !== undefined) node.x = patch.x
    if (patch.y !== undefined) node.y = patch.y
    if (patch.width !== undefined) node.width = patch.width
    if (patch.height !== undefined) node.height = patch.height
  }
}

export interface ViewOptions {
  /** WebSocket URL to connect to. */
  url: string
  /** Terminal columns (default: stdout columns). */
  width?: number
  /** Terminal rows (default: stdout rows). */
  height?: number
}

/**
 * Connect to a Geometra server WebSocket and render in the terminal.
 * Returns a cleanup function to close the connection.
 */
export function viewInTerminal(options: ViewOptions): { close: () => void } {
  const renderer = new TerminalRenderer({
    width: options.width,
    height: options.height,
  })

  let layout: ComputedLayout | null = null
  let tree: UIElement | null = null

  const ws = new WebSocket(options.url)

  ws.on('message', (data) => {
    try {
      const msg: ServerMessage = JSON.parse(data.toString())

      if (msg.type === 'frame') {
        const frame = msg as ServerFrame
        layout = frame.layout
        tree = frame.tree
        renderer.render(layout, tree)
      } else if (msg.type === 'patch' && layout && tree) {
        applyPatches(layout, (msg as ServerPatch).patches)
        renderer.render(layout, tree)
      }
    } catch {
      // ignore parse errors
    }
  })

  ws.on('error', (err) => {
    process.stderr.write(`\x1b[31mConnection error: ${err.message}\x1b[0m\n`)
  })

  ws.on('close', () => {
    renderer.destroy()
    process.stderr.write('Disconnected.\n')
  })

  return {
    close() {
      ws.close()
      renderer.destroy()
    },
  }
}
