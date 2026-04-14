import { describe, it, expect } from 'vitest'
import { box, text, image } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import { PDFRenderer, measureTextWidth, wrapText } from '../index.js'

function pdfToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

describe('PDFRenderer', () => {
  it('generates valid PDF header', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 100, height: 100 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 100, children: [] }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    expect(str).toContain('%PDF-1.4')
    expect(str).toContain('%%EOF')
  })

  it('renders background color', () => {
    const renderer = new PDFRenderer({ background: '#ff0000' })
    const tree = box({ width: 100, height: 100 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 100, children: [] }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    // Red = 1.00 0.00 0.00 rg
    expect(str).toContain('1.00 0.00 0.00 rg')
  })

  it('renders a solid box with backgroundColor', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 200, height: 100, backgroundColor: '#0000ff' }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 200, height: 100, children: [] }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    // Blue fill
    expect(str).toContain('0.00 0.00 1.00 rg')
    // Rectangle operation
    expect(str).toContain('re f')
  })

  it('renders text with BT/ET operators', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 200, height: 100 }, [
      text({ text: 'Hello PDF', font: '14px Helvetica', lineHeight: 18, width: 100, height: 18 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [{ x: 10, y: 10, width: 100, height: 18, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    expect(str).toContain('BT')
    expect(str).toContain('(Hello PDF) Tj')
    expect(str).toContain('ET')
    expect(str).toContain('/F1 14.00 Tf')
  })

  it('escapes special characters in text', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 200, height: 100 }, [
      text({ text: 'a(b)c\\d', font: '12px Helvetica', lineHeight: 16, width: 100, height: 16 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 16, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    expect(str).toContain('(a\\(b\\)c\\\\d) Tj')
  })

  it('uses custom page dimensions', () => {
    const renderer = new PDFRenderer({ pageWidth: 300, pageHeight: 400 })
    const tree = box({ width: 300, height: 400 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 300, height: 400, children: [] }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    expect(str).toContain('/MediaBox [0 0 300.00 400.00]')
  })

  it('renders nested boxes', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 200, height: 200, backgroundColor: '#cccccc' }, [
      box({ width: 100, height: 50, backgroundColor: '#ff0000' }, []),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      children: [{ x: 10, y: 10, width: 100, height: 50, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    // Both colors present
    expect(str).toContain('0.80 0.80 0.80 rg') // #cccccc
    expect(str).toContain('1.00 0.00 0.00 rg') // #ff0000
  })

  it('skips nodes with non-finite layout bounds', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 100, height: 100, backgroundColor: '#ff0000' }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: NaN, height: 100, children: [] }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    // Should still produce valid PDF, just without the box
    expect(str).toContain('%PDF-1.4')
    expect(str).not.toContain('1.00 0.00 0.00 rg')
  })

  it('contains a valid catalog, pages, and page structure', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 100, height: 100 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 100, children: [] }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    expect(str).toContain('/Type /Catalog')
    expect(str).toContain('/Type /Pages')
    expect(str).toContain('/Type /Page')
    expect(str).toContain('/Type /Font')
    expect(str).toContain('/BaseFont /Helvetica')
    expect(str).toContain('xref')
    expect(str).toContain('trailer')
    expect(str).toContain('startxref')
  })

  it('renders text with custom color', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 200, height: 100 }, [
      text({ text: 'colored', font: '16px Helvetica', lineHeight: 20, color: '#00ff00', width: 100, height: 20 }),
    ])
    const layout: ComputedLayout = {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 20, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = pdfToString(pdf)
    expect(str).toContain('0.00 1.00 0.00 rg')
  })

  it('returns a Uint8Array', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 100, height: 100 }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 100, height: 100, children: [] }
    const pdf = renderer.generate(layout, tree)
    expect(pdf).toBeInstanceOf(Uint8Array)
    expect(pdf.length).toBeGreaterThan(0)
  })
})

describe('PDF text measurement + wrapping', () => {
  it('measureTextWidth scales with font size for Helvetica', () => {
    const at12 = measureTextWidth('Hello', 12, 'Helvetica')
    const at24 = measureTextWidth('Hello', 24, 'Helvetica')
    expect(at24).toBeCloseTo(at12 * 2, 3)
  })

  it('measureTextWidth uses fixed 600 units for Courier (monospace)', () => {
    // 'abc' at 10pt: 3 chars * 600 units * (10/1000) = 18
    expect(measureTextWidth('abc', 10, 'Courier')).toBeCloseTo(18, 3)
    // Same string at same font size yields same width as any other 3-char Courier string
    expect(measureTextWidth('xyz', 10, 'Courier')).toBeCloseTo(18, 3)
  })

  it('wrapText breaks on spaces to fit maxWidth', () => {
    const text = 'The quick brown fox jumps over the lazy dog'
    const wrapped = wrapText(text, 100, 12, 'Helvetica')
    expect(wrapped.length).toBeGreaterThan(1)
    for (const line of wrapped) {
      // No line (except possibly the final one or single-word lines) should exceed maxWidth
      const isSingleWord = !line.includes(' ')
      if (!isSingleWord) {
        expect(measureTextWidth(line, 12, 'Helvetica')).toBeLessThanOrEqual(100)
      }
    }
  })

  it('wrapText returns the original text unchanged when it fits', () => {
    const wrapped = wrapText('Hi', 1000, 12, 'Helvetica')
    expect(wrapped).toEqual(['Hi'])
  })
})

