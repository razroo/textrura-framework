import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectFontFamiliesFromTree,
  extractFontFamiliesFromCSSFont,
  waitForFonts,
} from '../fonts.js'
import { box, image, text } from '../elements.js'

describe('extractFontFamiliesFromCSSFont', () => {
  it('parses weight + size + family', () => {
    expect(extractFontFamiliesFromCSSFont('600 14px Inter')).toEqual(['Inter'])
  })

  it('parses bold shorthand', () => {
    expect(extractFontFamiliesFromCSSFont('bold 24px JetBrains Mono')).toEqual(['JetBrains Mono'])
  })

  it('splits fallbacks and drops generics', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, sans-serif')).toEqual(['Inter'])
  })

  it('handles line-height in shorthand', () => {
    expect(extractFontFamiliesFromCSSFont('italic 12px/18px Georgia, serif')).toEqual(['Georgia'])
  })

  it('parses numeric weight with spaced line-height before family', () => {
    expect(extractFontFamiliesFromCSSFont('600 14px / 18px Inter, sans-serif')).toEqual(['Inter'])
  })

  it('does not split on commas inside a quoted family name', () => {
    expect(extractFontFamiliesFromCSSFont('14px "Foo, Bar", sans-serif')).toEqual(['Foo, Bar'])
  })

  it('handles single-quoted family with comma', () => {
    expect(extractFontFamiliesFromCSSFont("14px 'Acme, Inc', monospace")).toEqual(['Acme, Inc'])
  })

  it('parses multiple quoted families and drops generics', () => {
    expect(
      extractFontFamiliesFromCSSFont('12px "First, Name", "Second", serif'),
    ).toEqual(['First, Name', 'Second'])
  })

  it('skips empty segments from repeated commas in the family list', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter,, JetBrains Mono, sans-serif')).toEqual([
      'Inter',
      'JetBrains Mono',
    ])
  })

  it('skips whitespace-only segments between commas', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter,  \t  , Sans, serif')).toEqual(['Inter', 'Sans'])
  })

  it('returns empty when the only custom name is an empty quoted segment', () => {
    expect(extractFontFamiliesFromCSSFont('14px "", serif')).toEqual([])
  })

  it('parses numeric weight before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('500 14px Inter')).toEqual(['Inter'])
  })

  it('returns empty when only generic families remain', () => {
    expect(extractFontFamiliesFromCSSFont('14px sans-serif, serif')).toEqual([])
  })

  it('drops CSS system font keywords (single-token font values)', () => {
    expect(extractFontFamiliesFromCSSFont('caption')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('icon')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('menu')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('message-box')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('small-caption')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('status-bar')).toEqual([])
  })

  it('drops system font keywords case-insensitively and after shorthand peel', () => {
    expect(extractFontFamiliesFromCSSFont('CAPTION')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('14px caption')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('12px Inter, menu, serif')).toEqual(['Inter'])
  })

  it('parses unquoted multi-word family as single name', () => {
    expect(extractFontFamiliesFromCSSFont('12px Times New Roman, serif')).toEqual(['Times New Roman'])
  })

  it('parses rem-sized shorthand', () => {
    expect(extractFontFamiliesFromCSSFont('1rem Inter')).toEqual(['Inter'])
  })

  it('parses zero px size before family', () => {
    expect(extractFontFamiliesFromCSSFont('0px Inter, sans-serif')).toEqual(['Inter'])
  })

  it('parses scientific-notation font size before family', () => {
    expect(extractFontFamiliesFromCSSFont('1e2px Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('2.5e+1px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('16e0px JetBrains Mono, monospace')).toEqual(['JetBrains Mono'])
    expect(extractFontFamiliesFromCSSFont('600 3e0rem Literata, serif')).toEqual(['Literata'])
  })

  it('does not treat scientific-notation size token as a family name', () => {
    expect(extractFontFamiliesFromCSSFont('1e2px')).toEqual([])
  })

  it('parses unclosed double-quoted family with trailing backslash (escape at EOF)', () => {
    expect(extractFontFamiliesFromCSSFont('14px "Trail\\')).toEqual(['Trail\\'])
  })

  it('parses pt- and pc-sized shorthand', () => {
    expect(extractFontFamiliesFromCSSFont('12pt Times New Roman, serif')).toEqual(['Times New Roman'])
    expect(extractFontFamiliesFromCSSFont('1pc Courier New, monospace')).toEqual(['Courier New'])
  })

  it('parses percentage and viewport-unit sizes before family', () => {
    expect(extractFontFamiliesFromCSSFont('112% Georgia, serif')).toEqual(['Georgia'])
    expect(extractFontFamiliesFromCSSFont('2.5vmin Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('10vh "Display Font"')).toEqual(['Display Font'])
  })

  it('parses container query unit sizes before family', () => {
    expect(extractFontFamiliesFromCSSFont('4cqw Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('3cqh "CQ Font"')).toEqual(['CQ Font'])
    expect(extractFontFamiliesFromCSSFont('2.5cqi Source Serif 4, serif')).toEqual(['Source Serif 4'])
    expect(extractFontFamiliesFromCSSFont('1cqb JetBrains Mono, monospace')).toEqual(['JetBrains Mono'])
    expect(extractFontFamiliesFromCSSFont('10cqmin Display, serif')).toEqual(['Display'])
    expect(extractFontFamiliesFromCSSFont('12cqmax UI Sans, system-ui')).toEqual(['UI Sans'])
  })

  it('skips font-stretch percentage before container-query font size and family', () => {
    expect(extractFontFamiliesFromCSSFont('75% 5cqw Inter')).toEqual(['Inter'])
  })

  it('drops generic fallbacks case-insensitively', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, SANS-SERIF, Monospace')).toEqual(['Inter'])
  })

  it('returns empty for whitespace-only input', () => {
    expect(extractFontFamiliesFromCSSFont('')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('   ')).toEqual([])
  })

  it('parses CSS-wide font-style keyword before size', () => {
    expect(extractFontFamiliesFromCSSFont('normal 14px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('italic 14px Inter')).toEqual(['Inter'])
  })

  it('parses oblique angle before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('oblique 14deg 16px Inter')).toEqual(['Inter'])
  })

  it('parses oblique angle in turn units before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('oblique 0.25turn 16px Inter, sans-serif')).toEqual(['Inter'])
  })

  it('parses oblique angle in rad units before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('oblique 0.5rad 16px Inter, sans-serif')).toEqual(['Inter'])
  })

  it('parses oblique angle in grad units before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('oblique 100grad 14px Literata, serif')).toEqual(['Literata'])
  })

  it('parses oblique keyword without angle before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('oblique 14px Inter, sans-serif')).toEqual(['Inter'])
  })

  it('treats bare family list when no size token is present', () => {
    expect(extractFontFamiliesFromCSSFont('Inter, system-ui')).toEqual(['Inter'])
  })

  it('returns empty when shorthand has size but no family token', () => {
    expect(extractFontFamiliesFromCSSFont('14px')).toEqual([])
  })

  it('returns empty when size and line-height are present but no family list', () => {
    expect(extractFontFamiliesFromCSSFont('14px / normal')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('600 14px / 1.5')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('italic 12px/18px')).toEqual([])
  })

  it('parses unitless line-height before family', () => {
    expect(extractFontFamiliesFromCSSFont('14px / 1.5 Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('14px/1.5 "Custom, Name"')).toEqual(['Custom, Name'])
  })

  it('parses line-height with lh unit before family', () => {
    expect(extractFontFamiliesFromCSSFont('14px/1.2lh Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('600 16px / 1.5lh "Display Face", serif')).toEqual(['Display Face'])
  })

  it('parses font-variant keyword stacks before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('small-caps 600 14px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('all-small-caps italic 12px Source Serif 4, serif')).toEqual([
      'Source Serif 4',
    ])
  })

  it('drops ui-prefixed generic families', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, ui-rounded')).toEqual(['Inter'])
  })

  it('drops CSS-wide font keywords from family lists', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, inherit')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('12px unset, serif')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('16px Brand, initial, sans-serif')).toEqual(['Brand'])
    expect(extractFontFamiliesFromCSSFont('14px revert, monospace')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('14px Revert-Layer, serif')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('600 14px Custom, INHERIT')).toEqual(['Custom'])
  })

  it('returns empty when the entire font value is a bare CSS-wide keyword', () => {
    expect(extractFontFamiliesFromCSSFont('inherit')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('initial')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('unset')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('revert')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('revert-layer')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('  INHERIT  ')).toEqual([])
  })

  it('drops cursive, fantasy, and emoji generic fallbacks', () => {
    expect(extractFontFamiliesFromCSSFont('14px Display, cursive')).toEqual(['Display'])
    expect(extractFontFamiliesFromCSSFont('16px "Brand", fantasy')).toEqual(['Brand'])
    expect(extractFontFamiliesFromCSSFont('12px Color UI, emoji')).toEqual(['Color UI'])
  })

  it('skips font-stretch percentage before real font size and family', () => {
    expect(extractFontFamiliesFromCSSFont('75% 14px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('500 75% 14px Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('condensed 75% 14px "Custom Face"')).toEqual(['Custom Face'])
  })

  it('parses named font-stretch keywords before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('ultra-condensed 14px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('expanded 500 16px "Custom Face"')).toEqual(['Custom Face'])
    expect(extractFontFamiliesFromCSSFont('semi-expanded 12px Source Serif 4, serif')).toEqual([
      'Source Serif 4',
    ])
    expect(extractFontFamiliesFromCSSFont('extra-expanded 1rem JetBrains Mono, monospace')).toEqual([
      'JetBrains Mono',
    ])
  })

  it('skips multiple leading percentage tokens before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('75% 50% 14px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('500 75% 62.5% 16px "Display", sans-serif')).toEqual(['Display'])
  })

  it('still resolves family after more leading stretch tokens than the primary strip budget', () => {
    const font = `${'75% '.repeat(4100)}14px Inter`
    expect(extractFontFamiliesFromCSSFont(font)).toEqual(['Inter'])
  })

  it(
    'returns empty for absurd leading stretch stacks beyond remainder ceiling (no bogus family)',
    () => {
      // After the primary strip budget, remainder length still exceeds MAX_REMAINDER_AFTER_PRIMARY_STRIP.
      const font = `${'75% '.repeat(8200)}14px Inter`
      expect(extractFontFamiliesFromCSSFont(font)).toEqual([])
    },
    15_000,
  )

  it('skips a long stack of leading stretch percentages before real size and family', () => {
    const pre = Array(12).fill('75%').join(' ')
    expect(extractFontFamiliesFromCSSFont(`${pre} 14px Inter, sans-serif`)).toEqual(['Inter'])
  })

  it('parses family after a full strip run leaves bare size + family shorthand', () => {
    const pre = Array(32).fill('75%').join(' ')
    expect(extractFontFamiliesFromCSSFont(`${pre} 14px Inter, sans-serif`)).toEqual(['Inter'])
  })

  it('parses family through a long leading stretch-percent stack', () => {
    const pre = Array(40).fill('75%').join(' ')
    expect(extractFontFamiliesFromCSSFont(`${pre} 14px Inter, sans-serif`)).toEqual(['Inter'])
  })

  it('parses family when stretch-percent count exceeds the former 128-strip cap', () => {
    const pre = Array(129).fill('75%').join(' ')
    expect(extractFontFamiliesFromCSSFont(`${pre} 14px Inter, sans-serif`)).toEqual(['Inter'])
  })

  it('parses family through a very long leading stretch-percent stack within the strip budget', () => {
    const pre = Array(1024).fill('75%').join(' ')
    expect(extractFontFamiliesFromCSSFont(`${pre} 14px Inter, sans-serif`)).toEqual(['Inter'])
  })

  it('parses family when stretch-percent count exceeds the shorthand strip iteration budget', () => {
    const pre = Array(1025).fill('75%').join(' ')
    expect(extractFontFamiliesFromCSSFont(`${pre} 14px Inter, sans-serif`)).toEqual(['Inter'])
  })

  it('still treats a single percentage as font-size when it is followed only by family', () => {
    expect(extractFontFamiliesFromCSSFont('112% Georgia, serif')).toEqual(['Georgia'])
  })

  it('parses cap, lh, rlh, and ic sizes before family', () => {
    expect(extractFontFamiliesFromCSSFont('1.25cap Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('1.2lh Literata, serif')).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('1rlh System Font')).toEqual(['System Font'])
    expect(extractFontFamiliesFromCSSFont('2ic "Noto Sans CJK"')).toEqual(['Noto Sans CJK'])
  })

  it('parses root-relative r* units before family', () => {
    expect(extractFontFamiliesFromCSSFont('1rcap Brand UI')).toEqual(['Brand UI'])
    expect(extractFontFamiliesFromCSSFont('1.1rch Mono, monospace')).toEqual(['Mono'])
    expect(extractFontFamiliesFromCSSFont('0.9rex Condensed')).toEqual(['Condensed'])
    expect(extractFontFamiliesFromCSSFont('1ric Han Serif')).toEqual(['Han Serif'])
  })

  it('parses dynamic and large/small viewport units before family', () => {
    expect(extractFontFamiliesFromCSSFont('4dvh Display Pro')).toEqual(['Display Pro'])
    expect(extractFontFamiliesFromCSSFont('10dvw Wide Sans, sans-serif')).toEqual(['Wide Sans'])
    expect(extractFontFamiliesFromCSSFont('3svw Side, sans-serif')).toEqual(['Side'])
    expect(extractFontFamiliesFromCSSFont('5lvmin Body Text')).toEqual(['Body Text'])
  })

  it('parses viewport inline and block units (vi/vb and d/s/l variants) before family', () => {
    expect(extractFontFamiliesFromCSSFont('2.5vi Inline UI, sans-serif')).toEqual(['Inline UI'])
    expect(extractFontFamiliesFromCSSFont('4vb Block Serif, serif')).toEqual(['Block Serif'])
    expect(extractFontFamiliesFromCSSFont('3dvi Dynamic Inline, sans-serif')).toEqual(['Dynamic Inline'])
    expect(extractFontFamiliesFromCSSFont('2dvb Dyn Block')).toEqual(['Dyn Block'])
    expect(extractFontFamiliesFromCSSFont('1.5svi Small Inline')).toEqual(['Small Inline'])
    expect(extractFontFamiliesFromCSSFont('2svb Small Block, monospace')).toEqual(['Small Block'])
    expect(extractFontFamiliesFromCSSFont('2.25lvi Large Inline')).toEqual(['Large Inline'])
    expect(extractFontFamiliesFromCSSFont('3lvb Large Block')).toEqual(['Large Block'])
  })

  it('parses Q (quarter-mm) size before family', () => {
    expect(extractFontFamiliesFromCSSFont('40Q Mincho, serif')).toEqual(['Mincho'])
  })

  it('parses math unit size before family', () => {
    expect(extractFontFamiliesFromCSSFont('1.2math Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('600 14math "Math Face", serif')).toEqual(['Math Face'])
  })

  it('parses absolute length units (cm, mm, in, pc) before family', () => {
    expect(extractFontFamiliesFromCSSFont('1.2cm Literata, serif')).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('3mm Micro, monospace')).toEqual(['Micro'])
    expect(extractFontFamiliesFromCSSFont('0.25in Print Serif, serif')).toEqual(['Print Serif'])
    expect(extractFontFamiliesFromCSSFont('1.5pc Heading, serif')).toEqual(['Heading'])
  })

  it('parses ex- and ch-sized shorthand before family', () => {
    expect(extractFontFamiliesFromCSSFont('2ex Literata, serif')).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('1.5ch Mono, monospace')).toEqual(['Mono'])
  })

  it('treats unclosed quoted family as a single segment (best-effort)', () => {
    expect(extractFontFamiliesFromCSSFont('14px "Unclosed Name')).toEqual(['Unclosed Name'])
  })

  it('respects backslash-escaped double quote inside a double-quoted family', () => {
    expect(extractFontFamiliesFromCSSFont('14px "Foo\\"Bar", serif')).toEqual(['Foo"Bar'])
  })

  it('respects backslash-escaped single quote inside a single-quoted family', () => {
    expect(extractFontFamiliesFromCSSFont("14px 'O\\'Reilly', serif")).toEqual(["O'Reilly"])
  })

  it('parses comma after a quoted family that contains an escaped quote', () => {
    expect(extractFontFamiliesFromCSSFont('12px "A\\",B", "Second", serif')).toEqual(['A",B', 'Second'])
  })

  it('parses line-height keyword normal between size and family', () => {
    expect(extractFontFamiliesFromCSSFont('600 14px / normal Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('italic 12px / normal Georgia, serif')).toEqual(['Georgia'])
  })

  it('parses relative font-weight bolder and lighter before size', () => {
    expect(extractFontFamiliesFromCSSFont('bolder 16px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('lighter 12px Georgia, serif')).toEqual(['Georgia'])
  })

  it('collapses repeated custom families in one list to first spelling (case-insensitive)', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, Inter, Mono, sans-serif')).toEqual(['Inter', 'Mono'])
    expect(extractFontFamiliesFromCSSFont('12px Inter, inter, JetBrains Mono')).toEqual(['Inter', 'JetBrains Mono'])
  })

  it('keeps dashed and vendor-like concrete families (not confused with size tokens or generics)', () => {
    expect(extractFontFamiliesFromCSSFont('16px -apple-system, sans-serif')).toEqual(['-apple-system'])
    expect(extractFontFamiliesFromCSSFont('15px BlinkMacSystemFont, system-ui')).toEqual(['BlinkMacSystemFont'])
    expect(extractFontFamiliesFromCSSFont('14px Segoe UI Variable, ui-sans-serif')).toEqual(['Segoe UI Variable'])
    expect(extractFontFamiliesFromCSSFont('13px --custom-font-fallback, serif')).toEqual(['--custom-font-fallback'])
  })

  it('strips relative font-size keywords smaller and larger before family or explicit size', () => {
    expect(extractFontFamiliesFromCSSFont('smaller Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('larger Georgia, serif')).toEqual(['Georgia'])
    expect(extractFontFamiliesFromCSSFont('SMALLER  JetBrains Mono , monospace')).toEqual(['JetBrains Mono'])
    expect(extractFontFamiliesFromCSSFont('LaRgEr 14px Literata, serif')).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('smaller larger 12px Mono, monospace')).toEqual(['Mono'])
  })

  it('still resolves family when more than eight leading smaller/larger keywords precede explicit size', () => {
    expect(extractFontFamiliesFromCSSFont(`${'smaller '.repeat(9)}14px Inter, sans-serif`)).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont(`${'larger '.repeat(10)}16px Literata, serif`)).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont(`${'smaller '.repeat(20)}12px JetBrains Mono, monospace`)).toEqual([
      'JetBrains Mono',
    ])
  })

  it('after eight strips, a remaining smaller/larger prefix merges into bare family list (best-effort limit)', () => {
    // Only eight `smaller`/`larger` peels run; a ninth before a bare list is kept as part of the first segment.
    expect(extractFontFamiliesFromCSSFont(`${'smaller '.repeat(9)}Inter, serif`)).toEqual(['smaller Inter'])
  })

  it('preserves CSS local() family tokens for callers that forward strings to document.fonts.load', () => {
    expect(extractFontFamiliesFromCSSFont('14px local("Brand"), serif')).toEqual(['local("Brand")'])
    expect(extractFontFamiliesFromCSSFont("600 16px local('Acme UI'), monospace")).toEqual(["local('Acme UI')"])
  })
})

describe('collectFontFamiliesFromTree', () => {
  it('returns empty when tree has no text nodes', () => {
    const tree = box({ width: 10, height: 10 })
    expect(collectFontFamiliesFromTree(tree)).toEqual([])
  })

  it('collects from a text node used as the tree root', () => {
    const root = text({ text: 'hi', font: '16px Literata, serif', lineHeight: 22 })
    expect(collectFontFamiliesFromTree(root)).toEqual(['Literata'])
  })

  it('returns empty when the root is an image (images carry no font shorthand)', () => {
    const root = image({ src: '/x.png', width: 1, height: 1 })
    expect(collectFontFamiliesFromTree(root)).toEqual([])
  })

  it('dedupes families from text nodes', () => {
    const tree = box({}, [
      text({ text: 'a', font: '14px Inter', lineHeight: 20 }),
      text({ text: 'b', font: 'bold 14px Inter', lineHeight: 20 }),
      text({ text: 'c', font: '12px JetBrains Mono', lineHeight: 16 }),
    ])
    const fam = collectFontFamiliesFromTree(tree).sort()
    expect(fam).toEqual(['Inter', 'JetBrains Mono'])
  })

  it('returns unique families in first-seen preorder (depth-first) order', () => {
    const tree = box({}, [
      text({ text: 'a', font: '12px Beta, serif', lineHeight: 16 }),
      text({ text: 'b', font: '12px Alpha, serif', lineHeight: 16 }),
      text({ text: 'c', font: '12px Beta', lineHeight: 16 }),
    ])
    expect(collectFontFamiliesFromTree(tree)).toEqual(['Beta', 'Alpha'])
  })

  it('collects families from nested text under boxes', () => {
    const tree = box({}, [
      box({}, [text({ text: 'inner', font: '16px Source Sans 3', lineHeight: 22 })]),
    ])
    expect(collectFontFamiliesFromTree(tree)).toEqual(['Source Sans 3'])
  })

  it('ignores empty font strings on text nodes', () => {
    const tree = box({}, [
      text({ text: 'a', font: '', lineHeight: 20 }),
      text({ text: 'b', font: '   ', lineHeight: 20 }),
      text({ text: 'c', font: '12px Inter', lineHeight: 16 }),
    ])
    expect(collectFontFamiliesFromTree(tree).sort()).toEqual(['Inter'])
  })

  it('preserves distinct family order from a single shorthand on one text node', () => {
    const tree = box({}, [
      text({ text: 'x', font: '12px Alpha, Beta, serif', lineHeight: 16 }),
    ])
    expect(collectFontFamiliesFromTree(tree)).toEqual(['Alpha', 'Beta'])
  })

  it('dedupes repeated names within one shorthand when collecting from tree', () => {
    const tree = box({}, [text({ text: 'x', font: '14px Inter, Inter, Mono', lineHeight: 20 })])
    expect(collectFontFamiliesFromTree(tree)).toEqual(['Inter', 'Mono'])
  })

  it('ignores image nodes and still collects fonts from text in the same subtree', () => {
    const tree = box({}, [
      image({ src: '/a.png', width: 40, height: 40 }),
      text({ text: 'hi', font: '14px Inter', lineHeight: 20 }),
    ])
    expect(collectFontFamiliesFromTree(tree)).toEqual(['Inter'])
  })

  it('returns empty when every family in a shorthand is generic or CSS-wide', () => {
    const tree = box({}, [
      text({ text: 'a', font: '14px inherit, initial, sans-serif', lineHeight: 20 }),
    ])
    expect(collectFontFamiliesFromTree(tree)).toEqual([])
  })
})

describe('waitForFonts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('no-ops when families is empty', async () => {
    const load = vi.fn()
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })
    await waitForFonts([])
    expect(load).not.toHaveBeenCalled()
  })

  it('no-ops when every family is empty or whitespace-only after trim', async () => {
    const load = vi.fn()
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } })
    await waitForFonts(['', '   ', '\t'])
    expect(load).not.toHaveBeenCalled()
  })

  it('trims family names and dedupes before load', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const ready = Promise.resolve()
    vi.stubGlobal('document', { fonts: { load, ready } })
    await waitForFonts([' Inter ', 'Inter', '  JetBrains Mono  '])
    expect(load).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenCalledWith('16px Inter')
    expect(load).toHaveBeenCalledWith('16px JetBrains Mono')
  })

  it('no-ops when document is undefined (SSR / non-browser)', async () => {
    vi.stubGlobal('document', undefined)
    await expect(waitForFonts(['Inter'])).resolves.toBeUndefined()
  })

  it('no-ops when document.fonts is missing', async () => {
    vi.stubGlobal('document', {})
    await expect(waitForFonts(['Inter'])).resolves.toBeUndefined()
  })

  it('no-ops when document.fonts.load is missing', async () => {
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } })
    await waitForFonts(['Inter'])
  })

  it('resolves when fonts.ready is absent after load succeeds', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('document', { fonts: { load } })
    await expect(waitForFonts(['Inter'])).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledWith('16px Inter')
  })

  it('dedupes families and calls load once per unique name', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const ready = Promise.resolve()
    vi.stubGlobal('document', { fonts: { load, ready } })
    await waitForFonts(['Inter', 'Inter', 'JetBrains Mono'])
    expect(load).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenCalledWith('16px Inter')
    expect(load).toHaveBeenCalledWith('16px JetBrains Mono')
  })

  it('continues when a single load rejects', async () => {
    const load = vi
      .fn()
      .mockImplementation((spec: string) =>
        spec.includes('Bad') ? Promise.reject(new Error('fail')) : Promise.resolve(),
      )
    const ready = Promise.resolve()
    vi.stubGlobal('document', { fonts: { load, ready } })
    await expect(waitForFonts(['Bad', 'Good'])).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('stops waiting after timeout when loads never settle', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const p = waitForFonts(['Slow'], 50)
    await vi.advanceTimersByTimeAsync(50)
    await expect(p).resolves.toBeUndefined()
  })

  it('defaults to a 10_000ms timeout when loads never settle', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const p = waitForFonts(['Slow'])
    await vi.advanceTimersByTimeAsync(9_999)
    await expect(
      Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
    ).resolves.toBe('not-yet')
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toBeUndefined()
  })

  it('swallows rejection from fonts.ready after loads settle', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const ready = Promise.reject(new Error('ready failed'))
    vi.stubGlobal('document', { fonts: { load, ready } })
    await expect(waitForFonts(['Inter'])).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledWith('16px Inter')
  })
})
