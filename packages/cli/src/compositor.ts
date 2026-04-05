import type { ComputedLayout } from 'textura'
import type { UIElement } from '@geometra/core'
import WebSocket from 'ws'

interface ServerPatch {
  type: 'patch'
  patches: Array<{ path: number[]; x?: number; y?: number; width?: number; height?: number }>
}

function applyPatches(layout: ComputedLayout, patches: ServerPatch['patches']): void {
  for (const patch of patches) {
    let node: ComputedLayout = layout
    for (const idx of patch.path) node = node.children[idx]!
    if (patch.x !== undefined) node.x = patch.x
    if (patch.y !== undefined) node.y = patch.y
    if (patch.width !== undefined) node.width = patch.width
    if (patch.height !== undefined) node.height = patch.height
  }
}

interface ViewSlot {
  url: string
  ws: WebSocket | null
  layout: ComputedLayout | null
  tree: UIElement | null
  /** Rows allocated to this view in the terminal */
  rows: number
}

const ESC = '\x1b['
const RESET = `${ESC}0m`
const CLEAR = `${ESC}2J${ESC}H`
const HIDE_CURSOR = `${ESC}?25l`
const SHOW_CURSOR = `${ESC}?25h`
const moveTo = (x: number, y: number) => `${ESC}${y + 1};${x + 1}H`

function parseColor(color: string): [number, number, number] | null {
  if (color.startsWith('#')) {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]
  }
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbaMatch) {
    return [Number(rgbaMatch[1]), Number(rgbaMatch[2]), Number(rgbaMatch[3])]
  }
  return null
}

function colorToAnsi256(color: string): number | null {
  const rgb = parseColor(color)
  if (!rgb) return null
  const [r, g, b] = rgb
  if (r === g && g === b) {
    if (r < 8) return 16
    if (r > 248) return 231
    return Math.round((r - 8) / 247 * 24) + 232
  }
  return 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5)
}

function bg256(color: string): string {
  const c = colorToAnsi256(color)
  return c !== null ? `${ESC}48;5;${c}m` : ''
}
function fg256(color: string): string {
  const c = colorToAnsi256(color)
  return c !== null ? `${ESC}38;5;${c}m` : ''
}

interface Cell { char: string; fg: string; bg: string }

/**
 * Composites multiple Geometra WebSocket views into a single terminal output.
 * Each view gets a vertical slice of the terminal, rendered top-to-bottom.
 */
export class TerminalCompositor {
  private views: ViewSlot[] = []
  private width: number
  private height: number
  private grid: Cell[][] = []
  private renderScheduled = false

  constructor(
    urls: string[],
    options?: { width?: number; height?: number },
  ) {
    this.width = options?.width ?? process.stdout.columns ?? 80
    this.height = options?.height ?? process.stdout.rows ?? 24
    this.grid = this.createGrid()

    this.views = urls.map((url) => ({
      url,
      ws: null,
      layout: null,
      tree: null,
      rows: 0, // computed dynamically after first frames arrive
    }))
  }

  start(): void {
    process.stdout.write(HIDE_CURSOR + CLEAR)

    for (const view of this.views) {
      this.connectView(view)
    }
  }

  close(): void {
    for (const view of this.views) {
      view.ws?.close()
    }
    process.stdout.write(RESET + SHOW_CURSOR + CLEAR)
  }

