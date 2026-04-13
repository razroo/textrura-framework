import { describe, it, expect } from 'vitest'
import { box, text } from '@geometra/core'
import type { ComputedLayout } from 'textura'
import { PDFRenderer } from '../index.js'

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
