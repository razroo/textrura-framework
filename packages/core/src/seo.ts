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
  /**
   * Twitter / X Card metadata (`name="twitter:..."`).
   * Values are HTML-escaped; URLs and handles should be passed as plain strings.
   */
  twitter?: {
    /** e.g. `summary`, `summary_large_image`. */
    card?: string
    /** Site handle, e.g. `@myapp`. */
    site?: string
    title?: string
    description?: string
    image?: string
  }
  /**
   * Additional `<head>` markup appended verbatim (unlike `title`, meta `content`, and body text,
   * this string is not HTML-escaped).
   * Treat as trusted, pre-sanitized HTML only; never pass end-user strings here without escaping.
   */
  headExtra?: string
}

/**
 * First explicit `font-size` length in the shorthand (supports scientific notation).
 * Used only for heading-level heuristics in static HTML; non-px units map to approximate px.
 * Covers `%`, viewport units (including dynamic `d*`, small `s*`, and large `l*` variants), common font-relative units (`ch`, `cap`, `math`), and absolute lengths
 * (`pt`, `pc`, `in`, `cm`, `mm`, `Q`) aligned with typical `fonts.ts` shorthand shapes (subset of units;
 * coarse px mapping for tier heuristics only). Longer viewport unit tokens precede shorter prefixes
 * (e.g. `dvmin` before `vmin`), aligned with `fonts.ts`. A negative lookbehind skips digit runs
 * immediately after `-` so `-32px` is not read as `32px`.
 */
const FONT_SIZE_LENGTH =
  /(?<!-)(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(%|px|rem|em|pt|pc|in|cm|mm|Q|math|dvmin|dvmax|svmin|svmax|lvmin|lvmax|dvh|dvw|dvi|dvb|svh|svw|svi|svb|lvh|lvw|lvi|lvb|vmin|vmax|vh|vw|vi|vb|rlh|lh|rcap|rch|rex|ric|cap|ch|ex|ic|cqmin|cqmax|cqw|cqh|cqi|cqb)(?=[\s,;/]|$)/i

/**
 * True when the **leading** font shorthand style segment (before the first font-size length token)
 * indicates bold weight: `bold` / `bolder` as whole tokens, or numeric 700–900.
 * Substrings such as `semibold` must not match. Tokens after the size (e.g. family names like
 * `Bold` or `2024`) must not affect heading inference.
 */
function isFontBoldShorthand(stylePrefixLower: string): boolean {
  if (/\bbold\b/.test(stylePrefixLower) || /\bbolder\b/.test(stylePrefixLower)) return true
  const tokens = stylePrefixLower.match(/\b([1-9]\d{2,3})\b/g)
  if (!tokens) return false
  for (const token of tokens) {
    const n = Number.parseInt(token, 10)
    if (n >= 700 && n <= 900) return true
  }
  return false
}

/**
 * Approximate CSS px used for heading inference when the first size token is not `px`.
 * Percent is treated as a fraction of a 16px parent (common root text size). Viewport units use a
 * coarse middle viewport so hero-style `vw`/`vmin` titles map to heading tiers without a real layout.
 */
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
    case 'pc':
      return value * 16
    case 'in':
      return value * 96
    case 'cm':
      return (value * 96) / 2.54
    case 'mm':
      return (value * 96) / 25.4
    case 'q':
      return (value * 96) / 25.4 / 4
    case 'math':
      return value * 16
    case '%':
      return (value / 100) * 16
    case 'dvmin':
    case 'dvmax':
    case 'svmin':
    case 'svmax':
    case 'lvmin':
    case 'lvmax':
    case 'vmin':
    case 'vmax':
      return value * 9
    case 'dvh':
    case 'dvw':
    case 'svh':
    case 'svw':
    case 'lvh':
    case 'lvw':
    case 'vh':
    case 'vw':
      return value * 3
    case 'dvi':
    case 'dvb':
    case 'svi':
    case 'svb':
    case 'lvi':
    case 'lvb':
    case 'vi':
    case 'vb':
      return value * 3
    // Container query units: no real container in static HTML; coarse tiers only.
    case 'cqmin':
      return value * 9
    case 'cqmax':
      return value * 12
    case 'cqw':
    case 'cqh':
      return value * 3
    case 'cqi':
      return value * 8
    case 'cqb':
      return value * 18
    // Root-relative font metrics (aligned with `fonts.ts` unit set).
    case 'rcap':
      return value * 12
    case 'rch':
      return value * 8
    case 'rex':
      return value * 8
    case 'ric':
      return value * 16
    // Cap-height unit: approximate vs a 16px root for heading-tier heuristics only.
    case 'cap':
      return value * 12
    // `ch` advance width: coarse ~half-em on a 16px body for static HTML inference.
    case 'ch':
      return value * 8
    // Root / used line-height: approximate one line at typical body scale (static HTML only).
    case 'rlh':
      return value * 24
    case 'lh':
      return value * 18
    // x-height and ideographic character advance vs ~16px body.
    case 'ex':
      return value * 8
    case 'ic':
      return value * 16
    default:
      return value
  }
}

