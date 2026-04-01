import type { UIElement } from './types.js'

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
])

/** CSS-wide keywords that may appear in `font` / family lists but are not concrete family names. */
const CSS_WIDE_FONT_KEYWORDS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
])

/**
 * Single-keyword `font` values that select the UA system font (CSS Fonts); not concrete families
 * and must not be passed to `document.fonts.load`.
 */
const SYSTEM_FONT_KEYWORDS = new Set([
  'caption',
  'icon',
  'menu',
  'message-box',
  'small-caption',
  'status-bar',
])

/**
 * Font-size units we treat as the numeric token before the family list in `font` shorthand.
 * Longer tokens precede shorter prefixes (e.g. `dvmin` before `vmin`, `rlh` before `lh`, `rch` before `ch`).
 */
const FONT_SIZE_UNIT =
  '(?:dvmin|dvmax|svmin|svmax|lvmin|lvmax|dvh|dvw|dvi|dvb|svh|svw|svi|svb|lvh|lvw|lvi|lvb|' +
  'vmin|vmax|vh|vw|vi|vb|' +
  'cqmin|cqmax|cqi|cqb|cqw|cqh|' +
  'rlh|rcap|rch|rex|ric|' +
  'rem|cap|px|em|pt|pc|in|cm|math|mm|Q|%|ch|ex|ic|lh)'

/** Magnitude in a `font-size` dimension token (allows scientific notation, e.g. `1e2px`). */
const FONT_SIZE_NUMBER = String.raw`\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`

/** Optional `/ line-height` after font-size in shorthand (numeric length or keyword `normal`). */
const FONT_SHORTHAND_LINE_HEIGHT =
  String.raw`(?:\/\s*(?:` + FONT_SIZE_NUMBER + FONT_SIZE_UNIT + String.raw`?|normal))?`

const FONT_SHORTHAND_FAMILY_TAIL = new RegExp(
  String.raw`\b(` + FONT_SIZE_NUMBER + FONT_SIZE_UNIT + String.raw`)\s*` + FONT_SHORTHAND_LINE_HEIGHT + String.raw`\s+(.+)$`,
  'i',
)

const FONT_SIZE_ONLY = new RegExp(String.raw`^` + FONT_SIZE_NUMBER + FONT_SIZE_UNIT + String.raw`$`, 'i')

/** True when the family tail begins with a dimension token + space (another size before the real family). */
const TAIL_LEADS_WITH_SIZE_TOKEN = new RegExp(
  String.raw`^` + FONT_SIZE_NUMBER + FONT_SIZE_UNIT + String.raw`\s+`,
  'i',
)

/**
 * Upper bound on leading token strips for `font` shorthand parsing (pathological inputs stay finite).
 * Long font-stretch / leading-percent stacks before the real size + family can consume one strip each.
 */
const MAX_SHORTHAND_STRIP_ITERATIONS = 4096

/**
 * After the primary strip budget, if this many characters remain and another peel is still required,
 * return [] instead of continuing (avoids O(n²) regex work and bogus synthesized family names).
 */
const MAX_REMAINDER_AFTER_PRIMARY_STRIP = 16_384

/** Extra peels allowed on modest remainders once the primary budget is exhausted. */
const EXTRA_SHORTHAND_STRIP_ITERATIONS = 8192

/** Split a CSS font-family list on commas not inside single or double quotes. */
function splitFontFamilyList(tail: string): string[] {
  const parts: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < tail.length; i++) {
    const c = tail[i]!
    if (quote) {
      if (c === '\\' && i + 1 < tail.length) {
        cur += tail[i + 1]!
        i++
        continue
      }
      cur += c
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      cur += c
      continue
    }
    if (c === ',') {
      const t = cur.trim()
      if (t.length > 0) parts.push(t)
      cur = ''
      continue
    }
    cur += c
  }
  const last = cur.trim()
  if (last.length > 0) parts.push(last)
  return parts
}

/**
 * Extract custom font family names from a CSS `font` shorthand (e.g. `600 14px Inter`).
 * Drops generic fallbacks like `sans-serif`, CSS-wide keywords (`inherit`, `initial`, …), and
 * system font keywords (`caption`, `menu`, …).
 * Repeated custom names in the same list collapse
 * to the first spelling (comparison is case-insensitive, e.g. `Inter, inter` → one entry).
 * Best-effort parsing for common patterns.
 * Commas inside quoted family names are ignored; `\\` escapes the next character inside quotes (e.g. `\"` for a literal `"`).
 * Recognizes common font-size units (px, em, rem, cap/ic/lh/rlh, root-relative r* units, pt, %, viewport, viewport inline/block (`vi`/`vb` and `d*`/`s*`/`l*` variants), dynamic-viewport, container query, Q, and math units), including scientific notation on the numeric part (e.g. `1e2px`).
 * When a percentage is used as `font-stretch` before the real font size (e.g. `75% 14px Inter`),
 * skips that leading dimension so the size + family tail is parsed correctly.
 * Very long chains of leading size tokens are peeled with a bounded primary budget, then a secondary pass on modest remainders.
 * If an oversized tail still looks like stacked size tokens, returns [] rather than inventing a family name or doing pathological work.
 * Line-height after `/` may be numeric (with optional unit) or the `normal` keyword.
 */
