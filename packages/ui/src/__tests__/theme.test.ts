import { describe, it, expect, afterEach } from 'vitest'
import {
  theme,
  setTheme,
  peekTheme,
  mergeTheme,
  darkTheme,
  button,
  badge,
  checkbox,
  toast,
} from '../index.js'

afterEach(() => setTheme(darkTheme))

describe('theme system', () => {
  it('defaults to darkTheme', () => {
    expect(theme()).toBe(darkTheme)
  })

  it('setTheme replaces the active theme', () => {
    const custom = mergeTheme({ colors: { accent: '#ff0000' } })
    setTheme(custom)
    expect(theme().colors.accent).toBe('#ff0000')
    expect(theme().colors.text).toBe(darkTheme.colors.text)
  })

  it('peekTheme reads without subscribing', () => {
    expect(peekTheme()).toBe(darkTheme)
    const custom = mergeTheme({ colors: { bg: '#111' } })
    setTheme(custom)
    expect(peekTheme().colors.bg).toBe('#111')
  })

  it('mergeTheme deep-merges partial overrides', () => {
    const merged = mergeTheme({
      colors: {
        accent: '#ff0000',
        variants: { error: { border: '#fff', bg: '#000', text: '#ccc' } },
      },
      typography: { fontFamily: 'Roboto' },
    })
    expect(merged.colors.accent).toBe('#ff0000')
    expect(merged.colors.text).toBe(darkTheme.colors.text)
    expect(merged.colors.variants.error.border).toBe('#fff')
    expect(merged.colors.variants.info).toEqual(darkTheme.colors.variants.info)
    expect(merged.typography.fontFamily).toBe('Roboto')
    expect(merged.typography.fontSizeBase).toBe(darkTheme.typography.fontSizeBase)
  })

  it('button reflects active theme accent', () => {
    const custom = mergeTheme({ colors: { accent: '#ff0000', accentText: '#00ff00' } })
    setTheme(custom)
    const el = button('Click')
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.backgroundColor).toBe('#ff0000')
    const label = el.children[0]
    if (label?.kind === 'text') {
      expect(label.props.color).toBe('#00ff00')
    }
  })

  it('badge uses themed badge variants', () => {
    const custom = mergeTheme({
      colors: { badgeVariants: { success: { bg: '#00aa00', text: '#fff' } } },
    })
    setTheme(custom)
    const el = badge('Ok', { variant: 'success' })
    if (el.kind === 'box') {
      expect(el.props.backgroundColor).toBe('#00aa00')
    }
  })

  it('checkbox uses themed success colors', () => {
    const custom = mergeTheme({ colors: { successBg: '#003300' } })
    setTheme(custom)
    const el = checkbox('Accept', { checked: true })
    if (el.kind === 'box') {
      const indicator = el.children[0]
      if (indicator?.kind === 'box') {
        expect(indicator.props.backgroundColor).toBe('#003300')
      }
    }
  })

  it('toast reads variant palette from theme', () => {
    const custom = mergeTheme({
      colors: { variants: { warning: { border: '#aaa', bg: '#bbb', text: '#ccc' } } },
    })
    setTheme(custom)
    const el = toast('Warn', { variant: 'warning' })
    if (el.kind === 'box') {
      expect(el.props.borderColor).toBe('#aaa')
      expect(el.props.backgroundColor).toBe('#bbb')
    }
  })

  it('typography tokens change font strings', () => {
    const custom = mergeTheme({ typography: { fontFamily: 'Roboto', fontSizeBase: 15 } })
    setTheme(custom)
    const el = button('Hi')
    if (el.kind === 'box') {
      const label = el.children[0]
      if (label?.kind === 'text') {
        expect(label.props.font).toBe('15px Roboto')
      }
    }
  })
})