/** Infer an HTML tag from a text element's font property. */
function inferTag(element: TextElement): string {
  const rawFont = element.props.font
  const font = typeof rawFont === 'string' ? rawFont.toLowerCase() : ''
  // Detect heading-like fonts by size (first length token in shorthand)
  const sizeMatch = font.match(FONT_SIZE_LENGTH)
  let size = 14
  if (sizeMatch) {
    const n = parseFloat(sizeMatch[1]!)
    const unit = sizeMatch[2]!
    if (Number.isFinite(n)) {
      const px = fontLengthToApproxPx(n, unit)
      if (Number.isFinite(px) && px > 0) size = px
    }
  }
  const stylePrefix =
    sizeMatch && sizeMatch.index !== undefined ? font.slice(0, sizeMatch.index) : font
  const isBold = isFontBoldShorthand(stylePrefix)

  if (isBold && size >= 28) return 'h1'
  if (isBold && size >= 22) return 'h2'
  if (isBold && size >= 18) return 'h3'
  if (isBold && size >= 15) return 'h4'
  return 'p'
}

/**
 * Infer an HTML tag for a box without `semantic.tag`.
 * Click handlers on compound regions (multiple nodes or non-text children) stay `div` so crawlers do
 * not see one oversized `<button>`; leaf controls (`onClick` + lone text, or empty with `onClick`) map to `button`.
 */
