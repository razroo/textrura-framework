import type { UIElement, BoxElement, TextElement, ImageElement } from './types.js'

/** Options for semantic HTML generation. */
export interface SemanticHTMLOptions {
  /** Page title for the <title> tag. */
  title?: string
  /** Meta description. */
  description?: string
  /** Canonical URL. */
  canonical?: string
  /** Open Graph metadata. */
  og?: {
    title?: string
    description?: string
    image?: string
    url?: string
    type?: string
  }
  /** Additional <head> content (raw HTML string). */
  headExtra?: string
}

/** First `font-size` dimension in `px` (supports scientific notation), aligned with `fonts.ts` parsing. */
const FONT_SIZE_PX = /(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)px/

/** Infer an HTML tag from a text element's font property. */
function inferTag(element: TextElement): string {
  const font = element.props.font.toLowerCase()
  // Detect heading-like fonts by size
  const sizeMatch = font.match(FONT_SIZE_PX)
  let size = 14
  if (sizeMatch) {
    const n = parseFloat(sizeMatch[1]!)
    if (Number.isFinite(n)) size = n
  }
  const isBold = font.includes('bold')

  if (isBold && size >= 28) return 'h1'
  if (isBold && size >= 22) return 'h2'
  if (isBold && size >= 18) return 'h3'
  if (isBold && size >= 15) return 'h4'
  return 'p'
}

/** Infer an HTML tag from a box element's styling and children. */
function inferBoxTag(element: BoxElement): string {
  // Check for nav-like patterns (row of clickable items)
  if (element.handlers?.onClick) return 'button'
  return 'div'
}

/** Escape HTML special characters. */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Convert a UIElement tree to a semantic HTML string body. */
function elementToHTML(element: UIElement, indent: number): string {
  const pad = '  '.repeat(indent)

  if (element.kind === 'image') {
    const imgEl = element as ImageElement
    const alt = imgEl.semantic?.alt ?? imgEl.props.alt ?? ''
    return `${pad}<img src="${escapeHTML(imgEl.props.src)}" alt="${escapeHTML(alt)}">`
  }

  if (element.kind === 'text') {
    const tag = element.semantic?.tag ?? inferTag(element)
    const attrs: string[] = []
    if (element.semantic?.role) attrs.push(`role="${escapeHTML(element.semantic.role)}"`)
    if (element.semantic?.ariaLabel) attrs.push(`aria-label="${escapeHTML(element.semantic.ariaLabel)}"`)
    const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''
    return `${pad}<${tag}${attrStr}>${escapeHTML(element.props.text)}</${tag}>`
  }

  const tag = element.semantic?.tag ?? inferBoxTag(element)
  const attrs: string[] = []
  if (element.semantic?.role) attrs.push(`role="${escapeHTML(element.semantic.role)}"`)
  if (element.semantic?.ariaLabel) attrs.push(`aria-label="${escapeHTML(element.semantic.ariaLabel)}"`)
  if (element.semantic?.alt) attrs.push(`aria-label="${escapeHTML(element.semantic.alt)}"`)
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''

  if (element.children.length === 0) {
    return `${pad}<${tag}${attrStr}></${tag}>`
  }

  const children = element.children.map(c => elementToHTML(c, indent + 1)).join('\n')
  return `${pad}<${tag}${attrStr}>\n${children}\n${pad}</${tag}>`
}

/**
 * Generate semantic HTML from a UIElement tree.
 *
 * This produces a full HTML document suitable for search engine crawlers.
 * Serve this to user-agents like Googlebot while rendering the canvas
 * version for real users.
 */
export function toSemanticHTML(
  tree: UIElement,
  options: SemanticHTMLOptions = {},
): string {
  const meta: string[] = [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  ]

  if (options.title) meta.push(`<title>${escapeHTML(options.title)}</title>`)
  if (options.description) meta.push(`<meta name="description" content="${escapeHTML(options.description)}">`)
  if (options.canonical) meta.push(`<link rel="canonical" href="${escapeHTML(options.canonical)}">`)

  if (options.og) {
    if (options.og.title) meta.push(`<meta property="og:title" content="${escapeHTML(options.og.title)}">`)
    if (options.og.description) meta.push(`<meta property="og:description" content="${escapeHTML(options.og.description)}">`)
    if (options.og.image) meta.push(`<meta property="og:image" content="${escapeHTML(options.og.image)}">`)
    if (options.og.url) meta.push(`<meta property="og:url" content="${escapeHTML(options.og.url)}">`)
    if (options.og.type) meta.push(`<meta property="og:type" content="${escapeHTML(options.og.type)}">`)
  }

  if (options.headExtra) meta.push(options.headExtra)

  const body = elementToHTML(tree, 2)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${meta.join('\n  ')}
</head>
<body>
${body}
</body>
</html>`
}
