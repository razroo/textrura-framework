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
})

describe('collectFontFamiliesFromTree', () => {
  it('dedupes families from text nodes', () => {
    const tree = box({}, [
      text({ text: 'a', font: '14px Inter', lineHeight: 20 }),
      text({ text: 'b', font: 'bold 14px Inter', lineHeight: 20 }),
      text({ text: 'c', font: '12px JetBrains Mono', lineHeight: 16 }),
    ])
    const fam = collectFontFamiliesFromTree(tree).sort()
    expect(fam).toEqual(['Inter', 'JetBrains Mono'])
  })
})
