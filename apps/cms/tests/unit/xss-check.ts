import { parse, parseFragment } from 'parse5'

/**
 * Judges sanitised HTML THE WAY A BROWSER WOULD: it is parsed with parse5, which
 * implements the WHATWG HTML parsing algorithm (foreign content, raw-text
 * elements, comment edge cases and all), and the resulting tree is walked for
 * anything that could run script. Testing the sanitiser with its own parser
 * would only prove it agrees with itself.
 */

type Node = {
  nodeName: string
  tagName?: string
  attrs?: { name: string; value: string }[]
  childNodes?: Node[]
  content?: Node
}

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'data', 'background', 'srcset'])
const DANGEROUS_TAGS = new Set(['object', 'embed', 'base', 'applet', 'frame', 'frameset'])

function badUrl(value: string): boolean {
  // Browsers ignore control characters and whitespace inside the scheme.
  const compact = value.replace(/[\u0000- ]/g, '').toLowerCase()
  return /^(javascript|vbscript|data:text\/html|data:application|data:image\/svg)/.test(compact) ||
    compact.startsWith('javascript:')
}

/** Every way the parsed tree could execute script. Empty means safe. */
export function findScriptVectors(html: string, { fullDocument = false } = {}): string[] {
  const root = (fullDocument ? parse(html) : parseFragment(html)) as unknown as Node
  const problems: string[] = []

  const walk = (node: Node) => {
    const tag = node.tagName?.toLowerCase()
    if (tag) {
      if (DANGEROUS_TAGS.has(tag)) problems.push(`<${tag}> element`)
      if (tag === 'script') {
        const type = node.attrs?.find((a) => a.name === 'type')?.value ?? ''
        if (type !== 'application/ld+json') problems.push(`executable <script type="${type}">`)
      }
      if (tag === 'meta' && node.attrs?.some((a) => a.name === 'http-equiv')) problems.push('<meta http-equiv>')
      if (tag === 'iframe' && node.attrs?.some((a) => a.name === 'srcdoc')) problems.push('<iframe srcdoc>')
      for (const attr of node.attrs ?? []) {
        const name = attr.name.toLowerCase()
        if (name.startsWith('on')) problems.push(`<${tag} ${name}=…> event handler`)
        if (URL_ATTRS.has(name) && badUrl(attr.value)) problems.push(`<${tag} ${name}="${attr.value}">`)
        if (name === 'style' && /javascript:|expression\(/i.test(attr.value)) problems.push(`<${tag} style> script`)
      }
    }
    for (const child of node.childNodes ?? []) walk(child)
    if (node.content) walk(node.content)
  }
  walk(root)
  return problems
}
