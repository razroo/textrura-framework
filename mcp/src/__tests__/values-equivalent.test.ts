import { describe, expect, it } from 'vitest'
import { valuesEquivalent } from '../server.js'

describe('valuesEquivalent', () => {
  describe('plain strings', () => {
    it('matches identical strings case-insensitively', () => {
      expect(valuesEquivalent('Charlie', 'charlie')).toBe(true)
    })

    it('matches with whitespace collapse', () => {
      expect(valuesEquivalent('Charlie  Greenman', 'Charlie Greenman')).toBe(true)
    })

    it('rejects unrelated strings', () => {
      expect(valuesEquivalent('Charlie', 'Alice')).toBe(false)
    })
  })

  describe('phone numbers', () => {
    it('matches identical phone signatures', () => {
      expect(valuesEquivalent('9296081737', '9296081737')).toBe(true)
    })

    // Bug surfaced by JobForge round-2 marathon — Cloudflare FDE NYC #312.
    // Greenhouse formats `+1-929-608-1737` → `(929) 608-1737`. The expected
    // side carries the country code; the actual readback drops it. The
    // strict-equality digit comparison previously rejected this as a
    // mismatch even though the underlying value is correct.
    it('matches phone numbers when expected has country code and actual does not', () => {
      expect(valuesEquivalent('+1-929-608-1737', '(929) 608-1737')).toBe(true)
    })

    it('matches phone numbers when actual has country code and expected does not', () => {
      expect(valuesEquivalent('(929) 608-1737', '+1-929-608-1737')).toBe(true)
    })

    it('matches across many ATS auto-format variants', () => {
      const expected = '+19296081737'
      expect(valuesEquivalent(expected, '(929) 608-1737')).toBe(true)
      expect(valuesEquivalent(expected, '929-608-1737')).toBe(true)
      expect(valuesEquivalent(expected, '929.608.1737')).toBe(true)
      expect(valuesEquivalent(expected, '929 608 1737')).toBe(true)
      expect(valuesEquivalent(expected, '+1 (929) 608-1737')).toBe(true)
    })

    it('rejects two phone numbers that differ in the local 10 digits', () => {
      expect(valuesEquivalent('+1-929-608-1737', '(415) 555-0123')).toBe(false)
    })

    it('rejects suffix-match below the 7-digit local minimum', () => {
      // Pure 6-digit IDs must not match against a longer phone signature
      // even if the IDs happen to be a digit-suffix.
      expect(valuesEquivalent('19296081737', '081737')).toBe(false)
    })
  })

  describe('formatted numbers', () => {
    it('matches a salary across comma formatting', () => {
      expect(valuesEquivalent('$160000', '$160,000')).toBe(true)
    })
  })
})
