import type { ComputedLayout } from 'textura'
import { finiteNumberOrZero, layoutBoundsAreFinite, type UIElement } from '@geometra/core'

export interface PreloadedImage {
  /** Raw JPEG bytes (SOI marker through EOI). */
  bytes: Uint8Array
  /** Image width in pixels. */
  width: number
  /** Image height in pixels. */
  height: number
}

export interface PDFRendererOptions {
  /** Page width in PDF points (1 pt = 1/72 inch). Default: 612 (US Letter). */
  pageWidth?: number
  /** Page height in PDF points. Default: 792 (US Letter). */
  pageHeight?: number
  /** Background color for the page. Default: '#ffffff'. */
  background?: string
  /** Default text font name for PDF (must be a PDF base-14 font). Default: 'Helvetica'. */
  defaultFont?: string
  /**
   * Pre-loaded JPEG images keyed by image `src`. When the tree contains `image(...)` elements with
   * matching `src` values, the image is embedded as a JPEG XObject and drawn at the layout rect.
   * PNG and other formats are not supported — callers should pre-convert to JPEG.
   */
  images?: Record<string, PreloadedImage>
}

/**
 * PDF renderer for Geometra.
 *
 * Produces a self-contained PDF 1.4 binary from computed geometry. Uses the 14 PDF base fonts
 * (no font embedding). Supports:
 *
 * - Solid-color boxes
 * - Text with word wrapping (Helvetica AFM width table; `whiteSpace: 'normal' | 'pre-wrap'`)
 * - Multi-page output when `layout.height` exceeds `pageHeight`
 * - JPEG image embedding via the `images` option (preloaded bytes + dimensions)
 * - Basic opacity
 *
 * Does not implement the `Renderer` interface (which is frame-oriented for live canvases);
 * instead exposes a `generate()` method that returns raw PDF bytes as a `Uint8Array`.
 */
export class PDFRenderer {
  private pageWidth: number
  private pageHeight: number
  private background: string
  private defaultFont: string
  private images: Record<string, PreloadedImage>

  constructor(options?: PDFRendererOptions) {
    this.pageWidth = options?.pageWidth ?? 612
    this.pageHeight = options?.pageHeight ?? 792
    this.background = options?.background ?? '#ffffff'
    this.defaultFont = options?.defaultFont ?? 'Helvetica'
    this.images = options?.images ?? {}
  }

  /**
   * Register a JPEG image by `src` so `image({ src })` elements can be embedded in the output.
   * Call before `generate()`. Returns the renderer for chaining.
   */
  preloadImage(src: string, image: PreloadedImage): this {
    this.images[src] = image
    return this
  }

  /**
   * Generate a PDF document from computed layout and element tree.
   * Returns raw PDF bytes suitable for saving to a file or serving over HTTP.
   */
  generate(layout: ComputedLayout, tree: UIElement): Uint8Array {
    const pw = this.pageWidth
    const ph = this.pageHeight
    const contentHeight = Math.max(ph, layoutBoundsAreFinite(layout) ? layout.height : ph)
    const pageCount = Math.max(1, Math.ceil(contentHeight / ph))

    // First pass: determine which images are actually used and assign XObject names
    const usedImages = this.collectUsedImages(tree)
    const imageRefs = new Map<string, string>() // src -> PDF resource name like 'Im1'
    let imgCounter = 1
    for (const src of usedImages) {
      if (this.images[src]) {
        imageRefs.set(src, `Im${imgCounter++}`)
      }
    }

    // Generate one content stream per page
    const pageStreams: string[] = []
    for (let p = 0; p < pageCount; p++) {
      const yBias = p * ph
      const ops: string[] = []

      // Background fill
      const bg = hexToRgb(this.background)
      if (bg) {
        ops.push(`${bg[0]} ${bg[1]} ${bg[2]} rg`)
        ops.push(`0 0 ${fmt(pw)} ${fmt(ph)} re f`)
      }

      this.paintNode(tree, layout, 0, 0, yBias, ph, ops, imageRefs)
      pageStreams.push(ops.join('\n'))
    }

    return buildPDF({
      pageWidth: pw,
      pageHeight: ph,
      pageStreams,
      fontName: this.defaultFont,
      images: imageRefs,
      imageData: this.images,
    })
  }

