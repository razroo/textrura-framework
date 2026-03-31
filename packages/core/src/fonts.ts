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

/** Split a CSS font-family list on commas not inside single or double quotes. */
function splitFontFamilyList(tail: string): string[] {
  const parts: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < tail.length; i++) {
    const c = tail[i]!
    if (quote) {
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
 * Drops generic fallbacks like `sans-serif`. Best-effort parsing for common patterns.
 */
export function extractFontFamiliesFromCSSFont(font: string): string[] {
  const trimmed = font.trim()
  const m = trimmed.match(
    /\b(\d+(?:\.\d+)?(?:px|em|rem))\s*(?:\/\s*[\d.]+(?:px|em|rem)?)?\s+(.+)$/i,
  )
  const tail = m ? m[2]! : trimmed
  const sizeLike = /^\d+(\.\d+)?(px|em|rem)$/i
  return splitFontFamilyList(tail)
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(f => f.length > 0 && !GENERIC_FAMILIES.has(f.toLowerCase()) && !sizeLike.test(f))
}

/** Collect unique font families referenced by text nodes in a UI tree. */
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
 */
export async function waitForFonts(families: string[], timeoutMs = 10_000): Promise<void> {
  if (typeof document === 'undefined' || families.length === 0) return
  const api = document.fonts
  if (!api?.load) return

  const unique = [...new Set(families)]
  const work = Promise.all(unique.map(f => api.load(`16px ${f}`).catch(() => undefined))).then(() =>
    api.ready,
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
