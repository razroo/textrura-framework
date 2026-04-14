# @geometra/renderer-pdf

PDF renderer for Geometra — consumes computed geometry and produces PDF output.

## Install

```bash
npm install @geometra/renderer-pdf
```

## Current support

- Solid-color box backgrounds
- Text rendering using PDF base-14 fonts (Helvetica, Times-Roman, Courier, etc.)
- **Word wrapping** with Helvetica AFM width tables (or Courier's fixed 600-unit width); respects `whiteSpace: 'normal' | 'pre-wrap'`
- Explicit newlines (`\n`) in text
- Font size extraction from CSS font shorthand (`"16px Inter"` → 16pt)
- Nested box/text hierarchies
- Custom page dimensions (default: US Letter 612×792 pt)
- Custom background color
- Basic opacity via graphics state
- Scroll offset support
- Non-finite layout bound safety
- **Multi-page output** — when `layout.height` exceeds `pageHeight`, the content is split across consecutive pages with per-page y-bias; off-page elements are culled
- **JPEG image embedding** via `preloadImage()` or the `images` constructor option; embedded as `ASCIIHexDecode + DCTDecode` XObjects

## Current gaps

- Font embedding (only base-14 PDF fonts; width estimates use Helvetica for non-Helvetica fonts)
- Non-Helvetica AFM width tables (Times-Roman, Courier-oblique, etc. use Helvetica approximations except Courier which uses the 600-unit monospace width)
- PNG / WebP / GIF images (only JPEG via `DCTDecode`)
- Gradients, shadows, border-radius
- Selection highlights, focus rings
- Mid-word line breaks when a single word exceeds the box width (the word stays on its own line)

## Usage

### Basic text + boxes

```ts
import { box, text, toLayoutTree } from '@geometra/core'
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
import { writeFileSync } from 'node:fs'
writeFileSync('output.pdf', pdfBytes)
```

### Word-wrapped paragraph text

Pass `whiteSpace: 'normal'` on a text node to enable word wrapping within its box width:

```ts
text({
  text: 'A long paragraph of text that will wrap to fit the enclosing box…',
  font: '12px Helvetica',
  lineHeight: 16,
  whiteSpace: 'normal',
})
```

### Multi-page reports

When the root `layout.height` exceeds `pageHeight`, the renderer emits one PDF page per vertical band. Off-page elements are culled so large documents stay compact.

```ts
const renderer = new PDFRenderer({ pageWidth: 612, pageHeight: 792 })
// layout.height = 3000 → 4 pages automatically
const pdfBytes = renderer.generate(layout, tree)
```

### JPEG images

Pre-load JPEG bytes and their pixel dimensions before calling `generate()`. The image is embedded as a JPEG XObject and drawn at each matching `image()` element's layout rect.

```ts
import { readFileSync } from 'node:fs'

const jpegBytes = new Uint8Array(readFileSync('logo.jpg'))
const renderer = new PDFRenderer()
  .preloadImage('logo.jpg', { bytes: jpegBytes, width: 400, height: 200 })

const tree = box({}, [
  image({ src: 'logo.jpg', width: 200, height: 100 }),
])
```

## Notes

- The PDF renderer does not implement the live `Renderer` interface (which is frame-oriented for canvas/terminal). Instead it exposes a `generate()` method that returns `Uint8Array` PDF bytes.
- Text uses PDF base-14 fonts. The `defaultFont` option (default: `'Helvetica'`) sets the font name in the PDF; CSS font family names from element props are not mapped automatically.
- PDF coordinate system places the origin at the bottom-left; the renderer handles the y-axis flip internally.
