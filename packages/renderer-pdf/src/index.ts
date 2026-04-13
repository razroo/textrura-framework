import type { ComputedLayout } from 'textura'
import { finiteNumberOrZero, layoutBoundsAreFinite, type UIElement } from '@geometra/core'

export interface PDFRendererOptions {
  /** Page width in PDF points (1 pt = 1/72 inch). Default: 612 (US Letter). */
  pageWidth?: number
  /** Page height in PDF points. Default: 792 (US Letter). */
  pageHeight?: number
  /** Background color for the page. Default: '#ffffff'. */
  background?: string
  /** Default text font name for PDF (must be a PDF base-14 font). Default: 'Helvetica'. */
  defaultFont?: string
}

/**
 * PDF renderer for Geometra.
 *
 * Produces a self-contained PDF 1.4 binary from computed geometry. Uses only
 * the 14 PDF base fonts (no font embedding). Renders solid boxes, text, and
 * basic opacity. Does not implement the `Renderer` interface (which is
 * frame-oriented for live canvases); instead exposes a `generate()` method
 * that returns a `Uint8Array`.
 */
export class PDFRenderer {
  private pageWidth: number
  private pageHeight: number
  private background: string
  private defaultFont: string

  constructor(options?: PDFRendererOptions) {
    this.pageWidth = options?.pageWidth ?? 612
    this.pageHeight = options?.pageHeight ?? 792
    this.background = options?.background ?? '#ffffff'
    this.defaultFont = options?.defaultFont ?? 'Helvetica'
  }

  /**
   * Generate a PDF document from computed layout and element tree.
   * Returns raw PDF bytes suitable for saving to a file or serving over HTTP.
   */
  generate(layout: ComputedLayout, tree: UIElement): Uint8Array {
    const pw = this.pageWidth
    const ph = this.pageHeight

    // Collect draw operations
    const ops: string[] = []

    // Background
    const bg = hexToRgb(this.background)
    if (bg) {
      ops.push(`${bg[0]} ${bg[1]} ${bg[2]} rg`)
      ops.push(`0 0 ${pw} ${ph} re f`)
    }

    // Walk the tree
    this.paintNode(tree, layout, 0, 0, ph, ops)

    const contentStream = ops.join('\n')
    return buildPDF(pw, ph, contentStream, this.defaultFont)
  }

  private paintNode(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
    pageHeight: number,
    ops: string[],
  ): void {
    if (!layoutBoundsAreFinite(layout)) return

    const x = offsetX + layout.x
    const y = offsetY + layout.y
    const w = layout.width
    const h = layout.height

    // PDF coordinate system: origin at bottom-left, y increases upward
    const pdfX = x
    const pdfY = pageHeight - y - h

    if (element.kind === 'box') {
      const { backgroundColor, opacity } = element.props

      if (backgroundColor) {
        const rgb = hexToRgb(backgroundColor)
        if (rgb) {
          if (opacity !== undefined && opacity < 1) {
            ops.push('q')
            ops.push(`/GS1 gs`)
          }
          ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`)
          ops.push(`${fmt(pdfX)} ${fmt(pdfY)} ${fmt(w)} ${fmt(h)} re f`)
          if (opacity !== undefined && opacity < 1) {
            ops.push('Q')
          }
        }
      }

      const childOffsetX = x - finiteNumberOrZero(element.props.scrollX)
      const childOffsetY = y - finiteNumberOrZero(element.props.scrollY)
      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.paintNode(element.children[i]!, childLayout, childOffsetX, childOffsetY, pageHeight, ops)
        }
      }
    } else if (element.kind === 'text') {
      const { text, color, lineHeight, opacity } = element.props
      if (!text) return

      const rgb = hexToRgb(color ?? '#000000')
      if (!rgb) return

      // Extract font size from the font shorthand (e.g. "16px Inter" -> 16)
      const fontSize = parseFontSize(element.props.font ?? '16px sans-serif')

      if (opacity !== undefined && opacity < 1) {
        ops.push('q')
        ops.push('/GS1 gs')
      }

      ops.push('BT')
      ops.push(`/F1 ${fmt(fontSize)} Tf`)
      ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`)

      const lh = lineHeight ?? fontSize * 1.2
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const lineY = pageHeight - (y + i * lh) - fontSize
        ops.push(`${fmt(pdfX)} ${fmt(lineY)} Td`)
        ops.push(`(${escapePDFString(lines[i]!)}) Tj`)
      }

      ops.push('ET')

      if (opacity !== undefined && opacity < 1) {
        ops.push('Q')
      }
    }
    // image and scene3d are not rendered in PDF
  }
}

// --- Raw PDF 1.4 generation ---

function buildPDF(pageWidth: number, pageHeight: number, contentStream: string, fontName: string): Uint8Array {
  const objects: string[] = []
  let nextObj = 1

  function addObj(content: string): number {
    const id = nextObj++
    objects.push(`${id} 0 obj\n${content}\nendobj`)
    return id
  }

  // 1: Catalog
  const pagesId = nextObj + 1
  addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  // 2: Pages
  const pageId = nextObj + 1
  addObj(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`)

  // 3: Page
  const contentsId = nextObj + 1
  const resourcesId = nextObj + 2
  addObj(
    `<< /Type /Page /Parent ${pagesId} 0 R ` +
    `/MediaBox [0 0 ${fmt(pageWidth)} ${fmt(pageHeight)}] ` +
    `/Contents ${contentsId} 0 R ` +
    `/Resources ${resourcesId} 0 R >>`,
  )

  // 4: Content stream
  const streamBytes = new TextEncoder().encode(contentStream)
  addObj(
    `<< /Length ${streamBytes.length} >>\nstream\n${contentStream}\nendstream`,
  )

  // 5: Resources (font + graphics state for opacity)
  const fontId = nextObj + 1
  const gsId = nextObj + 2
  addObj(
    `<< /Font << /F1 ${fontId} 0 R >> ` +
    `/ExtGState << /GS1 ${gsId} 0 R >> >>`,
  )

  // 6: Font
  addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} >>`)

  // 7: Graphics state (50% opacity placeholder — real per-element opacity would need per-node GS)
  addObj(`<< /Type /ExtGState /ca 0.5 /CA 0.5 >>`)

  // Build the file
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const body = objects.join('\n') + '\n'
  const xrefOffset = header.length + body.length

  const xrefEntries = [`0000000000 65535 f `]
  let offset = header.length
  for (const obj of objects) {
    xrefEntries.push(`${String(offset).padStart(10, '0')} 00000 n `)
    offset += obj.length + 1 // +1 for the newline
  }

  const xref =
    `xref\n0 ${objects.length + 1}\n` +
    xrefEntries.join('\n') +
    '\n'

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`

  const fullContent = header + body + xref + trailer
  return new TextEncoder().encode(fullContent)
}

// --- Helpers ---

function hexToRgb(color: string): [string, string, string] | null {
  if (!color.startsWith('#')) {
    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (m) {
      return [
        fmt(Number(m[1]) / 255),
        fmt(Number(m[2]) / 255),
        fmt(Number(m[3]) / 255),
      ]
    }
    return null
  }
  const hex = color.slice(1)
  const full = hex.length === 3
    ? hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
    : hex
  return [
    fmt(parseInt(full.slice(0, 2), 16) / 255),
    fmt(parseInt(full.slice(2, 4), 16) / 255),
    fmt(parseInt(full.slice(4, 6), 16) / 255),
  ]
}

function parseFontSize(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)\s*px/)
  return m ? Number(m[1]) : 16
}

function escapePDFString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}
