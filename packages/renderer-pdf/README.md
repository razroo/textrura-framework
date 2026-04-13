# @geometra/renderer-pdf

PDF renderer for Geometra — consumes computed geometry and produces PDF output.

## Install

```bash
npm install @geometra/renderer-pdf
```

## Current support

- Solid-color box backgrounds
- Text rendering using PDF base-14 fonts (Helvetica, Times-Roman, Courier, etc.)
- Font size extraction from CSS font shorthand (`"16px Inter"` → 16pt)
- Nested box/text hierarchies
- Custom page dimensions (default: US Letter 612×792 pt)
- Custom background color
- Basic opacity via graphics state
- Scroll offset support
- Non-finite layout bound safety

## Current gaps

- Font embedding (only base-14 PDF fonts; custom fonts render as Helvetica)
- Word wrapping (text wraps at newlines only; Textura handles wrapping in layout)
- Images
- Gradients, shadows, border-radius
- Selection highlights, focus rings
- Multi-page output

## Usage

```ts
import { box, text } from '@geometra/core'
import { computeLayout, init } from 'textura'
import { PDFRenderer } from '@geometra/renderer-pdf'

await init()

const tree = box({ width: 400, height: 200, backgroundColor: '#f0f0f0' }, [
  text({ text: 'Hello PDF', font: '24px Helvetica', lineHeight: 30, color: '#333' }),
])

const layoutTree = toLayoutTree(tree)
const layout = computeLayout(layoutTree, { width: 400, height: 200 })

const renderer = new PDFRenderer({ pageWidth: 400, pageHeight: 200 })
const pdfBytes = renderer.generate(layout, tree)

// Save to file (Node.js)
import { writeFileSync } from 'fs'
writeFileSync('output.pdf', pdfBytes)
```

## Notes

- The PDF renderer does not implement the live `Renderer` interface (which is frame-oriented for canvas/terminal). Instead it exposes a `generate()` method that returns `Uint8Array` PDF bytes.
- Text uses PDF base-14 fonts. The `defaultFont` option (default: `'Helvetica'`) sets the font name in the PDF; CSS font family names from element props are not mapped automatically.
- PDF coordinate system places the origin at the bottom-left; the renderer handles the y-axis flip internally.