  private connectView(view: ViewSlot): void {
    const ws = new WebSocket(view.url)
    view.ws = ws

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'frame') {
          view.layout = msg.layout
          view.tree = msg.tree
          this.scheduleRender()
        } else if (msg.type === 'patch' && view.layout && view.tree) {
          applyPatches(view.layout, msg.patches)
          this.scheduleRender()
        }
      } catch { /* ignore */ }
    })

    ws.on('error', (err) => {
      process.stderr.write(`\x1b[31m${view.url}: ${err.message}\x1b[0m\n`)
    })

    ws.on('close', () => {
      // Try reconnect after 3s
      setTimeout(() => {
        if (view.ws === ws) this.connectView(view)
      }, 3000)
    })
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return
    this.renderScheduled = true
    setImmediate(() => {
      this.renderScheduled = false
      this.compositeRender()
    })
  }

  private computeRowAllocation(): void {
    const scale = 0.15
    // Compute natural row height for each view based on layout
    const naturalHeights = this.views.map(v => {
      if (!v.layout) return 4 // minimum for unloaded views
      return Math.max(2, Math.round(v.layout.height * scale * 0.5))
    })
    const totalNatural = naturalHeights.reduce((a, b) => a + b, 0)

    if (totalNatural <= this.height) {
      // All views fit — use natural heights, give remaining to last view
      let used = 0
      for (let i = 0; i < this.views.length; i++) {
        this.views[i]!.rows = naturalHeights[i]!
        used += naturalHeights[i]!
      }
      // Give remaining rows to the last view (below-fold, most content)
      if (this.views.length > 0) {
        this.views[this.views.length - 1]!.rows += this.height - used
      }
    } else {
      // Views don't fit — scale proportionally
      for (let i = 0; i < this.views.length; i++) {
        this.views[i]!.rows = Math.max(2, Math.round(naturalHeights[i]! / totalNatural * this.height))
      }
    }
  }

  private compositeRender(): void {
    this.computeRowAllocation()
    this.grid = this.createGrid()

    let yOffset = 0
    for (const view of this.views) {
      if (view.layout && view.tree) {
        this.paintView(view.layout, view.tree, yOffset, view.rows)
      }
      yOffset += view.rows
    }

    // Flush grid to terminal
    let buf = moveTo(0, 0)
    for (let y = 0; y < this.height; y++) {
      buf += moveTo(0, y)
      let lastFg = '', lastBg = ''
      for (let x = 0; x < this.width; x++) {
        const cell = this.grid[y]![x]!
        if (cell.bg !== lastBg) { buf += cell.bg ? bg256(cell.bg) : RESET; lastBg = cell.bg }
        if (cell.fg !== lastFg) { buf += cell.fg ? fg256(cell.fg) : ''; lastFg = cell.fg }
        buf += cell.char
      }
      buf += RESET
    }
    process.stdout.write(buf)
  }

  private paintView(layout: ComputedLayout, tree: UIElement, yOffset: number, maxRows: number): void {
    const scale = 0.15
    this.paintNode(tree, layout, 0, 0, scale, yOffset, yOffset + maxRows)
  }

  private paintNode(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
    scale: number,
    minRow: number,
    maxRow: number,
  ): void {
    const x = Math.round((offsetX + layout.x) * scale)
    const y = minRow + Math.round((offsetY + layout.y) * scale * 0.5)
    const w = Math.max(1, Math.round(layout.width * scale))
    const h = Math.max(1, Math.round(layout.height * scale * 0.5))

    if (element.kind === 'box') {
      this.paintBox(element, x, y, w, h, minRow, maxRow)

      const childOffsetX = offsetX + layout.x - ((element.props.scrollX as number) ?? 0)
      const childOffsetY = offsetY + layout.y - ((element.props.scrollY as number) ?? 0)

      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.paintNode(element.children[i]!, childLayout, childOffsetX, childOffsetY, scale, minRow, maxRow)
        }
      }
    } else if (element.kind === 'scene3d') {
      // Skip 3D scenes in terminal
    } else if (element.kind !== 'image') {
      this.paintText(element, x, y, w, minRow, maxRow)
    }
  }

  private paintBox(element: any, x: number, y: number, w: number, h: number, minRow: number, maxRow: number): void {
    const bg = element.props.backgroundColor
    const gradientBg = element.props.gradient?.stops[0]?.color
    const fillColor = bg ?? gradientBg
    if (!fillColor) return

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setCell(x + dx, y + dy, ' ', '', fillColor, minRow, maxRow)
      }
    }

    if (element.props.borderColor) {
      const bc = element.props.borderColor
      if (w >= 2 && h >= 2) {
        this.setCell(x, y, '\u250c', bc, fillColor, minRow, maxRow)
        this.setCell(x + w - 1, y, '\u2510', bc, fillColor, minRow, maxRow)
        this.setCell(x, y + h - 1, '\u2514', bc, fillColor, minRow, maxRow)
        this.setCell(x + w - 1, y + h - 1, '\u2518', bc, fillColor, minRow, maxRow)
        for (let dx = 1; dx < w - 1; dx++) {
          this.setCell(x + dx, y, '\u2500', bc, fillColor, minRow, maxRow)
          this.setCell(x + dx, y + h - 1, '\u2500', bc, fillColor, minRow, maxRow)
        }
        for (let dy = 1; dy < h - 1; dy++) {
          this.setCell(x, y + dy, '\u2502', bc, fillColor, minRow, maxRow)
          this.setCell(x + w - 1, y + dy, '\u2502', bc, fillColor, minRow, maxRow)
        }
      }
    }
  }

  private paintText(element: any, x: number, y: number, w: number, minRow: number, maxRow: number): void {
    const { text, color, backgroundColor } = element.props
    const fg = color ?? '#ffffff'
    const bg = backgroundColor ?? ''

    let row = 0
    for (const paragraph of text.split('\n')) {
      if (!paragraph.length) { row++; continue }
      for (let i = 0; i < paragraph.length; i += w) {
        const chunk = paragraph.slice(i, i + w)
        for (let c = 0; c < chunk.length; c++) {
          this.setCell(x + c, y + row, chunk[c]!, fg, bg, minRow, maxRow)
        }
        row++
      }
    }
  }

  private setCell(x: number, y: number, char: string, fg: string, bg: string, minRow: number, maxRow: number): void {
    if (x < 0 || x >= this.width || y < minRow || y >= maxRow || y < 0 || y >= this.height) return
    const cell = this.grid[y]?.[x]
    if (!cell) return
    cell.char = char
    if (fg) cell.fg = fg
    if (bg) cell.bg = bg
  }

  private createGrid(): Cell[][] {
    const grid: Cell[][] = []
    for (let y = 0; y < this.height; y++) {
      const row: Cell[] = []
      for (let x = 0; x < this.width; x++) row.push({ char: ' ', fg: '', bg: '' })
      grid.push(row)
    }
    return grid
  }
}
