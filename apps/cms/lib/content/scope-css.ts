/**
 * Confining a pasted page's stylesheet to the element it belongs to.
 *
 * WHY THIS HAS TO EXIST. An HTML post now renders inside the site, with the real header
 * above it and the real footer below. The page brings its own `<style>` block, and a
 * stylesheet written for a standalone document says things like `body { background: … }`,
 * `h2 { font-size: 27px }` and `table { border-collapse: collapse }` — none of them scoped
 * to anything, because in a standalone document there is nothing else to hit. Dropped into
 * this page as-is, every one of those rules reaches the header, the footer and the cookie
 * banner. The first pasted page would repaint the site.
 *
 * SO EVERY SELECTOR IS PREFIXED with the wrapper <HtmlPost> renders, and `html`, `body` and
 * `:root` are rewritten to BE that wrapper. The post keeps its design; nothing outside it
 * changes. Relative order among the page's own rules is untouched because every selector
 * gains the same specificity, so a stylesheet that worked standalone still works.
 *
 * WHAT THIS IS NOT. It is not a security control — that is sanitizePagePostHtml, which has
 * already run by the time anything gets here. CSS cannot execute; the worst an unscoped
 * stylesheet does is make the site look broken, which is bad enough to be worth fixing and
 * not worth being paranoid about. Nothing downstream depends on this being airtight.
 *
 * A HAND-WRITTEN WALKER, NOT A REGULAR EXPRESSION AND NOT A CSS PARSER. A regex cannot do
 * it: `@media` bodies nest, and a brace or a comma inside a string, a comment, `url(…)` or
 * `:is(…)` breaks any pattern that pretends otherwise. A real parser would be correct and
 * is a dependency plus a build-size cost for a transformation that is, at bottom, "find the
 * selector lists and prefix them". This walks the string once, tracking the three things
 * that can hide a brace, and leaves everything it does not understand alone — which is the
 * safe direction: an unrecognised at-rule passes through untouched rather than mangled.
 */

/**
 * At-rules whose body is a list of further rules, so the walker descends into them.
 * Everything else — @keyframes, @font-face, @property, @page, @counter-style, @import,
 * @charset — either contains declarations rather than rules, or is not a rule at all.
 * Prefixing inside those would corrupt them: `@keyframes` steps are percentages, not
 * selectors, and `.wrapper 0%` is nonsense.
 */
const NESTED_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'scope', 'document'])

/**
 * Selectors that mean "the document", rewritten to mean "this post".
 *
 * A standalone page's `body` rule carries its background, its base font and its text
 * colour, and all three are wanted — just on the wrapper instead of on the site's body,
 * where they would repaint every page. `html` and `:root` get the same treatment, which
 * also keeps custom properties declared on `:root` working: they land on the wrapper and
 * inherit down to everything inside it.
 */
const DOCUMENT_SELECTORS = new Set(['html', 'body', ':root'])

