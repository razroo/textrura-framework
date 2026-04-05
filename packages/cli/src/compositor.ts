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
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
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
 * Composites multiple Geometra WebSocket views into a scrollable terminal.
 *
 * Renders at readable scale (width-based) into a virtual grid that can be
 * taller than the terminal. Arrow keys scroll the viewport up/down.
 * Text truncates with "…" instead of overflowing.
 */
export class TerminalCompositor {
  private views: ViewSlot[] = []
  private termWidth: number
  private termHeight: number
  /** Virtual grid — can be taller than the terminal */
  private vGrid: Cell[][] = []
  private vHeight = 0
  /** Scroll offset (which virtual row is at the top of the terminal) */
  private scrollY = 0
  private renderScheduled = false

  constructor(
    urls: string[],
    options?: { width?: number; height?: number },
  ) {
    this.termWidth = options?.width ?? process.stdout.columns ?? 80
    this.termHeight = options?.height ?? process.stdout.rows ?? 24

    this.views = urls.map((url) => ({
      url,
      ws: null,
      layout: null,
      tree: null,
    }))
  }

  start(): void {
    process.stdout.write(HIDE_CURSOR + CLEAR)
    for (const view of this.views) this.connectView(view)
    this.setupKeyboardScroll()
  }

  close(): void {
    for (const view of this.views) view.ws?.close()
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdout.write(RESET + SHOW_CURSOR + CLEAR)
  }

