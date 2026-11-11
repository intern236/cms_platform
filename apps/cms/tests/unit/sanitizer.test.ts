import { describe, expect, it } from 'vitest'
import { renderablePostHtml, sanitizePostHtml, splitForMidCta } from '@/lib/content/sanitize'
import { htmlPostDocument, sanitizePagePostHtml } from '@/lib/content/post-page-html'
import { findScriptVectors } from './xss-check'
import { XSS_VECTORS } from './xss-vectors'

const CLOUD = 'https://res.cloudinary.com/demo-cloud/image/upload/v1/cms/ws/posts/body/a.jpg'

describe('rich-editor sanitiser — XSS', () => {
  it.each(XSS_VECTORS)('neutralises %s', (vector) => {
    expect(findScriptVectors(sanitizePostHtml(vector))).toEqual([])
  })

  it('stays safe for every ordered pair of payloads', () => {
    const failures: string[] = []
    for (const a of XSS_VECTORS) {
      for (const b of XSS_VECTORS) {
        const problems = findScriptVectors(renderablePostHtml(sanitizePostHtml(`${a}\n${b}`)))
        if (problems.length) failures.push(`${a}  +  ${b}  →  ${problems.join('; ')}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('strips images that are not on our own Cloudinary cloud', () => {
    expect(sanitizePostHtml('<img src="https://tracker.example/p.gif">')).toBe('')
    expect(sanitizePostHtml('<img src="//tracker.example/p.gif">')).toBe('')
    expect(sanitizePostHtml('<img src="https://res.cloudinary.com/someone-else/x.jpg">')).toBe('')
    expect(sanitizePostHtml(`<img src="${CLOUD}" alt="A">`)).toBe(`<img src="${CLOUD}" alt="A" />`)
  })

  it('keeps everything the editor can produce', () => {
    const html =
      '<h2>T</h2><h3>t</h3><p><strong>b</strong> <em>i</em> <s>s</s> <u>u</u> <code>c</code></p>' +
      '<ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote><pre><code>x</code></pre><hr />' +
      '<table><thead><tr><th scope="col">H</th></tr></thead><tbody><tr><td colspan="2">C</td></tr></tbody></table>'
    expect(sanitizePostHtml(html)).toBe(html)
  })

  it('drops h1 (the post title is the only h1) and arbitrary attributes', () => {
    expect(sanitizePostHtml('<h1 class="x" id="y">Big</h1>')).toBe('Big')
    expect(sanitizePostHtml('<p class="evil" style="color:red">x</p>')).toBe('<p>x</p>')
  })

  it('allows only http(s)/mailto links and normalises the button flag to a closed set', () => {
    expect(sanitizePostHtml('<a href="https://a.example">a</a>')).toBe('<a href="https://a.example">a</a>')
    expect(sanitizePostHtml('<a href="mailto:a@b.co">m</a>')).toBe('<a href="mailto:a@b.co">m</a>')
    expect(sanitizePostHtml('<a href="tel:123">t</a>')).toBe('<a>t</a>')
    expect(sanitizePostHtml('<a href="https://a.example" data-button="outline">b</a>')).toContain('data-button="outline"')
    expect(sanitizePostHtml('<a href="https://a.example" data-button="x" onclick="y">b</a>')).toBe(
      '<a href="https://a.example" data-button>b</a>'
    )
    expect(sanitizePostHtml('<a href="https://a.example" target="_blank" rel="opener">b</a>')).toBe(
      '<a href="https://a.example">b</a>'
    )
  })
})

describe('HTML-page sanitiser — XSS', () => {
  it.each(XSS_VECTORS)('neutralises %s', (vector) => {
    const clean = sanitizePagePostHtml(vector)
    expect(findScriptVectors(clean)).toEqual([])
    // …and again as a whole document, the way the page is actually served.
    expect(findScriptVectors(`<!doctype html><html><body>${clean}</body></html>`, { fullDocument: true })).toEqual([])
  })

  it.each(XSS_VECTORS)('stays safe after the render-time transform: %s', (vector) => {
    const doc = htmlPostDocument(sanitizePagePostHtml(vector))
    expect(findScriptVectors(`${doc.head}\n${doc.body}`)).toEqual([])
  })

  it('drops HTML comments entirely (they can turn into markup inside raw-text elements)', () => {
    expect(sanitizePagePostHtml('<p>a</p><!-- note --><p>b</p>')).toBe('<p>a</p><p>b</p>')
    expect(findScriptVectors(sanitizePagePostHtml('<!--><img src=x onerror=alert(1)>-->'))).toEqual([])
  })

  /* Payloads can interact: one leaves a raw-text element open, a later one's text
     lands inside it. Testing each alone missed exactly that (found by the browser
     test), so every ordered PAIR, and the whole list as one page, is checked too. */
  it('stays safe for every ordered pair of payloads', () => {
    const failures: string[] = []
    for (const a of XSS_VECTORS) {
      for (const b of XSS_VECTORS) {
        const clean = sanitizePagePostHtml(`${a}\n${b}`)
        const doc = htmlPostDocument(clean)
        const problems = [
          ...findScriptVectors(clean),
          ...findScriptVectors(`${doc.head}\n${doc.body}`),
        ]
        if (problems.length) failures.push(`${a}  +  ${b}  →  ${problems.join('; ')}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('stays safe with every payload in one document, in either order', () => {
    for (const list of [XSS_VECTORS, [...XSS_VECTORS].reverse()]) {
      const page = `<!doctype html><html><head><title>t</title></head><body>${list.join('\n')}</body></html>`
      const doc = htmlPostDocument(sanitizePagePostHtml(page))
      expect(findScriptVectors(`${doc.head}\n${doc.body}`)).toEqual([])
    }
  })

  it('escapes < inside <style> and JSON-LD so the text can never form a tag', () => {
    expect(sanitizePagePostHtml('<style>a::before{content:"<b>"}</style>')).toBe(
      '<style>a::before{content:"\\3c b>"}</style>'
    )
    expect(
      sanitizePagePostHtml('<script type="application/ld+json">{"name":"<b>"}</script>')
    ).toBe('<script type="application/ld+json">{"name":"\\u003cb>"}</script>')
  })

  it('allows data: only as inline raster image data', () => {
    expect(sanitizePagePostHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png')
    expect(sanitizePagePostHtml('<img src="data:image/svg+xml;base64,AAAA">')).toBe('<img />')
    expect(sanitizePagePostHtml('<img src="data:text/html,x">')).toBe('<img />')
    expect(sanitizePagePostHtml('<a href="data:image/png;base64,AAAA">x</a>')).toBe('<a>x</a>')
  })

  it('only lets <link> pull in stylesheets', () => {
    expect(sanitizePagePostHtml('<link rel="stylesheet" href="https://cdn.example/a.css">')).toContain('stylesheet')
    expect(sanitizePagePostHtml('<link rel="preload" href="https://x.example/a">')).toBe('')
    expect(sanitizePagePostHtml('<link rel="import" href="https://x.example/a">')).toBe('')
  })

  it('keeps a real landing page intact: layout, SVG casing, forms, JSON-LD', () => {
    const page = `<!doctype html><html><head><title>Launch</title>
<meta name="description" content="Our launch page">
<style>.hero{color:red}</style>
<script type="application/ld+json">{"@type":"Article"}</script>
</head><body><section class="hero"><h1>Hello</h1>
<svg viewBox="0 0 10 10"><linearGradient id="g" gradientUnits="userSpaceOnUse"></linearGradient><path d="M0 0h10"/></svg>
<form action="https://forms.example/x" method="post"><input name="email" type="email"><button>Go</button></form>
<iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>
</section></body></html>`
    const clean = sanitizePagePostHtml(page)
    const doc = htmlPostDocument(clean)
    expect(doc.title).toBe('Launch')
    expect(doc.description).toBe('Our launch page')
    expect(doc.hasStructuredData).toBe(true)
    expect(doc.head).toContain('.cms-html-post .hero')
    expect(doc.body).toContain('viewBox="0 0 10 10"')
    expect(doc.body).toContain('gradientUnits="userSpaceOnUse"')
    expect(doc.body).toContain('action="https://forms.example/x"')
    expect(doc.body).toContain('https://www.youtube.com/embed/abc')
    expect(doc.body).not.toContain('<title>')
  })
})

describe('render helpers', () => {
  it('wraps tables for horizontal scrolling without touching the table', () => {
    expect(renderablePostHtml('<table><tr><td>1</td></tr></table>')).toBe(
      '<div class="cms-table-scroll"><table><tr><td>1</td></tr></table></div>'
    )
  })

  it('splits long posts only at top-level block boundaries near the middle', () => {
    const para = `<p>${'word '.repeat(120)}</p>`
    const html = `${para}<blockquote><p>q</p><p>r</p></blockquote>${para.repeat(4)}`
    const split = splitForMidCta(html)
    expect(split).not.toBeNull()
    expect(split!.before + split!.after).toBe(html)
    // Neither half may leave an element open.
    for (const half of [split!.before, split!.after]) {
      expect((half.match(/<blockquote>/g) ?? []).length).toBe((half.match(/<\/blockquote>/g) ?? []).length)
    }
    expect(splitForMidCta('<p>short</p>')).toBeNull()
  })
})

describe('per-workspace image scope', () => {
  const mine = 'https://res.cloudinary.com/demo-cloud/image/upload/v1/cms/aaaaaaaaaaaaaaaaaaaaaaaa/posts/body/a.jpg'
  const theirs = 'https://res.cloudinary.com/demo-cloud/image/upload/v1/cms/bbbbbbbbbbbbbbbbbbbbbbbb/posts/body/a.jpg'
  const prefix = 'cms/aaaaaaaaaaaaaaaaaaaaaaaa'
  it('keeps images from this workspace folder and drops another client’s', () => {
    expect(sanitizePostHtml(`<img src="${mine}">`, prefix)).toContain(mine)
    expect(sanitizePostHtml(`<img src="${theirs}">`, prefix)).toBe('')
  })
  it('refuses path tricks that climb out of the folder', () => {
    const sneaky = `https://res.cloudinary.com/demo-cloud/image/upload/v1/${prefix}/../bbbbbbbbbbbbbbbbbbbbbbbb/x.jpg`
    expect(sanitizePostHtml(`<img src="${sneaky}">`, prefix)).toBe('')
  })
})
