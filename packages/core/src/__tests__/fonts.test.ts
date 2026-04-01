import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectFontFamiliesFromTree,
  extractFontFamiliesFromCSSFont,
  waitForFonts,
} from '../fonts.js'
import { box, text } from '../elements.js'

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

  it('parses numeric weight before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('500 14px Inter')).toEqual(['Inter'])
  })

  it('returns empty when only generic families remain', () => {
    expect(extractFontFamiliesFromCSSFont('14px sans-serif, serif')).toEqual([])
  })

  it('parses unquoted multi-word family as single name', () => {
    expect(extractFontFamiliesFromCSSFont('12px Times New Roman, serif')).toEqual(['Times New Roman'])
  })

  it('parses rem-sized shorthand', () => {
    expect(extractFontFamiliesFromCSSFont('1rem Inter')).toEqual(['Inter'])
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

  it('skips multiple leading percentage tokens before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('75% 50% 14px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('500 75% 62.5% 16px "Display", sans-serif')).toEqual(['Display'])
  })

  it('skips a long stack of leading stretch percentages before real size and family', () => {
    const pre = Array(12).fill('75%').join(' ')
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
    expect(extractFontFamiliesFromCSSFont('3svw Side, sans-serif')).toEqual(['Side'])
    expect(extractFontFamiliesFromCSSFont('5lvmin Body Text')).toEqual(['Body Text'])
  })

  it('parses Q (quarter-mm) size before family', () => {
    expect(extractFontFamiliesFromCSSFont('40Q Mincho, serif')).toEqual(['Mincho'])
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
})

describe('collectFontFamiliesFromTree', () => {
  it('returns empty when tree has no text nodes', () => {
    const tree = box({ width: 10, height: 10 })
    expect(collectFontFamiliesFromTree(tree)).toEqual([])
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

  it('swallows rejection from fonts.ready after loads settle', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const ready = Promise.reject(new Error('ready failed'))
    vi.stubGlobal('document', { fonts: { load, ready } })
    await expect(waitForFonts(['Inter'])).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledWith('16px Inter')
  })
})
