/**
 * Reading a pasted HTML page's own head, with no dependencies at all.
 *
 * WHY IT IS ITS OWN FILE. Three places need these answers: the save action, which stores
 * the post's title and description; the published page, which puts them in the real head;
 * and the admin editor, which shows the writer what was found before they save. The first
 * two are server code and could have taken them from lib/post-page-html.ts. The third is a
 * client component, and importing that module would pull sanitize-html — around 50KB — into
 * the admin bundle to run four regular expressions.
 *
 * The alternative was mirroring the patterns by hand in the editor, which this codebase
 * does do for plain constants. A regular expression is not a constant: a change to one
 * copy that misses the other is a silent disagreement about what a page's title is, in two
 * places that are supposed to be showing the same thing. So it is one definition in a file
 * with nothing to drag along.
 *
 * REGULAR EXPRESSIONS, ON PURPOSE. Parsing HTML with them is a bad idea in general and a
 * fine one for this: nothing here is a security control — the boundary is
 * sanitizePagePostHtml in lib/post-page-html.ts — and the three things being looked for are
 * unambiguous. Everything these produce is treated as TEXT by every caller: stored in a
 * string field, rendered through Next's metadata, or printed into the editor's UI. None of
 * it is ever re-emitted as markup.
 */

import { decodeHtmlEntities } from '@/lib/content/html-entities'

/** Which of the two shapes a post is. Stored on the post; defaults to the editor. */
export type PostFormat = 'editor' | 'html'

/**
 * Coerced, never trusted. Anything that is not exactly 'html' is an editor post, so a
 * hand-crafted request cannot reach the wider sanitiser by sending a typo, and a document
 * written straight into the database with no format at all gets the narrower one.
 */
export function asPostFormat(value: unknown): PostFormat {
  return value === 'html' ? 'html' : 'editor'
}

/**
 * A copy of the document with every region that only LOOKS like markup blanked out,
 * character for character, so offsets into it are valid offsets into the original.
 *
 * THIS IS NOT A NICETY. It was found by the first realistic page put through the format,
 * and the failure was silent and absurd: a comment in the head reading "becomes the real
 * `<title>`" was matched by the title pattern, which then ran non-greedily to the first
 * real `</title>` and produced a post titled with a sentence of prose plus the actual
 * headline. A CSS comment mentioning `<body>` did the same to the body extraction, so the
 * published page opened mid-sentence.
 *
 * Pages that talk about HTML inside HTML are not a corner case; every page a developer
 * hands over has commented-out markup in it, and half of them have a stylesheet with a
 * note about the body. So the rule is: FIND positions in this masked copy, SLICE them out
 * of the original.
 *
 * WHAT IS BLANKED: comment bodies, CSS inside `<style>`, and code inside `<script>`. The
 * tags themselves survive, so the head extractor can still find where a style block starts
 * and ends — only its contents stop being scannable.
 *
 * WHAT IS NOT: `<title>` and `<meta>` contents, which is what makes it safe to read those
 * two straight out of the masked copy rather than slicing.
 */
export function maskForScanning(html: string): string {
  const blank = (text: string) => ' '.repeat(text.length)
  const inner = (_m: string, open: string, body: string, close: string) =>
    open + blank(body) + close

  return html
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, inner)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, inner)
}

/**
 * The document's own `<title>`, or null.
 *
 * Read from the masked copy, and safe to take straight from it because a title's text is
 * never one of the blanked regions. See maskForScanning for why it is not read from the
 * raw string.
 */
export function pageTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(maskForScanning(html))
  const text = match?.[1]?.trim()
  return text ? decodeEntities(text) : null
}

/** The document's own meta description, or null. Masked for the same reason. */
export function pageDescription(html: string): string | null {
  const scan = maskForScanning(html)
  /* `name` and `content` in either order, which is the only variation worth handling —
     both are attribute soup by the time a page has been through three tools. */
  const text =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i.exec(scan)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i.exec(scan)?.[1]
  const trimmed = text?.trim()
  return trimmed ? decodeEntities(trimmed) : null
}

/**
 * Whether a pasted page already publishes its own FAQPage structured data.
 *
 * Used on both sides of the same decision: the post page renders the FAQ panel's questions
 * as an accordion WITHOUT a second FAQPage block when this is true, and the admin editor
 * tells the writer so before they save. Both call this one function, so what the editor
 * promises and what the page does cannot disagree.
 *
 * READ FROM THE JSON-LD, and only as far as the type. `@type` may be a string or an array
 * ("@type": ["FAQPage", "WebPage"] is valid), so both shapes are matched. Script contents
 * are deliberately NOT masked here the way pageTitle masks them — the JSON-LD is exactly
 * the part being read.
 */
export function pageHasFaqSchema(html: string): boolean {
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    if (/"@type"\s*:\s*(?:"FAQPage"|\[[^\]]*"FAQPage")/.test(match[1])) return true
  }
  return false
}

/**
 * Entity decoding, plus the whitespace tidy a title lifted out of markup needs.
 *
 * IT USED TO BE ITS OWN FIVE-ENTITY VERSION, and it carried the ordering bug that
 * lib/html-entities.ts now documents: it replaced `&amp;` FIRST, so a title meant to read
 * `&quot;` — written `&amp;quot;` — came out as a bare quote, its meaning destroyed
 * silently. It also knew nothing of `&#8220;`, `&#x27;` or `&mdash;`, which is most of what
 * a title pasted out of a real page actually carries.
 *
 * The old note here argued that `&lt;` and `&gt;` should stay escaped in case something
 * downstream rendered the value as markup. Nothing does — see the invariant in
 * lib/html-entities.ts — and leaving them encoded is how a heading about `<head>` ends up
 * published as `&lt;head&gt;`.
 */
function decodeEntities(text: string): string {
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim()
}

/**
 * A pasted page's readable text, for word counts and reading estimates.
 *
 * THE ORDER OF THESE FOUR PASSES IS THE WHOLE FUNCTION:
 *
 *   1. The `<head>` goes as a block. Its `<title>` and meta descriptions are real text and
 *      would otherwise be counted as prose — on a short page a seven-word title doubled
 *      the count.
 *   2. Style and script blocks go with their contents. Without this a page carrying a 6KB
 *      stylesheet reports roughly 600 words of CSS as writing, which is wrong by more than
 *      the number is worth.
 *   3. Comments go. They are notes to the next developer, not to the reader.
 *   4. Only then are the remaining tags stripped, and they are replaced with a SPACE
 *      rather than nothing. That is not a detail: `<li>one</li><li>two</li>` collapses to
 *      "onetwo" without it, and a page built from short elements — a nav, a table, a grid
 *      of cards — can lose a third of its word count that way.
 *
 * USED ON BOTH SIDES. The admin editor calls it on every keystroke in the paste box, and
 * readingMinutes() in lib/blog.ts calls it on save for the number that gets stored. It was
 * briefly two functions, one here and one built on sanitize-html for the server, and they
 * disagreed on exactly the two counts above — which is the argument against having two.
 */
export function pageBodyText(html: string): string {
  return html
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(style|script|title)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function pageWordCount(html: string): number {
  const text = pageBodyText(html)
  return text ? text.split(' ').filter(Boolean).length : 0
}