  private setupKeyboardScroll(): void {
    if (!process.stdin.isTTY) return
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', (data) => {
      const key = data.toString()
      if (key === '\x03' || key === 'q') { // Ctrl+C or q
        this.close()
        process.exit(0)
      }
      const maxScroll = Math.max(0, this.vHeight - this.termHeight)
      if (key === '\x1b[A' || key === 'k') { // Up arrow or k
        this.scrollY = Math.max(0, this.scrollY - 3)
        this.flushViewport()
      } else if (key === '\x1b[B' || key === 'j') { // Down arrow or j
        this.scrollY = Math.min(maxScroll, this.scrollY + 3)
        this.flushViewport()
      } else if (key === '\x1b[5~' || key === 'u') { // Page Up or u
        this.scrollY = Math.max(0, this.scrollY - this.termHeight)
        this.flushViewport()
      } else if (key === '\x1b[6~' || key === 'd') { // Page Down or d
        this.scrollY = Math.min(maxScroll, this.scrollY + this.termHeight)
        this.flushViewport()
      } else if (key === 'g') { // Home
        this.scrollY = 0
        this.flushViewport()
      } else if (key === 'G') { // End
        this.scrollY = maxScroll
        this.flushViewport()
      }
    })
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
      setTimeout(() => { if (view.ws === ws) this.connectView(view) }, 3000)
    })
  }

  private scheduleRender(): void {
    // Wait until all views have sent at least one frame before rendering
    const allReady = this.views.every(v => v.layout !== null)
    if (!allReady) return

    if (this.renderScheduled) return
    this.renderScheduled = true
    setImmediate(() => {
      this.renderScheduled = false
      this.compositeRender()
    })
  }

  private compositeRender(): void {
    // Compute scale: fit layout width to terminal columns
    let maxLayoutWidth = 1
    let totalLayoutHeight = 0
    for (const v of this.views) {
      if (v.layout) {
        if (v.layout.width > maxLayoutWidth) maxLayoutWidth = v.layout.width
        totalLayoutHeight += v.layout.height
      }
    }
    const scaleX = this.termWidth / maxLayoutWidth

    // Target: fit entire page in exactly one screenful — no scrolling needed
    const scaleY = this.termHeight / Math.max(1, totalLayoutHeight)

    let totalVRows = 0
    for (const v of this.views) {
      if (v.layout) {
        totalVRows += Math.max(1, Math.ceil(v.layout.height * scaleY))
      } else {
        totalVRows += 2
      }
    }
    this.vHeight = totalVRows

    // Build virtual grid
    this.vGrid = this.createGrid(this.termWidth, this.vHeight)

    // Paint each view into the virtual grid
    let yOffset = 0
    for (const view of this.views) {
      if (view.layout && view.tree) {
        const viewRows = Math.max(1, Math.ceil(view.layout.height * scaleY))
        this.paintNode(view.tree, view.layout, 0, 0, scaleX, scaleY, yOffset)
        yOffset += viewRows
      } else {
        yOffset += 2
      }
    }

    // Clamp scroll
    this.scrollY = Math.min(this.scrollY, Math.max(0, this.vHeight - this.termHeight))

    this.flushViewport()
  }

  /** Write the visible viewport slice of vGrid to the terminal */
  private flushViewport(): void {
    let buf = moveTo(0, 0)
    for (let ty = 0; ty < this.termHeight; ty++) {
      buf += moveTo(0, ty)
      const vy = ty + this.scrollY
      let lastFg = '', lastBg = ''
      for (let x = 0; x < this.termWidth; x++) {
        const cell = this.vGrid[vy]?.[x] ?? { char: ' ', fg: '', bg: '' }
        if (cell.bg !== lastBg) { buf += cell.bg ? bg256(cell.bg) : RESET; lastBg = cell.bg }
        if (cell.fg !== lastFg) { buf += cell.fg ? fg256(cell.fg) : ''; lastFg = cell.fg }
        buf += cell.char
      }
      buf += RESET
    }
    // Scroll indicator
    if (this.vHeight > this.termHeight) {
      const pct = Math.round(this.scrollY / Math.max(1, this.vHeight - this.termHeight) * 100)
      const indicator = ` ${pct}% ↑↓ scroll `
      buf += moveTo(this.termWidth - indicator.length - 1, this.termHeight - 1)
      buf += `${ESC}48;5;237m${ESC}38;5;252m${indicator}${RESET}`
    }
    process.stdout.write(buf)
  }

  private paintNode(
    element: UIElement, layout: ComputedLayout,
    offsetX: number, offsetY: number,
    scaleX: number, scaleY: number, baseY: number,
  ): void {
    const x = Math.round((offsetX + layout.x) * scaleX)
    const y = baseY + Math.round((offsetY + layout.y) * scaleY)
    const w = Math.max(1, Math.round(layout.width * scaleX))
    const h = Math.max(1, Math.round(layout.height * scaleY))

    if (element.kind === 'box') {
      this.paintBox(element, x, y, w, h)
      const childOffsetX = offsetX + layout.x - ((element.props.scrollX as number) ?? 0)
      const childOffsetY = offsetY + layout.y - ((element.props.scrollY as number) ?? 0)
      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.paintNode(element.children[i]!, childLayout, childOffsetX, childOffsetY, scaleX, scaleY, baseY)
        }
      }
    } else if (element.kind === 'scene3d') {
      // skip
    } else if (element.kind !== 'image') {
      this.paintText(element, x, y, w, h)
    }
  }

  private paintBox(element: UIElement, x: number, y: number, w: number, h: number): void {
    const props = element.props as Record<string, unknown>
    const bg = props.backgroundColor as string | undefined
    const gradientBg = (props.gradient as { stops: Array<{ color: string }> } | undefined)?.stops[0]?.color
    const fillColor = bg ?? gradientBg
    if (!fillColor) return

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setCell(x + dx, y + dy, ' ', '', fillColor)
      }
    }

    const bc = props.borderColor as string | undefined
    if (bc && w >= 2 && h >= 2) {
      this.setCell(x, y, '\u250c', bc, fillColor)
      this.setCell(x + w - 1, y, '\u2510', bc, fillColor)
      this.setCell(x, y + h - 1, '\u2514', bc, fillColor)
      this.setCell(x + w - 1, y + h - 1, '\u2518', bc, fillColor)
      for (let dx = 1; dx < w - 1; dx++) {
        this.setCell(x + dx, y, '\u2500', bc, fillColor)
        this.setCell(x + dx, y + h - 1, '\u2500', bc, fillColor)
      }
      for (let dy = 1; dy < h - 1; dy++) {
        this.setCell(x, y + dy, '\u2502', bc, fillColor)
        this.setCell(x + w - 1, y + dy, '\u2502', bc, fillColor)
      }
    }
  }

  private paintText(element: UIElement, x: number, y: number, w: number, h: number): void {
    const props = element.props as Record<string, unknown>
    const text = (props.text as string) ?? ''
    const fg = (props.color as string) ?? '#ffffff'
    const bg = (props.backgroundColor as string) ?? ''

    // Smart truncation: fit text into allocated w×h cells
    const lines = text.split('\n')
    let row = 0
    for (const line of lines) {
      if (row >= h) break
      if (line.length <= w) {
        // Fits — render as-is
        for (let c = 0; c < line.length; c++) {
          this.setCell(x + c, y + row, line[c]!, fg, bg)
        }
      } else {
        // Truncate with ellipsis
        const truncated = line.slice(0, Math.max(1, w - 1)) + '\u2026'
        for (let c = 0; c < Math.min(truncated.length, w); c++) {
          this.setCell(x + c, y + row, truncated[c]!, fg, bg)
        }
      }
      row++
    }
  }

  private setCell(x: number, y: number, char: string, fg: string, bg: string): void {
    if (x < 0 || x >= this.termWidth || y < 0 || y >= this.vHeight) return
    const cell = this.vGrid[y]?.[x]
    if (!cell) return
    cell.char = char
    if (fg) cell.fg = fg
    if (bg) cell.bg = bg
  }

  private createGrid(w: number, h: number): Cell[][] {
    const grid: Cell[][] = []
    for (let y = 0; y < h; y++) {
      const row: Cell[] = []
      for (let x = 0; x < w; x++) row.push({ char: ' ', fg: '', bg: '' })
      grid.push(row)
    }
    return grid
  }
}
