import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectFontFamiliesFromTree,
  extractFontFamiliesFromCSSFont,
  resolveFontLoadTimeoutMs,
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

  it('parses calc() font-size before family', () => {
    expect(extractFontFamiliesFromCSSFont('calc(14px + 1vmin) Inter, sans-serif')).toEqual(['Inter'])
  })

  it('returns empty when unclosed math leaves a leading + remnant (not a loadable family)', () => {
    expect(extractFontFamiliesFromCSSFont('calc(14px + Inter')).toEqual([])
  })

  it('still extracts family when a dimension inside broken math is followed by a family token', () => {
    expect(extractFontFamiliesFromCSSFont('calc(14px + 1vmin Inter')).toEqual(['Inter'])
  })

  it('returns empty for size tokens followed by a lone + tail (invalid shorthand)', () => {
    expect(extractFontFamiliesFromCSSFont('14px + Inter')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('600 14px + Inter, sans-serif')).toEqual([])
  })

  it('keeps a quoted family whose spelling starts with +', () => {
    expect(extractFontFamiliesFromCSSFont('14px "+Plus", serif')).toEqual(['+Plus'])
  })

  it('parses min(), max(), and clamp() sizes before family', () => {
    expect(extractFontFamiliesFromCSSFont('min(1rem, 10vw) Literata, serif')).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('max(12px, 1rem) JetBrains Mono, monospace')).toEqual([
      'JetBrains Mono',
    ])
    expect(extractFontFamiliesFromCSSFont('clamp(1rem, 2.5vw, 2rem) Source Serif 4, serif')).toEqual([
      'Source Serif 4',
    ])
  })

  it('parses nested math and grouped parens inside calc/min/max/clamp before family', () => {
    expect(
      extractFontFamiliesFromCSSFont('calc(min(1rem, max(12px, 10vw))) Literata, serif'),
    ).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('calc((14px + 1px)) Inter, sans-serif')).toEqual(['Inter'])
    expect(
      extractFontFamiliesFromCSSFont('min(max(12px, 1rem), 3rem) JetBrains Mono, monospace'),
    ).toEqual(['JetBrains Mono'])
    expect(
      extractFontFamiliesFromCSSFont(
        'clamp(min(1rem, 2rem), 12px, max(2rem, 3rem)) Source Serif 4, serif',
      ),
    ).toEqual(['Source Serif 4'])
  })

  it('parses math font-size after font-stretch percent then resolves family', () => {
    expect(extractFontFamiliesFromCSSFont('75% calc(14px) Inter, sans-serif')).toEqual(['Inter'])
  })

  it('parses math size with slash line-height before family', () => {
    expect(extractFontFamiliesFromCSSFont('calc(16px) / 1.2 Literata, serif')).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('600 CALC(14px) / normal JetBrains Mono, monospace')).toEqual([
      'JetBrains Mono',
    ])
  })

  it('parses numeric size before a following math size then family', () => {
    expect(extractFontFamiliesFromCSSFont('14px min(1vw, 12px) Inter, sans-serif')).toEqual(['Inter'])
  })

  it('parses unclosed double-quoted family with trailing backslash (escape at EOF)', () => {
    expect(extractFontFamiliesFromCSSFont('14px "Trail\\')).toEqual(['Trail\\'])
  })

  it('parses unclosed single-quoted family with trailing backslash (escape at EOF)', () => {
    expect(extractFontFamiliesFromCSSFont("14px 'Trail\\")).toEqual(['Trail\\'])
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

  it('parses root-relative rch, rex, ric, and rcap sizes before family', () => {
    expect(extractFontFamiliesFromCSSFont('1.25rch Literata, serif')).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('600 2rex "Display", sans-serif')).toEqual(['Display'])
    expect(extractFontFamiliesFromCSSFont('1ric JetBrains Mono, monospace')).toEqual(['JetBrains Mono'])
    expect(extractFontFamiliesFromCSSFont('1.1rcap UI Text, system-ui')).toEqual(['UI Text'])
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

  it(
    'still resolves family after more leading stretch tokens than the primary strip budget',
    () => {
      const font = `${'75% '.repeat(4100)}14px Inter`
      expect(extractFontFamiliesFromCSSFont(font)).toEqual(['Inter'])
    },
    15_000,
  )

  it(
    'returns empty for absurd leading stretch stacks beyond remainder ceiling (no bogus family)',
    () => {
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
    expect(extractFontFamiliesFromCSSFont("14px 'Unclosed Name")).toEqual(['Unclosed Name'])
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

  it('strips leading absolute font-size keywords before bare family or explicit size', () => {
    expect(extractFontFamiliesFromCSSFont('medium Georgia, serif')).toEqual(['Georgia'])
    expect(extractFontFamiliesFromCSSFont('XX-SMALL Literata, serif')).toEqual(['Literata'])
    expect(extractFontFamiliesFromCSSFont('xxx-large Source Serif 4, serif')).toEqual(['Source Serif 4'])
    expect(extractFontFamiliesFromCSSFont('large 14px Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('small larger 12px Mono, monospace')).toEqual(['Mono'])
  })

  it('still resolves explicit size+family when more absolute keywords lead than the prefix strip budget', () => {
    // MAX_ABSOLUTE_SIZE_PREFIX_STRIPS is 16; extra keywords remain and must not block peeling the real shorthand.
    expect(extractFontFamiliesFromCSSFont(`${'medium '.repeat(17)}14px Inter, sans-serif`)).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont(`${'xx-small '.repeat(17)}16px Literata, serif`)).toEqual(['Literata'])
  })

  it('drops unquoted absolute size keywords as sole or fallback segments; keeps quoted keyword as family name', () => {
    expect(extractFontFamiliesFromCSSFont('medium')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('14px medium, serif')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('14px "medium", serif')).toEqual(['medium'])
    expect(extractFontFamiliesFromCSSFont("16px 'large', sans-serif")).toEqual(['large'])
  })

  it('preserves CSS local() family tokens for callers that forward strings to document.fonts.load', () => {
    expect(extractFontFamiliesFromCSSFont('14px local("Brand"), serif')).toEqual(['local("Brand")'])
    expect(extractFontFamiliesFromCSSFont("600 16px local('Acme UI'), monospace")).toEqual(["local('Acme UI')"])
  })

  it('preserves unquoted local() when the face name is a CSS identifier', () => {
    expect(extractFontFamiliesFromCSSFont('14px local(Inter), sans-serif')).toEqual(['local(Inter)'])
    expect(extractFontFamiliesFromCSSFont('600 16px local(Acme_UI_Fallback), monospace')).toEqual([
      'local(Acme_UI_Fallback)',
    ])
  })

  it('drops url() segments so @font-face src paste does not become a load target', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, url("./font.woff2"), sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('14px URL( "./font.woff2" ) format("woff2"), serif')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('600 16px Inter, url(font.ttf), monospace')).toEqual(['Inter'])
  })

  it('keeps quoted family names that look like url() or format() (literal CSS family tokens)', () => {
    expect(extractFontFamiliesFromCSSFont('14px "url(Brand Face)", serif')).toEqual(['url(Brand Face)'])
    expect(extractFontFamiliesFromCSSFont("12px 'format(Legacy)', monospace")).toEqual(['format(Legacy)'])
  })

  it('drops format() segments from mistaken @font-face src paste', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, format("woff2"), sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('16px FORMAT( "opentype" ) , serif')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('600 16px Literata, format(woff2), monospace')).toEqual([
      'Literata',
    ])
  })

  it('drops local() only in comma-list continuations (mistaken @font-face src after a real family)', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, local("My Font"), sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('16px LOCAL( "System UI" ) , serif')).toEqual(['LOCAL( "System UI" )'])
    expect(extractFontFamiliesFromCSSFont('600 16px Literata, local(Fallback), monospace')).toEqual([
      'Literata',
    ])
  })

  it('keeps quoted family names that look like local() syntax', () => {
    expect(extractFontFamiliesFromCSSFont('14px "local(Not a function)", serif')).toEqual([
      'local(Not a function)',
    ])
  })

  it('skips unquoted url() and format() with case and internal whitespace (src paste hardening)', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, Url ( "./a.woff2" ), serif')).toEqual(['Inter'])
    expect(
      extractFontFamiliesFromCSSFont('14px Body,\tFoRmAt ( "woff2" ), sans-serif'),
    ).toEqual(['Body'])
    expect(extractFontFamiliesFromCSSFont('16px Mono, uRl\t( font.ttf ), monospace')).toEqual(['Mono'])
  })
})

