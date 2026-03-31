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
