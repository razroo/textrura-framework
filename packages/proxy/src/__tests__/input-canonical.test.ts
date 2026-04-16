import { describe, expect, it } from 'vitest'
import { canonicalizeHtmlInputValue } from '../input-canonical.js'

describe('canonicalizeHtmlInputValue', () => {
  it('passes through text-like types', () => {
    expect(canonicalizeHtmlInputValue('text', '  hello  ')).toBe('  hello  ')
    expect(canonicalizeHtmlInputValue('email', 'a@b.co')).toBe('a@b.co')
  })

  it('normalizes number and strips grouping commas', () => {
    expect(canonicalizeHtmlInputValue('number', '1,234.5')).toBe('1234.5')
    expect(canonicalizeHtmlInputValue('range', '  42 ')).toBe('42')
  })

  it('formats date and datetime-local from parseable strings', () => {
    expect(canonicalizeHtmlInputValue('date', '2026-03-15')).toBe('2026-03-15')
    expect(canonicalizeHtmlInputValue('datetime-local', '2026-01-02T14:30')).toBe('2026-01-02T14:30')
    expect(canonicalizeHtmlInputValue('datetime-local', '2026-07-04T18:30:00')).toBe('2026-07-04T18:30')
  })

  it('formats time', () => {
    expect(canonicalizeHtmlInputValue('time', '9:05')).toBe('09:05')
    expect(canonicalizeHtmlInputValue('time', '9:05:30')).toBe('09:05:30')
  })

  it('formats month', () => {
    expect(canonicalizeHtmlInputValue('month', '2026-04')).toBe('2026-04')
  })

  it('normalizes week casing only', () => {
    expect(canonicalizeHtmlInputValue('week', '2026-w03')).toBe('2026-W03')
  })
})
