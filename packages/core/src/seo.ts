import type { UIElement, BoxElement, TextElement, ImageElement } from './types.js'

/** Options for semantic HTML generation. */
export interface SemanticHTMLOptions {
  /**
   * BCP 47 language tag for the root `<html lang="...">` attribute (defaults to `en`).
   * Value is HTML-escaped; prefer well-formed tags like `en-US` or `fr`.
   */
  lang?: string
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

/**
 * First explicit `font-size` length in the shorthand (supports scientific notation).
 * Used only for heading-level heuristics in static HTML; non-px units map to approximate px.
 */
const FONT_SIZE_LENGTH =
  /(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(px|rem|em|pt)\b/i

/** True when `font` shorthand indicates bold weight (keyword or numeric 700–900). */
function isFontBoldShorthand(fontLower: string): boolean {
  if (fontLower.includes('bold') || fontLower.includes('bolder')) return true
  const tokens = fontLower.match(/\b([1-9]\d{2,3})\b/g)
  if (!tokens) return false
  for (const token of tokens) {
    const n = Number.parseInt(token, 10)
    if (n >= 700 && n <= 900) return true
  }
  return false
}

/** Approximate CSS px used for heading inference when the first size token is not `px`. */
function fontLengthToApproxPx(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'px':
      return value
    case 'rem':
      return value * 16
    case 'em':
      return value * 14
    case 'pt':
      return value * (96 / 72)
    default:
      return value
  }
}

/** Infer an HTML tag from a text element's font property. */
function inferTag(element: TextElement): string {
  const font = element.props.font.toLowerCase()
  // Detect heading-like fonts by size (first length token in shorthand)
  const sizeMatch = font.match(FONT_SIZE_LENGTH)
  let size = 14
  if (sizeMatch) {
    const n = parseFloat(sizeMatch[1]!)
    const unit = sizeMatch[2]!
    if (Number.isFinite(n)) size = fontLengthToApproxPx(n, unit)
  }
  const isBold = isFontBoldShorthand(font)

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

/**
 * HTML void elements: no closing tag in HTML5.
 * Used when `semantic.tag` names a void element and the node has no children.
 */
const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

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
  if (element.semantic?.ariaLabel) {
    attrs.push(`aria-label="${escapeHTML(element.semantic.ariaLabel)}"`)
  } else if (element.semantic?.alt) {
    attrs.push(`aria-label="${escapeHTML(element.semantic.alt)}"`)
  }
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''

  if (element.children.length === 0) {
    if (VOID_HTML_TAGS.has(tag.toLowerCase())) {
      return `${pad}<${tag}${attrStr}>`
    }
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
  const lang = escapeHTML(options.lang ?? 'en')

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  ${meta.join('\n  ')}
</head>
<body>
${body}
</body>
</html>`
}