export function extractFontFamiliesFromCSSFont(font: string): string[] {
  function filterFamilies(tail: string): string[] {
    const raw = splitFontFamilyList(tail)
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(
        f =>
          f.length > 0 &&
          !GENERIC_FAMILIES.has(f.toLowerCase()) &&
          !CSS_WIDE_FONT_KEYWORDS.has(f.toLowerCase()) &&
          !SYSTEM_FONT_KEYWORDS.has(f.toLowerCase()) &&
          !FONT_SIZE_ONLY.test(f),
      )
    const seen = new Set<string>()
    const out: string[] = []
    for (const f of raw) {
      const key = f.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(f)
    }
    return out
  }

  type PeelResult =
    | { kind: 'family'; tail: string }
    | { kind: 'peeled'; next: string }
    | { kind: 'none' }

  function peelFontShorthand(s: string): PeelResult {
    const m = s.match(FONT_SHORTHAND_FAMILY_TAIL)
    if (!m) return { kind: 'none' }
    const tail = m[2]!
    const firstSegment = splitFontFamilyList(tail)[0]?.trim() ?? ''
    const tailLeadsWithAnotherSize =
      FONT_SIZE_ONLY.test(firstSegment) || TAIL_LEADS_WITH_SIZE_TOKEN.test(tail)
    if (!tailLeadsWithAnotherSize) return { kind: 'family', tail }
    const matchIndex = m.index ?? 0
    return { kind: 'peeled', next: s.slice(matchIndex + m[1]!.length).trimStart() }
  }

  let trimmed = font.trim()
  for (let i = 0; i < MAX_SHORTHAND_STRIP_ITERATIONS; i++) {
    const r = peelFontShorthand(trimmed)
    if (r.kind === 'none') break
    if (r.kind === 'family') return filterFamilies(r.tail)
    trimmed = r.next
  }

  if (trimmed.length > MAX_REMAINDER_AFTER_PRIMARY_STRIP) {
    const r = peelFontShorthand(trimmed)
    if (r.kind === 'peeled') return []
  }

  for (let i = 0; i < EXTRA_SHORTHAND_STRIP_ITERATIONS; i++) {
    const r = peelFontShorthand(trimmed)
    if (r.kind === 'none') break
    if (r.kind === 'family') return filterFamilies(r.tail)
    trimmed = r.next
  }

  const last = peelFontShorthand(trimmed)
  if (last.kind === 'family') return filterFamilies(last.tail)
  if (last.kind === 'peeled') return []
  return filterFamilies(trimmed)
}

/**
 * Collect unique font families referenced by text nodes in a UI tree.
 * Order is first-seen in a depth-first preorder walk (later duplicates are skipped).
 */
export function collectFontFamiliesFromTree(root: UIElement): string[] {
  const out = new Set<string>()
  function walk(el: UIElement): void {
    if (el.kind === 'text') {
      for (const f of extractFontFamiliesFromCSSFont(el.props.font)) {
        out.add(f)
      }
    } else if (el.kind === 'box') {
      for (const c of el.children) walk(c)
    }
  }
  walk(root)
  return [...out]
}

/**
 * Wait for web fonts used by the app. Browser only; no-op on server.
 * Uses `document.fonts.load` per family; timeouts are swallowed so startup never hard-fails.
 * Empty and whitespace-only family strings are ignored; names are trimmed before load and deduped.
 */
export async function waitForFonts(families: string[], timeoutMs = 10_000): Promise<void> {
  if (typeof document === 'undefined' || families.length === 0) return
  const api = document.fonts
  if (!api?.load) return

  const unique = [...new Set(families.map(f => f.trim()).filter(f => f.length > 0))]
  if (unique.length === 0) return
  const work = Promise.all(unique.map(f => api.load(`16px ${f}`).catch(() => undefined))).then(() =>
    Promise.resolve(api.ready).catch(() => undefined),
  )

  try {
    await Promise.race([
      work,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Font load timeout')), timeoutMs)
      }),
    ])
  } catch {
    /* best-effort */
  }
}
