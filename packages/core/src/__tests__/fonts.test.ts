import { describe, it, expect } from 'vitest'
import { extractFontFamiliesFromCSSFont, collectFontFamiliesFromTree } from '../fonts.js'
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

  it('parses font-variant keyword stacks before size and family', () => {
    expect(extractFontFamiliesFromCSSFont('small-caps 600 14px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('all-small-caps italic 12px Source Serif 4, serif')).toEqual([
      'Source Serif 4',
    ])
  })

  it('drops ui-prefixed generic families', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, ui-rounded')).toEqual(['Inter'])
  })

  it('skips font-stretch percentage before real font size and family', () => {
    expect(extractFontFamiliesFromCSSFont('75% 14px Inter')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('500 75% 14px Inter, sans-serif')).toEqual(['Inter'])
    expect(extractFontFamiliesFromCSSFont('condensed 75% 14px "Custom Face"')).toEqual(['Custom Face'])
  })

  it('still treats a single percentage as font-size when it is followed only by family', () => {
    expect(extractFontFamiliesFromCSSFont('112% Georgia, serif')).toEqual(['Georgia'])
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

  it('collects families from nested text under boxes', () => {
    const tree = box({}, [
      box({}, [text({ text: 'inner', font: '16px Source Sans 3', lineHeight: 22 })]),
    ])
    expect(collectFontFamiliesFromTree(tree)).toEqual(['Source Sans 3'])
  })
})
