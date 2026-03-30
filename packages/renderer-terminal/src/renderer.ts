import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement, BoxElement, TextElement } from '@geometra/core'

export interface TerminalRendererOptions {
  /** Terminal columns. Default: process.stdout.columns. */
  width?: number
  /** Terminal rows. Default: process.stdout.rows. */
  height?: number
  /** Output stream. Default: process.stdout. */
  output?: NodeJS.WritableStream
}

// ANSI escape helpers
const ESC = '\x1b['
const RESET = `${ESC}0m`
const CLEAR = `${ESC}2J${ESC}H`
const HIDE_CURSOR = `${ESC}?25l`
const SHOW_CURSOR = `${ESC}?25h`
const moveTo = (x: number, y: number) => `${ESC}${y + 1};${x + 1}H`

/** Map CSS hex colors to closest ANSI 256 color. */
function hexToAnsi256(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // Grayscale ramp
  if (r === g && g === b) {
    if (r < 8) return 16
    if (r > 248) return 231
    return Math.round((r - 8) / 247 * 24) + 232
  }

  return (
    16 +
    36 * Math.round(r / 255 * 5) +
    6 * Math.round(g / 255 * 5) +
    Math.round(b / 255 * 5)
  )
}

function bg256(color: string): string {
  return `${ESC}48;5;${hexToAnsi256(color)}m`
}

function fg256(color: string): string {
  return `${ESC}38;5;${hexToAnsi256(color)}m`
}

/** Character grid for terminal output. */
interface Cell {
  char: string
  fg: string
  bg: string
}

export class TerminalRenderer implements Renderer {
  private width: number
  private height: number
  private output: NodeJS.WritableStream
  private grid: Cell[][]

  constructor(options: TerminalRendererOptions = {}) {
    this.width = options.width ?? process.stdout.columns ?? 80
    this.height = options.height ?? process.stdout.rows ?? 24
    this.output = options.output ?? process.stdout
    this.grid = this.createGrid()
  }

  private createGrid(): Cell[][] {
    const grid: Cell[][] = []
    for (let y = 0; y < this.height; y++) {
      const row: Cell[] = []
      for (let x = 0; x < this.width; x++) {
        row.push({ char: ' ', fg: '', bg: '' })
      }
      grid.push(row)
    }
    return grid
  }

  render(layout: ComputedLayout, tree: UIElement): void {
    // Clear grid
    this.grid = this.createGrid()

    // Scale: 1 layout unit = 1 character column, but height is scaled 2:1
    // because terminal characters are ~2x taller than wide
    this.paintNode(tree, layout, 0, 0)

    // Flush to terminal
    let buf = HIDE_CURSOR + CLEAR
    for (let y = 0; y < this.height; y++) {
      buf += moveTo(0, y)
      let lastFg = ''
      let lastBg = ''

      for (let x = 0; x < this.width; x++) {
        const cell = this.grid[y]![x]!
        if (cell.bg !== lastBg) {
          buf += cell.bg ? bg256(cell.bg) : RESET
          lastBg = cell.bg
        }
        if (cell.fg !== lastFg) {
          buf += cell.fg ? fg256(cell.fg) : ''
          lastFg = cell.fg
        }
        buf += cell.char
      }
      buf += RESET
    }
    buf += SHOW_CURSOR

    this.output.write(buf)
  }

  private paintNode(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
  ): void {
    // Scale layout coords to terminal coords
    // We use a simple 1:1 horizontal, 0.5:1 vertical scale
    const scale = 0.15 // ~1px = 0.15 columns, adjust per use case
    const x = Math.round((offsetX + layout.x) * scale)
    const y = Math.round((offsetY + layout.y) * scale * 0.5)
    const w = Math.max(1, Math.round(layout.width * scale))
    const h = Math.max(1, Math.round(layout.height * scale * 0.5))

    if (element.kind === 'box') {
      this.paintBox(element, x, y, w, h)
      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.paintNode(
            element.children[i]!,
            childLayout,
            offsetX + layout.x,
            offsetY + layout.y,
          )
        }
      }
    } else {
      this.paintText(element, x, y, w, h)
    }
  }

  private paintBox(
    element: BoxElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const bg = element.props.backgroundColor
    if (!bg) return

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setCell(x + dx, y + dy, ' ', '', bg)
      }
    }

    // Draw border using box-drawing characters
    if (element.props.borderColor) {
      const bc = element.props.borderColor
      if (w >= 2 && h >= 2) {
        this.setCell(x, y, '\u250c', bc, bg ?? '')
        this.setCell(x + w - 1, y, '\u2510', bc, bg ?? '')
        this.setCell(x, y + h - 1, '\u2514', bc, bg ?? '')
        this.setCell(x + w - 1, y + h - 1, '\u2518', bc, bg ?? '')
        for (let dx = 1; dx < w - 1; dx++) {
          this.setCell(x + dx, y, '\u2500', bc, bg ?? '')
          this.setCell(x + dx, y + h - 1, '\u2500', bc, bg ?? '')
        }
        for (let dy = 1; dy < h - 1; dy++) {
          this.setCell(x, y + dy, '\u2502', bc, bg ?? '')
          this.setCell(x + w - 1, y + dy, '\u2502', bc, bg ?? '')
        }
      }
    }
  }

  private paintText(
    element: TextElement,
    x: number,
    y: number,
    w: number,
    _h: number,
  ): void {
    const { text, color, backgroundColor } = element.props
    const fg = color ?? '#ffffff'
    const bg = backgroundColor ?? ''

    let col = 0
    let row = 0
    for (const ch of text) {
      if (ch === '\n') {
        row++
        col = 0
        continue
      }
      if (col >= w) {
        row++
        col = 0
      }
      this.setCell(x + col, y + row, ch, fg, bg)
      col++
    }
  }

  private setCell(x: number, y: number, char: string, fg: string, bg: string): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
    const cell = this.grid[y]![x]!
    cell.char = char
    if (fg) cell.fg = fg
    if (bg) cell.bg = bg
  }

  destroy(): void {
    this.output.write(RESET + SHOW_CURSOR + CLEAR)
  }
}