describe('PDF renderer — word wrapping', () => {
  it("wraps text when whiteSpace is 'normal'", () => {
    const renderer = new PDFRenderer()
    const longText = 'The quick brown fox jumps over the lazy dog and runs away quickly'
    const tree = box({ width: 200, height: 100 }, [
      text({
        text: longText,
        font: '14px Helvetica',
        lineHeight: 18,
        whiteSpace: 'normal',
        width: 100,
        height: 100,
      }),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 100, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    // Should contain multiple Tj operations (one per wrapped line)
    const tjMatches = str.match(/\) Tj/g)
    expect(tjMatches).not.toBeNull()
    expect(tjMatches!.length).toBeGreaterThan(1)
    // Should use Tm (text matrix) for subsequent lines
    expect(str).toContain(' Tm')
  })

  it("does not wrap when whiteSpace is missing (default)", () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 200, height: 100 }, [
      text({
        text: 'A very long single line of text',
        font: '14px Helvetica',
        lineHeight: 18,
        width: 100,
        height: 18,
      }),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 18, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    const tjMatches = str.match(/\) Tj/g)
    expect(tjMatches?.length).toBe(1)
  })

  it('preserves explicit newlines in text', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 200, height: 100 }, [
      text({
        text: 'Line one\nLine two\nLine three',
        font: '14px Helvetica',
        lineHeight: 18,
        width: 180,
        height: 60,
      }),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [{ x: 0, y: 0, width: 180, height: 60, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    expect(str).toContain('(Line one) Tj')
    expect(str).toContain('(Line two) Tj')
    expect(str).toContain('(Line three) Tj')
  })
})

describe('PDF renderer — multi-page output', () => {
  it('emits a single page when content fits the page height', () => {
    const renderer = new PDFRenderer({ pageWidth: 400, pageHeight: 500 })
    const tree = box({ width: 400, height: 400, backgroundColor: '#ff0000' }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 400, height: 400, children: [] }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    expect(str).toContain('/Count 1')
  })

  it('emits multiple pages when content exceeds page height', () => {
    const renderer = new PDFRenderer({ pageWidth: 400, pageHeight: 200 })
    const tree = box({ width: 400, height: 800, backgroundColor: '#ff0000' }, [])
    const layout: ComputedLayout = { x: 0, y: 0, width: 400, height: 800, children: [] }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    // 800 / 200 = 4 pages
    expect(str).toContain('/Count 4')
    // Should have 4 Page objects
    const pageMatches = str.match(/\/Type \/Page[^s]/g)
    expect(pageMatches?.length).toBe(4)
  })

  it('positions content correctly across pages via yBias', () => {
    const renderer = new PDFRenderer({ pageWidth: 400, pageHeight: 200 })
    // Two boxes: one on page 1 (y=50), one on page 2 (y=250)
    const tree = box({ width: 400, height: 400 }, [
      box({ width: 100, height: 50, backgroundColor: '#ff0000' }, []),
      box({ width: 100, height: 50, backgroundColor: '#00ff00' }, []),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 400, height: 400,
      children: [
        { x: 0, y: 50, width: 100, height: 50, children: [] },
        { x: 0, y: 250, width: 100, height: 50, children: [] },
      ],
    }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    // Both colors should appear (one per page)
    expect(str).toContain('1.00 0.00 0.00 rg')
    expect(str).toContain('0.00 1.00 0.00 rg')
    expect(str).toContain('/Count 2')
  })
})

describe('PDF renderer — JPEG image embedding', () => {
  // Minimal 1x1 white JPEG (valid SOI through EOI bytes)
  const tinyJpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xd9,
  ])

  it('embeds a JPEG XObject when the tree references a preloaded image', () => {
    const renderer = new PDFRenderer({
      images: {
        'test.jpg': { bytes: tinyJpeg, width: 1, height: 1 },
      },
    })
    const tree = box({ width: 200, height: 100 }, [
      image({ src: 'test.jpg', width: 100, height: 50 }),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [{ x: 10, y: 10, width: 100, height: 50, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    expect(str).toContain('/Type /XObject')
    expect(str).toContain('/Subtype /Image')
    expect(str).toContain('/Filter [/ASCIIHexDecode /DCTDecode]')
    // Content stream should use the image via `/ImN Do`
    expect(str).toContain('/Im1 Do')
  })

  it('skips image elements whose src is not preloaded', () => {
    const renderer = new PDFRenderer()
    const tree = box({ width: 200, height: 100 }, [
      image({ src: 'missing.jpg', width: 100, height: 50 }),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [{ x: 0, y: 0, width: 100, height: 50, children: [] }],
    }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    expect(str).not.toContain('/Subtype /Image')
    expect(str).not.toContain(' Do')
  })

  it('preloadImage() registers images and supports multiple images', () => {
    const bytes = tinyJpeg
    const renderer = new PDFRenderer()
      .preloadImage('a.jpg', { bytes, width: 1, height: 1 })
      .preloadImage('b.jpg', { bytes, width: 1, height: 1 })
    const tree = box({ width: 200, height: 100 }, [
      image({ src: 'a.jpg', width: 100, height: 50 }),
      image({ src: 'b.jpg', width: 100, height: 50 }),
    ])
    const layout: ComputedLayout = {
      x: 0, y: 0, width: 200, height: 100,
      children: [
        { x: 0, y: 0, width: 100, height: 50, children: [] },
        { x: 100, y: 0, width: 100, height: 50, children: [] },
      ],
    }
    const pdf = renderer.generate(layout, tree)
    const str = new TextDecoder().decode(pdf)
    expect(str).toContain('/Im1 Do')
    expect(str).toContain('/Im2 Do')
  })
})