function inferBoxTag(element: BoxElement): string {
  if (!element.handlers?.onClick) return 'div'
  const kids = element.children
  if (kids.length === 0) return 'button'
  if (kids.length === 1 && kids[0]!.kind === 'text') return 'button'
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

/**
 * HTML5 local name: starts with a-z, then letters/digits/hyphen. Rejects spaces, quotes, and
 * attribute injection. Used so `semantic.tag` cannot break out of the tag token in `toSemanticHTML`.
 */
const SAFE_HTML_TAG_NAME = /^[a-z][a-z0-9-]{0,127}$/

/**
 * Return a safe tag name for static HTML, or `fallback` when `tag` is missing or malformed.
 */
function sanitizeHtmlTagName(tag: string | undefined, fallback: string): string {
  if (tag === undefined || tag === '') return fallback
  const t = tag.trim().toLowerCase()
  if (!SAFE_HTML_TAG_NAME.test(t)) return fallback
  return t
}

/** Escape HTML special characters. */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * HTML `dir` attribute for explicit bidi hints. Only known values are emitted so malformed
 * serialized trees cannot inject attribute text.
 */
function dirAttribute(props: { dir?: unknown }): string | null {
  const d = props.dir
  if (d === 'ltr' || d === 'rtl' || d === 'auto') {
    return `dir="${escapeHTML(d)}"`
  }
  return null
}

/** Convert a UIElement tree to a semantic HTML string body. */
function elementToHTML(element: UIElement, indent: number): string {
  const pad = '  '.repeat(indent)

  if (element.kind === 'image') {
    const imgEl = element as ImageElement
    const alt = imgEl.semantic?.alt ?? imgEl.props.alt ?? ''
    const attrs: string[] = []
    const dir = dirAttribute(imgEl.props)
    if (dir) attrs.push(dir)
    if (imgEl.semantic?.role) attrs.push(`role="${escapeHTML(imgEl.semantic.role)}"`)
    if (imgEl.semantic?.ariaLabel) {
      attrs.push(`aria-label="${escapeHTML(imgEl.semantic.ariaLabel)}"`)
    }
    const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''
    return `${pad}<img src="${escapeHTML(imgEl.props.src)}" alt="${escapeHTML(alt)}"${attrStr}>`
  }

  if (element.kind === 'text') {
    const tag = sanitizeHtmlTagName(element.semantic?.tag, inferTag(element))
    const attrs: string[] = []
    const dir = dirAttribute(element.props)
    if (dir) attrs.push(dir)
    if (element.semantic?.role) attrs.push(`role="${escapeHTML(element.semantic.role)}"`)
    if (element.semantic?.ariaLabel) attrs.push(`aria-label="${escapeHTML(element.semantic.ariaLabel)}"`)
    const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''
    const rawText = element.props.text
    const body = escapeHTML(typeof rawText === 'string' ? rawText : '')
    if (VOID_HTML_TAGS.has(tag.toLowerCase())) {
      const voidOpen = `${pad}<${tag}${attrStr}>`
      if (body === '') return voidOpen
      return `${voidOpen}\n${pad}${body}`
    }
    return `${pad}<${tag}${attrStr}>${body}</${tag}>`
  }

  const tag = sanitizeHtmlTagName(element.semantic?.tag, inferBoxTag(element))
  const attrs: string[] = []
  const dir = dirAttribute(element.props)
  if (dir) attrs.push(dir)
  if (element.semantic?.role) attrs.push(`role="${escapeHTML(element.semantic.role)}"`)
  if (element.semantic?.ariaLabel) {
    attrs.push(`aria-label="${escapeHTML(element.semantic.ariaLabel)}"`)
  } else if (element.semantic?.alt) {
    attrs.push(`aria-label="${escapeHTML(element.semantic.alt)}"`)
  }
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''

  if (VOID_HTML_TAGS.has(tag.toLowerCase())) {
    const voidOpen = `${pad}<${tag}${attrStr}>`
    if (element.children.length === 0) return voidOpen
    const childLines = element.children.map(c => elementToHTML(c, indent + 1)).join('\n')
    return `${voidOpen}\n${childLines}`
  }

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
 *
 * When `props.dir` is `ltr`, `rtl`, or `auto` on a box, text, or image node, the HTML `dir`
 * attribute is emitted on that element’s tag. Images also honor `semantic.role` and
 * `semantic.ariaLabel` (escaped), alongside `alt` from props or `semantic.alt`.
 *
 * `semantic.tag` is validated as a safe HTML local name (letter, then letters/digits/hyphen, ≤128
 * chars); invalid values fall back to font/box inference so crawlers cannot receive broken markup.
 *
 * Default box tags: `onClick` maps to `<button>` only for an empty box or a box whose sole child is
 * `text()`; otherwise `div` (compound click targets should use `semantic.tag` / roles when needed).
 *
 * HTML5 void elements (`input`, `br`, `img`, …) never get a closing tag; if a void `semantic.tag`
 * has text content or box children, that content is serialized as following siblings (valid markup).
 *
 * `options.headExtra` is concatenated raw; all other string options and tree text are escaped.
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

  if (options.twitter) {
    if (options.twitter.card) {
      meta.push(`<meta name="twitter:card" content="${escapeHTML(options.twitter.card)}">`)
    }
    if (options.twitter.site) {
      meta.push(`<meta name="twitter:site" content="${escapeHTML(options.twitter.site)}">`)
    }
    if (options.twitter.title) {
      meta.push(`<meta name="twitter:title" content="${escapeHTML(options.twitter.title)}">`)
    }
    if (options.twitter.description) {
      meta.push(`<meta name="twitter:description" content="${escapeHTML(options.twitter.description)}">`)
    }
    if (options.twitter.image) {
      meta.push(`<meta name="twitter:image" content="${escapeHTML(options.twitter.image)}">`)
    }
  }

  if (options.headExtra) meta.push(options.headExtra)

  const body = elementToHTML(tree, 2)
  // Only accept string lang; ignore other runtime shapes so malformed options never reach escapeHTML.
  const rawLang = typeof options.lang === 'string' ? options.lang.trim() : ''
  const lang = escapeHTML(rawLang || 'en')

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
