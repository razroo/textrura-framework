import { describe, it, expect } from 'vitest'
import { toSemanticHTML } from '../seo.js'
import { box, text, image } from '../elements.js'

describe('toSemanticHTML', () => {
  it('generates valid HTML with doctype', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('</html>')
  })

  it('uses custom lang on the root html element', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, { lang: 'fr-CA' })
    expect(html).toContain('<html lang="fr-CA">')
  })

  it('falls back to en when lang is empty or whitespace-only', () => {
    const el = box({ width: 100, height: 100 })
    expect(toSemanticHTML(el, { lang: '' })).toContain('<html lang="en">')
    expect(toSemanticHTML(el, { lang: '   \t' })).toContain('<html lang="en">')
  })

  it('emits HTML dir on boxes and text when props.dir is ltr, rtl, or auto', () => {
    const el = box({ width: 200, height: 80, dir: 'rtl' }, [
      text({ text: 'mixed', font: '14px sans-serif', lineHeight: 18, dir: 'ltr' }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<div dir="rtl">')
    expect(html).toContain('<p dir="ltr">')
  })

  it('emits dir on image elements', () => {
    const el = box({ width: 100, height: 100 }, [
      image({ src: '/a.png', width: 10, height: 10, alt: 'x', dir: 'auto' }),
    ])
    expect(toSemanticHTML(el)).toMatch(/<img[^>]*dir="auto"/)
  })

  it('omits dir when props.dir is unset', () => {
    const el = box({ width: 100, height: 100 })
    expect(toSemanticHTML(el)).not.toMatch(/<div[^>]*\sdir=/)
  })

  it('ignores invalid runtime dir values', () => {
    const el = box({ width: 100, height: 100, dir: 'evil" onclick=' as never })
    expect(toSemanticHTML(el)).not.toContain('dir=')
  })

  it('escapes lang attribute values', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, { lang: 'xx"><script' })
    expect(html).toContain('<html lang="xx&quot;&gt;&lt;script">')
    expect(html).not.toContain('<script')
  })

  it('includes meta tags when provided', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, {
      title: 'My Page',
      description: 'A description',
      canonical: 'https://example.com',
    })
    expect(html).toContain('<title>My Page</title>')
    expect(html).toContain('name="description" content="A description"')
    expect(html).toContain('rel="canonical" href="https://example.com"')
  })

  it('escapes HTML special characters in title, description, canonical, and OG meta values', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, {
      title: 'A & B <title>',
      description: 'Say "hi" & <br> safely',
      canonical: 'https://example.com/path?a=1&b=2"onload=',
      og: {
        title: 'OG & Co',
        description: 'OG <desc>',
        image: 'https://cdn.example.com/i.png?x=1&y=2',
        url: 'https://example.com/share?u=1&evil=3"',
        type: 'article&evil',
      },
    })
    expect(html).toContain('<title>A &amp; B &lt;title&gt;</title>')
    expect(html).toContain('content="Say &quot;hi&quot; &amp; &lt;br&gt; safely"')
    expect(html).toContain('href="https://example.com/path?a=1&amp;b=2&quot;onload="')
    expect(html).toContain('property="og:title" content="OG &amp; Co"')
    expect(html).toContain('property="og:description" content="OG &lt;desc&gt;"')
    expect(html).toContain('property="og:image" content="https://cdn.example.com/i.png?x=1&amp;y=2"')
    expect(html).toContain('property="og:url" content="https://example.com/share?u=1&amp;evil=3&quot;"')
    expect(html).toContain('property="og:type" content="article&amp;evil"')
  })

  it('includes OG tags', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, {
      og: {
        title: 'OG Title',
        description: 'OG Desc',
        image: 'https://example.com/img.png',
      },
    })
    expect(html).toContain('property="og:title" content="OG Title"')
    expect(html).toContain('property="og:description" content="OG Desc"')
    expect(html).toContain('property="og:image" content="https://example.com/img.png"')
  })

  it('includes Twitter / X Card meta tags when provided', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, {
      twitter: {
        card: 'summary_large_image',
        site: '@geometra',
        title: 'TW Title',
        description: 'TW Desc',
        image: 'https://example.com/tw.png',
      },
    })
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('name="twitter:site" content="@geometra"')
    expect(html).toContain('name="twitter:title" content="TW Title"')
    expect(html).toContain('name="twitter:description" content="TW Desc"')
    expect(html).toContain('name="twitter:image" content="https://example.com/tw.png"')
  })

  it('escapes HTML special characters in Twitter Card meta values', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, {
      twitter: {
        card: 'summary&evil',
        site: '@app"><xss',
        title: 'A & B',
        description: 'Say "hi"',
        image: 'https://example.com/i?a=1&b=2"',
      },
    })
    expect(html).toContain('name="twitter:card" content="summary&amp;evil"')
    expect(html).toContain('name="twitter:site" content="@app&quot;&gt;&lt;xss"')
    expect(html).toContain('name="twitter:title" content="A &amp; B"')
    expect(html).toContain('name="twitter:description" content="Say &quot;hi&quot;"')
    expect(html).toContain('name="twitter:image" content="https://example.com/i?a=1&amp;b=2&quot;"')
  })

  it('appends headExtra as trusted raw head markup after built-in meta', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, {
      headExtra: '<link rel="alternate" hreflang="fr" href="https://example.com/fr">',
    })
    expect(html).toContain('<meta name="viewport"')
    expect(html).toContain(
      '<link rel="alternate" hreflang="fr" href="https://example.com/fr">',
    )
    const viewportIdx = html.indexOf('initial-scale=1.0">')
    const extraIdx = html.indexOf('hreflang="fr"')
    expect(extraIdx).toBeGreaterThan(viewportIdx)
  })

  it('does not escape headExtra so integrators can emit literal entities or structured tags', () => {
    const el = box({ width: 100, height: 100 })
    const html = toSemanticHTML(el, {
      headExtra: '<meta name="app:note" content="A & B <not escaped>">',
    })
    expect(html).toContain('content="A & B <not escaped>"')
    expect(html).not.toContain('content="A &amp; B')
  })

  it('infers h1 from numeric font-weight 800 and 900 without the bold keyword', () => {
    const heavy = box({ width: 200, height: 50 }, [
      text({ text: 'ExtraBold', font: '800 32px Inter, sans-serif', lineHeight: 40 }),
      text({ text: 'Black', font: '900 32px Inter, sans-serif', lineHeight: 40 }),
    ])
    const html = toSemanticHTML(heavy)
    expect(html).toContain('<h1>ExtraBold</h1>')
    expect(html).toContain('<h1>Black</h1>')
  })

  it('escapes HTML special characters in text', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: '<script>alert("xss")</script>', font: '14px sans-serif', lineHeight: 18 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('infers h1 from bold large font', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'Big Title', font: 'bold 32px sans-serif', lineHeight: 40 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Big Title</h1>')
  })

  it('infers heading level when font shorthand has leading whitespace', () => {
    const el = box({ width: 200, height: 80 }, [
      text({ text: 'Hero', font: '  \tbold 32px sans-serif', lineHeight: 40 }),
      text({ text: 'Section', font: ' \nbold 24px Inter, sans-serif', lineHeight: 30 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Hero</h1>')
    expect(html).toContain('<h2>Section</h2>')
  })

  it('infers heading tiers from calc(), min(), max(), and clamp() using the first font-size length token', () => {
    const el = box({ width: 400, height: 220 }, [
      text({ text: 'Calc hero', font: 'bold calc(1.75rem + 2px) sans-serif', lineHeight: 40 }),
      text({ text: 'Min section', font: 'bold min(22px, 2rem) sans-serif', lineHeight: 32 }),
      text({ text: 'Max sub', font: 'bold max(19px, 1rem) sans-serif', lineHeight: 28 }),
      text({ text: 'Clamp h4', font: 'bold clamp(15px, 2vw, 20px) sans-serif', lineHeight: 20 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Calc hero</h1>')
    expect(html).toContain('<h2>Min section</h2>')
    expect(html).toContain('<h3>Max sub</h3>')
    expect(html).toContain('<h4>Clamp h4</h4>')
  })

  it('infers h1 from numeric font-weight 700 without the bold keyword', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'Hero', font: 'italic 700 32px/40px Inter, sans-serif', lineHeight: 40 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Hero</h1>')
  })

  it('infers h1 from bolder keyword at large size', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'Title', font: 'bolder 32px sans-serif', lineHeight: 40 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Title</h1>')
  })

  it('does not treat semibold numeric weight (600) as bold for heading inference', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'Subheading', font: '600 32px sans-serif', lineHeight: 18 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<p>Subheading</p>')
  })

  it('does not treat bold keyword or large digits in the family list (after size) as bold weight', () => {
    const el = box({ width: 200, height: 120 }, [
      text({ text: 'Brand', font: '32px Bold Display, sans-serif', lineHeight: 40 }),
      text({ text: 'Year', font: '32px "Company 2024", sans-serif', lineHeight: 40 }),
      text({ text: 'Bolder name', font: '32px Foobolder Sans, sans-serif', lineHeight: 40 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<p>Brand</p>')
    expect(html).toContain('<p>Year</p>')
    expect(html).toContain('<p>Bolder name</p>')
  })

  it('does not treat the semibold keyword as bold for heading inference', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'UI label', font: 'semibold 32px sans-serif', lineHeight: 40 }),
    ])
    expect(toSemanticHTML(el)).toContain('<p>UI label</p>')
  })

  it('does not treat lighter weight as bold for heading inference at large sizes', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'De-emphasized', font: 'lighter 32px sans-serif', lineHeight: 40 }),
    ])
    expect(toSemanticHTML(el)).toContain('<p>De-emphasized</p>')
  })

  it('infers heading level from scientific-notation px sizes (not the trailing digit before px)', () => {
    const el = box({ width: 200, height: 120 }, [
      text({ text: 'Hero', font: 'bold 1e2px sans-serif', lineHeight: 120 }),
      text({ text: 'Section', font: 'bold 2.5e+1px sans-serif', lineHeight: 32 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Hero</h1>')
    expect(html).toContain('<h2>Section</h2>')
  })

  it('infers headings from rem, em, and pt using stable px approximations', () => {
    const el = box({ width: 400, height: 200 }, [
      text({ text: 'Rem hero', font: 'bold 2rem sans-serif', lineHeight: 40 }),
      text({ text: 'Em section', font: 'bold 1.6em sans-serif', lineHeight: 32 }),
      text({ text: 'Pt sub', font: 'bold 18pt sans-serif', lineHeight: 24 }),
      text({ text: 'Small pt', font: '10pt sans-serif', lineHeight: 14 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Rem hero</h1>')
    expect(html).toContain('<h2>Em section</h2>')
    expect(html).toContain('<h2>Pt sub</h2>')
    expect(html).toContain('<p>Small pt</p>')
  })

  it('infers headings from math unit and absolute lengths (pc, in, cm, mm, Q)', () => {
    const el = box({ width: 400, height: 240 }, [
      text({ text: 'Math hero', font: 'bold 2math sans-serif', lineHeight: 40 }),
      text({ text: 'Pc section', font: 'bold 1.5pc sans-serif', lineHeight: 32 }),
      text({ text: 'In sub', font: 'bold 0.25in sans-serif', lineHeight: 28 }),
      text({ text: 'Cm minor', font: 'bold 0.5cm sans-serif', lineHeight: 24 }),
      text({ text: 'Mm h4', font: 'bold 4.2mm sans-serif', lineHeight: 20 }),
      text({ text: 'Q h3', font: 'bold 21Q sans-serif', lineHeight: 22 }),
      text({ text: 'Large Q body', font: '140Q sans-serif', lineHeight: 18 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Math hero</h1>')
    expect(html).toContain('<h2>Pc section</h2>')
    expect(html).toContain('<h2>In sub</h2>')
    expect(html).toContain('<h3>Cm minor</h3>')
    expect(html).toContain('<h4>Mm h4</h4>')
    expect(html).toContain('<h3>Q h3</h3>')
    expect(html).toContain('<p>Large Q body</p>')
  })

  it('infers headings from percentage and viewport units using approximate px', () => {
    const el = box({ width: 400, height: 200 }, [
      text({ text: 'Pct hero', font: 'bold 200% sans-serif', lineHeight: 40 }),
      text({ text: 'Vmin section', font: 'bold 2.5vmin sans-serif', lineHeight: 32 }),
      text({ text: 'Vw sub', font: 'bold 8vw sans-serif', lineHeight: 28 }),
      text({ text: 'Vh minor', font: 'bold 6vh sans-serif', lineHeight: 22 }),
      text({ text: 'Vmax h4', font: 'bold 1.8vmax sans-serif', lineHeight: 20 }),
      text({ text: 'Large pct body', font: '150% sans-serif', lineHeight: 22 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Pct hero</h1>')
    expect(html).toContain('<h2>Vmin section</h2>')
    expect(html).toContain('<h2>Vw sub</h2>')
    expect(html).toContain('<h3>Vh minor</h3>')
    expect(html).toContain('<h4>Vmax h4</h4>')
    expect(html).toContain('<p>Large pct body</p>')
  })

  it('infers headings from dynamic, small, and large viewport font units (aligned with fonts.ts)', () => {
    // Coarse px mapping matches seo `fontLengthToApproxPx`: axis units *3, min/max *9.
    const el = box({ width: 400, height: 220 }, [
      text({ text: 'Dvh hero', font: 'bold 10dvh sans-serif', lineHeight: 40 }),
      text({ text: 'Svw section', font: 'bold 8svw sans-serif', lineHeight: 32 }),
      text({ text: 'Lvh sub', font: 'bold 6lvh sans-serif', lineHeight: 28 }),
      text({ text: 'Dvmin h4', font: 'bold 1.7dvmin sans-serif', lineHeight: 20 }),
      text({ text: 'Svi minor', font: 'bold 5.2svi sans-serif', lineHeight: 22 }),
      text({ text: 'Dvb edge', font: 'bold 5dvb sans-serif', lineHeight: 22 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Dvh hero</h1>')
    expect(html).toContain('<h2>Svw section</h2>')
    expect(html).toContain('<h3>Lvh sub</h3>')
    expect(html).toContain('<h4>Dvmin h4</h4>')
    expect(html).toContain('<h4>Svi minor</h4>')
    expect(html).toContain('<h4>Dvb edge</h4>')
  })

  it('infers headings from large-viewport axis and min/max units (lvw, lvi, lvb, lvmin, lvmax)', () => {
    const el = box({ width: 400, height: 240 }, [
      text({ text: 'Lvw hero', font: 'bold 10lvw sans-serif', lineHeight: 40 }),
      text({ text: 'Lvi section', font: 'bold 8lvi sans-serif', lineHeight: 32 }),
      text({ text: 'Lvb sub', font: 'bold 6lvb sans-serif', lineHeight: 28 }),
      text({ text: 'Lvmin h4', font: 'bold 1.7lvmin sans-serif', lineHeight: 20 }),
      text({ text: 'Lvmax edge', font: 'bold 1.7lvmax sans-serif', lineHeight: 20 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Lvw hero</h1>')
    expect(html).toContain('<h2>Lvi section</h2>')
    expect(html).toContain('<h3>Lvb sub</h3>')
    expect(html).toContain('<h4>Lvmin h4</h4>')
    expect(html).toContain('<h4>Lvmax edge</h4>')
  })

  it('infers h1 from scientific-notation percentage before bold keyword', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'Hero', font: 'bold 2e2% sans-serif', lineHeight: 40 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Hero</h1>')
  })

  it('infers headings from ch and cap units using approximate px', () => {
    const el = box({ width: 400, height: 200 }, [
      text({ text: 'Ch hero', font: 'bold 4ch sans-serif', lineHeight: 40 }),
      text({ text: 'Cap section', font: 'bold 2cap sans-serif', lineHeight: 32 }),
      text({ text: 'Ch minor', font: 'bold 2ch sans-serif', lineHeight: 22 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Ch hero</h1>')
    expect(html).toContain('<h2>Cap section</h2>')
    expect(html).toContain('<h4>Ch minor</h4>')
  })

  it('infers headings from vi/vb and container-query font units using approximate px', () => {
    const el = box({ width: 400, height: 220 }, [
      text({ text: 'Vi hero', font: 'bold 10vi sans-serif', lineHeight: 40 }),
      text({ text: 'Cqw section', font: 'bold 8cqw sans-serif', lineHeight: 32 }),
      text({ text: 'Cqmin sub', font: 'bold 2.5cqmin sans-serif', lineHeight: 28 }),
      text({ text: 'Cqi minor', font: 'bold 2cqi sans-serif', lineHeight: 22 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Vi hero</h1>')
    expect(html).toContain('<h2>Cqw section</h2>')
    expect(html).toContain('<h2>Cqmin sub</h2>')
    expect(html).toContain('<h4>Cqi minor</h4>')
  })

  it('infers headings from cqh, cqb, and cqmax using approximate px', () => {
    const el = box({ width: 400, height: 220 }, [
      text({ text: 'Cqh hero', font: 'bold 10cqh sans-serif', lineHeight: 40 }),
      text({ text: 'Cqmax section', font: 'bold 2cqmax sans-serif', lineHeight: 32 }),
      text({ text: 'Cqb sub', font: 'bold 1cqb sans-serif', lineHeight: 28 }),
      text({ text: 'Cqb minor', font: 'bold 0.9cqb sans-serif', lineHeight: 22 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Cqh hero</h1>')
    expect(html).toContain('<h2>Cqmax section</h2>')
    expect(html).toContain('<h3>Cqb sub</h3>')
    expect(html).toContain('<h4>Cqb minor</h4>')
  })

  it('infers headings from root-relative rch/rcap/rex/ric units', () => {
    const el = box({ width: 400, height: 200 }, [
      text({ text: 'Rch hero', font: 'bold 4rch sans-serif', lineHeight: 40 }),
      text({ text: 'Rcap section', font: 'bold 2rcap sans-serif', lineHeight: 32 }),
      text({ text: 'Rex sub', font: 'bold 3rex sans-serif', lineHeight: 28 }),
      text({ text: 'Ric h4', font: 'bold 1.1ric sans-serif', lineHeight: 22 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Rch hero</h1>')
    expect(html).toContain('<h2>Rcap section</h2>')
    expect(html).toContain('<h2>Rex sub</h2>')
    expect(html).toContain('<h4>Ric h4</h4>')
  })

  it('infers headings from lh, rlh, ex, and ic units using approximate px', () => {
    const el = box({ width: 400, height: 220 }, [
      text({ text: 'RlH hero', font: 'bold 1.5rlh sans-serif', lineHeight: 40 }),
      text({ text: 'Lh section', font: 'bold 1.4lh sans-serif', lineHeight: 32 }),
      text({ text: 'Ex sub', font: 'bold 3ex sans-serif', lineHeight: 28 }),
      text({ text: 'Ic minor', font: 'bold 1.2ic sans-serif', lineHeight: 22 }),
      text({ text: 'RlH before lh', font: 'bold 2rlh sans-serif', lineHeight: 52 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>RlH hero</h1>')
    expect(html).toContain('<h2>Lh section</h2>')
    expect(html).toContain('<h2>Ex sub</h2>')
    expect(html).toContain('<h3>Ic minor</h3>')
    expect(html).toContain('<h1>RlH before lh</h1>')
  })

  it('infers p from small regular font', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'Body text', font: '14px sans-serif', lineHeight: 18 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<p>Body text</p>')
  })

  it('does not promote headings when the first font-size token parses to non-finite values', () => {
    const el = box({ width: 200, height: 80 }, [
      text({ text: 'Overflow', font: 'bold 1e400px sans-serif', lineHeight: 40 }),
      text({ text: 'Also overflow', font: 'bold 2e308px sans-serif', lineHeight: 40 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<p>Overflow</p>')
    expect(html).toContain('<p>Also overflow</p>')
    expect(html).not.toMatch(/<h[1-6]>/)
  })

  it('does not promote headings when computed px from the size token is negative', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'Degenerate', font: 'bold -32px sans-serif', lineHeight: 40 }),
    ])
    expect(toSemanticHTML(el)).toContain('<p>Degenerate</p>')
  })

  it('uses explicit semantic tag when provided', () => {
    const el = box({ width: 200, height: 50 }, [
      text({
        text: 'Nav item',
        font: '14px sans-serif',
        lineHeight: 18,
        semantic: { tag: 'span' },
      }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<span>Nav item</span>')
  })

  it('normalizes uppercase semantic tags to lowercase HTML names', () => {
    const el = box({ width: 200, height: 50 }, [
      text({
        text: 'Hi',
        font: '14px sans-serif',
        lineHeight: 18,
        semantic: { tag: 'SPAN' },
      }),
    ])
    expect(toSemanticHTML(el)).toContain('<span>Hi</span>')
  })

  it('ignores malformed semantic.tag and falls back to inferred tags', () => {
    const el = box({ width: 200, height: 120 }, [
      text({
        text: 'Inject',
        font: 'bold 32px sans-serif',
        lineHeight: 40,
        semantic: { tag: 'h1><script' },
      }),
      text({
        text: 'Body',
        font: '14px sans-serif',
        lineHeight: 18,
        semantic: { tag: 'p onclick=alert(1)' },
      }),
      text({
        text: 'Digits',
        font: '14px sans-serif',
        lineHeight: 18,
        semantic: { tag: '1p' },
      }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h1>Inject</h1>')
    expect(html).toContain('<p>Body</p>')
    expect(html).toContain('<p>Digits</p>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick=')
  })

  it('ignores overlong semantic.tag names', () => {
    const longTag = `x${'a'.repeat(130)}`
    const el = box({ width: 200, height: 50 }, [
      text({
        text: 'T',
        font: 'bold 32px sans-serif',
        lineHeight: 40,
        semantic: { tag: longTag },
      }),
    ])
    expect(toSemanticHTML(el)).toContain('<h1>T</h1>')
  })

  it('ignores malformed semantic.tag on boxes', () => {
    const el = box({ width: 100, height: 40, semantic: { tag: 'div class=x"' } }, [])
    const html = toSemanticHTML(el)
    expect(html).toContain('<div></div>')
    expect(html).not.toContain('class=x')
  })

  it('handles image elements with <img> tag', () => {
    const el = box({ width: 200, height: 200 }, [
      image({ src: 'https://example.com/photo.jpg', alt: 'A photo', width: 100, height: 100 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<img src="https://example.com/photo.jpg" alt="A photo">')
  })

  it('uses only semantic aria-label on boxes when both ariaLabel and alt are set', () => {
    const el = box(
      {
        width: 100,
        height: 40,
        semantic: { ariaLabel: 'Primary', alt: 'Ignored duplicate' },
      },
      [],
    )
    const html = toSemanticHTML(el)
    expect(html).toContain('aria-label="Primary"')
    expect(html).not.toContain('Ignored duplicate')
    expect(html.match(/aria-label=/g)?.length).toBe(1)
  })

  it('falls back to semantic alt as aria-label on boxes when ariaLabel is absent', () => {
    const el = box(
      { width: 100, height: 40, semantic: { alt: 'Decorative region' } },
      [],
    )
    const html = toSemanticHTML(el)
    expect(html).toContain('aria-label="Decorative region"')
  })

  it('escapes semantic role and aria-label on text and box nodes', () => {
    const el = box(
      {
        width: 200,
        height: 80,
        semantic: { role: 'banner" x=', ariaLabel: 'App <main>' },
      },
      [
        text({
          text: 'Hi',
          font: '14px sans-serif',
          lineHeight: 18,
          semantic: { role: 'note"x', ariaLabel: 'Say "ok"' },
        }),
      ],
    )
    const html = toSemanticHTML(el)
    expect(html).toContain('role="banner&quot; x="')
    expect(html).toContain('aria-label="App &lt;main&gt;"')
    expect(html).toContain('role="note&quot;x"')
    expect(html).toContain('aria-label="Say &quot;ok&quot;"')
  })

  it('escapes img src and alt for HTML attribute safety', () => {
    const el = box({ width: 200, height: 200 }, [
      image({
        src: 'https://example.com/q?a=1&b=2"onerror=',
        alt: 'A & B <tag>',
        width: 100,
        height: 100,
      }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain(
      'src="https://example.com/q?a=1&amp;b=2&quot;onerror="',
    )
    expect(html).toContain('alt="A &amp; B &lt;tag&gt;"')
  })

  it('infers h2, h3, and h4 from bold px thresholds', () => {
    const el = box({ width: 400, height: 200 }, [
      text({ text: 'Section', font: 'bold 24px sans-serif', lineHeight: 30 }),
      text({ text: 'Sub', font: 'bold 19px sans-serif', lineHeight: 24 }),
      text({ text: 'Minor', font: 'bold 15px sans-serif', lineHeight: 20 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<h2>Section</h2>')
    expect(html).toContain('<h3>Sub</h3>')
    expect(html).toContain('<h4>Minor</h4>')
  })

  it('emits stable semantic snapshot for nav and article tree', () => {
    const el = box({ semantic: { tag: 'main' } }, [
      box({ semantic: { tag: 'nav', ariaLabel: 'Primary' } }, [
        text({ text: 'Docs', font: '14px sans-serif', lineHeight: 18, semantic: { tag: 'span' } }),
      ]),
      box({ semantic: { tag: 'article' } }, [
        text({ text: 'Launch notes', font: 'bold 28px Inter', lineHeight: 34, semantic: { tag: 'h1' } }),
        text({ text: 'Core keyboard flow updated.', font: '14px sans-serif', lineHeight: 18, semantic: { tag: 'p' } }),
      ]),
    ])
    const html = toSemanticHTML(el)
    expect(html).toMatchInlineSnapshot(`
      "<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
          <main>
            <nav aria-label="Primary">
              <span>Docs</span>
            </nav>
            <article>
              <h1>Launch notes</h1>
              <p>Core keyboard flow updated.</p>
            </article>
          </main>
      </body>
      </html>"
    `)
  })

  it('emits stable semantic snapshot for list-like form structure', () => {
    const el = box({ semantic: { tag: 'form', ariaLabel: 'Signup' } }, [
      box({ semantic: { tag: 'label' } }, [
        text({ text: 'Email', font: '14px sans-serif', lineHeight: 18 }),
      ]),
      box({ semantic: { tag: 'input', ariaLabel: 'Email input' } }, []),
      box({ semantic: { tag: 'button' } }, [
        text({ text: 'Submit', font: '14px sans-serif', lineHeight: 18 }),
      ]),
    ])
    const html = toSemanticHTML(el)
    expect(html).toMatchInlineSnapshot(`
      "<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
          <form aria-label="Signup">
            <label>
              <p>Email</p>
            </label>
            <input aria-label="Email input">
            <button>
              <p>Submit</p>
            </button>
          </form>
      </body>
      </html>"
    `)
  })

  it('emits HTML5 void elements without a closing tag when empty', () => {
    const el = box({ width: 200, height: 80 }, [
      box({ semantic: { tag: 'input', ariaLabel: 'q', role: 'searchbox' } }, []),
      box({ semantic: { tag: 'br' } }, []),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<input role="searchbox" aria-label="q">')
    expect(html).not.toContain('</input>')
    expect(html).toContain('<br>')
    expect(html).not.toContain('</br>')
  })

  it('infers button for onClick with a single text child or empty box', () => {
    const leaf = box({ width: 80, height: 32, onClick: () => {} }, [
      text({ text: 'OK', font: '14px sans-serif', lineHeight: 18 }),
    ])
    const empty = box({ width: 40, height: 40, onClick: () => {} }, [])
    const html = toSemanticHTML(box({ width: 200, height: 100 }, [leaf, empty]))
    expect(html).toContain('<button>')
    expect(html).toContain('<p>OK</p>')
    expect(html).toContain('</button>')
    expect(html.match(/<button>/g)?.length).toBe(2)
  })

  it('infers div for onClick on compound targets (multiple children or nested box)', () => {
    const row = box({ width: 200, height: 40, onClick: () => {} }, [
      text({ text: 'A', font: '14px sans-serif', lineHeight: 18 }),
      text({ text: 'B', font: '14px sans-serif', lineHeight: 18 }),
    ])
    const wrapped = box({ width: 200, height: 40, onClick: () => {} }, [
      box({ width: 100, height: 20 }, [
        text({ text: 'Inner', font: '14px sans-serif', lineHeight: 18 }),
      ]),
    ])
    const icon = box({ width: 48, height: 48, onClick: () => {} }, [
      image({ src: '/i.png', alt: '', width: 24, height: 24 }),
    ])
    const html = toSemanticHTML(box({ width: 220, height: 200 }, [row, wrapped, icon]))
    expect(html).not.toContain('<button>')
    expect(html.match(/<div>/g)?.length).toBeGreaterThanOrEqual(3)
  })
})
