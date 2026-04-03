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

/**
 * Size + required `/ line-height` before the family list. Family tail may be empty (invalid shorthand
 * with no family); tried before {@link FONT_SHORTHAND_FAMILY_TAIL} so `/ normal` is not misparsed as a family.
 */
const FONT_SHORTHAND_SLASH_LINE_TAIL = new RegExp(
  String.raw`\b(` +
    FONT_SIZE_NUMBER +
    FONT_SIZE_UNIT +
    String.raw`)\s*\/\s*(?:` +
    FONT_SIZE_NUMBER +
    FONT_SIZE_UNIT +
    String.raw`?|normal)\s*(.*)$`,
  'i',
)

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

/** Max leading `smaller` / `larger` peels (relative font-size keywords before family or explicit size). */
const MAX_RELATIVE_SIZE_PREFIX_STRIPS = 8

/**
 * CSS absolute font-size keywords (CSS Fonts). When they lead the shorthand they must be peeled before
 * size+family parsing; when a comma-separated segment is exactly one of these (unquoted), it is not a
 * family name (quoted names still pass through).
 */
const ABSOLUTE_FONT_SIZE_KEYWORDS = new Set([
  'xx-small',
  'x-small',
  'small',
  'medium',
  'large',
  'x-large',
  'xx-large',
  'xxx-large',
])

/** Longest-match alternation so `xx-large` does not match as `x-large` + `large`. */
const ABSOLUTE_FONT_SIZE_PREFIX = /^(xxx-large|xx-large|xx-small|x-large|x-small|small|medium|large)\s+/i

/** Max leading absolute keyword strips (pathological stacks stay bounded). */
const MAX_ABSOLUTE_SIZE_PREFIX_STRIPS = 16

