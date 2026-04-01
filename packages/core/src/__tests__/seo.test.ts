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
      text({ text: 'Subheading', font: '600 32px sans-serif', lineHeight: 40 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<p>Subheading</p>')
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

  it('infers p from small regular font', () => {
    const el = box({ width: 200, height: 50 }, [
      text({ text: 'Body text', font: '14px sans-serif', lineHeight: 18 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<p>Body text</p>')
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

  it('handles image elements with <img> tag', () => {
    const el = box({ width: 200, height: 200 }, [
      image({ src: 'https://example.com/photo.jpg', alt: 'A photo', width: 100, height: 100 }),
    ])
    const html = toSemanticHTML(el)
    expect(html).toContain('<img src="https://example.com/photo.jpg" alt="A photo">')
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
            <input aria-label="Email input"></input>
            <button>
              <p>Submit</p>
            </button>
          </form>
      </body>
      </html>"
    `)
  })
})