describe('resolveFontLoadTimeoutMs', () => {
  it('returns defaultMs when timeoutMs is undefined', () => {
    expect(resolveFontLoadTimeoutMs(undefined)).toBe(10_000)
    expect(resolveFontLoadTimeoutMs(undefined, 5_000)).toBe(5_000)
    expect(resolveFontLoadTimeoutMs(undefined, 3000)).toBe(3000)
  })

  it('returns defaultMs for NaN, non-finite, negative, or non-number values', () => {
    const fallback = 7777
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
    ] as const) {
      expect(resolveFontLoadTimeoutMs(bad)).toBe(10_000)
      expect(resolveFontLoadTimeoutMs(bad, 3_000)).toBe(3_000)
      expect(resolveFontLoadTimeoutMs(bad, fallback)).toBe(fallback)
    }
    expect(resolveFontLoadTimeoutMs('500' as unknown as number)).toBe(10_000)
    expect(resolveFontLoadTimeoutMs('500' as unknown as number, fallback)).toBe(fallback)
  })

  it('returns defaultMs for null, bigint, or object values (invalid timeout shapes)', () => {
    const fallback = 4242
    expect(resolveFontLoadTimeoutMs(null as unknown as number)).toBe(10_000)
    expect(resolveFontLoadTimeoutMs(null as unknown as number, fallback)).toBe(fallback)
    expect(resolveFontLoadTimeoutMs(0n as unknown as number)).toBe(10_000)
    expect(resolveFontLoadTimeoutMs(0n as unknown as number, fallback)).toBe(fallback)
    expect(resolveFontLoadTimeoutMs({} as unknown as number, fallback)).toBe(fallback)
  })

  it('preserves finite non-negative timeouts', () => {
    expect(resolveFontLoadTimeoutMs(0)).toBe(0)
    expect(resolveFontLoadTimeoutMs(80)).toBe(80)
    expect(resolveFontLoadTimeoutMs(0, 5_000)).toBe(0)
    expect(resolveFontLoadTimeoutMs(2500)).toBe(2500)
    expect(resolveFontLoadTimeoutMs(2500, 999)).toBe(2500)
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

  it('collects families when font shorthand uses calc() for size', () => {
    const tree = box({}, [
      text({ text: 'x', font: 'calc(1rem + 2px) Literata, serif', lineHeight: 22 }),
    ])
    expect(collectFontFamiliesFromTree(tree)).toEqual(['Literata'])
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

  it('uses the default 10_000ms timeout when timeoutMs is NaN, non-finite, or negative', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1] as const) {
      vi.useFakeTimers()
      const load = vi.fn(() => new Promise<void>(() => {}))
      const ready = new Promise<void>(() => {})
      vi.stubGlobal('document', { fonts: { load, ready } })
      try {
        const p = waitForFonts(['Slow'], bad)
        await vi.advanceTimersByTimeAsync(9_999)
        await expect(
          Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
        ).resolves.toBe('not-yet')
        await vi.advanceTimersByTimeAsync(1)
        await expect(p).resolves.toBeUndefined()
      } finally {
        vi.useRealTimers()
        vi.unstubAllGlobals()
      }
    }
  })

  it('uses the default 10_000ms timeout when timeoutMs is not a number', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    try {
      const p = waitForFonts(['Slow'], '500' as unknown as number)
      await vi.advanceTimersByTimeAsync(9_999)
      await expect(
        Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
      ).resolves.toBe('not-yet')
      await vi.advanceTimersByTimeAsync(1)
      await expect(p).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('uses the default 10_000ms timeout when timeoutMs is bigint', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    try {
      const p = waitForFonts(['Slow'], 5000n as unknown as number)
      await vi.advanceTimersByTimeAsync(9_999)
      await expect(
        Promise.race([p, new Promise<string>(resolve => queueMicrotask(() => resolve('not-yet')))]),
      ).resolves.toBe('not-yet')
      await vi.advanceTimersByTimeAsync(1)
      await expect(p).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('resolves when loads finish before a zero-ms timeout fires', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const ready = Promise.resolve()
    vi.stubGlobal('document', { fonts: { load, ready } })
    await expect(waitForFonts(['Inter'], 0)).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledWith('16px Inter')
  })

  it('stops waiting after a zero-ms timeout when loads never settle', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<void>(() => {}))
    const ready = new Promise<void>(() => {})
    vi.stubGlobal('document', { fonts: { load, ready } })
    const p = waitForFonts(['Slow'], 0)
    await vi.advanceTimersByTimeAsync(0)
    await expect(p).resolves.toBeUndefined()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('swallows rejection from fonts.ready after loads settle', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const ready = Promise.reject(new Error('ready failed'))
    vi.stubGlobal('document', { fonts: { load, ready } })
    await expect(waitForFonts(['Inter'])).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledWith('16px Inter')
  })
})