/** Splits a selector list on its top-level commas — the ones not inside (), [] or a string. */
function splitSelectors(selector: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (char === ',' && depth === 0) {
      parts.push(selector.slice(start, i))
      start = i + 1
    }
  }
  parts.push(selector.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

function prefixOne(selector: string, scope: string): string {
  /* Leave anything already anchored to the scope alone, so running this twice is
     harmless — which matters because a page can be re-saved any number of times. */
  if (selector.startsWith(scope)) return selector

  /* `*` has to become both the wrapper and everything in it. `.scope *` alone would miss
     the wrapper, and a universal reset that skips the element it is scoped to is the kind
     of near-miss that shows up as one wrong margin nobody can find. */
  if (selector === '*') return `${scope}, ${scope} *`

  if (DOCUMENT_SELECTORS.has(selector.toLowerCase())) return scope

  /* A descendant selector led by the document: `body .card`, `html.dark p`. The leading
     token is replaced rather than prefixed, because `.scope body .card` would match
     nothing — there is no <body> inside the wrapper. */
  const lead = /^(html|body|:root)\b([.#:[][^\s>+~]*)?/i.exec(selector)
  if (lead) {
    const rest = selector.slice(lead[0].length).trim()
    /* A qualifier on the document element — `html.dark`, `body.home` — cannot be tested
       from inside the wrapper, so it is dropped and the rule applies unconditionally.
       Wrong in principle, right in practice: those classes are set by scripts that no
       longer run, so keeping the qualifier would silently disable the rule instead. */
    return rest ? `${scope} ${rest}` : scope
  }

  return `${scope} ${selector}`
}

function prefixSelectorList(selectors: string, scope: string): string {
  return splitSelectors(selectors)
    .map((selector) => prefixOne(selector, scope))
    .join(', ')
}

/**
 * The walker. Reads a block of CSS and returns it with every style rule scoped.
 *
 * `depth` is only used to decide whether a nested at-rule's body needs the same treatment;
 * the recursion does the actual work.
 */
function walk(css: string, scope: string): string {
  let out = ''
  let prelude = ''
  let i = 0

  while (i < css.length) {
    const char = css[i]

    /* Comments are copied through untouched and, crucially, are not scanned for braces —
       a commented-out rule would otherwise unbalance everything after it. */
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      const stop = end === -1 ? css.length : end + 2
      out += prelude + css.slice(i, stop)
      prelude = ''
      i = stop
      continue
    }

    /* A string can hold a brace, a semicolon or a comma — `content: "}"` is legal and is
       the classic way a naive splitter loses the plot. */
    if (char === '"' || char === "'") {
      let j = i + 1
      while (j < css.length && css[j] !== char) {
        if (css[j] === '\\') j++
        j++
      }
      prelude += css.slice(i, j + 1)
      i = j + 1
      continue
    }

    if (char === '{') {
      const head = prelude.trim()
      const body = readBlock(css, i)
      /* `end` points PAST the closing brace when there was one, and at the end of the
         string when there was not. Subtracting one unconditionally ate the last
         character of a truncated stylesheet, which is a paste that got cut off — the
         case this branch exists to survive. */
      const inner = css.slice(i + 1, body.closed ? body.end - 1 : body.end)

      if (head.startsWith('@')) {
        const name = /^@([\w-]+)/.exec(head)?.[1]?.toLowerCase() ?? ''
        out += NESTED_AT_RULES.has(name)
          ? `${head}{${walk(inner, scope)}}`
          : /* @keyframes, @font-face and friends: verbatim. */
            `${head}{${inner}}`
      } else if (head) {
        out += `${prefixSelectorList(head, scope)}{${inner}}`
      } else {
        /* A block with no selector at all. Malformed, but dropping it would lose whatever
           is inside; passing it through leaves the page exactly as broken as it arrived. */
        out += `{${inner}}`
      }

      prelude = ''
      i = body.end
      continue
    }

    /* A statement at-rule with no block: @import, @charset. Copied as-is. */
    if (char === ';' && prelude.trim().startsWith('@')) {
      out += `${prelude};`
      prelude = ''
      i++
      continue
    }

    prelude += char
    i++
  }

  return out + prelude
}

/**
 * Finds the matching close brace for the `{` at `open`, ignoring strings and comments.
 *
 * `closed` says whether one was actually found. It is not a detail: without it a
 * truncated paste loses its last character, because the caller cannot tell "end of
 * block" from "end of string".
 */
function readBlock(css: string, open: number): { end: number; closed: boolean } {
  let depth = 0
  let i = open

  while (i < css.length) {
    const char = css[i]
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? css.length : end + 2
      continue
    }
    if (char === '"' || char === "'") {
      i++
      while (i < css.length && css[i] !== char) {
        if (css[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return { end: i + 1, closed: true }
    }
    i++
  }
  /* Unbalanced input — a truncated paste. Treat the rest as the block rather than
     throwing: half a stylesheet is better than a page with none. */
  return { end: css.length, closed: false }
}

/**
 * Scopes a stylesheet to a selector.
 *
 * Idempotent: a selector already starting with the scope is left alone, so re-saving a
 * post does not stack prefixes.
 */
export function scopeCss(css: string, scope: string): string {
  return walk(css, scope)
}

/**
 * The same, for a run of markup: rewrites the CSS inside every `<style>` element and
 * leaves everything else exactly as it was.
 *
 * EXTERNAL STYLESHEETS CANNOT BE TOUCHED. A `<link rel="stylesheet">` fetches a file this
 * code never sees, so its rules arrive unscoped and can reach the rest of the page. That is
 * a real hole and there is no fix short of refusing the tag, which would break legitimate
 * pages that pull a font or a CSS framework. Worth knowing before someone pastes a page
 * that links a full framework: inline `<style>` is contained, a linked file is not.
 */
export function scopeStyleBlocks(html: string, scope: string): string {
  return html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open: string, css: string, close: string) => open + scopeCss(css, scope) + close
  )
}
