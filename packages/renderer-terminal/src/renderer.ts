import type { ComputedLayout } from 'textura'
import type { Renderer, UIElement, BoxElement, TextElement, ImageElement } from '@geometra/core'

export interface TerminalRendererOptions {
  /** Terminal columns. Default: process.stdout.columns. */
  width?: number
  /** Terminal rows. Default: process.stdout.rows. */
  height?: number
  /** Output stream. Default: process.stdout. */
  output?: NodeJS.WritableStream
}

const ESC = '\x1b['
const RESET = `${ESC}0m`
const CLEAR = `${ESC}2J${ESC}H`
const HIDE_CURSOR = `${ESC}?25l`
const SHOW_CURSOR = `${ESC}?25h`
const moveTo = (x: number, y: number) => `${ESC}${y + 1};${x + 1}H`

function hexToAnsi256(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  if (r === g && g === b) {
    if (r < 8) return 16
    if (r > 248) return 231
    return Math.round((r - 8) / 247 * 24) + 232
  }

  return 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5)
}

function bg256(color: string): string { return `${ESC}48;5;${hexToAnsi256(color)}m` }
function fg256(color: string): string { return `${ESC}38;5;${hexToAnsi256(color)}m` }

interface Cell { char: string; fg: string; bg: string }
interface ClipRect { x: number; y: number; w: number; h: number }

export class TerminalRenderer implements Renderer {
  private width: number
  private height: number
  private output: NodeJS.WritableStream
  private grid: Cell[][]
  private clipStack: ClipRect[] = []

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
    this.grid = this.createGrid()
    this.clipStack = []
    this.paintNode(tree, layout, 0, 0)

    let buf = HIDE_CURSOR + CLEAR
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
    buf += SHOW_CURSOR
    this.output.write(buf)
  }

  private paintNode(element: UIElement, layout: ComputedLayout, offsetX: number, offsetY: number): void {
    const scale = 0.15
    const x = Math.round((offsetX + layout.x) * scale)
    const y = Math.round((offsetY + layout.y) * scale * 0.5)
    const w = Math.max(1, Math.round(layout.width * scale))
    const h = Math.max(1, Math.round(layout.height * scale * 0.5))

    if (element.kind === 'box') {
      this.paintBox(element, x, y, w, h)

      const { overflow, scrollX, scrollY } = element.props
      const shouldClip = overflow === 'hidden' || overflow === 'scroll'
      if (shouldClip) {
        this.clipStack.push({ x, y, w, h })
      }

      const childOffsetX = offsetX + layout.x - (scrollX ?? 0)
      const childOffsetY = offsetY + layout.y - (scrollY ?? 0)

      // Sort children by zIndex
      const indices = element.children.map((_, i) => i)
      const hasZIndex = element.children.some(c => (c.props as Record<string, unknown>).zIndex !== undefined)
      if (hasZIndex) {
        indices.sort((a, b) => {
          const zA = (element.children[a]!.props as Record<string, unknown>).zIndex as number | undefined ?? 0
          const zB = (element.children[b]!.props as Record<string, unknown>).zIndex as number | undefined ?? 0
          return zA - zB
        })
      }

      for (const i of indices) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.paintNode(element.children[i]!, childLayout, childOffsetX, childOffsetY)
        }
      }

      if (shouldClip) {
        this.clipStack.pop()
      }
    } else if (element.kind === 'image') {
      this.paintImagePlaceholder(element, x, y, w, h)
    } else if (element.kind === 'scene3d') {
      // scene3d not supported in terminal — skip silently
    } else {
      this.paintText(element, x, y, w, h)
    }
  }

  private paintBox(element: BoxElement, x: number, y: number, w: number, h: number): void {
    const bg = element.props.backgroundColor
    // Use first gradient stop color as fallback
    const gradientBg = element.props.gradient?.stops[0]?.color
    const fillColor = bg ?? gradientBg
    if (!fillColor) return

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setCell(x + dx, y + dy, ' ', '', fillColor)
      }
    }

    if (element.props.borderColor) {
      const bc = element.props.borderColor
      if (w >= 2 && h >= 2) {
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
  }

  private paintImagePlaceholder(_element: ImageElement, x: number, y: number, w: number, h: number): void {
    const label = '[IMG]'
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setCell(x + dx, y + dy, ' ', '', '#27272a')
      }
    }
    for (let i = 0; i < label.length && i < w; i++) {
      this.setCell(x + i, y, label[i]!, '#a1a1aa', '#27272a')
    }
  }

  private paintText(element: TextElement, x: number, y: number, w: number, _h: number): void {
    const { text, color, backgroundColor, dir } = element.props
    const fg = color ?? '#ffffff'
    const bg = backgroundColor ?? ''
    const rtl = dir === 'rtl'

    let row = 0
    const paragraphs = text.split('\n')
    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) {
        row++
        continue
      }
      for (let i = 0; i < paragraph.length; i += w) {
        const chunk = paragraph.slice(i, i + w)
        const startCol = rtl ? Math.max(0, w - chunk.length) : 0
        for (let c = 0; c < chunk.length; c++) {
          this.setCell(x + startCol + c, y + row, chunk[c]!, fg, bg)
        }
        row++
      }
    }
  }

  private setCell(x: number, y: number, char: string, fg: string, bg: string): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return

    // Check clip stack
    for (const clip of this.clipStack) {
      if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return
    }

    const cell = this.grid[y]![x]!
    cell.char = char
    if (fg) cell.fg = fg
    if (bg) cell.bg = bg
  }

  destroy(): void {
    this.output.write(RESET + SHOW_CURSOR + CLEAR)
  }
}