/** Index after the closing `)` that matches `s[openParenIndex]` (which must be `(`). */
function indexAfterMatchingParen(s: string, openParenIndex: number): number | null {
  let depth = 0
  for (let i = openParenIndex; i < s.length; i++) {
    const c = s[i]!
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return null
}

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
 * CSS math functions `calc()`, `min()`, `max()`, and `clamp()` are treated as a single font-size token (balanced parentheses; commas inside are allowed).
 * When a percentage is used as `font-stretch` before the real font size (e.g. `75% 14px Inter`),
 * skips that leading dimension so the size + family tail is parsed correctly.
 * Very long chains of leading size tokens are peeled with a bounded primary budget, then a secondary pass on modest remainders.
 * If an oversized tail still looks like stacked size tokens, returns [] rather than inventing a family name or doing pathological work.
 * Line-height after `/` may be numeric (with optional unit) or the `normal` keyword; a slash line-height
 * with no following family list yields no families (e.g. `14px / normal` alone).
 * Leading relative size keywords `smaller` and `larger` (CSS Fonts) are stripped so
 * values like `smaller Inter, serif` resolve to concrete families for {@link waitForFonts}.
 * Leading absolute size keywords (`medium`, `xx-small`, `large`, …) are stripped the same way.
 * A comma-list segment that is exactly an absolute size keyword is dropped when unquoted; the same word
 * inside quotes is kept (CSS requires quoting when a family name matches a keyword).
 * Unquoted `url(...)` and `format(...)` segments (e.g. mistaken `@font-face` `src` paste) are not
 * concrete family names and are skipped so {@link waitForFonts} does not call `load` with them.
 * The same spellings inside quotes are kept as literal family names (CSS `font-family` rules).
 */
export function extractFontFamiliesFromCSSFont(font: string): string[] {
  function filterFamilies(tail: string): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    for (const seg of splitFontFamilyList(tail)) {
      const t = seg.trim()
      if (t.length === 0) continue
      const doubleQuoted = t.length >= 2 && t.startsWith('"') && t.endsWith('"')
      const singleQuoted = t.length >= 2 && t.startsWith("'") && t.endsWith("'")
      const quoted = doubleQuoted || singleQuoted
      const inner = t.replace(/^["']|["']$/g, '')
      if (inner.length === 0) continue
      const lead = inner.trimStart()
      if (!quoted && /^url\s*\(/i.test(lead)) continue
      if (!quoted && /^format\s*\(/i.test(lead)) continue
      if (!quoted && ABSOLUTE_FONT_SIZE_KEYWORDS.has(inner.toLowerCase())) continue
      if (
        GENERIC_FAMILIES.has(inner.toLowerCase()) ||
        CSS_WIDE_FONT_KEYWORDS.has(inner.toLowerCase()) ||
        SYSTEM_FONT_KEYWORDS.has(inner.toLowerCase()) ||
        FONT_SIZE_ONLY.test(inner)
      ) {
        continue
      }
      const key = inner.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(inner)
    }
    return out
  }

  type PeelResult =
    | { kind: 'family'; tail: string }
    | { kind: 'peeled'; next: string }
    | { kind: 'none' }

  function firstFamilyListSegment(tail: string): string {
    return splitFontFamilyList(tail)[0]?.trim() ?? ''
  }

  /** True when the family tail still begins with another size token (dimension, stacked shorthand, or CSS math size). */
  function tailLeadsWithStackedSize(tail: string): boolean {
    const first = firstFamilyListSegment(tail)
    return (
      FONT_SIZE_ONLY.test(first) ||
      TAIL_LEADS_WITH_SIZE_TOKEN.test(tail) ||
      /^(calc|min|max|clamp)\s*\(/i.test(first)
    )
  }

  const MATH_SIZE_OPEN = /\b(calc|min|max|clamp)\s*\(/gi

  function tryPeelMathSlashLine(s: string): PeelResult | null {
    const re = new RegExp(MATH_SIZE_OPEN.source, 'gi')
    let ma: RegExpExecArray | null
    while ((ma = re.exec(s)) !== null) {
      const openIdx = ma.index + ma[0].length - 1
      const afterClose = indexAfterMatchingParen(s, openIdx)
      if (afterClose === null) continue
      const restRaw = s.slice(afterClose)
      if (!/^\s*\//.test(restRaw)) continue
      const slashRestMatch = restRaw.match(
        new RegExp(
          String.raw`^\s*\/\s*(?:` + FONT_SIZE_NUMBER + FONT_SIZE_UNIT + String.raw`?|normal)\s*(.*)$`,
          'i',
        ),
      )
      if (!slashRestMatch) continue
      const tail = slashRestMatch[1] ?? ''
      if (tailLeadsWithStackedSize(tail)) {
        return { kind: 'peeled', next: s.slice(afterClose).trimStart() }
      }
      if (tail.trim().length === 0) continue
      return { kind: 'family', tail: tail.trimStart() }
    }
    return null
  }

  function tryPeelMathFamily(s: string): PeelResult | null {
    const re = new RegExp(MATH_SIZE_OPEN.source, 'gi')
    let ma: RegExpExecArray | null
    while ((ma = re.exec(s)) !== null) {
      const openIdx = ma.index + ma[0].length - 1
      const afterClose = indexAfterMatchingParen(s, openIdx)
      if (afterClose === null) continue
      const restRaw = s.slice(afterClose)
      if (/^\s*\//.test(restRaw)) continue
      const famM = restRaw.match(/^\s+(.+)$/)
      if (!famM) continue
      const tail = famM[1]!
      if (tailLeadsWithStackedSize(tail)) {
        return { kind: 'peeled', next: s.slice(afterClose).trimStart() }
      }
      return { kind: 'family', tail }
    }
    return null
  }

  function peelFontShorthand(s: string): PeelResult {
    const slashM = s.match(FONT_SHORTHAND_SLASH_LINE_TAIL)
    if (slashM) {
      const tail = slashM[2] ?? ''
      if (!tailLeadsWithStackedSize(tail)) return { kind: 'family', tail }
      const matchIndex = slashM.index ?? 0
      return { kind: 'peeled', next: s.slice(matchIndex + slashM[1]!.length).trimStart() }
    }
    const mathSlash = tryPeelMathSlashLine(s)
    if (mathSlash) return mathSlash

    // Before numeric size + family: math sizes can contain dimension tokens (e.g. `14px` inside
    // `calc(14px + 1vmin)`) that would otherwise match {@link FONT_SHORTHAND_FAMILY_TAIL} early.
    const mathFam = tryPeelMathFamily(s)
    if (mathFam) return mathFam

    const m = s.match(FONT_SHORTHAND_FAMILY_TAIL)
    if (m) {
      const tail = m[2]!
      if (!tailLeadsWithStackedSize(tail)) return { kind: 'family', tail }
      const matchIndex = m.index ?? 0
      return { kind: 'peeled', next: s.slice(matchIndex + m[1]!.length).trimStart() }
    }

    return { kind: 'none' }
  }

  let trimmed = font.trim()
  for (let p = 0; p < MAX_RELATIVE_SIZE_PREFIX_STRIPS; p++) {
    const withoutRel = trimmed.replace(/^(smaller|larger)\s+/i, '')
    if (withoutRel === trimmed) break
    trimmed = withoutRel
  }
  for (let p = 0; p < MAX_ABSOLUTE_SIZE_PREFIX_STRIPS; p++) {
    const m = trimmed.match(ABSOLUTE_FONT_SIZE_PREFIX)
    if (!m) break
    trimmed = trimmed.slice(m[0].length).trimStart()
  }
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
 * Resolve a font-load timeout in milliseconds. Used by {@link waitForFonts} and `createApp`'s
 * `fontLoadTimeoutMs` so `NaN`, `±Infinity`, negative values, and non-numbers (`null`, `bigint`,
 * objects, strings, …) all fall back to `defaultMs` (avoids `??` missing `NaN` and odd `setTimeout` coercion).
 */
export function resolveFontLoadTimeoutMs(timeoutMs: number | undefined, defaultMs = 10_000): number {
  return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : defaultMs
}

/**
 * Wait for web fonts used by the app. Browser only; no-op on server.
 * Uses `document.fonts.load` per family; timeouts are swallowed so startup never hard-fails.
 * Empty and whitespace-only family strings are ignored; names are trimmed before load and deduped.
 * `timeoutMs` must be a finite non-negative number; otherwise the default `10_000` is used (avoids
 * relying on `setTimeout` coercion for `NaN`, `±Infinity`, or negative values).
 */
export async function waitForFonts(families: string[], timeoutMs = 10_000): Promise<void> {
  if (typeof document === 'undefined' || families.length === 0) return
  const api = document.fonts
  if (!api?.load) return

  const unique = [...new Set(families.map(f => f.trim()).filter(f => f.length > 0))]
  if (unique.length === 0) return
  const safeTimeoutMs = resolveFontLoadTimeoutMs(timeoutMs, 10_000)
  const work = Promise.all(unique.map(f => api.load(`16px ${f}`).catch(() => undefined))).then(() =>
    Promise.resolve(api.ready).catch(() => undefined),
  )

  try {
    await Promise.race([
      work,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Font load timeout')), safeTimeoutMs)
      }),
    ])
  } catch {
    /* best-effort */
  }
}
