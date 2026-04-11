import type { TwResult } from './index.js'
import { layoutMap } from './mappings/layout.js'
import { flexMap, resolveFlexPrefix } from './mappings/flex.js'
import { resolveSpacingPrefix, spacingPrefixes } from './mappings/spacing.js'
import { sizingMap, resolveSizingPrefix, sizingPrefixes } from './mappings/sizing.js'
import { borderMap, resolveBorderPrefix, borderPrefixes } from './mappings/borders.js'
import { visualMap, resolveVisualPrefix, visualPrefixes } from './mappings/visual.js'
import { effectsMap } from './mappings/effects.js'
import { resolveColor } from './colors.js'

/** Merged static class map (built once at module load). */
const staticMap: Record<string, Partial<TwResult>> = {
  ...layoutMap,
  ...flexMap,
  ...sizingMap,
  ...borderMap,
  ...visualMap,
  ...effectsMap,
}

/**
 * All dynamic prefixes sorted by descending length.
 * Each entry: [prefix, category] where category determines which handler to call.
 */
type PrefixCategory = 'spacing' | 'sizing' | 'flex' | 'border' | 'visual'

const dynamicPrefixes: Array<[string, PrefixCategory]> = [
  // Spacing
  ...spacingPrefixes.map((p): [string, PrefixCategory] => [p, 'spacing']),
  // Sizing
  ...sizingPrefixes.map((p): [string, PrefixCategory] => [p, 'sizing']),
  // Flex
  ...(['gap', 'gap-x', 'gap-y', 'basis'] as const).map((p): [string, PrefixCategory] => [p, 'flex']),
  // Borders
  ...borderPrefixes.map((p): [string, PrefixCategory] => [p, 'border']),
  // Visual
  ...visualPrefixes.map((p): [string, PrefixCategory] => [p, 'visual']),
].sort((a, b) => b[0].length - a[0].length)

/** Extract an arbitrary value from brackets: "w-[200]" → "200", "bg-[#ff00ff]" → "#ff00ff". */
function extractArbitrary(token: string): { base: string; arbitrary: string } | undefined {
  const openBracket = token.indexOf('[')
  // Require a non-empty prefix before `[` (e.g. `w-[200]` → base `w`); bare `[200]` is not a utility token.
  if (openBracket < 1) return undefined
  let depth = 0
  for (let i = openBracket; i < token.length; i++) {
    const c = token[i]!
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) {
        // Closing `]` must be the last character — rejects `w-[200]]` and other trailing junk.
        if (i !== token.length - 1) return undefined
        const base = token.slice(0, openBracket - 1)
        const arbitrary = token.slice(openBracket + 1, i)
        return { base, arbitrary }
      }
    }
  }
  return undefined
}

/** Resolve a single class token to props. Returns undefined for unknown tokens. */
export function resolveToken(token: string): Partial<TwResult> | undefined {
  // Handle negative prefix: -mt-4 → prefix=mt, value=4, negative=true
  let negative = false
  let normalizedToken = token
  if (token.startsWith('-')) {
    negative = true
    normalizedToken = token.slice(1)
  }

  // Check static map first (use original token for non-negative, normalized for negative)
  if (!negative) {
    const staticResult = staticMap[token]
    if (staticResult) return staticResult
  }

  // Check for arbitrary value: w-[200], bg-[#ff00ff]
  const arb = extractArbitrary(normalizedToken)
  if (arb) {
    return resolveArbitrary(arb.base, arb.arbitrary, negative)
  }

  // Dynamic prefix matching: find the longest matching prefix
  for (const [prefix, category] of dynamicPrefixes) {
    if (!normalizedToken.startsWith(prefix + '-')) continue
    const value = normalizedToken.slice(prefix.length + 1)
    if (!value) continue

    // For border prefix, the value might be a compound color like "red-500"
    if (prefix === 'border') {
      const fullColorValue = normalizedToken.slice(prefix.length + 1)
      const color = resolveColor(fullColorValue)
      if (color) return { borderColor: color }
    }

    // For bg/text prefix, the value might be a compound color like "blue-500"
    if (prefix === 'bg' || prefix === 'text') {
      const fullColorValue = normalizedToken.slice(prefix.length + 1)
      return dispatchPrefix(prefix, category, fullColorValue, negative, fullColorValue)
    }

    const result = dispatchPrefix(prefix, category, value, negative, value)
    if (result) return result
  }

  return undefined
}