  /** Recursively collect all image `src` URLs referenced in the tree. */
  private collectUsedImages(element: UIElement, out = new Set<string>()): Set<string> {
    if (element.kind === 'image' && element.props.src) {
      out.add(element.props.src)
    } else if (element.kind === 'box') {
      for (const child of element.children) this.collectUsedImages(child, out)
    }
    return out
  }

  private paintNode(
    element: UIElement,
    layout: ComputedLayout,
    offsetX: number,
    offsetY: number,
    yBias: number,
    pageHeight: number,
    ops: string[],
    imageRefs: Map<string, string>,
  ): void {
    if (!layoutBoundsAreFinite(layout)) return

    const x = offsetX + layout.x
    const y = offsetY + layout.y
    const w = layout.width
    const h = layout.height

    // Page culling: skip nodes entirely outside the current page's y-range.
    // Container boxes with children are always walked (descendants may be visible).
    const pageTop = yBias
    const pageBottom = yBias + pageHeight
    const entirelyAbove = y + h <= pageTop
    const entirelyBelow = y >= pageBottom

    // For leaves (text, image), skip if outside the page.
    if ((element.kind === 'text' || element.kind === 'image') && (entirelyAbove || entirelyBelow)) {
      return
    }

    // PDF coord conversion: PDF origin is bottom-left, y grows upward.
    // `yBias` shifts the content window up by p*pageHeight for page p.
    const pdfX = x
    const pdfY = pageHeight - (y - yBias) - h

    if (element.kind === 'box') {
      if (!(entirelyAbove || entirelyBelow)) {
        const { backgroundColor, opacity } = element.props
        if (backgroundColor) {
          const rgb = hexToRgb(backgroundColor)
          if (rgb) {
            if (opacity !== undefined && opacity < 1) {
              ops.push('q', '/GS1 gs')
            }
            ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`)
            ops.push(`${fmt(pdfX)} ${fmt(pdfY)} ${fmt(w)} ${fmt(h)} re f`)
            if (opacity !== undefined && opacity < 1) {
              ops.push('Q')
            }
          }
        }
      }

      const childOffsetX = x - finiteNumberOrZero(element.props.scrollX)
      const childOffsetY = y - finiteNumberOrZero(element.props.scrollY)
      for (let i = 0; i < element.children.length; i++) {
        const childLayout = layout.children[i]
        if (childLayout) {
          this.paintNode(element.children[i]!, childLayout, childOffsetX, childOffsetY, yBias, pageHeight, ops, imageRefs)
        }
      }
      return
    }

    if (element.kind === 'text') {
      const { text, color, lineHeight, opacity, whiteSpace, font } = element.props
      if (!text) return

      const rgb = hexToRgb(color ?? '#000000')
      if (!rgb) return

      const fontSize = parseFontSize(font ?? '16px sans-serif')
      const lh = lineHeight ?? fontSize * 1.2

      const shouldWrap = whiteSpace === 'normal' || whiteSpace === 'pre-wrap'
      const rawLines = text.split('\n')
      const lines: string[] = []
      for (const raw of rawLines) {
        if (shouldWrap) {
          for (const wrapped of wrapText(raw, w, fontSize, this.defaultFont)) {
            lines.push(wrapped)
          }
        } else {
          lines.push(raw)
        }
      }

      if (opacity !== undefined && opacity < 1) {
        ops.push('q', '/GS1 gs')
      }

      ops.push('BT')
      ops.push(`/F1 ${fmt(fontSize)} Tf`)
      ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`)

      let firstLineDrawn = false
      for (let i = 0; i < lines.length; i++) {
        const lineTopY = y + i * lh
        if (lineTopY + lh <= yBias || lineTopY >= pageBottom) continue // skip off-page lines
        const linePdfY = pageHeight - (lineTopY - yBias) - fontSize
        if (!firstLineDrawn) {
          ops.push(`${fmt(pdfX)} ${fmt(linePdfY)} Td`)
          firstLineDrawn = true
        } else {
          // Absolute positioning for subsequent lines — use Tm (text matrix) to reset.
          ops.push(`1 0 0 1 ${fmt(pdfX)} ${fmt(linePdfY)} Tm`)
        }
        ops.push(`(${escapePDFString(lines[i]!)}) Tj`)
      }

      ops.push('ET')

      if (opacity !== undefined && opacity < 1) {
        ops.push('Q')
      }
      return
    }

    if (element.kind === 'image') {
      const { src, opacity } = element.props
      if (!src) return
      const ref = imageRefs.get(src)
      if (!ref) return // image not preloaded

      if (opacity !== undefined && opacity < 1) {
        ops.push('q', '/GS1 gs')
      } else {
        ops.push('q')
      }
      // PDF image transform: scale from 1x1 unit square to (w, h), translate to (pdfX, pdfY).
      ops.push(`${fmt(w)} 0 0 ${fmt(h)} ${fmt(pdfX)} ${fmt(pdfY)} cm`)
      ops.push(`/${ref} Do`)
      ops.push('Q')

      if (opacity !== undefined && opacity < 1) {
        // outer q/Q already handles opacity via GS1
      }
      return
    }
    // scene3d and other element kinds are not rendered in PDF
  }
}

// --- Raw PDF 1.4 generation ---

interface BuildPDFOptions {
  pageWidth: number
  pageHeight: number
  pageStreams: string[]
  fontName: string
  images: Map<string, string> // src -> PDF resource name
  imageData: Record<string, PreloadedImage>
}

function buildPDF(opts: BuildPDFOptions): Uint8Array {
  const objects: string[] = []
  let nextObj = 1

  function addObj(content: string): number {
    const id = nextObj++
    objects.push(`${id} 0 obj\n${content}\nendobj`)
    return id
  }

  // Pre-calculate object IDs
  // Layout (1-indexed):
  //   1: Catalog
  //   2: Pages
  //   3: Font
  //   4: GS1 ExtGState
  //   5..(5+N-1): Image XObjects, one per unique image
  //   After images: Page objects (one per page), then Content streams (one per page)
  const catalogId = 1
  const pagesId = 2
  const fontId = 3
  const gsId = 4

  const imageEntries: Array<{ src: string; ref: string; id: number }> = []
  let imgNextId = gsId + 1
  for (const [src, ref] of opts.images) {
    const data = opts.imageData[src]
    if (!data) continue
    imageEntries.push({ src, ref, id: imgNextId++ })
  }

  const imageBlockSize = imageEntries.length
  // Pages and content streams alternate:
  // For each page p: one Page obj, one Content obj
  const pageCount = opts.pageStreams.length
  const firstPageId = gsId + 1 + imageBlockSize
  const pageIds: number[] = []
  const contentIds: number[] = []
  for (let p = 0; p < pageCount; p++) {
    pageIds.push(firstPageId + p * 2)
    contentIds.push(firstPageId + p * 2 + 1)
  }

  // Actually emit objects in the calculated order

  // 1: Catalog
  addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  // 2: Pages
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ')
  addObj(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`)

  // 3: Font
  addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /${opts.fontName} >>`)

  // 4: GS1 ExtGState (50% opacity placeholder)
  addObj(`<< /Type /ExtGState /ca 0.5 /CA 0.5 >>`)

  // 5..: Image XObjects (JPEG with ASCIIHexDecode + DCTDecode filter chain)
  for (const entry of imageEntries) {
    const data = opts.imageData[entry.src]!
    const hex = bytesToHex(data.bytes) + '>'
    const length = hex.length
    addObj(
      `<< /Type /XObject /Subtype /Image ` +
      `/Width ${data.width} /Height ${data.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
      `/Filter [/ASCIIHexDecode /DCTDecode] /Length ${length} >>\n` +
      `stream\n${hex}\nendstream`,
    )
  }

  // Resource dict shared by all pages
  const xobjectDict = imageEntries.length > 0
    ? ` /XObject << ${imageEntries.map((e) => `/${e.ref} ${e.id} 0 R`).join(' ')} >>`
    : ''
  const resourcesStr =
    `<< /Font << /F1 ${fontId} 0 R >> ` +
    `/ExtGState << /GS1 ${gsId} 0 R >>` +
    xobjectDict +
    ` >>`

  // Page + Content pairs
  for (let p = 0; p < pageCount; p++) {
    addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R ` +
      `/MediaBox [0 0 ${fmt(opts.pageWidth)} ${fmt(opts.pageHeight)}] ` +
      `/Contents ${contentIds[p]} 0 R ` +
      `/Resources ${resourcesStr} >>`,
    )
    const stream = opts.pageStreams[p]!
    const streamBytes = new TextEncoder().encode(stream)
    addObj(`<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`)
  }

  // Assemble
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const body = objects.join('\n') + '\n'
  const xrefOffset = header.length + body.length

  const xrefEntries = [`0000000000 65535 f `]
  let offset = header.length
  for (const obj of objects) {
    xrefEntries.push(`${String(offset).padStart(10, '0')} 00000 n `)
    offset += obj.length + 1
  }

  const xref =
    `xref\n0 ${objects.length + 1}\n` +
    xrefEntries.join('\n') +
    '\n'

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`

  const fullContent = header + body + xref + trailer
  return new TextEncoder().encode(fullContent)
}

// --- Text measurement (Helvetica AFM widths, 1000 units per em) ---

/**
 * Helvetica glyph widths in AFM units (1000 = one em). Extracted from Adobe Core14 Font Metrics.
 * Index is Unicode code point; fallback for unmapped chars is the width of 'a' (556).
 */
const HELVETICA_WIDTHS: Record<number, number> = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
  64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
  96: 222, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556,
  104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556, 111: 556,
  112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722,
  120: 500, 121: 500, 122: 500, 123: 334, 124: 260, 125: 334, 126: 584,
}

/** All Courier chars are 600 units wide (monospace). */
const COURIER_FIXED_WIDTH = 600

function getCharWidth(code: number, fontName: string): number {
  const name = fontName.toLowerCase()
  if (name.startsWith('courier')) return COURIER_FIXED_WIDTH
  return HELVETICA_WIDTHS[code] ?? 556
}

/**
 * Estimate text width in PDF points given a font size and base-14 font name. Uses Helvetica AFM
 * widths for all fonts except Courier-family (monospace 600). Falls back to 556 (width of 'a')
 * for unmapped code points. Callers should treat this as an approximation — rendered widths may
 * differ slightly for non-Helvetica fonts.
 */
export function measureTextWidth(text: string, fontSize: number, fontName: string): number {
  let total = 0
  for (let i = 0; i < text.length; i++) {
    total += getCharWidth(text.charCodeAt(i), fontName)
  }
  return (total * fontSize) / 1000
}

/**
 * Greedy word-wrap: break on spaces so each line fits within `maxWidth`. Preserves original word
 * order; single words wider than `maxWidth` stay on their own line (no mid-word breaks).
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, fontName: string): string[] {
  if (maxWidth <= 0 || !text) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? current + ' ' + word : word
    if (measureTextWidth(test, fontSize, fontName) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
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

/** Encode bytes as uppercase hex without separators (for ASCIIHexDecode PDF filter). */
function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    out += (b < 16 ? '0' : '') + b.toString(16).toUpperCase()
  }
  return out
}
