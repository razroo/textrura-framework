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

  it('drops generic fallbacks case-insensitively', () => {
    expect(extractFontFamiliesFromCSSFont('14px Inter, SANS-SERIF, Monospace')).toEqual(['Inter'])
  })

  it('returns empty for whitespace-only input', () => {
    expect(extractFontFamiliesFromCSSFont('')).toEqual([])
    expect(extractFontFamiliesFromCSSFont('   ')).toEqual([])
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