function dispatchPrefix(
  prefix: string,
  category: PrefixCategory,
  value: string,
  negative: boolean,
  rawValue: string,
): Partial<TwResult> | undefined {
  switch (category) {
    case 'spacing': return resolveSpacingPrefix(prefix, value, negative)
    case 'sizing': return resolveSizingPrefix(prefix, value, negative)
    case 'flex': return resolveFlexPrefix(prefix, value)
    case 'border': return resolveBorderPrefix(prefix, rawValue)
    case 'visual': return resolveVisualPrefix(prefix, rawValue)
  }
}

/**
 * Resolve an arbitrary value like w-[200] or bg-[#ff00ff].
 * Arbitrary values bypass the spacing scale and color palette — they're used directly.
 */
function resolveArbitrary(base: string, raw: string, negative: boolean): Partial<TwResult> | undefined {
  const num = parseFloat(raw)
  const hasNum = !Number.isNaN(num)
  const v = hasNum ? (negative ? -num : num) : undefined

  switch (base) {
    // Sizing
    case 'w': return v !== undefined ? { width: v } : undefined
    case 'h': return v !== undefined ? { height: v } : undefined
    case 'min-w': return v !== undefined ? { minWidth: v } : undefined
    case 'max-w': return v !== undefined ? { maxWidth: v } : undefined
    case 'min-h': return v !== undefined ? { minHeight: v } : undefined
    case 'max-h': return v !== undefined ? { maxHeight: v } : undefined
    // Spacing
    case 'p': return v !== undefined ? { padding: v } : undefined
    case 'px': return v !== undefined ? { paddingHorizontal: v } : undefined
    case 'py': return v !== undefined ? { paddingVertical: v } : undefined
    case 'pt': return v !== undefined ? { paddingTop: v } : undefined
    case 'pr': return v !== undefined ? { paddingRight: v } : undefined
    case 'pb': return v !== undefined ? { paddingBottom: v } : undefined
    case 'pl': return v !== undefined ? { paddingLeft: v } : undefined
    case 'm': return v !== undefined ? { margin: v } : undefined
    case 'mx': return v !== undefined ? { marginHorizontal: v } : undefined
    case 'my': return v !== undefined ? { marginVertical: v } : undefined
    case 'mt': return v !== undefined ? { marginTop: v } : undefined
    case 'mr': return v !== undefined ? { marginRight: v } : undefined
    case 'mb': return v !== undefined ? { marginBottom: v } : undefined
    case 'ml': return v !== undefined ? { marginLeft: v } : undefined
    // Flex
    case 'gap': return v !== undefined ? { gap: v } : undefined
    case 'gap-x': return v !== undefined ? { columnGap: v } : undefined
    case 'gap-y': return v !== undefined ? { rowGap: v } : undefined
    case 'basis': return v !== undefined ? { flexBasis: v } : undefined
    // Position
    case 'top': return v !== undefined ? { top: v } : undefined
    case 'right': return v !== undefined ? { right: v } : undefined
    case 'bottom': return v !== undefined ? { bottom: v } : undefined
    case 'left': return v !== undefined ? { left: v } : undefined
    case 'inset': return v !== undefined ? { top: v, right: v, bottom: v, left: v } : undefined
    // Borders
    case 'border': return v !== undefined ? { borderWidth: v } : { borderColor: raw }
    case 'border-t': return v !== undefined ? { borderTop: v } : undefined
    case 'border-r': return v !== undefined ? { borderRight: v } : undefined
    case 'border-b': return v !== undefined ? { borderBottom: v } : undefined
    case 'border-l': return v !== undefined ? { borderLeft: v } : undefined
    case 'rounded': return v !== undefined ? { borderRadius: v } : undefined
    // Visual — colors pass through directly
    case 'bg': return { backgroundColor: raw }
    case 'text': return { color: raw }
    case 'opacity': return v !== undefined ? { opacity: v / 100 } : undefined
    case 'z': return v !== undefined ? { zIndex: v } : undefined
    // Aspect
    case 'aspect': return v !== undefined ? { aspectRatio: v } : undefined
    default: return undefined
  }
}
